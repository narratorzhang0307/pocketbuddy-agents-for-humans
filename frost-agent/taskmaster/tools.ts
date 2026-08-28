import { HEALTH_EVENT_PROTOCOL, type FrostTaskRequest, type HealthEvent, type JsonObject, type SkillPermission } from './contracts';
import { compileDailySummary, isDemoHealthFact, localHealthDay } from './summary';
import type { TaskmasterStore } from './store';

export interface Observation {
  facts: JsonObject;
  confidence: number;
  model_version: string;
  tool_version: string;
  input_hash: string;
}

export interface ExternalHealthProviders {
  observeMeal?: (input: JsonObject) => Promise<Observation | null>;
  guideMotion?: (input: JsonObject) => Promise<Observation | null>;
  observeNature?: (input: JsonObject) => Promise<Observation | null>;
  planRoute?: (input: JsonObject, context: ToolContext) => Promise<JsonObject | null>;
}

export interface ToolContext {
  request: FrostTaskRequest;
  store: TaskmasterStore;
  prior_results: Record<string, JsonObject>;
  /** 下游适配器执行写入时必须透传，保证重试不会制造第二份副作用。 */
  idempotency_key: string;
}

export interface ToolResult {
  status: 'success' | 'waiting_external';
  data: JsonObject;
  events?: HealthEvent[];
  message?: string;
}

export interface TaskmasterTool {
  name: string;
  permission: SkillPermission;
  execute(input: JsonObject, context: ToolContext): Promise<ToolResult>;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619); }
  return `fnv1a-${(result >>> 0).toString(16)}`;
}

function eventFromObservation(request: FrostTaskRequest, type: HealthEvent['type'], domain: HealthEvent['domain'], observation: Observation, facts = observation.facts): HealthEvent {
  return {
    protocol: HEALTH_EVENT_PROTOCOL,
    event_id: `${request.task_id}:${type}`,
    user_id: request.user_id,
    occurred_at: typeof facts.consumed_at === 'string' && Number.isFinite(Date.parse(facts.consumed_at)) ? facts.consumed_at : request.requested_at,
    domain,
    type,
    source: { device_id: String(request.input.device_id || 'pwa'), provider: 'frost-taskmaster' },
    facts,
    confidence: observation.confidence,
    provenance: { model_version: observation.model_version, tool_version: observation.tool_version, input_hash: observation.input_hash },
    visibility: 'private',
    sync: { state: 'pending', revision: 1 },
  };
}

function observationFromToolResult(value: unknown): Observation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (!item.facts || typeof item.facts !== 'object' || Array.isArray(item.facts)) return null;
  if (typeof item.confidence !== 'number' || item.confidence < 0 || item.confidence > 1) return null;
  if (typeof item.model_version !== 'string' || typeof item.tool_version !== 'string' || typeof item.input_hash !== 'string') return null;
  return item as unknown as Observation;
}

export class TaskmasterToolRegistry {
  private readonly tools = new Map<string, TaskmasterTool>();
  register(tool: TaskmasterTool): void {
    if (this.tools.has(tool.name)) throw new Error(`tool_already_registered:${tool.name}`);
    this.tools.set(tool.name, tool);
  }
  get(name: string): TaskmasterTool | null { return this.tools.get(name) || null; }
  list(): Array<{ name: string; permission: SkillPermission }> { return [...this.tools.values()].map(({ name, permission }) => ({ name, permission })); }
}

export function createDefaultTools(providers: ExternalHealthProviders = {}): TaskmasterToolRegistry {
  const registry = new TaskmasterToolRegistry();
  registry.register({
    name: 'meal.observe', permission: 'run:model',
    async execute(input): Promise<ToolResult> {
      const result = providers.observeMeal ? await providers.observeMeal(input) : null;
      return result
        ? { status: 'success', data: { observation: result as unknown as JsonObject } }
        : { status: 'waiting_external', data: {}, message: '等待 Qwen/SAM/OCR 饮食识别适配器' };
    },
  });
  registry.register({
    name: 'meal.commit', permission: 'write:health_events',
    async execute(_input, context): Promise<ToolResult> {
      const observed = observationFromToolResult(context.prior_results['meal.observe']?.observation);
      if (!observed) return { status: 'waiting_external', data: {}, message: '等待已完成的饮食观察' };
      if (isDemoHealthFact(observed.facts, observed.model_version)) throw new Error('示例餐食不能写入真实健康记忆');
      const confirmedFacts = { ...observed.facts, confirmed: true } as JsonObject;
      return { status: 'success', data: confirmedFacts, events: [eventFromObservation(context.request, 'meal_confirmed', 'meal', observed, confirmedFacts)] };
    },
  });
  registry.register({
    name: 'motion.guide', permission: 'capture:camera',
    async execute(input, context) {
      const result = providers.guideMotion ? await providers.guideMotion(input) : null;
      if (!result) return { status: 'waiting_external', data: {}, message: '等待 Her Motion 姿态模型适配器' };
      return { status: 'success', data: result.facts, events: [eventFromObservation(context.request, 'skill_completed', 'skill', result)] };
    },
  });
  registry.register({
    name: 'route.plan', permission: 'write:route',
    async execute(input, context) {
      const result = providers.planRoute ? await providers.planRoute(input, context) : null;
      return result
        ? { status: 'success', data: result }
        : { status: 'waiting_external', data: {}, message: '等待高德路线规划执行面' };
    },
  });
  registry.register({
    name: 'run.start', permission: 'write:health_events',
    async execute(input) { return { status: 'success', data: { state: 'WORKOUT_RUNNING', device_id: input.device_id || 'pwa' } }; },
  });
  registry.register({
    name: 'run.finalize', permission: 'write:route',
    async execute(input, context) {
      const fact = input.device_fact;
      if (!fact || typeof fact !== 'object' || Array.isArray(fact)) return { status: 'waiting_external', data: {}, message: '等待 ESP32/手机上传真实运动事实' };
      const facts = fact as JsonObject;
      if (typeof facts.duration_s !== 'number' || facts.duration_s < 0 || typeof facts.distance_m !== 'number' || facts.distance_m < 0) throw new Error('run_fact_missing_duration_or_distance');
      if ('route_points' in facts) {
        if (!Array.isArray(facts.route_points)) throw new Error('route_points_must_be_array');
        const valid = facts.route_points.every((point) => point && typeof point === 'object' && !Array.isArray(point)
          && typeof point.latitude === 'number' && point.latitude >= -90 && point.latitude <= 90
          && typeof point.longitude === 'number' && point.longitude >= -180 && point.longitude <= 180);
        if (!valid) throw new Error('invalid_route_points');
      }
      const observation: Observation = { facts, confidence: 1, model_version: 'none', tool_version: 'run-finalizer/1.0.0', input_hash: hash(JSON.stringify(facts)) };
      return { status: 'success', data: facts, events: [eventFromObservation(context.request, 'run_completed', 'workout', observation)] };
    },
  });
  registry.register({
    name: 'map.plant_private_tree', permission: 'write:route',
    async execute(_input, context): Promise<ToolResult> {
      const run = context.prior_results['run.finalize'];
      if (!run) return { status: 'waiting_external', data: {}, message: '等待跑步完成事实' };
      return { status: 'success', data: { tree_id: `tree:${context.request.task_id}`, visibility: 'private', source_task_id: context.request.task_id } };
    },
  });
  registry.register({
    name: 'nature.observe', permission: 'run:model',
    async execute(input, context) {
      const result = providers.observeNature ? await providers.observeNature(input) : null;
      if (!result) return { status: 'waiting_external', data: {}, message: '等待自然图像/声音识别适配器' };
      const facts = { ...result.facts, label: result.confidence >= 0.7 ? result.facts.label || 'unknown' : 'unknown' } as JsonObject;
      return { status: 'success', data: facts, events: [eventFromObservation(context.request, 'nature_captured', 'nature', result, facts)] };
    },
  });
  registry.register({
    name: 'memory.daily_summary', permission: 'read:health_events',
    async execute(input, context) {
      const timezone = typeof input.timezone === 'string' ? input.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone;
      const day = typeof input.day === 'string' ? input.day : localHealthDay(context.request.requested_at, timezone);
      const events = await context.store.listHealthEvents(context.request.user_id);
      return { status: 'success', data: compileDailySummary(context.request.user_id, day, events, timezone) as unknown as JsonObject };
    },
  });
  return registry;
}
