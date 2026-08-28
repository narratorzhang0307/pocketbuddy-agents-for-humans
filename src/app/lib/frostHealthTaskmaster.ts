import {
  FrostHealthTaskmaster,
  HealthSkillRegistry,
  IndexedDbTaskmasterStore,
  PersistentTraceSink,
  HEALTH_EVENT_PROTOCOL,
  TASK_SIGNAL_PROTOCOL,
  createDefaultTools,
  type HealthEvent,
  type JsonObject,
  type FrostTaskSession,
  type Observation,
  type ExternalHealthProviders,
  type TaskSignal,
} from '../../../frost-agent/taskmaster';
import { createRunRouteSessionFromTaskmaster, runRouteTaskInput, type RunRouteInput } from './runRouteSkill';
import { localHealthDay } from '../../../frost-agent/taskmaster/summary';

export interface FrostHealthRuntime {
  taskmaster: FrostHealthTaskmaster;
  store: IndexedDbTaskmasterStore;
  traces: PersistentTraceSink;
  skills: HealthSkillRegistry;
}

/**
 * PWA 的单例入口。真实 Qwen/SAM、Her Motion 与自然识别能力通过 providers 注入；
 * 未注入的能力会进入 waiting_external，不会返回假成功。
 */
let runtime: FrostHealthRuntime | null = null;

export function getFrostHealthRuntime(providers: ExternalHealthProviders = {}): FrostHealthRuntime {
  if (runtime) return runtime;
  const store = new IndexedDbTaskmasterStore();
  const traces = new PersistentTraceSink(store);
  const skills = new HealthSkillRegistry();
  const tools = createDefaultTools({
    planRoute: async (input, context) => {
      const session = createRunRouteSessionFromTaskmaster({ ...input, source_task_id: context.request.task_id });
      return {
        route_session_id: session.session_id,
        status: session.status,
        ui_action: { tab: 'earth', mode: 'route_preview', session_id: session.session_id },
      };
    },
    ...providers,
  });
  runtime = { store, traces, skills, taskmaster: new FrostHealthTaskmaster(store, tools, traces, skills) };
  return runtime;
}

async function currentSignalTarget(taskId: string): Promise<{ session: FrostTaskSession; action: FrostTaskSession['actions'][number] }> {
  const session = await getFrostHealthRuntime().taskmaster.get(taskId);
  if (!session) throw new Error(`task_not_found:${taskId}`);
  const action = session.actions[session.next_action_index];
  if (!action) throw new Error(`task_has_no_waiting_action:${taskId}`);
  return { session, action };
}

export async function submitTaskSignal(input: {
  taskId: string;
  signalId: string;
  actor: TaskSignal['actor'];
  payload: JsonObject;
  events?: HealthEvent[];
}): Promise<FrostTaskSession> {
  const { session, action } = await currentSignalTarget(input.taskId);
  const completed = await getFrostHealthRuntime().taskmaster.signal({
    protocol: TASK_SIGNAL_PROTOCOL,
    signal_id: input.signalId,
    task_id: session.task_id,
    run_id: session.run_id,
    action_id: action.action_id,
    correlation_id: action.correlation_id,
    kind: 'tool_result',
    occurred_at: new Date().toISOString(),
    actor: input.actor,
    payload: structuredClone(input.payload),
    ...(input.events ? { events: structuredClone(input.events) } : {}),
  });
  if (typeof window !== 'undefined') {
    const { resumeFrostAgentFromTaskSignal } = await import('./frostAgentRuntime');
    await resumeFrostAgentFromTaskSignal({
      signal_id: input.signalId,
      task_id: completed.task_id,
      run_id: completed.run_id,
      status: completed.status,
    });
  }
  return completed;
}

export interface StartHerMotionTaskInput {
  taskId?: string;
  planId?: string;
  stepId?: string;
  objective?: string;
}

export async function startMealTask(input: StartHerMotionTaskInput = {}): Promise<FrostTaskSession> {
  const taskId = input.taskId || `health-log_meal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const taskmaster = getFrostHealthRuntime().taskmaster;
  const existing = await taskmaster.get(taskId);
  if (existing) return existing;
  return taskmaster.start({
    task_id: taskId,
    user_id: 'local-user',
    kind: 'log_meal',
    requested_at: new Date().toISOString(),
    input: {
      taskmaster_task_id: taskId,
      ...(input.planId ? { plan_id: input.planId } : {}),
      ...(input.stepId ? { step_id: input.stepId } : {}),
      ...(input.objective ? { objective: input.objective.slice(0, 240) } : {}),
    },
    source: 'agent',
  });
}

/** A user-requested fitness launch can confirm this workout; OS camera permission is still enforced. */
export async function startHerMotionTask(input: StartHerMotionTaskInput & { confirmCamera?: boolean } = {}): Promise<FrostTaskSession> {
  const taskId = input.taskId || `health-start_workout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const runtime = getFrostHealthRuntime();
  let session = await runtime.taskmaster.get(taskId);
  if (!session) session = await runtime.taskmaster.start({
    task_id: taskId,
    user_id: 'local-user',
    kind: 'start_workout',
    requested_at: new Date().toISOString(),
    input: {
      taskmaster_task_id: taskId,
      ...(input.planId ? { plan_id: input.planId } : {}),
      ...(input.stepId ? { step_id: input.stepId } : {}),
      ...(input.objective ? { objective: input.objective.slice(0, 240) } : {}),
    },
    source: input.confirmCamera ? 'user' : 'agent',
  });
  if (input.confirmCamera && session.status === 'waiting_confirmation') {
    const action = session.actions[session.next_action_index];
    if (action?.status === 'waiting_confirmation') session = await runtime.taskmaster.confirm(session.task_id, action.action_id);
  }
  return session;
}

/** Skill 表单与 Frost 对话共用同一 Taskmaster 路线入口。 */
export async function startRunRouteTask(input: RunRouteInput, taskId = `health-plan_run_route-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`): Promise<FrostTaskSession> {
  const taskmaster = getFrostHealthRuntime().taskmaster;
  const existing = await taskmaster.get(taskId);
  if (existing) return existing;
  return taskmaster.start({
    task_id: taskId,
    user_id: 'local-user',
    kind: 'plan_run_route',
    requested_at: new Date().toISOString(),
    input: runRouteTaskInput(input) as JsonObject,
    source: input.source === 'taskmaster' ? 'agent' : input.source,
  });
}

/** Her Motion 只发标准 signal；事件的校验、幂等落库和完成门仍由 Taskmaster 负责。 */
export async function completeHerMotionTask(taskId: string, observation: Observation): Promise<FrostTaskSession> {
  const runtime = getFrostHealthRuntime();
  const existing = await runtime.taskmaster.get(taskId);
  if (!existing) throw new Error(`task_not_found:${taskId}`);
  if (existing.status === 'completed') return existing;
  const event: HealthEvent = {
    protocol: HEALTH_EVENT_PROTOCOL,
    event_id: `${taskId}:skill_completed`,
    user_id: existing.request.user_id,
    occurred_at: new Date().toISOString(),
    domain: 'skill',
    type: 'skill_completed',
    source: { device_id: String(existing.request.input.device_id || 'pwa'), provider: 'her-motion' },
    facts: structuredClone(observation.facts),
    confidence: observation.confidence,
    provenance: {
      model_version: observation.model_version,
      tool_version: observation.tool_version,
      input_hash: observation.input_hash,
    },
    visibility: 'private',
    sync: { state: 'pending', revision: 1 },
  };
  return submitTaskSignal({
    taskId,
    signalId: `${taskId}:her-motion:${observation.input_hash}`,
    actor: 'skill',
    payload: structuredClone(observation.facts),
    events: [event],
  });
}

/** Photos 的确认按钮完成“观察 signal -> 用户确认 -> 唯一健康写入”三段事务。 */
export async function recordMealWithTaskmaster(observation: Observation, taskId = `health-log_meal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`): Promise<FrostTaskSession> {
  const runtime = getFrostHealthRuntime();
  let session = await runtime.taskmaster.get(taskId);
  if (!session) {
    session = await runtime.taskmaster.start({
      task_id: taskId,
      user_id: 'local-user',
      kind: 'log_meal',
      requested_at: new Date().toISOString(),
      input: { taskmaster_task_id: taskId, input_hash: observation.input_hash },
      source: 'user',
    });
  }
  if (session.status === 'waiting_external') {
    session = await submitTaskSignal({
      taskId,
      signalId: `${taskId}:meal-observation:${observation.input_hash}`,
      actor: 'skill',
      payload: { observation: observation as unknown as JsonObject },
    });
  }
  if (session.status === 'waiting_confirmation') {
    const action = session.actions[session.next_action_index];
    if (action?.status === 'waiting_confirmation') session = await runtime.taskmaster.confirm(session.task_id, action.action_id);
  }
  return session;
}

/** 设备完成事实直接进入同一 Taskmaster；没有 GPS 时绝不补造 route_points。 */
export async function completeRunWithTaskmaster(deviceFact: JsonObject, taskId = `health-complete_run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`): Promise<FrostTaskSession> {
  const taskmaster = getFrostHealthRuntime().taskmaster;
  const existing = await taskmaster.get(taskId);
  if (existing) return existing;
  return taskmaster.start({
    task_id: taskId,
    user_id: 'local-user',
    kind: 'complete_run',
    requested_at: new Date().toISOString(),
    input: { device_fact: structuredClone(deviceFact) },
    source: 'device',
  });
}

export async function recordNatureWithTaskmaster(observation: Observation, taskId = `health-capture_nature-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`): Promise<FrostTaskSession> {
  const runtime = getFrostHealthRuntime();
  let session = await runtime.taskmaster.get(taskId);
  if (!session) session = await runtime.taskmaster.start({
    task_id: taskId,
    user_id: 'local-user',
    kind: 'capture_nature',
    requested_at: new Date().toISOString(),
    input: { taskmaster_task_id: taskId, input_hash: observation.input_hash },
    source: 'device',
  });
  if (session.status !== 'waiting_external') return session;
  const facts = {
    ...observation.facts,
    label: observation.confidence >= 0.7 ? observation.facts.label || 'unknown' : 'unknown',
  } as JsonObject;
  const event: HealthEvent = {
    protocol: HEALTH_EVENT_PROTOCOL,
    event_id: `${taskId}:nature_captured`,
    user_id: session.request.user_id,
    occurred_at: new Date().toISOString(),
    domain: 'nature',
    type: 'nature_captured',
    source: { device_id: String(session.request.input.device_id || 'pwa'), provider: 'nature-skill' },
    facts,
    confidence: observation.confidence,
    provenance: { model_version: observation.model_version, tool_version: observation.tool_version, input_hash: observation.input_hash },
    visibility: 'private',
    sync: { state: 'pending', revision: 1 },
  };
  session = await submitTaskSignal({ taskId, signalId: `${taskId}:nature:${observation.input_hash}`, actor: 'skill', payload: facts, events: [event] });
  return session;
}

export async function buildDailyReviewWithTaskmaster(day = localHealthDay(), taskId?: string): Promise<FrostTaskSession> {
  // A previous review is a historical checkpoint, not a forever-cached answer.
  taskId ||= `health-daily_review-${day}-${crypto.randomUUID()}`;
  const taskmaster = getFrostHealthRuntime().taskmaster;
  const existing = await taskmaster.get(taskId);
  if (existing) return existing;
  return taskmaster.start({
    task_id: taskId,
    user_id: 'local-user',
    kind: 'daily_review',
    requested_at: new Date().toISOString(),
    input: { day, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    source: 'schedule',
  });
}
