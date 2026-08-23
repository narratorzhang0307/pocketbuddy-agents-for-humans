import { HEALTH_EVENT_PROTOCOL, type HealthEvent, type JsonObject } from '../taskmaster/contracts';
import { CAPABILITY_CATALOG } from './catalog';
import { verifyGraphHash } from './compiler';
import {
  SKILL_RUN_PROTOCOL,
  type CompiledSkillGraph,
  type CompiledSkillNode,
  type SkillEvidenceRecord,
  type SkillExecutionContext,
  type SkillRunStep,
  type SkillRunTrace,
} from './contracts';
import { getCompiledGraph, persistSkillEvidence, persistSkillRun } from './store';

export interface SkillRuntimeDependencies {
  userId: string;
  deviceId: string;
  confirmManual?: () => Promise<boolean>;
  readLocation?: (config: JsonObject) => Promise<{ latitude: number; longitude: number; accuracy_m?: number; captured_at: string }>;
  readHealthSummary?: (config: JsonObject) => Promise<JsonObject>;
  generateText?: (input: { prompt: string; system: string; json: boolean; task: string }) => Promise<{ text: string; model_version?: string }>;
  estimatePose?: (config: JsonObject) => Promise<JsonObject>;
  evaluateSafety?: (context: SkillExecutionContext, config: JsonObject) => Promise<{ safe: boolean; reason?: string }>;
  speak?: (text: string, config: JsonObject) => Promise<void>;
  saveEvidence?: (record: SkillEvidenceRecord) => Promise<void>;
  syncHealthEvent?: (event: HealthEvent) => Promise<{ status: 'synced' | 'duplicate' | 'conflict' | 'invalid'; revision: number; error?: string }>;
  now?: () => Date;
  createId?: (prefix: string) => string;
  onTrace?: (trace: SkillRunTrace) => void | Promise<void>;
  signal?: AbortSignal;
}

export class SkillRuntimeError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'SkillRuntimeError';
  }
}

function jsonObject(value: SkillExecutionContext): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function defaultId(prefix: string): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `${prefix}:${random}`;
}

function ensureAvailable<T>(value: T | undefined, capability: string): T {
  if (!value) throw new SkillRuntimeError('capability_unavailable', `${capability} 还没有可用的运行适配器。`);
  return value;
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new SkillRuntimeError('cancelled', '用户已取消这次技能运行。');
}

function modelPrompt(graph: CompiledSkillGraph, context: SkillExecutionContext): string {
  return [
    `技能：${graph.title}`,
    `目标：${graph.description}`,
    context.location ? `位置：${context.location.latitude.toFixed(5)},${context.location.longitude.toFixed(5)}；精度 ${context.location.accuracy_m ?? '未知'} 米` : '',
    context.health_summary ? `健康摘要：${JSON.stringify(context.health_summary)}` : '',
    '请只返回一条简短、可执行、遵守上述边界的中文下一步。',
  ].filter(Boolean).join('\n');
}

function initialTrace(graph: CompiledSkillGraph, runId: string, now: Date, mode: 'preview' | 'live'): SkillRunTrace {
  return {
    protocol: SKILL_RUN_PROTOCOL,
    run_id: runId,
    graph_id: graph.graph_id,
    graph_hash: graph.graph_hash,
    skill_id: graph.skill_id,
    mode,
    status: mode === 'preview' ? 'preview_completed' : 'running',
    started_at: now.toISOString(),
    ...(mode === 'preview' ? { completed_at: now.toISOString() } : {}),
    steps: graph.nodes.map((node) => ({
      node_id: node.id,
      capability: node.capability,
      label: node.label,
      status: mode === 'preview' ? 'completed' : 'pending',
      provider: CAPABILITY_CATALOG[node.capability].provider,
      evidence: mode === 'preview' ? 'PREVIEW ONLY · 已检查合同、端口、权限和 Provider Binding，未读取真实数据' : '等待上一步',
      started_at: now.toISOString(),
      ...(mode === 'preview' ? { completed_at: now.toISOString() } : {}),
    })),
    note: mode === 'preview'
      ? '结构检查已完成，未把 preview 冒充为真实运行。'
      : `正在执行用户刚编译的 Graph ${graph.graph_hash.slice(0, 20)}…`,
  };
}

export function previewSkillGraph(graph: CompiledSkillGraph, now = new Date()): SkillRunTrace {
  return initialTrace(graph, `preview:${Date.now().toString(36)}`, now, 'preview');
}

async function runNode(
  graph: CompiledSkillGraph,
  node: CompiledSkillNode,
  context: SkillExecutionContext,
  dependencies: SkillRuntimeDependencies,
  runId: string,
): Promise<{ context: SkillExecutionContext; evidence: string; provider: string }> {
  const contract = CAPABILITY_CATALOG[node.capability];
  switch (node.capability) {
    case 'trigger.manual': {
      const confirmed = await (dependencies.confirmManual?.() ?? Promise.resolve(true));
      if (!confirmed) throw new SkillRuntimeError('permission_denied', '用户没有确认启动。');
      return { context: { ...context, user_confirmed: true }, evidence: 'USER GESTURE · 用户明确启动', provider: contract.provider };
    }
    case 'sensor.location': {
      const location = await ensureAvailable(dependencies.readLocation, node.capability)(node.config);
      return { context: { ...context, location }, evidence: `LOCATION · ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)} · 精度 ${location.accuracy_m ?? '未知'}m`, provider: contract.provider };
    }
    case 'sensor.health': {
      const healthSummary = await ensureAvailable(dependencies.readHealthSummary, node.capability)(node.config);
      return { context: { ...context, health_summary: healthSummary }, evidence: 'LOCAL FACTS · 已读取用户确认的本机健康摘要', provider: contract.provider };
    }
    case 'model.gemma': {
      const generated = await ensureAvailable(dependencies.generateText, node.capability)({
        prompt: modelPrompt(graph, context),
        system: '你是 Pocket Buddy 的技能执行器。不得扩张权限，不得编造传感器数据。',
        json: node.config.json === true,
        task: typeof node.config.task === 'string' ? node.config.task : 'skill-canvas',
      });
      if (!generated.text.trim()) throw new SkillRuntimeError('bad_model_output', 'Gemma 没有返回可用文本。');
      return { context: { ...context, generated_text: generated.text.trim(), model_version: generated.model_version || 'server-managed' }, evidence: `MODEL · ${generated.model_version || 'server-managed'} · 输出已通过 API 契约`, provider: contract.provider };
    }
    case 'model.pose': {
      const pose = await ensureAvailable(dependencies.estimatePose, node.capability)(node.config);
      return { context: { ...context, pose }, evidence: 'LOCAL MODEL · 姿态信号已生成，原始帧未离开设备', provider: contract.provider };
    }
    case 'gate.safety': {
      const evaluation = dependencies.evaluateSafety
        ? await dependencies.evaluateSafety(context, node.config)
        : { safe: context.safety_signal !== 'stop' };
      if (!evaluation.safe) throw new SkillRuntimeError('safety_stop', evaluation.reason || '安全门已停止后续动作。');
      return { context: { ...context, safe: true }, evidence: 'SAFETY · 未发现已定义的停止信号', provider: contract.provider };
    }
    case 'action.voice': {
      const copy = context.generated_text || graph.description;
      await ensureAvailable(dependencies.speak, node.capability)(copy, node.config);
      return { context: { ...context, notified: true }, evidence: `VOICE · 已播报 ${copy.length} 个字符`, provider: contract.provider };
    }
    case 'state.skill_completed': {
      const now = (dependencies.now || (() => new Date()))();
      const createId = dependencies.createId || defaultId;
      const evidenceId = createId('evidence');
      const eventId = createId('skill-event');
      const evidence: SkillEvidenceRecord = {
        evidence_id: evidenceId,
        run_id: runId,
        graph_id: graph.graph_id,
        graph_hash: graph.graph_hash,
        skill_id: graph.skill_id,
        node_id: node.id,
        provider: contract.provider,
        context: jsonObject(context),
        created_at: now.toISOString(),
      };
      await (dependencies.saveEvidence || persistSkillEvidence)(evidence);
      const event: HealthEvent & { schema_version: 1; media_ids: string[] } = {
        schema_version: 1,
        protocol: HEALTH_EVENT_PROTOCOL,
        event_id: eventId,
        user_id: dependencies.userId,
        occurred_at: now.toISOString(),
        domain: 'skill',
        type: 'skill_completed',
        source: { device_id: dependencies.deviceId, provider: 'skill-taskmaster' },
        facts: { session_id: runId, skill_id: graph.skill_id },
        confidence: 1,
        provenance: { model_version: String(context.model_version || 'none'), tool_version: 'skill-runtime/1.0.0', input_hash: graph.graph_hash },
        visibility: node.config.visibility === 'friends' || node.config.visibility === 'public' ? node.config.visibility : 'private',
        media_ids: [],
        sync: { state: 'pending', revision: 0 },
      };
      const result = await ensureAvailable(dependencies.syncHealthEvent, node.capability)(event);
      if (result.status === 'conflict' || result.status === 'invalid') {
        throw new SkillRuntimeError(`health_event_${result.status}`, result.error || `skill_completed 同步失败：${result.status}`);
      }
      return {
        context: { ...context, evidence_id: evidenceId, health_event_id: eventId },
        evidence: `EVIDENCE · ${evidenceId} · CLOUD FACT ${result.status} r${result.revision}`,
        provider: contract.provider,
      };
    }
  }
}

async function emit(trace: SkillRunTrace, dependencies: SkillRuntimeDependencies): Promise<void> {
  await persistSkillRun(trace);
  await dependencies.onTrace?.(structuredClone(trace));
}

export async function executeSkillGraph(graph: CompiledSkillGraph, dependencies: SkillRuntimeDependencies): Promise<SkillRunTrace> {
  if (!verifyGraphHash(graph)) throw new SkillRuntimeError('graph_hash_mismatch', '技能图已被改动，必须重新编译后再运行。');
  const now = dependencies.now || (() => new Date());
  const createId = dependencies.createId || defaultId;
  const runId = createId('skill-run');
  let trace = initialTrace(graph, runId, now(), 'live');
  let context: SkillExecutionContext = {
    run_id: runId,
    skill_id: graph.skill_id,
    graph_hash: graph.graph_hash,
    user_confirmed: false,
  };
  await emit(trace, dependencies);

  for (let index = 0; index < graph.nodes.length; index += 1) {
    throwIfCancelled(dependencies.signal);
    const node = graph.nodes[index];
    const startedAt = now().toISOString();
    trace = {
      ...trace,
      steps: trace.steps.map((step, stepIndex) => stepIndex === index
        ? { ...step, status: 'running', started_at: startedAt, evidence: `RUNNING · ${node.provider_binding}` }
        : step),
    };
    await emit(trace, dependencies);
    try {
      const result = await runNode(graph, node, context, dependencies, runId);
      context = result.context;
      const completedAt = now().toISOString();
      const completedStep: SkillRunStep = {
        ...trace.steps[index],
        status: 'completed',
        provider: result.provider,
        evidence: result.evidence,
        completed_at: completedAt,
        output: jsonObject(context),
      };
      trace = { ...trace, steps: trace.steps.map((step, stepIndex) => stepIndex === index ? completedStep : step) };
      await emit(trace, dependencies);
    } catch (error) {
      const runtimeError = error instanceof SkillRuntimeError
        ? error
        : new SkillRuntimeError('provider_failed', error instanceof Error ? error.message : '能力执行失败');
      const status = runtimeError.code === 'safety_stop'
        ? 'safe_stopped'
        : runtimeError.code === 'permission_denied' ? 'waiting_permission' : 'failed';
      trace = {
        ...trace,
        status,
        completed_at: now().toISOString(),
        note: runtimeError.message,
        steps: trace.steps.map((step, stepIndex) => stepIndex === index
          ? { ...step, status: 'blocked', completed_at: now().toISOString(), evidence: `BLOCKED · ${runtimeError.code}`, error: { code: runtimeError.code, message: runtimeError.message } }
          : stepIndex > index ? { ...step, status: 'skipped', evidence: '上游未完成，未执行' } : step),
      };
      await emit(trace, dependencies);
      return trace;
    }
  }

  trace = {
    ...trace,
    status: 'completed',
    completed_at: now().toISOString(),
    note: `已按 ${graph.graph_hash.slice(0, 20)}… 执行完成；云端只收到允许的完成事实。`,
  };
  await emit(trace, dependencies);
  return trace;
}

export async function executeStoredSkillGraph(
  graphId: string,
  expectedHash: CompiledSkillGraph['graph_hash'],
  dependencies: SkillRuntimeDependencies,
): Promise<SkillRunTrace> {
  const graph = await getCompiledGraph(graphId);
  if (!graph) throw new SkillRuntimeError('graph_not_found', '本机没有找到这份已编译技能图。');
  if (graph.graph_hash !== expectedHash) throw new SkillRuntimeError('graph_hash_mismatch', '运行要求的 Hash 与本机图不一致。');
  return executeSkillGraph(graph, dependencies);
}
