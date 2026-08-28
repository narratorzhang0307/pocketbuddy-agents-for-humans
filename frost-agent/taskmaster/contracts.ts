/** Frost Health Taskmaster 的持久化边界。字段名与设备/TiDB 线协议保持一致。 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export const HEALTH_EVENT_PROTOCOL = 'health_event/v1' as const;
export const DEVICE_EVENT_PROTOCOL = 'device_event/v1' as const;
export const HEALTH_SKILL_PROTOCOL = 'frost-health-skill/v1' as const;
export const TASK_PROTOCOL = 'frost-task/v1' as const;
export const TASK_SIGNAL_PROTOCOL = 'task_signal/v1' as const;
export const EFFECT_RECORD_PROTOCOL = 'effect_record/v1' as const;

export type HealthDomain = 'meal' | 'workout' | 'nature' | 'skill' | 'device';
export type HealthEventType =
  | 'meal_confirmed'
  | 'run_completed'
  | 'nature_captured'
  | 'skill_completed'
  | 'device_state_changed';

export interface HealthEvent {
  protocol: typeof HEALTH_EVENT_PROTOCOL;
  event_id: string;
  user_id: string;
  occurred_at: string;
  domain: HealthDomain;
  type: HealthEventType;
  source: { device_id: string; provider: string };
  facts: JsonObject;
  confidence: number;
  provenance: { model_version: string; tool_version: string; input_hash: string };
  visibility: 'private' | 'friends' | 'public';
  sync: { state: 'local' | 'pending' | 'synced' | 'failed'; revision: number };
  supersedes_event_id?: string;
}

export type DeviceEventKind =
  | 'workout_started'
  | 'workout_paused'
  | 'workout_resumed'
  | 'workout_completed'
  | 'nature_capture'
  | 'feeling_mark'
  | 'skill_completed'
  | 'device_state';

export interface DeviceEvent {
  protocol: typeof DEVICE_EVENT_PROTOCOL;
  event_id: string;
  user_id: string;
  device_id: string;
  occurred_at: string;
  kind: DeviceEventKind;
  geo?: { latitude: number; longitude: number; accuracy_m?: number };
  payload: JsonObject;
  media?: Array<{ id: string; mime_type: string; local_uri?: string; sha256?: string }>;
  sync: { state: 'local' | 'pending' | 'synced' | 'failed'; revision: number };
}

export type SkillPermission =
  | 'read:health_events'
  | 'write:health_events'
  | 'read:local_files'
  | 'read:wearable'
  | 'read:public_sources'
  | 'read:location'
  | 'write:route'
  | 'capture:camera'
  | 'capture:microphone'
  | 'run:model'
  | 'publish:map'
  | 'notify:user';

export interface HealthSkillStep {
  id: string;
  tool: string;
  purpose: string;
  requires_confirmation: boolean;
}

export interface HealthSkillDefinition {
  protocol: typeof HEALTH_SKILL_PROTOCOL;
  skill_id: string;
  title: string;
  description: string;
  when_to_use: string[];
  not_for: string[];
  eligibility: string[];
  permissions: SkillPermission[];
  steps: HealthSkillStep[];
  stop_rules: string[];
  completion: string[];
  provenance: {
    version: string;
    owner: string;
    source_url?: string;
    source_commit?: string;
    license?: string;
    adaptation?: string;
  };
}

export type FrostTaskKind =
  | 'log_meal'
  | 'start_workout'
  | 'plan_run_route'
  | 'complete_run'
  | 'capture_nature'
  | 'daily_review';

export type FrostTaskStatus =
  | 'created'
  | 'planned'
  | 'waiting_confirmation'
  | 'waiting_external'
  | 'running'
  | 'completed'
  | 'failed'
  | 'safe_stopped';

export interface FrostTaskRequest {
  task_id: string;
  user_id: string;
  kind: FrostTaskKind;
  requested_at: string;
  input: JsonObject;
  source: 'user' | 'device' | 'schedule' | 'agent';
}

export interface FrostTaskAction {
  action_id: string;
  correlation_id: string;
  tool: string;
  purpose: string;
  input: JsonObject;
  permission: SkillPermission;
  requires_confirmation: boolean;
  status: 'pending' | 'waiting_confirmation' | 'waiting_external' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: JsonObject;
  error?: string;
}

export type TaskSignalKind = 'tool_result' | 'tool_error' | 'cancel';

/** 外部 Skill / 设备只通过这一种信号恢复 Taskmaster，不直接改任务或健康记忆。 */
export interface TaskSignal {
  protocol: typeof TASK_SIGNAL_PROTOCOL;
  signal_id: string;
  task_id: string;
  run_id: string;
  action_id: string;
  correlation_id: string;
  kind: TaskSignalKind;
  occurred_at: string;
  actor: 'skill' | 'device' | 'user' | 'agent';
  payload: JsonObject;
  events?: HealthEvent[];
}

export type EffectStatus = 'proposed' | 'approved' | 'committed' | 'failed';

/** 对外写入的幂等账本。Taskmaster 重启后以 committed 为准，避免重复副作用。 */
export interface EffectRecord {
  protocol: typeof EFFECT_RECORD_PROTOCOL;
  effect_id: string;
  idempotency_key: string;
  task_id: string;
  run_id: string;
  action_id: string;
  permission: SkillPermission;
  status: EffectStatus;
  input: JsonObject;
  result?: JsonObject;
  event_ids: string[];
  created_at: string;
  updated_at: string;
  error?: string;
}

export interface FrostTaskSession {
  protocol: typeof TASK_PROTOCOL;
  task_id: string;
  run_id: string;
  request: FrostTaskRequest;
  skill_id: string;
  status: FrostTaskStatus;
  actions: FrostTaskAction[];
  next_action_index: number;
  confirmed_action_ids: string[];
  source_event_ids: string[];
  created_at: string;
  updated_at: string;
  limits: { max_steps: number; max_tool_calls: number; deadline_at: string };
  counters: { steps: number; tool_calls: number };
  error?: string;
}

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function iso(value: unknown): value is string { return text(value) && !Number.isNaN(Date.parse(value)); }
function confidence(value: unknown): value is number { return typeof value === 'number' && value >= 0 && value <= 1; }
function revision(value: unknown): value is number { return Number.isInteger(value) && Number(value) >= 0; }

export function validateHealthEvent(value: unknown): ValidationResult<HealthEvent> {
  const errors: string[] = [];
  if (!record(value)) return { ok: false, errors: ['event 必须是对象'] };
  if (value.protocol !== HEALTH_EVENT_PROTOCOL) errors.push('protocol 必须是 health_event/v1');
  for (const key of ['event_id', 'user_id'] as const) if (!text(value[key])) errors.push(`${key} 不能为空`);
  if (!iso(value.occurred_at)) errors.push('occurred_at 必须是 ISO 时间');
  if (!['meal', 'workout', 'nature', 'skill', 'device'].includes(String(value.domain))) errors.push('domain 不受支持');
  if (!['meal_confirmed', 'run_completed', 'nature_captured', 'skill_completed', 'device_state_changed'].includes(String(value.type))) errors.push('type 不受支持');
  if (!record(value.source) || !text(value.source.device_id) || !text(value.source.provider)) errors.push('source 缺少 device_id/provider');
  if (!record(value.facts)) errors.push('facts 必须是对象');
  if (!confidence(value.confidence)) errors.push('confidence 必须在 0..1');
  if (!record(value.provenance) || !text(value.provenance.model_version) || !text(value.provenance.tool_version) || !text(value.provenance.input_hash)) errors.push('provenance 不完整');
  if (!['private', 'friends', 'public'].includes(String(value.visibility))) errors.push('visibility 不受支持');
  if (!record(value.sync) || !['local', 'pending', 'synced', 'failed'].includes(String(value.sync.state)) || !revision(value.sync.revision)) errors.push('sync 不合法');
  return errors.length ? { ok: false, errors } : { ok: true, value: value as unknown as HealthEvent, errors: [] };
}

export function validateDeviceEvent(value: unknown): ValidationResult<DeviceEvent> {
  const errors: string[] = [];
  if (!record(value)) return { ok: false, errors: ['device event 必须是对象'] };
  if (value.protocol !== DEVICE_EVENT_PROTOCOL) errors.push('protocol 必须是 device_event/v1');
  for (const key of ['event_id', 'user_id', 'device_id'] as const) if (!text(value[key])) errors.push(`${key} 不能为空`);
  if (!iso(value.occurred_at)) errors.push('occurred_at 必须是 ISO 时间');
  const kinds = ['workout_started', 'workout_paused', 'workout_resumed', 'workout_completed', 'nature_capture', 'feeling_mark', 'skill_completed', 'device_state'];
  if (!kinds.includes(String(value.kind))) errors.push('kind 不受支持');
  if (!record(value.payload)) errors.push('payload 必须是对象');
  if (value.geo !== undefined) {
    if (!record(value.geo) || typeof value.geo.latitude !== 'number' || value.geo.latitude < -90 || value.geo.latitude > 90 || typeof value.geo.longitude !== 'number' || value.geo.longitude < -180 || value.geo.longitude > 180) errors.push('geo 经纬度不合法');
  }
  if (!record(value.sync) || !['local', 'pending', 'synced', 'failed'].includes(String(value.sync.state)) || !revision(value.sync.revision)) errors.push('sync 不合法');
  return errors.length ? { ok: false, errors } : { ok: true, value: value as unknown as DeviceEvent, errors: [] };
}

export function validateTaskSignal(value: unknown): ValidationResult<TaskSignal> {
  const errors: string[] = [];
  if (!record(value)) return { ok: false, errors: ['task signal 必须是对象'] };
  if (value.protocol !== TASK_SIGNAL_PROTOCOL) errors.push('protocol 必须是 task_signal/v1');
  for (const key of ['signal_id', 'task_id', 'run_id', 'action_id', 'correlation_id'] as const) {
    if (!text(value[key])) errors.push(`${key} 不能为空`);
  }
  if (!['tool_result', 'tool_error', 'cancel'].includes(String(value.kind))) errors.push('kind 不受支持');
  if (!['skill', 'device', 'user', 'agent'].includes(String(value.actor))) errors.push('actor 不受支持');
  if (!iso(value.occurred_at)) errors.push('occurred_at 必须是 ISO 时间');
  if (!isJsonObject(value.payload)) errors.push('payload 必须是 JSON 对象');
  if (value.events !== undefined) {
    if (!Array.isArray(value.events)) errors.push('events 必须是数组');
    else value.events.forEach((event, index) => {
      const validation = validateHealthEvent(event);
      if (!validation.ok) errors.push(`events[${index}]:${validation.errors.join('|')}`);
    });
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: value as unknown as TaskSignal, errors: [] };
}

export function isJsonObject(value: unknown): value is JsonObject {
  if (!record(value)) return false;
  const visit = (candidate: unknown): boolean => candidate === null || ['string', 'number', 'boolean'].includes(typeof candidate)
    || (Array.isArray(candidate) && candidate.every(visit))
    || (record(candidate) && Object.values(candidate).every(visit));
  return Object.values(value).every(visit);
}
