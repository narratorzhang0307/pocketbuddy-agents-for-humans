import type { JsonObject } from './contracts';
import type { TaskmasterStore } from './store';

export type TraceEventType =
  | 'task.created'
  | 'task.planned'
  | 'tool.requested'
  | 'tool.blocked'
  | 'tool.completed'
  | 'tool.failed'
  | 'signal.received'
  | 'signal.rejected'
  | 'effect.proposed'
  | 'effect.committed'
  | 'task.waiting'
  | 'task.completed'
  | 'task.stopped';

export interface FrostTraceEvent {
  trace_id: string;
  run_id: string;
  task_id: string;
  occurred_at: string;
  type: TraceEventType;
  actor: 'taskmaster' | 'policy' | 'tool' | 'user' | 'device';
  detail: string;
  data: JsonObject;
}

export interface TraceSink {
  append(event: FrostTraceEvent): Promise<void>;
  list(runId: string): Promise<FrostTraceEvent[]>;
}

export class InMemoryTraceSink implements TraceSink {
  private readonly events: FrostTraceEvent[] = [];
  async append(event: FrostTraceEvent): Promise<void> { this.events.push(structuredClone(event)); }
  async list(runId: string): Promise<FrostTraceEvent[]> {
    return this.events.filter((event) => event.run_id === runId).map((event) => structuredClone(event));
  }
}

/** 浏览器/本地服务共用的持久 Trace；与任务和 Effect 使用同一事实库。 */
export class PersistentTraceSink implements TraceSink {
  constructor(private readonly store: TaskmasterStore) {}
  append(event: FrostTraceEvent): Promise<void> { return this.store.appendTrace(event); }
  list(runId: string): Promise<FrostTraceEvent[]> { return this.store.listTraces(runId); }
}

export function createTraceEvent(input: Omit<FrostTraceEvent, 'trace_id' | 'occurred_at'>): FrostTraceEvent {
  return {
    ...input,
    trace_id: `${input.run_id}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
    occurred_at: new Date().toISOString(),
  };
}
