import {
  FROST_AGENT_EVENT_PROTOCOL,
  type FrostAgentEvent,
  type FrostAgentEventType,
} from './contracts';
import type { JsonObject } from '../taskmaster/contracts';

export interface AppendFrostAgentEvent {
  event_id?: string;
  session_id: string;
  type: FrostAgentEventType;
  occurred_at?: string;
  data: JsonObject;
}

export type FrostSessionLogObserver = (event: FrostAgentEvent) => void;

export interface FrostSessionLog {
  append(input: AppendFrostAgentEvent): Promise<FrostAgentEvent>;
  list(sessionId: string, afterSeq?: number): Promise<FrostAgentEvent[]>;
  flush(): Promise<void>;
  subscribe(observer: FrostSessionLogObserver): () => void;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sameRequestedEvent(existing: FrostAgentEvent, input: AppendFrostAgentEvent): boolean {
  return existing.session_id === input.session_id
    && existing.type === input.type
    && canonical(existing.data) === canonical(input.data)
    && (input.occurred_at === undefined || existing.occurred_at === input.occurred_at);
}

/** Phase 1 的权威内存实现。浏览器持久化实现可以复用完全相同的合同。 */
export class InMemoryFrostSessionLog implements FrostSessionLog {
  private readonly sessions = new Map<string, FrostAgentEvent[]>();
  private readonly byId = new Map<string, FrostAgentEvent>();
  private readonly observers = new Set<FrostSessionLogObserver>();

  async append(input: AppendFrostAgentEvent): Promise<FrostAgentEvent> {
    if (!input.session_id.trim()) throw new Error('session_id_required');
    if (input.event_id) {
      const existing = this.byId.get(input.event_id);
      if (existing) {
        if (!sameRequestedEvent(existing, input)) throw new Error(`agent_event_id_conflict:${input.event_id}`);
        return structuredClone(existing);
      }
    }
    const events = this.sessions.get(input.session_id) || [];
    const seq = events.length + 1;
    const event: FrostAgentEvent = {
      protocol: FROST_AGENT_EVENT_PROTOCOL,
      event_id: input.event_id || `${input.session_id}:event:${seq}`,
      session_id: input.session_id,
      seq,
      type: input.type,
      occurred_at: input.occurred_at || new Date().toISOString(),
      data: structuredClone(input.data),
    };
    if (this.byId.has(event.event_id)) throw new Error(`agent_event_id_conflict:${event.event_id}`);
    events.push(structuredClone(event));
    this.sessions.set(input.session_id, events);
    this.byId.set(event.event_id, structuredClone(event));
    for (const observer of this.observers) {
      try { observer(structuredClone(event)); } catch { /* observers cannot roll back committed events */ }
    }
    return structuredClone(event);
  }

  async list(sessionId: string, afterSeq = 0): Promise<FrostAgentEvent[]> {
    return (this.sessions.get(sessionId) || [])
      .filter((event) => event.seq > afterSeq)
      .map((event) => structuredClone(event));
  }

  async flush(): Promise<void> { /* memory writes are synchronous */ }

  subscribe(observer: FrostSessionLogObserver): () => void {
    this.observers.add(observer);
    return () => { this.observers.delete(observer); };
  }
}
