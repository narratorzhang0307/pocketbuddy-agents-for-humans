import {
  FROST_AGENT_EVENT_PROTOCOL,
  type FrostAgentEvent,
} from './contracts';
import {
  InMemoryFrostSessionLog,
  sameRequestedEvent,
  type AppendFrostAgentEvent,
  type FrostSessionLog,
  type FrostSessionLogObserver,
} from './sessionLog';

const EVENTS = 'events';
const SESSIONS = 'sessions';

interface SessionSequence {
  session_id: string;
  last_seq: number;
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('agent_session_log_request_failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('agent_session_log_transaction_failed'));
    transaction.onabort = () => reject(transaction.error || new Error('agent_session_log_transaction_aborted'));
  });
}

/** Browser authority for Frost sessions. IndexedDB unavailable means explicit in-process fallback, never cloud storage. */
export class IndexedDbFrostSessionLog implements FrostSessionLog {
  private readonly fallback = new InMemoryFrostSessionLog();
  private readonly observers = new Set<FrostSessionLogObserver>();
  private databasePromise: Promise<IDBDatabase | null> | null = null;

  constructor(
    private readonly databaseName = 'pe-frost-agent-runtime-v1',
    private readonly factory: IDBFactory | null | undefined = typeof indexedDB === 'undefined' ? null : indexedDB,
  ) {}

  async append(input: AppendFrostAgentEvent): Promise<FrostAgentEvent> {
    const database = await this.database();
    if (!database) return this.fallback.append(input);
    const transaction = database.transaction([EVENTS, SESSIONS], 'readwrite');
    const committed = transactionDone(transaction);
    const eventStore = transaction.objectStore(EVENTS);
    if (input.event_id) {
      const existing = await requestValue(eventStore.get(input.event_id)) as FrostAgentEvent | undefined;
      if (existing) {
        if (!sameRequestedEvent(existing, input)) {
          transaction.abort();
          await committed.catch(() => {});
          throw new Error(`agent_event_id_conflict:${input.event_id}`);
        }
        await committed;
        return structuredClone(existing);
      }
    }
    const sessionStore = transaction.objectStore(SESSIONS);
    const sequence = await requestValue(sessionStore.get(input.session_id)) as SessionSequence | undefined;
    const seq = (sequence?.last_seq || 0) + 1;
    const event: FrostAgentEvent = {
      protocol: FROST_AGENT_EVENT_PROTOCOL,
      event_id: input.event_id || `${input.session_id}:event:${seq}`,
      session_id: input.session_id,
      seq,
      type: input.type,
      occurred_at: input.occurred_at || new Date().toISOString(),
      data: structuredClone(input.data),
    };
    eventStore.add(event);
    sessionStore.put({ session_id: input.session_id, last_seq: seq } satisfies SessionSequence);
    await committed;
    for (const observer of this.observers) {
      try { observer(structuredClone(event)); } catch { /* observers cannot roll back committed events */ }
    }
    return structuredClone(event);
  }

  async list(sessionId: string, afterSeq = 0): Promise<FrostAgentEvent[]> {
    const database = await this.database();
    if (!database) return this.fallback.list(sessionId, afterSeq);
    const transaction = database.transaction(EVENTS, 'readonly');
    const committed = transactionDone(transaction);
    const values = await requestValue(transaction.objectStore(EVENTS).index('session_id').getAll(sessionId)) as FrostAgentEvent[];
    await committed;
    return values.filter((event) => event.seq > afterSeq).sort((left, right) => left.seq - right.seq).map((event) => structuredClone(event));
  }

  async flush(): Promise<void> {
    const database = await this.database();
    if (!database) await this.fallback.flush();
  }

  subscribe(observer: FrostSessionLogObserver): () => void {
    this.observers.add(observer);
    const releaseFallback = this.fallback.subscribe(observer);
    return () => { this.observers.delete(observer); releaseFallback(); };
  }

  private database(): Promise<IDBDatabase | null> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve) => {
      if (!this.factory) { resolve(null); return; }
      try {
        const request = this.factory.open(this.databaseName, 1);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(EVENTS)) {
            const events = database.createObjectStore(EVENTS, { keyPath: 'event_id' });
            events.createIndex('session_id', 'session_id', { unique: false });
            events.createIndex('session_seq', ['session_id', 'seq'], { unique: true });
          }
          if (!database.objectStoreNames.contains(SESSIONS)) database.createObjectStore(SESSIONS, { keyPath: 'session_id' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => { this.databasePromise = null; resolve(null); };
        request.onblocked = () => { this.databasePromise = null; resolve(null); };
      } catch { this.databasePromise = null; resolve(null); }
    });
    return this.databasePromise;
  }
}
