import type { EffectRecord, FrostTaskSession, HealthEvent, TaskSignal } from './contracts';
import type { FrostTraceEvent } from './trace';
import { InMemoryTaskmasterStore, type AppendResult, type AppendSignalResult, type TaskmasterStore } from './store';

const DATABASE = 'frost-health-taskmaster';
const VERSION = 2;
const EVENTS = 'healthEvents';
const TASKS = 'tasks';
const SIGNALS = 'taskSignals';
const EFFECTS = 'effects';
const TRACES = 'traces';
export const HEALTH_MEMORY_CHANGED = 'frost-health-memory-changed';
export function notifyHealthMemoryChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(HEALTH_MEMORY_CHANGED));
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

const requestValue = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('indexeddb_request_failed'));
});

const transactionDone = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error || new Error('indexeddb_transaction_failed'));
  transaction.onabort = () => reject(transaction.error || new Error('indexeddb_transaction_aborted'));
});

/** PWA 离线事实库。没有 IndexedDB 的测试/SSR 环境会退化到进程内存。 */
export class IndexedDbTaskmasterStore implements TaskmasterStore {
  private readonly fallback = new InMemoryTaskmasterStore();
  private databasePromise: Promise<IDBDatabase | null> | null = null;

  async persistence(): Promise<'indexeddb' | 'volatile'> { return await this.database() ? 'indexeddb' : 'volatile'; }

  private database(): Promise<IDBDatabase | null> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const request = indexedDB.open(DATABASE, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(EVENTS)) {
          const store = db.createObjectStore(EVENTS, { keyPath: 'event_id' });
          store.createIndex('user_id', 'user_id', { unique: false });
          store.createIndex('occurred_at', 'occurred_at', { unique: false });
        }
        if (!db.objectStoreNames.contains(TASKS)) db.createObjectStore(TASKS, { keyPath: 'task_id' });
        if (!db.objectStoreNames.contains(SIGNALS)) {
          const store = db.createObjectStore(SIGNALS, { keyPath: 'signal_id' });
          store.createIndex('task_id', 'task_id', { unique: false });
        }
        if (!db.objectStoreNames.contains(EFFECTS)) db.createObjectStore(EFFECTS, { keyPath: 'effect_id' });
        if (!db.objectStoreNames.contains(TRACES)) {
          const store = db.createObjectStore(TRACES, { keyPath: 'trace_id' });
          store.createIndex('run_id', 'run_id', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
    return this.databasePromise;
  }

  async appendHealthEvent(event: HealthEvent): Promise<AppendResult> {
    const db = await this.database();
    if (!db) {
      const result = await this.fallback.appendHealthEvent(event);
      if (result.status === 'inserted') notifyHealthMemoryChanged();
      return result;
    }
    const transaction = db.transaction(EVENTS, 'readwrite');
    const done = transactionDone(transaction);
    try {
      const records = transaction.objectStore(EVENTS);
      const existing = await requestValue(records.get(event.event_id)) as HealthEvent | undefined;
      if (existing) {
        if (canonical(existing) !== canonical(event)) throw new Error(`event_id_conflict:${event.event_id}`);
        await done;
        return { status: 'duplicate', event: existing };
      }
      if (event.supersedes_event_id) {
        const previous = await requestValue(records.get(event.supersedes_event_id)) as HealthEvent | undefined;
        if (!previous || previous.user_id !== event.user_id) throw new Error(`superseded_event_not_found:${event.supersedes_event_id}`);
      }
      records.add(event);
      await done;
      notifyHealthMemoryChanged();
      return { status: 'inserted', event: structuredClone(event) };
    } catch (error) {
      try { transaction.abort(); } catch { /* Already completed. */ }
      await done.catch(() => {});
      throw error;
    }
  }

  async getHealthEvent(eventId: string): Promise<HealthEvent | null> {
    const db = await this.database();
    if (!db) return this.fallback.getHealthEvent(eventId);
    const transaction = db.transaction(EVENTS, 'readonly');
    const done = transactionDone(transaction);
    const value = await requestValue(transaction.objectStore(EVENTS).get(eventId)) as HealthEvent | undefined;
    await done;
    return value ? structuredClone(value) : null;
  }

  async listHealthEvents(userId: string, from?: string, to?: string): Promise<HealthEvent[]> {
    const db = await this.database();
    if (!db) return this.fallback.listHealthEvents(userId, from, to);
    const transaction = db.transaction(EVENTS, 'readonly');
    const done = transactionDone(transaction);
    const values = await requestValue(transaction.objectStore(EVENTS).index('user_id').getAll(userId)) as HealthEvent[];
    await done;
    const fromMs = from ? Date.parse(from) : Number.NEGATIVE_INFINITY;
    const toMs = to ? Date.parse(to) : Number.POSITIVE_INFINITY;
    return values.filter((event) => {
      const at = Date.parse(event.occurred_at);
      return at >= fromMs && at <= toMs;
    }).sort((left, right) => left.occurred_at.localeCompare(right.occurred_at)).map((event) => structuredClone(event));
  }

  async saveTask(session: FrostTaskSession): Promise<void> {
    const db = await this.database();
    if (!db) return this.fallback.saveTask(session);
    const existing = await this.getTask(session.task_id);
    if (existing && existing.run_id !== session.run_id) throw new Error(`task_id_conflict:${session.task_id}`);
    const transaction = db.transaction(TASKS, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(TASKS).put(session);
    await done;
  }

  async getTask(taskId: string): Promise<FrostTaskSession | null> {
    const db = await this.database();
    if (!db) return this.fallback.getTask(taskId);
    const transaction = db.transaction(TASKS, 'readonly');
    const done = transactionDone(transaction);
    const value = await requestValue(transaction.objectStore(TASKS).get(taskId)) as FrostTaskSession | undefined;
    await done;
    if (!value) return null;
    const migrated = structuredClone(value);
    migrated.actions = migrated.actions.map((action) => ({
      ...action,
      correlation_id: action.correlation_id || `${action.action_id}:correlation:v1`,
    }));
    return migrated;
  }

  async appendTaskSignal(signal: TaskSignal): Promise<AppendSignalResult> {
    const db = await this.database();
    if (!db) return this.fallback.appendTaskSignal(signal);
    const existing = await this.getTaskSignal(signal.signal_id);
    if (existing) {
      if (canonical(existing) !== canonical(signal)) throw new Error(`signal_id_conflict:${signal.signal_id}`);
      return { status: 'duplicate', signal: existing };
    }
    const transaction = db.transaction(SIGNALS, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(SIGNALS).add(signal);
    await done;
    return { status: 'inserted', signal: structuredClone(signal) };
  }

  async getTaskSignal(signalId: string): Promise<TaskSignal | null> {
    const db = await this.database();
    if (!db) return this.fallback.getTaskSignal(signalId);
    const transaction = db.transaction(SIGNALS, 'readonly');
    const done = transactionDone(transaction);
    const value = await requestValue(transaction.objectStore(SIGNALS).get(signalId)) as TaskSignal | undefined;
    await done;
    return value ? structuredClone(value) : null;
  }

  async listTaskSignals(taskId: string): Promise<TaskSignal[]> {
    const db = await this.database();
    if (!db) return this.fallback.listTaskSignals(taskId);
    const transaction = db.transaction(SIGNALS, 'readonly');
    const done = transactionDone(transaction);
    const values = await requestValue(transaction.objectStore(SIGNALS).index('task_id').getAll(taskId)) as TaskSignal[];
    await done;
    return values.sort((left, right) => left.occurred_at.localeCompare(right.occurred_at)).map((signal) => structuredClone(signal));
  }

  async saveEffect(effect: EffectRecord): Promise<void> {
    const db = await this.database();
    if (!db) return this.fallback.saveEffect(effect);
    const existing = await this.getEffect(effect.effect_id);
    if (existing && (existing.task_id !== effect.task_id || existing.action_id !== effect.action_id || existing.idempotency_key !== effect.idempotency_key)) {
      throw new Error(`effect_id_conflict:${effect.effect_id}`);
    }
    if (existing?.status === 'committed' && canonical(existing) !== canonical(effect)) throw new Error(`committed_effect_immutable:${effect.effect_id}`);
    const transaction = db.transaction(EFFECTS, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(EFFECTS).put(effect);
    await done;
  }

  async getEffect(effectId: string): Promise<EffectRecord | null> {
    const db = await this.database();
    if (!db) return this.fallback.getEffect(effectId);
    const transaction = db.transaction(EFFECTS, 'readonly');
    const done = transactionDone(transaction);
    const value = await requestValue(transaction.objectStore(EFFECTS).get(effectId)) as EffectRecord | undefined;
    await done;
    return value ? structuredClone(value) : null;
  }

  async appendTrace(event: FrostTraceEvent): Promise<void> {
    const db = await this.database();
    if (!db) return this.fallback.appendTrace(event);
    const transaction = db.transaction(TRACES, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(TRACES).put(event);
    await done;
  }

  async listTraces(runId: string): Promise<FrostTraceEvent[]> {
    const db = await this.database();
    if (!db) return this.fallback.listTraces(runId);
    const transaction = db.transaction(TRACES, 'readonly');
    const done = transactionDone(transaction);
    const values = await requestValue(transaction.objectStore(TRACES).index('run_id').getAll(runId)) as FrostTraceEvent[];
    await done;
    return values.sort((left, right) => left.occurred_at.localeCompare(right.occurred_at)).map((event) => structuredClone(event));
  }
}
