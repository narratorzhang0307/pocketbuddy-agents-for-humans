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

const ACTIVE_SESSION_KEY = 'pe.frost.agent.active-session.v1';
const SESSION_PREFIX = 'frost:local-user:';

export interface FrostAgentRunResult {
  session: FrostAgentSession;
  events: FrostAgentEvent[];
  task: FrostTaskSession | null;
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

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function taskFromEvents(events: FrostAgentEvent[]): FrostTaskSession | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type !== 'tool.result' || !record(event.data.result)) continue;
    const result = event.data.result;
    if (!record(result.data) || !record(result.data.task)) continue;
    return structuredClone(result.data.task) as unknown as FrostTaskSession;
  }
  return null;
}

async function createClient(sessionId: string): Promise<Client> {
  rememberSessionId(sessionId);
  const health = getFrostHealthRuntime();
  const approvals = new InMemoryFrostApprovalStore();
  const tools = new FrostAgentToolRegistry({
    default_timeout_ms: 45_000,
    approval_gate: new ReceiptApprovalGate(approvals),
  });
  const skills = new TaskmasterSkillProvider(health.skills);
  for (const tool of createSkillAgentTools(skills)) tools.register(tool);
  for (const tool of createTaskmasterAgentTools(health.taskmaster)) tools.register(tool);
  const model = new QwenFrostModelAdapter(
    edgeQwenCompletion(edgeSafe),
    tools,
    skills,
    { fallback: new LocalHealthFallbackModel(skills), max_events: 48, max_context_chars: 18_000 },
  );
  const log = new IndexedDbFrostSessionLog();
  const loop = new FrostAgentLoop(
    FrostAgentLoop.createSession(sessionId, 'local-user'),
    model,
    tools,
    log,
    { max_steps: 12, max_tool_calls: 12, deadline_ms: 5 * 60 * 1000 },
  );
  await loop.initialize();
  const goals = new IndexedDbFrostGoalStore();
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

export async function sendFrostAgentMessage(text: string): Promise<FrostAgentRunResult> {
  const client = await activeClient();
  const before = await client.log.list(client.loop.getSession().session_id);
  const cursor = before[before.length - 1]?.seq || 0;
  const waiting = taskFromEvents(before);
  const action = waiting?.status === 'waiting_confirmation' ? waiting.actions[waiting.next_action_index] : undefined;
  if (action?.status === 'waiting_confirmation' && /(确认|同意|开始|可以|继续)/.test(text)) {
    await issueFrostApproval(client.approvals, {
      approval_id: `${client.loop.getSession().session_id}:approval:${cursor + 1}`,
      session_id: client.loop.getSession().session_id,
      tool: 'taskmaster.confirm',
      arguments: { task_id: waiting!.task_id, action_id: action.action_id },
      decision: 'allow',
      reason: 'explicit_user_confirmation',
    });
  }
  await client.loop.followup({ text: text.trim() });
  await client.loop.whenIdle();
  const events = await client.log.list(client.loop.getSession().session_id, cursor);
  return { session: client.loop.getSession(), events, task: taskFromEvents(events) };
}

/** Skill/device completion re-enters the same Agent Loop as next-step evidence. */
export async function resumeFrostAgentFromTaskSignal(signal: JsonObject): Promise<void> {
  if (!existingSessionId() || typeof signal.task_id !== 'string') return;
  const client = await activeClient();
  const history = await client.log.list(client.loop.getSession().session_id);
  if (!history.some((event) => taskFromEvents([event])?.task_id === signal.task_id)) return;
  await client.loop.steer(structuredClone(signal), 'skill');
  await client.loop.whenIdle();
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
