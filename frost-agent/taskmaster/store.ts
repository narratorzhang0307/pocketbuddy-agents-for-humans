import type { EffectRecord, FrostTaskSession, HealthEvent, TaskSignal } from './contracts';
import type { FrostTraceEvent } from './trace';

export type AppendResult = { status: 'inserted' | 'duplicate'; event: HealthEvent };
export type AppendSignalResult = { status: 'inserted' | 'duplicate'; signal: TaskSignal };

export interface TaskmasterStore {
  appendHealthEvent(event: HealthEvent): Promise<AppendResult>;
  getHealthEvent(eventId: string): Promise<HealthEvent | null>;
  listHealthEvents(userId: string, from?: string, to?: string): Promise<HealthEvent[]>;
  saveTask(session: FrostTaskSession): Promise<void>;
  getTask(taskId: string): Promise<FrostTaskSession | null>;
  appendTaskSignal(signal: TaskSignal): Promise<AppendSignalResult>;
  getTaskSignal(signalId: string): Promise<TaskSignal | null>;
  listTaskSignals(taskId: string): Promise<TaskSignal[]>;
  saveEffect(effect: EffectRecord): Promise<void>;
  getEffect(effectId: string): Promise<EffectRecord | null>;
  appendTrace(event: FrostTraceEvent): Promise<void>;
  listTraces(runId: string): Promise<FrostTraceEvent[]>;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export class InMemoryTaskmasterStore implements TaskmasterStore {
  private readonly events = new Map<string, HealthEvent>();
  private readonly tasks = new Map<string, FrostTaskSession>();
  private readonly signals = new Map<string, TaskSignal>();
  private readonly effects = new Map<string, EffectRecord>();
  private readonly traces = new Map<string, FrostTraceEvent>();

  async appendHealthEvent(event: HealthEvent): Promise<AppendResult> {
    const existing = this.events.get(event.event_id);
    if (existing) {
      if (canonical(existing) !== canonical(event)) throw new Error(`event_id_conflict:${event.event_id}`);
      return { status: 'duplicate', event: structuredClone(existing) };
    }
    if (event.supersedes_event_id && !this.events.has(event.supersedes_event_id)) {
      throw new Error(`superseded_event_not_found:${event.supersedes_event_id}`);
    }
    this.events.set(event.event_id, structuredClone(event));
    return { status: 'inserted', event: structuredClone(event) };
  }

  async getHealthEvent(eventId: string): Promise<HealthEvent | null> {
    const event = this.events.get(eventId);
    return event ? structuredClone(event) : null;
  }

  async listHealthEvents(userId: string, from?: string, to?: string): Promise<HealthEvent[]> {
    const fromMs = from ? Date.parse(from) : Number.NEGATIVE_INFINITY;
    const toMs = to ? Date.parse(to) : Number.POSITIVE_INFINITY;
    return [...this.events.values()]
      .filter((event) => event.user_id === userId)
      .filter((event) => {
        const at = Date.parse(event.occurred_at);
        return at >= fromMs && at <= toMs;
      })
      .sort((left, right) => left.occurred_at.localeCompare(right.occurred_at))
      .map((event) => structuredClone(event));
  }

  async saveTask(session: FrostTaskSession): Promise<void> {
    const existing = this.tasks.get(session.task_id);
    if (existing && existing.run_id !== session.run_id) throw new Error(`task_id_conflict:${session.task_id}`);
    this.tasks.set(session.task_id, structuredClone(session));
  }

  async getTask(taskId: string): Promise<FrostTaskSession | null> {
    const task = this.tasks.get(taskId);
    return task ? structuredClone(task) : null;
  }

  async appendTaskSignal(signal: TaskSignal): Promise<AppendSignalResult> {
    const existing = this.signals.get(signal.signal_id);
    if (existing) {
      if (canonical(existing) !== canonical(signal)) throw new Error(`signal_id_conflict:${signal.signal_id}`);
      return { status: 'duplicate', signal: structuredClone(existing) };
    }
    this.signals.set(signal.signal_id, structuredClone(signal));
    return { status: 'inserted', signal: structuredClone(signal) };
  }

  async getTaskSignal(signalId: string): Promise<TaskSignal | null> {
    const signal = this.signals.get(signalId);
    return signal ? structuredClone(signal) : null;
  }

  async listTaskSignals(taskId: string): Promise<TaskSignal[]> {
    return [...this.signals.values()].filter((signal) => signal.task_id === taskId)
      .sort((left, right) => left.occurred_at.localeCompare(right.occurred_at))
      .map((signal) => structuredClone(signal));
  }

  async saveEffect(effect: EffectRecord): Promise<void> {
    const existing = this.effects.get(effect.effect_id);
    if (existing && (existing.task_id !== effect.task_id || existing.action_id !== effect.action_id || existing.idempotency_key !== effect.idempotency_key)) {
      throw new Error(`effect_id_conflict:${effect.effect_id}`);
    }
    if (existing?.status === 'committed' && canonical(existing) !== canonical(effect)) throw new Error(`committed_effect_immutable:${effect.effect_id}`);
    this.effects.set(effect.effect_id, structuredClone(effect));
  }

  async getEffect(effectId: string): Promise<EffectRecord | null> {
    const effect = this.effects.get(effectId);
    return effect ? structuredClone(effect) : null;
  }

  async appendTrace(event: FrostTraceEvent): Promise<void> {
    const existing = this.traces.get(event.trace_id);
    if (existing && canonical(existing) !== canonical(event)) throw new Error(`trace_id_conflict:${event.trace_id}`);
    if (!existing) this.traces.set(event.trace_id, structuredClone(event));
  }

  async listTraces(runId: string): Promise<FrostTraceEvent[]> {
    return [...this.traces.values()].filter((event) => event.run_id === runId)
      .sort((left, right) => left.occurred_at.localeCompare(right.occurred_at))
      .map((event) => structuredClone(event));
  }
}
