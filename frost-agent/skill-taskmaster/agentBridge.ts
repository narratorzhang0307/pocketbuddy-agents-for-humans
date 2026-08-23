import {
  HEALTH_SKILL_PROTOCOL,
  HealthSkillRegistry,
  type FrostTaskRequest,
  type HealthSkillDefinition,
  type JsonObject,
  type SkillPermission,
  type TaskmasterToolRegistry,
  type ToolResult,
} from '../taskmaster';
import { verifyGraphHash } from './compiler';
import type { CompiledSkillGraph, SkillPreflightIssue, SkillRunTrace } from './contracts';
import { createBrowserSkillRuntimeDependencies, preflightBrowserSkillRuntime } from './browserRuntime';
import { executeSkillGraph, type SkillRuntimeDependencies } from './runtime';
import { getCanvasSkill, listCanvasSkills } from './store';

const CANVAS_EXECUTE_TOOL = 'canvas.execute';

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function uniquePermissions(graph: CompiledSkillGraph): SkillPermission[] {
  return [...new Set<SkillPermission>(['run:skill', ...graph.permissions])];
}

function graphFromValue(value: unknown): CompiledSkillGraph | null {
  if (!record(value)
    || value.protocol !== 'pocket-skill-graph/v1'
    || typeof value.graph_id !== 'string'
    || typeof value.graph_hash !== 'string'
    || typeof value.skill_id !== 'string'
    || !Array.isArray(value.nodes)
    || !Array.isArray(value.edges)
    || !Array.isArray(value.capability_lockfile)
    || !Array.isArray(value.permissions)) return null;
  return structuredClone(value) as unknown as CompiledSkillGraph;
}

function definitionForGraph(graph: CompiledSkillGraph): HealthSkillDefinition {
  const permissions = uniquePermissions(graph);
  const needsConfirmation = graph.nodes.some((node) => node.capability === 'trigger.manual');
  return {
    protocol: HEALTH_SKILL_PROTOCOL,
    skill_id: graph.skill_id,
    title: graph.title,
    description: graph.description,
    when_to_use: [graph.title, graph.description].filter((value, index, values) => value.trim() && values.indexOf(value) === index),
    not_for: ['绕过编译 Hash、权限确认或安全门', '在 Provider 缺失时伪造执行成功'],
    eligibility: ['Graph 通过 pocket-skill-graph/v1 编译与 Hash 校验', '当前宿主具备所需 Provider 与权限'],
    permissions,
    steps: [{
      id: 'execute-graph',
      tool: CANVAS_EXECUTE_TOOL,
      purpose: `按锁定合同执行「${graph.title}」能力图`,
      requires_confirmation: needsConfirmation,
      permissions,
    }],
    stop_rules: [...graph.stop_rules, 'Graph Hash 或 Capability Contract 不一致时停止', 'Provider 暂不可用时保留 checkpoint'],
    completion: ['返回绑定 graph_hash 的 skill_run', '完成状态来自真实节点执行 Trace，而非界面预览'],
    provenance: {
      version: graph.version,
      owner: 'Pocket Buddy Skill Canvas',
      adaptation: `pocket-skill-graph/v1 ${graph.graph_hash}`,
    },
  };
}

/**
 * 把内置/外部健康 Skill 与用户编译的 Canvas Skill 暴露为同一个可发现目录。
 * 当次执行会把完整 Graph 快照写进请求，后续恢复不受用户再次编辑影响。
 */
export class CanvasAwareHealthSkillRegistry extends HealthSkillRegistry {
  override catalog(): ReturnType<HealthSkillRegistry['catalog']> {
    const merged = new Map(super.catalog().map((item) => [item.skill_id, item]));
    for (const { graph } of listCanvasSkills()) {
      if (merged.has(graph.skill_id)) continue;
      const skill = definitionForGraph(graph);
      merged.set(skill.skill_id, {
        skill_id: skill.skill_id,
        title: skill.title,
        description: skill.description,
        when_to_use: [...skill.when_to_use],
        not_for: [...skill.not_for],
      });
    }
    return [...merged.values()].map((item) => structuredClone(item));
  }

  override load(skillId: string): HealthSkillDefinition | null {
    const registered = super.load(skillId);
    if (registered) return registered;
    const record = getCanvasSkill(skillId);
    return record ? definitionForGraph(record.graph) : null;
  }

  override resolveRequest(request: FrostTaskRequest): { request: FrostTaskRequest; skill: HealthSkillDefinition } {
    if (request.kind !== 'run_skill') return super.resolveRequest(request);
    const skillId = typeof request.input.skill_id === 'string' ? request.input.skill_id.trim() : '';
    if (!skillId) throw new Error('run_skill_id_required');

    const embedded = graphFromValue(request.input.graph);
    if (embedded) {
      if (embedded.skill_id !== skillId) throw new Error('canvas_skill_id_mismatch');
      if (!verifyGraphHash(embedded)) throw new Error('canvas_graph_hash_mismatch');
      return { request: structuredClone(request), skill: definitionForGraph(embedded) };
    }

    const canvas = getCanvasSkill(skillId);
    if (!canvas) return super.resolveRequest(request);
    if (!verifyGraphHash(canvas.graph)) throw new Error('canvas_graph_hash_mismatch');
    const locked: FrostTaskRequest = {
      ...structuredClone(request),
      input: {
        ...structuredClone(request.input),
        skill_id: canvas.graph.skill_id,
        graph_id: canvas.graph.graph_id,
        graph_hash: canvas.graph.graph_hash,
        graph: structuredClone(canvas.graph) as unknown as JsonObject,
      },
    };
    return { request: locked, skill: definitionForGraph(canvas.graph) };
  }
}

export interface CanvasTaskmasterToolOptions {
  preflight?: (graph: CompiledSkillGraph) => Promise<SkillPreflightIssue[]>;
  dependencies?: (input: { graph: CompiledSkillGraph; request: FrostTaskRequest; idempotencyKey: string }) => SkillRuntimeDependencies;
}

function blockingIssues(issues: SkillPreflightIssue[]): SkillPreflightIssue[] {
  return issues.filter((issue) => issue.severity === 'blocking');
}

function isStructuralIssue(issue: SkillPreflightIssue): boolean {
  return issue.code === 'graph_hash_mismatch' || issue.code === 'contract_mismatch';
}

function idsFromTrace(trace: SkillRunTrace, key: 'evidence_id' | 'health_event_id'): string[] {
  const values = trace.steps.flatMap((step) => {
    const value = step.output?.[key];
    return typeof value === 'string' && value ? [value] : [];
  });
  return [...new Set(values)];
}

function runData(trace: SkillRunTrace): JsonObject {
  return {
    run_id: trace.run_id,
    graph_id: trace.graph_id,
    graph_hash: trace.graph_hash,
    skill_id: trace.skill_id,
    status: trace.status,
    evidence_ids: idsFromTrace(trace, 'evidence_id'),
    health_event_ids: idsFromTrace(trace, 'health_event_id'),
  };
}

function defaultDependencies(request: FrostTaskRequest, idempotencyKey: string): SkillRuntimeDependencies {
  return {
    ...createBrowserSkillRuntimeDependencies({ userId: request.user_id, deviceId: 'pocketbuddy-agent' }),
    createId: (prefix) => `${prefix}:${idempotencyKey.replace(/[^a-zA-Z0-9:_-]/g, '-')}`,
  };
}

/** 注册一次 Canvas Graph Provider；缺 Provider 时返回 waiting_external，而不是伪成功。 */
export function registerCanvasTaskmasterTool(registry: TaskmasterToolRegistry, options: CanvasTaskmasterToolOptions = {}): void {
  if (registry.has(CANVAS_EXECUTE_TOOL)) return;
  registry.register({
    name: CANVAS_EXECUTE_TOOL,
    permission: 'run:skill',
    async execute(input, context): Promise<ToolResult> {
      const graph = graphFromValue(input.graph);
      if (!graph) throw new Error('canvas_graph_snapshot_required');
      if (graph.skill_id !== input.skill_id || graph.graph_id !== input.graph_id || graph.graph_hash !== input.graph_hash) {
        throw new Error('canvas_graph_snapshot_mismatch');
      }
      if (!verifyGraphHash(graph)) throw new Error('canvas_graph_hash_mismatch');

      const preflight = await (options.preflight || preflightBrowserSkillRuntime)(graph);
      const blocked = blockingIssues(preflight);
      if (blocked.some(isStructuralIssue)) {
        throw new Error(`canvas_preflight_failed:${blocked.map((issue) => issue.code).join(',')}`);
      }
      if (blocked.length) {
        return {
          status: 'waiting_external',
          data: { issues: blocked as unknown as JsonObject[] },
          message: blocked.map((issue) => issue.message).join('；'),
        };
      }

      const dependencies = options.dependencies
        ? options.dependencies({ graph, request: context.request, idempotencyKey: context.idempotency_key })
        : defaultDependencies(context.request, context.idempotency_key);
      const trace = await executeSkillGraph(graph, dependencies);
      if (trace.status === 'completed') return { status: 'success', data: { skill_run: runData(trace) } };
      if (trace.status === 'waiting_permission') {
        return { status: 'waiting_external', data: { skill_run: runData(trace) }, message: trace.note };
      }
      const retryable = trace.steps.some((step) => step.error?.retryable);
      if (trace.status === 'failed' && retryable) {
        return { status: 'waiting_external', data: { skill_run: runData(trace) }, message: trace.note };
      }
      if (trace.status === 'safe_stopped') throw new Error(`safety_stop:${trace.note}`);
      throw new Error(`canvas_skill_${trace.status}:${trace.note}`);
    },
  });
}
