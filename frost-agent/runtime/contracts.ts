import { isJsonObject, type FrostTaskKind, type JsonObject } from '../taskmaster/contracts';

export const FROST_AGENT_SESSION_PROTOCOL = 'frost-agent-session/v1' as const;
export const FROST_AGENT_EVENT_PROTOCOL = 'frost-agent-event/v1' as const;
export const FROST_AGENT_DECISION_PROTOCOL = 'frost-agent-decision/v1' as const;

export type FrostAgentStatus =
  | 'idle'
  | 'running'
  | 'waiting_user'
  | 'waiting_external'
  | 'stopped'
  | 'failed';

export interface FrostAgentSession {
  protocol: typeof FROST_AGENT_SESSION_PROTOCOL;
  session_id: string;
  user_id: string;
  status: FrostAgentStatus;
  active_goal_id?: string;
  created_at: string;
  updated_at: string;
  counters: { turns: number; steps: number; tool_calls: number };
}

export type FrostAgentEventType =
  | 'session.created'
  | 'session.restored'
  | 'session.status_changed'
  | 'session.stopped'
  | 'inbox.queued'
  | 'inbox.claimed'
  | 'inbox.discarded'
  | 'turn.started'
  | 'turn.ended'
  | 'step.started'
  | 'step.ended'
  | 'user.message'
  | 'context.injected'
  | 'assistant.message'
  | 'decision.recorded'
  | 'decision.invalid'
  | 'tool.called'
  | 'tool.result'
  | 'subagent.report'
  | 'skill.dispatched'
  | 'skill.result'
  | 'peripheral.input';

export interface FrostAgentEvent<T extends JsonObject = JsonObject> {
  protocol: typeof FROST_AGENT_EVENT_PROTOCOL;
  event_id: string;
  session_id: string;
  seq: number;
  type: FrostAgentEventType;
  occurred_at: string;
  data: T;
}

export type NextAction =
  | { type: 'load_skill'; skill_id: string }
  | { type: 'call_tool'; tool: string; arguments: JsonObject }
  | { type: 'start_task'; task_kind: FrostTaskKind; input: JsonObject }
  | { type: 'ask_user'; question: string; reason: string }
  | { type: 'wait_external'; reason: string }
  | { type: 'complete'; summary: string; evidence_ids: string[] }
  | { type: 'safe_stop'; reason: string };

export interface FrostAgentDecision {
  protocol: typeof FROST_AGENT_DECISION_PROTOCOL;
  goal: string;
  observations: string[];
  next_action: NextAction;
  confidence: number;
  risk: 'low' | 'medium' | 'high';
  success_condition: string;
}

export interface FrostAgentModelContext {
  session: FrostAgentSession;
  events: FrostAgentEvent[];
  turn: number;
  step: number;
  signal: AbortSignal;
  /** Host-normalized task facts after a child clarification, never a model-authored instruction. */
  task_intent?: { kind: FrostTaskKind; skill: string; input: JsonObject; goal: string };
}

export interface FrostAgentModelAdapter {
  decide(context: FrostAgentModelContext): Promise<unknown>;
}

export type FrostAgentToolStatus =
  | 'success'
  | 'waiting_user'
  | 'waiting_external'
  | 'error'
  | 'cancelled';

export interface FrostAgentToolResult {
  status: FrostAgentToolStatus;
  data: JsonObject;
  message?: string;
}

export interface FrostAgentToolContext {
  session: FrostAgentSession;
  call_id: string;
  signal: AbortSignal;
  events: FrostAgentEvent[];
}

export interface FrostAgentToolDefinition {
  name: string;
  description: string;
  read_only: boolean;
  risk: 'low' | 'medium' | 'high';
  model_visible?: boolean;
  requires_approval?: boolean;
  timeout_ms?: number;
  validate_input?: (input: JsonObject) => string[];
  execute(input: JsonObject, context: FrostAgentToolContext): Promise<FrostAgentToolResult>;
}

export interface FrostAgentToolApprovalRequest {
  tool: Pick<FrostAgentToolDefinition, 'name' | 'description' | 'read_only' | 'risk'>;
  input: JsonObject;
  context: FrostAgentToolContext;
}

export interface FrostAgentToolApprovalDecision {
  decision: 'allow' | 'deny' | 'ask';
  reason: string;
}

export interface FrostAgentToolApprovalGate {
  check(request: FrostAgentToolApprovalRequest): Promise<FrostAgentToolApprovalDecision>;
}

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function exactKeys(value: Record<string, unknown>, expected: string[], errors: string[], label: string): void {
  const expectedSet = new Set(expected);
  for (const key of Object.keys(value)) if (!expectedSet.has(key)) errors.push(`${label} 包含未知字段 ${key}`);
  for (const key of expected) if (!(key in value)) errors.push(`${label} 缺少字段 ${key}`);
}

function validateNextAction(value: unknown, errors: string[]): value is NextAction {
  if (!record(value) || !nonEmptyText(value.type)) {
    errors.push('next_action 必须是带 type 的对象');
    return false;
  }
  switch (value.type) {
    case 'load_skill':
      exactKeys(value, ['type', 'skill_id'], errors, 'next_action');
      if (!nonEmptyText(value.skill_id)) errors.push('skill_id 不能为空');
      break;
    case 'call_tool':
      exactKeys(value, ['type', 'tool', 'arguments'], errors, 'next_action');
      if (!nonEmptyText(value.tool)) errors.push('tool 不能为空');
      if (!isJsonObject(value.arguments)) errors.push('arguments 必须是 JSON 对象');
      break;
    case 'start_task':
      exactKeys(value, ['type', 'task_kind', 'input'], errors, 'next_action');
      if (!['log_meal', 'start_workout', 'plan_run_route', 'complete_run', 'capture_nature', 'daily_review'].includes(String(value.task_kind))) {
        errors.push('task_kind 不受 Taskmaster 支持');
      }
      if (!isJsonObject(value.input)) errors.push('input 必须是 JSON 对象');
      break;
    case 'ask_user':
      exactKeys(value, ['type', 'question', 'reason'], errors, 'next_action');
      if (!nonEmptyText(value.question) || !nonEmptyText(value.reason)) errors.push('question 和 reason 不能为空');
      break;
    case 'wait_external':
    case 'safe_stop':
      exactKeys(value, ['type', 'reason'], errors, 'next_action');
      if (!nonEmptyText(value.reason)) errors.push('reason 不能为空');
      break;
    case 'complete':
      exactKeys(value, ['type', 'summary', 'evidence_ids'], errors, 'next_action');
      if (!nonEmptyText(value.summary)) errors.push('summary 不能为空');
      if (!Array.isArray(value.evidence_ids) || value.evidence_ids.some((item) => !nonEmptyText(item))) {
        errors.push('evidence_ids 必须是字符串数组');
      }
      break;
    default:
      errors.push(`next_action.type 不受支持：${value.type}`);
  }
  return errors.length === 0;
}

export function validateFrostAgentDecision(value: unknown): ValidationResult<FrostAgentDecision> {
  const errors: string[] = [];
  if (!record(value)) return { ok: false, errors: ['decision 必须是对象'] };
  exactKeys(value, ['protocol', 'goal', 'observations', 'next_action', 'confidence', 'risk', 'success_condition'], errors, 'decision');
  if (value.protocol !== FROST_AGENT_DECISION_PROTOCOL) errors.push(`protocol 必须是 ${FROST_AGENT_DECISION_PROTOCOL}`);
  if (!nonEmptyText(value.goal)) errors.push('goal 不能为空');
  if (!Array.isArray(value.observations) || value.observations.some((item) => !nonEmptyText(item))) errors.push('observations 必须是字符串数组');
  validateNextAction(value.next_action, errors);
  if (typeof value.confidence !== 'number' || value.confidence < 0 || value.confidence > 1) errors.push('confidence 必须在 0 到 1 之间');
  if (!['low', 'medium', 'high'].includes(String(value.risk))) errors.push('risk 不受支持');
  if (!nonEmptyText(value.success_condition)) errors.push('success_condition 不能为空');
  return errors.length === 0
    ? { ok: true, value: structuredClone(value) as unknown as FrostAgentDecision, errors: [] }
    : { ok: false, errors };
}

export function validateFrostAgentToolResult(value: unknown): ValidationResult<FrostAgentToolResult> {
  const errors: string[] = [];
  if (!record(value)) return { ok: false, errors: ['tool result 必须是对象'] };
  for (const key of Object.keys(value)) if (!['status', 'data', 'message'].includes(key)) errors.push(`tool result 包含未知字段 ${key}`);
  if (!['success', 'waiting_user', 'waiting_external', 'error', 'cancelled'].includes(String(value.status))) errors.push('tool result status 不受支持');
  if (!isJsonObject(value.data)) errors.push('tool result data 必须是 JSON 对象');
  if (value.message !== undefined && typeof value.message !== 'string') errors.push('tool result message 必须是字符串');
  return errors.length === 0
    ? { ok: true, value: structuredClone(value) as unknown as FrostAgentToolResult, errors: [] }
    : { ok: false, errors };
}
