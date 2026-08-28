import { edgeSafe } from '../../../frost-agent/edge/contract';
import {
  FrostAgentLoop,
  FrostAgentToolRegistry,
  IndexedDbFrostSessionLog,
  IndexedDbFrostGoalStore,
  InMemoryFrostApprovalStore,
  LocalHealthFallbackModel,
  QwenFrostModelAdapter,
  TaskmasterSkillProvider,
  createSkillAgentTools,
  createTaskmasterAgentTools,
  edgeQwenCompletion,
  issueFrostApproval,
  ReceiptApprovalGate,
  FrostGoalDriver,
  createFrostGoal,
  type FrostAgentEvent,
  type FrostAgentSession,
} from '../../../frost-agent/runtime';
import type { FrostTaskSession, JsonObject } from '../../../frost-agent/taskmaster';
import { getFrostHealthRuntime } from './frostHealthTaskmaster';
import { isExplicitTaskConfirmation, pendingFrostTask, pendingTaskConfirmation, taskFromEvents } from '../../../frost-agent/runtime/turnContext';
import { createFrostConversationTools, FrostConversationModel } from './frostConversation';
import { stageTaskHandoff, type FrostTaskHandoff } from '../../../frost-agent/harness/taskHandoff';
import type { FrostPlan, FrostPlanStep } from '../../../frost-agent/harness/skillRouter';
import type { FrostSkillPageResult } from '../../../frost-agent/harness/skillPageResult';

const ACTIVE_SESSION_KEY = 'pe.frost.agent.active-session.v1';
const SESSION_PREFIX = 'frost:local-user:';

export interface FrostAgentRunResult {
  session: FrostAgentSession;
  events: FrostAgentEvent[];
  task: FrostTaskSession | null;
}

export interface FrostAgentRunNotice {
  result: FrostAgentRunResult;
  input?: { text: string; origin: FrostMessageOrigin };
}

export function hasActiveFrostAgentSession(): boolean { return existingSessionId() !== null; }

interface Client {
  loop: FrostAgentLoop;
  log: IndexedDbFrostSessionLog;
  approvals: InMemoryFrostApprovalStore;
  goals: IndexedDbFrostGoalStore;
  goalDriver: FrostGoalDriver;
}

let clientPromise: Promise<Client> | null = null;
let observedSessionId: string | null = null;
const eventListeners = new Set<(event: FrostAgentEvent) => void>();
const runListeners = new Set<(notice: FrostAgentRunNotice) => void>();
const inFlightVoiceInputs = new Set<string>();
let messageRunning = false;

/** Completed turns, shared by phone UI and peripheral feedback. Never replays history. */
export function subscribeFrostAgentRuns(listener: (notice: FrostAgentRunNotice) => void): () => void {
  runListeners.add(listener);
  return () => { runListeners.delete(listener); };
}
function publishRun(notice: FrostAgentRunNotice) {
  for (const listener of runListeners) {
    try { listener(structuredClone(notice)); } catch { /* observers cannot change execution */ }
  }
}

/** Read-only observers share the main session; peripherals never own a second loop. */
export function subscribeFrostAgentEvents(listener: (event: FrostAgentEvent) => void): () => void {
  eventListeners.add(listener);
  return () => { eventListeners.delete(listener); };
}

function existingSessionId(): string | null {
  try {
    const value = localStorage.getItem(ACTIVE_SESSION_KEY);
    return value?.startsWith(SESSION_PREFIX) ? value : null;
  } catch { return null; }
}

function storedSessionId(): string {
  return existingSessionId() || `${SESSION_PREFIX}${Date.now().toString(36)}`;
}

function rememberSessionId(sessionId: string): void {
  try { localStorage.setItem(ACTIVE_SESSION_KEY, sessionId); } catch { /* local-only fallback */ }
}

async function createClient(sessionId: string): Promise<Client> {
  rememberSessionId(sessionId);
  observedSessionId = sessionId;
  const health = getFrostHealthRuntime();
  const approvals = new InMemoryFrostApprovalStore();
  const tools = new FrostAgentToolRegistry({
    default_timeout_ms: 45_000,
    approval_gate: new ReceiptApprovalGate(approvals),
  });
  const skills = new TaskmasterSkillProvider(health.skills);
  const goals = new IndexedDbFrostGoalStore();
  for (const tool of createSkillAgentTools(skills)) tools.register(tool);
  for (const tool of createTaskmasterAgentTools(health.taskmaster)) tools.register(tool);
  for (const tool of createFrostConversationTools(goals)) tools.register(tool);
  const taskModel = new QwenFrostModelAdapter(
    edgeQwenCompletion(edgeSafe),
    tools,
    skills,
    { fallback: new LocalHealthFallbackModel(), max_events: 48, max_context_chars: 18_000 },
  );
  const log = new IndexedDbFrostSessionLog();
  log.subscribe((event) => {
    if (event.session_id !== observedSessionId) return;
    for (const listener of eventListeners) {
      try { listener(structuredClone(event)); } catch { /* presentation cannot roll back execution */ }
    }
  });
  const loop = new FrostAgentLoop(
    FrostAgentLoop.createSession(sessionId, 'local-user'),
    new FrostConversationModel(taskModel),
    tools,
    log,
    { max_steps: 12, max_tool_calls: 12, deadline_ms: 5 * 60 * 1000 },
  );
  await loop.initialize();
  return { loop, log, approvals, goals, goalDriver: new FrostGoalDriver(loop, goals) };
}

async function activeClient(): Promise<Client> {
  if (!clientPromise) clientPromise = createClient(storedSessionId());
  let client = await clientPromise;
  const status = client.loop.getSession().status;
  if (status === 'stopped' || status === 'failed') {
    clientPromise = createClient(`${SESSION_PREFIX}${Date.now().toString(36)}`);
    client = await clientPromise;
  }
  return client;
}

export interface FrostMessageOrigin { channel: 'phone' | 'badge_voice'; inputId?: string }

export async function sendFrostAgentMessage(text: string, origin: FrostMessageOrigin = { channel: 'phone' }): Promise<FrostAgentRunResult> {
  if (!text.trim()) throw new Error('frost_message_required');
  if (!['phone', 'badge_voice'].includes(origin.channel)
    || (origin.channel === 'badge_voice' && !/^[a-zA-Z0-9:_-]{1,160}$/.test(origin.inputId || ''))) throw new Error('invalid_frost_input_origin');
  const client = await activeClient();
  if (messageRunning || client.loop.getSession().status === 'running') throw new Error('Frost 正在处理上一条指令，请等回复后再发送。');
  const voiceKey = origin.channel === 'badge_voice' ? `${client.loop.getSession().session_id}:${origin.inputId}` : null;
  if (voiceKey && inFlightVoiceInputs.has(voiceKey)) throw new Error('这段吧唧语音正在处理，未重复调用 Agent。');
  if (voiceKey) inFlightVoiceInputs.add(voiceKey);
  messageRunning = true;
  try {
    const before = await client.log.list(client.loop.getSession().session_id);
    const cursor = before[before.length - 1]?.seq || 0;
    const waiting = pendingTaskConfirmation(before);
    if (origin.channel === 'badge_voice' && waiting && isExplicitTaskConfirmation(text)) {
      throw new Error('这项权限需要在手机上明确确认，不能用识别出的语音代替授权。');
    }
    if (origin.channel === 'badge_voice' && origin.inputId && before.some(event => {
      const content = event.data.content as JsonObject | undefined;
      return event.type === 'user.message' && content?.input_channel === 'badge_voice' && content.input_id === origin.inputId;
    })) throw new Error('这段吧唧语音已发送，未重复调用 Agent。');
    const action = waiting?.status === 'waiting_confirmation' ? waiting.actions[waiting.next_action_index] : undefined;
    if (action?.status === 'waiting_confirmation' && isExplicitTaskConfirmation(text)) {
      await issueFrostApproval(client.approvals, {
        approval_id: `${client.loop.getSession().session_id}:approval:${cursor + 1}`,
        session_id: client.loop.getSession().session_id,
        tool: 'taskmaster.confirm',
        arguments: { task_id: waiting!.task_id, action_id: action.action_id },
        decision: 'allow',
        reason: 'explicit_user_confirmation',
      });
    }
    await client.loop.followup({ text: text.trim(), input_channel: origin.channel,
      ...(origin.inputId ? { input_id: origin.inputId } : {}) });
    await client.loop.whenIdle();
    const events = await client.log.list(client.loop.getSession().session_id, cursor);
    const prior = isExplicitTaskConfirmation(text) ? pendingFrostTask(before) : null;
    const task = taskFromEvents(events) || (prior ? await getFrostHealthRuntime().taskmaster.get(prior.task_id) : null);
    const result = { session: client.loop.getSession(), events, task };
    publishRun({ result, input: { text: text.trim(), origin } });
    return result;
  } finally { messageRunning = false; if (voiceKey) inFlightVoiceInputs.delete(voiceKey); }
}

/** Audit metadata only: no PCM, transcription, tool invocation, approval or model wake-up. */
export async function recordFrostPeripheralInput(input: {
  id: string; kind: 'touch' | 'recording_ready'; count?: number; bytes?: number;
}): Promise<void> {
  if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(input.id)) throw new Error('invalid_peripheral_event_id');
  if (!['touch', 'recording_ready'].includes(input.kind)
    || (input.count !== undefined && (!Number.isSafeInteger(input.count) || input.count < 0 || input.count > 0xffffffff))
    || (input.bytes !== undefined && (!Number.isSafeInteger(input.bytes) || input.bytes < 0 || input.bytes > 960000))) throw new Error('invalid_peripheral_event');
  const client = clientPromise ? await clientPromise : await activeClient();
  await client.log.append({
    event_id: `${client.loop.getSession().session_id}:peripheral:${input.id}`,
    session_id: client.loop.getSession().session_id, type: 'peripheral.input',
    data: { source: 'badge', kind: input.kind,
      ...(Number.isSafeInteger(input.count) ? { count: input.count! } : {}),
      ...(Number.isSafeInteger(input.bytes) ? { bytes: input.bytes! } : {}) },
  });
}

/** Skill/device completion re-enters the same Agent Loop as next-step evidence. */
export async function resumeFrostAgentFromTaskSignal(signal: JsonObject): Promise<void> {
  if (!existingSessionId() || typeof signal.task_id !== 'string') return;
  const client = await activeClient();
  const history = await client.log.list(client.loop.getSession().session_id);
  if (!history.some((event) => taskFromEvents([event])?.task_id === signal.task_id)) return;
  await client.loop.steer(structuredClone(signal), 'skill');
  await client.loop.whenIdle();
  const events = await client.log.list(client.loop.getSession().session_id, history.at(-1)?.seq || 0);
  publishRun({ result: { session: client.loop.getSession(), events, task: taskFromEvents(events) } });
}

export async function readFrostAgentSnapshot(): Promise<FrostAgentRunResult> {
  const client = await activeClient();
  const events = await client.log.list(client.loop.getSession().session_id);
  const inputSeq = [...events].reverse().find(event => event.type === 'user.message' && event.data.source === 'user')?.seq || 0;
  // Restoring a new memory/query turn must not resurrect an older workout's Run button.
  return { session: client.loop.getSession(), events, task: taskFromEvents(events.filter(event => event.seq > inputSeq)) };
}

/** Called by the existing phone Run button. Opening a page grants no camera/data permission. */
export async function stageFrostAgentHandoff(plan: FrostPlan, step: FrostPlanStep, text: string, taskId?: string): Promise<FrostTaskHandoff> {
  const client = await activeClient();
  const handoff = stageTaskHandoff(plan, step, text, taskId, client.loop.getSession().session_id);
  await client.log.append({ session_id: handoff.agentSessionId!, event_id: `${handoff.agentSessionId}:dispatch:${handoff.runId}`,
    type: 'skill.dispatched', data: { run_id: handoff.runId, skill_id: handoff.skillId, target: handoff.target,
      plan_id: handoff.planId, step_id: handoff.stepId, taskmaster_task_id: taskId || null } });
  return handoff;
}

/** A matching page may return a bounded summary. Health Taskmaster tasks MUST use their validated signal path. */
export async function reportFrostSkillPageResult(handoff: FrostTaskHandoff, report: FrostSkillPageResult): Promise<void> {
  if (!handoff.agentSessionId || handoff.agentSessionId !== existingSessionId() || handoff.taskmasterTaskId) throw new Error('页面结果与当前 Frost 会话不匹配，请返回 Frost 重新打开能力。');
  if (!['completed', 'blocked', 'failed'].includes(report.status) || typeof report.summary !== 'string'
    || !report.summary.trim() || report.summary.length > 500) throw new Error('invalid_skill_page_result');
  const client = await activeClient();
  if (client.loop.getSession().session_id !== handoff.agentSessionId) throw new Error('Frost 会话已改变，请重新发起任务。');
  if (messageRunning || client.loop.getSession().status === 'running') throw new Error('Frost 正在处理指令，请稍后手动交回结果。');
  messageRunning = true;
  try {
    const history = await client.log.list(handoff.agentSessionId);
    if (!history.some(event => event.type === 'skill.dispatched' && event.data.run_id === handoff.runId
      && event.data.skill_id === handoff.skillId && event.data.target === handoff.target
      && event.data.plan_id === handoff.planId && event.data.step_id === handoff.stepId
      && !event.data.taskmaster_task_id)) throw new Error('未找到匹配的能力交接记录');
    const id = `${handoff.agentSessionId}:page-result:${handoff.runId}`;
    const { recordSkillUsage, recordCompletedWorkout } = await import('./frostHealthMemory');
    const oldResult = history.find(event => event.event_id === id);
    if (report.workout) {
      if (handoff.skillId !== 'pocket.lianlema' || report.status !== 'completed') throw new Error('workout_result_requires_live_fitness_skill');
      await recordCompletedWorkout(`${id}:workout`, report.workout, oldResult?.occurred_at || new Date().toISOString());
    }
    await recordSkillUsage(id, handoff.skillId, String(oldResult?.data.status || report.status), oldResult?.occurred_at || new Date().toISOString());
    if (history.some(event => event.event_id === id)) return;
    await client.log.append({ session_id: handoff.agentSessionId, event_id: id, type: 'skill.result',
      data: { run_id: handoff.runId, skill_id: handoff.skillId, target: handoff.target,
        status: report.status, summary: report.summary.trim() } });
    await client.loop.steer({ page_result_id: id }, 'skill');
    await client.loop.whenIdle();
    const events = await client.log.list(handoff.agentSessionId, history.at(-1)?.seq || 0);
    publishRun({ result: { session: client.loop.getSession(), events, task: null } });
  } finally { messageRunning = false; }
}

export async function readFrostAgentEvents(afterSeq = 0): Promise<FrostAgentEvent[]> {
  const client = await activeClient();
  return client.log.list(client.loop.getSession().session_id, afterSeq);
}

export async function scheduleFrostAgentGoal(input: {
  objective: string;
  context?: JsonObject;
  run_at?: string;
  interval_ms?: number;
  max_rounds?: number;
}): Promise<string> {
  const client = await activeClient();
  const session = client.loop.getSession();
  const goalId = `${session.session_id}:goal:${Date.now().toString(36)}`;
  await client.goals.create(createFrostGoal({
    goal_id: goalId,
    session_id: session.session_id,
    user_id: session.user_id,
    objective: input.objective,
    context: input.context,
    run_at: input.run_at,
    interval_ms: input.interval_ms,
    max_rounds: input.max_rounds,
  }));
  return goalId;
}

export async function runFrostGoalDriverOnce(): Promise<string[]> {
  return (await activeClient()).goalDriver.runDue();
}

let goalTimer: ReturnType<typeof setInterval> | null = null;
let goalTickRunning = false;

export function startFrostGoalDriver(intervalMs = 30_000): () => void {
  if (goalTimer) return () => undefined;
  const tick = async () => {
    if (goalTickRunning) return;
    goalTickRunning = true;
    try { await runFrostGoalDriverOnce(); } finally { goalTickRunning = false; }
  };
  void tick();
  goalTimer = setInterval(() => { void tick(); }, intervalMs);
  return () => {
    if (goalTimer) clearInterval(goalTimer);
    goalTimer = null;
  };
}
