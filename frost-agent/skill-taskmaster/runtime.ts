import { CAPABILITY_DEFINITIONS } from '../skill-canvas/compiler';
import { SKILL_GRAPH_PROTOCOL, type CompiledSkillGraph, type SkillBlockCapability } from '../skill-canvas/contracts';
import type { JsonObject, SkillPermission } from '../taskmaster/contracts';
import {
  SKILL_EXECUTION_PROTOCOL,
  type RunSkillGraphOptions,
  type SkillAdapterResult,
  type SkillBindingReport,
  type SkillCapabilityAdapter,
  type SkillExecutionEvidence,
  type SkillExecutionStep,
  type SkillExecutionTrace,
} from './contracts';

// Archived callers may still ask for an explicit preview. The editor never treats that preview as execution.
export { previewSkillGraph } from '../skill-canvas/preview';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_STEPS = 24;

function safeMessage(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value || 'unknown_error');
  return text.replace(/[\r\n\t]+/g, ' ').slice(0, 240);
}

function defaultRunId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `skill-run-${uuid || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`}`;
}

function validateGraph(graph: CompiledSkillGraph): string | null {
  if (graph.protocol !== SKILL_GRAPH_PROTOCOL) return 'invalid_skill_graph_protocol';
  if (!graph.skill_id || !graph.nodes.length) return 'empty_skill_graph';
  if (!graph.nodes.some(node => node.capability === 'trigger.manual')) return 'missing_manual_trigger';
  if (!graph.nodes.some(node => ['action.voice', 'store.local'].includes(node.capability))) return 'missing_outcome';
  const ordered = [...graph.nodes].sort((a, b) => a.order - b.order);
  if (ordered[0]?.capability !== 'trigger.manual') return 'manual_trigger_must_start';
  if (ordered.some((node, index) => node.capability === 'store.local' && index !== ordered.length - 1)) return 'evidence_store_must_finish';
  if (graph.nodes.length > DEFAULT_MAX_STEPS) return 'skill_graph_too_large';
  const ids = new Set<string>();
  const orders = new Set<number>();
  for (const node of graph.nodes) {
    if (ids.has(node.id)) return `duplicate_node:${node.id}`;
    ids.add(node.id);
    if (!Number.isInteger(node.order) || node.order < 0 || orders.has(node.order)) return `invalid_node_order:${node.id}`;
    orders.add(node.order);
    const definition = CAPABILITY_DEFINITIONS[node.capability];
    if (!definition || definition.stage !== node.stage) return `invalid_capability_stage:${node.id}`;
    if (definition.permissions.some((permission) => !graph.permissions.includes(permission))) return `undeclared_permission:${node.id}`;
  }
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const dependencyEdges = new Set<string>();
  for (const node of graph.nodes) {
    if (node.depends_on.some((dependency) => !ids.has(dependency))) return `missing_dependency:${node.id}`;
    if (node.depends_on.some((dependency) => nodesById.get(dependency)!.order >= node.order)) return `forward_dependency:${node.id}`;
    for (const dependency of node.depends_on) dependencyEdges.add(`${dependency}->${node.id}`);
  }
  const graphEdges = graph.edges.map((edge) => `${edge.from}->${edge.to}`);
  if (graphEdges.some((edge, index) => graphEdges.indexOf(edge) !== index)) return 'duplicate_graph_edge';
  if (graphEdges.some((edge) => !dependencyEdges.has(edge)) || dependencyEdges.size !== graphEdges.length) return 'graph_dependency_mismatch';
  return null;
}

export class SkillCapabilityRegistry {
  private readonly adapters = new Map<SkillBlockCapability, SkillCapabilityAdapter>();

  register(adapter: SkillCapabilityAdapter): this {
    if (this.adapters.has(adapter.capability)) throw new Error(`skill_adapter_already_registered:${adapter.capability}`);
    this.adapters.set(adapter.capability, adapter);
    return this;
  }

  get(capability: SkillBlockCapability): SkillCapabilityAdapter | null {
    return this.adapters.get(capability) || null;
  }

  has(capability: SkillBlockCapability): boolean { return this.adapters.has(capability); }

  list(): SkillBlockCapability[] { return [...this.adapters.keys()]; }
}

export function inspectSkillBindings(graph: CompiledSkillGraph, registry: SkillCapabilityRegistry): SkillBindingReport {
  const missing = [...new Set(graph.nodes.map((node) => node.capability).filter((capability) => !registry.has(capability)))];
  return { ready: missing.length === 0, missing_capabilities: missing };
}

function failedTrace(graph: CompiledSkillGraph, runId: string, startedAt: string, completedAt: string, error: string): SkillExecutionTrace {
  return {
    protocol: SKILL_EXECUTION_PROTOCOL,
    run_id: runId,
    skill_id: graph.skill_id,
    mode: 'execute',
    status: 'failed',
    started_at: startedAt,
    completed_at: completedAt,
    steps: [],
    evidence: [],
    output: {},
    error,
  };
}

function adapterDeadline<T>(promise: Promise<T>, timeoutMs: number, controller: AbortController): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(new Error(safeMessage(controller.signal.reason || 'skill_run_cancelled'))); };
    const timer = setTimeout(() => {
      controller.abort('skill_adapter_timeout');
      reject(new Error('skill_adapter_timeout'));
    }, timeoutMs);
    promise.then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
    if (controller.signal.aborted) { abort(); return; }
    controller.signal.addEventListener('abort', abort, { once: true });
  });
}

function emitStep(callback: RunSkillGraphOptions['onStep'], step: SkillExecutionStep): void {
  try { callback?.(structuredClone(step)); } catch { /* observers cannot alter execution semantics */ }
}

function validateAdapterResult(result: SkillAdapterResult): string | null {
  if (!['completed', 'blocked', 'safe_stopped'].includes(result?.status)) return 'invalid_adapter_status';
  if (!result.output || typeof result.output !== 'object' || Array.isArray(result.output)) return 'invalid_adapter_output';
  if (!Array.isArray(result.evidence) || result.evidence.length === 0) return 'adapter_evidence_missing';
  if (result.evidence.some((item) => !item || !item.kind || !item.summary?.trim())) return 'invalid_adapter_evidence';
  return null;
}

/** Execute only explicitly registered capabilities; success requires evidence from every completed adapter. */
export async function runSkillGraph(
  graph: CompiledSkillGraph,
  registry: SkillCapabilityRegistry,
  options: RunSkillGraphOptions = {},
): Promise<SkillExecutionTrace> {
  graph = structuredClone(graph);
  const input = structuredClone(options.input || {});
  const now = options.now || (() => new Date());
  const runId = (options.createRunId || defaultRunId)();
  const startedAt = now().toISOString();
  const graphError = validateGraph(graph);
  if (graphError) return failedTrace(graph, runId, startedAt, now().toISOString(), graphError);

  const maxSteps = Math.min(options.maxSteps ?? DEFAULT_MAX_STEPS, DEFAULT_MAX_STEPS);
  if (graph.nodes.length > maxSteps) return failedTrace(graph, runId, startedAt, now().toISOString(), 'skill_step_limit_exceeded');

  const permissionCache = new Map<SkillPermission, boolean>();
  const steps: SkillExecutionStep[] = [];
  const evidence: SkillExecutionEvidence[] = [];
  const outputs: Record<string, JsonObject> = {};
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(options.signal?.reason || 'skill_run_cancelled');
  if (options.signal?.aborted) abortFromParent();
  else options.signal?.addEventListener('abort', abortFromParent, { once: true });

  let finalStatus: SkillExecutionTrace['status'] = 'completed';
  let finalError: string | undefined;
  try {
    for (const node of [...graph.nodes].sort((left, right) => left.order - right.order)) {
      const stepStartedAt = now().toISOString();
      const decisions: SkillExecutionStep['permission_decisions'] = [];
      if (controller.signal.aborted) {
        const reason = safeMessage(controller.signal.reason || 'skill_run_cancelled');
        const step: SkillExecutionStep = { node_id: node.id, capability: node.capability, label: node.label, status: 'safe_stopped', started_at: stepStartedAt,
          completed_at: now().toISOString(), permission_decisions: [], evidence_ids: [], error: reason };
        steps.push(step); emitStep(options.onStep, step);
        finalStatus = 'safe_stopped'; finalError = reason; break;
      }
      const adapter = registry.get(node.capability);
      if (!adapter) {
        const step: SkillExecutionStep = { node_id: node.id, capability: node.capability, label: node.label, status: 'blocked', started_at: stepStartedAt,
          completed_at: now().toISOString(), permission_decisions: [], evidence_ids: [], error: `missing_skill_adapter:${node.capability}` };
        steps.push(step); emitStep(options.onStep, step);
        finalStatus = 'blocked'; finalError = step.error; break;
      }

      for (const permission of CAPABILITY_DEFINITIONS[node.capability].permissions) {
        let granted = permissionCache.get(permission);
        if (granted === undefined) {
          try {
            granted = options.authorize ? await adapterDeadline(Promise.resolve(options.authorize({ graph: structuredClone(graph), node: structuredClone(node), permission, run_id: runId })), options.timeoutMs ?? DEFAULT_TIMEOUT_MS, controller) : false;
          } catch (error) {
            const message = controller.signal.aborted ? safeMessage(controller.signal.reason) : `permission_authorization_failed:${safeMessage(error)}`;
            const cancelled = controller.signal.aborted && controller.signal.reason !== 'skill_adapter_timeout';
            const step: SkillExecutionStep = { node_id: node.id, capability: node.capability, label: node.label, status: cancelled ? 'safe_stopped' : 'failed', started_at: stepStartedAt,
              completed_at: now().toISOString(), permission_decisions: decisions, evidence_ids: [], error: message };
            steps.push(step); emitStep(options.onStep, step);
            finalStatus = cancelled ? 'safe_stopped' : 'failed'; finalError = message;
            break;
          }
          permissionCache.set(permission, granted);
        }
        decisions.push({ permission, granted });
        if (!granted) break;
      }
      if (finalStatus !== 'completed') break;
      if (controller.signal.aborted) {
        const reason = safeMessage(controller.signal.reason || 'skill_run_cancelled');
        const step: SkillExecutionStep = { node_id: node.id, capability: node.capability, label: node.label, status: 'safe_stopped', started_at: stepStartedAt,
          completed_at: now().toISOString(), permission_decisions: decisions, evidence_ids: [], error: reason };
        steps.push(step); emitStep(options.onStep, step);
        finalStatus = 'safe_stopped'; finalError = reason; break;
      }
      const denied = decisions.find((decision) => !decision.granted);
      if (denied) {
        const step: SkillExecutionStep = { node_id: node.id, capability: node.capability, label: node.label, status: 'blocked', started_at: stepStartedAt,
          completed_at: now().toISOString(), permission_decisions: decisions, evidence_ids: [], error: `permission_denied:${denied.permission}` };
        steps.push(step); emitStep(options.onStep, step);
        finalStatus = 'blocked'; finalError = step.error; break;
      }

      try {
        const result = await adapterDeadline(adapter.execute({ graph: structuredClone(graph), node: structuredClone(node), input: structuredClone(input), prior_outputs: structuredClone(outputs),
          run_id: runId, idempotency_key: `${runId}:${node.id}`, signal: controller.signal }), options.timeoutMs ?? DEFAULT_TIMEOUT_MS, controller);
        controller.signal.throwIfAborted();
        const invalid = validateAdapterResult(result);
        if (invalid) throw new Error(invalid);
        const occurredAt = now().toISOString();
        const nodeEvidence = result.evidence.map((item, index): SkillExecutionEvidence => ({
          evidence_id: `${runId}:${node.id}:e${index + 1}`,
          node_id: node.id,
          capability: node.capability,
          kind: item.kind,
          summary: item.summary.trim().slice(0, 240),
          occurred_at: occurredAt,
          data: item.data || {},
        }));
        evidence.push(...nodeEvidence);
        outputs[node.id] = structuredClone(result.output);
        const step: SkillExecutionStep = { node_id: node.id, capability: node.capability, label: node.label, status: result.status,
          started_at: stepStartedAt, completed_at: occurredAt, permission_decisions: decisions, output: structuredClone(result.output),
          evidence_ids: nodeEvidence.map((item) => item.evidence_id), ...(result.error ? { error: safeMessage(result.error) } : {}) };
        steps.push(step); emitStep(options.onStep, step);
        if (result.status !== 'completed') {
          finalStatus = result.status;
          finalError = result.error ? safeMessage(result.error) : undefined;
          break;
        }
      } catch (error) {
        const message = safeMessage(error);
        const cancelled = controller.signal.aborted && controller.signal.reason !== 'skill_adapter_timeout';
        const step: SkillExecutionStep = { node_id: node.id, capability: node.capability, label: node.label, status: cancelled ? 'safe_stopped' : 'failed', started_at: stepStartedAt,
          completed_at: now().toISOString(), permission_decisions: decisions, evidence_ids: [], error: message };
        steps.push(step); emitStep(options.onStep, step);
        finalStatus = cancelled ? 'safe_stopped' : 'failed'; finalError = message; break;
      }
    }
  } finally {
    options.signal?.removeEventListener('abort', abortFromParent);
  }

  const lastOutput = steps.length ? outputs[steps[steps.length - 1].node_id] || {} : {};
  return {
    protocol: SKILL_EXECUTION_PROTOCOL,
    run_id: runId,
    skill_id: graph.skill_id,
    mode: 'execute',
    status: finalStatus,
    started_at: startedAt,
    completed_at: now().toISOString(),
    steps,
    evidence,
    output: structuredClone(lastOutput),
    ...(finalError ? { error: finalError } : {}),
  };
}
