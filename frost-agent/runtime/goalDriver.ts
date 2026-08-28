import type { JsonObject } from '../taskmaster/contracts';
import type { FrostAgentLoop } from './agentLoop';

export const FROST_GOAL_PROTOCOL = 'frost-agent-goal/v1' as const;

export type FrostGoalStatus = 'active' | 'running' | 'waiting' | 'paused' | 'completed' | 'exhausted' | 'cancelled';

export interface FrostAgentGoal {
  protocol: typeof FROST_GOAL_PROTOCOL;
  goal_id: string;
  session_id: string;
  user_id: string;
  objective: string;
  context: JsonObject;
  status: FrostGoalStatus;
  next_run_at: string;
  interval_ms?: number;
  budget: { rounds: number; max_rounds: number };
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface FrostGoalStore {
  create(goal: FrostAgentGoal): Promise<void>;
  get(goalId: string): Promise<FrostAgentGoal | null>;
  listSession(sessionId: string): Promise<FrostAgentGoal[]>;
  listDue(sessionId: string, now: string): Promise<FrostAgentGoal[]>;
  compareAndSwap(goalId: string, expectedRevision: number, next: FrostAgentGoal): Promise<boolean>;
}

export class InMemoryFrostGoalStore implements FrostGoalStore {
  private readonly goals = new Map<string, FrostAgentGoal>();

  async create(goal: FrostAgentGoal): Promise<void> {
    if (this.goals.has(goal.goal_id)) throw new Error(`goal_id_conflict:${goal.goal_id}`);
    this.goals.set(goal.goal_id, structuredClone(goal));
  }

  async get(goalId: string): Promise<FrostAgentGoal | null> {
    const goal = this.goals.get(goalId);
    return goal ? structuredClone(goal) : null;
  }

  async listSession(sessionId: string): Promise<FrostAgentGoal[]> {
    return [...this.goals.values()].filter((goal) => goal.session_id === sessionId).map((goal) => structuredClone(goal));
  }

  async listDue(sessionId: string, now: string): Promise<FrostAgentGoal[]> {
    return [...this.goals.values()]
      .filter((goal) => goal.session_id === sessionId && goal.status === 'active' && goal.next_run_at <= now)
      .sort((left, right) => left.next_run_at.localeCompare(right.next_run_at) || left.goal_id.localeCompare(right.goal_id))
      .map((goal) => structuredClone(goal));
  }

  async compareAndSwap(goalId: string, expectedRevision: number, next: FrostAgentGoal): Promise<boolean> {
    const current = this.goals.get(goalId);
    if (!current || current.revision !== expectedRevision || next.goal_id !== goalId || next.revision !== expectedRevision + 1) return false;
    this.goals.set(goalId, structuredClone(next));
    return true;
  }
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('goal_store_request_failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('goal_store_transaction_failed'));
    transaction.onabort = () => reject(transaction.error || new Error('goal_store_transaction_aborted'));
  });
}

export class IndexedDbFrostGoalStore implements FrostGoalStore {
  private readonly fallback = new InMemoryFrostGoalStore();
  private databasePromise: Promise<IDBDatabase | null> | null = null;

  constructor(
    private readonly databaseName = 'pe-frost-agent-goals-v1',
    private readonly factory: IDBFactory | null | undefined = typeof indexedDB === 'undefined' ? null : indexedDB,
  ) {}

  async create(goal: FrostAgentGoal): Promise<void> {
    const database = await this.database();
    if (!database) return this.fallback.create(goal);
    const transaction = database.transaction('goals', 'readwrite');
    const committed = transactionDone(transaction);
    transaction.objectStore('goals').add(structuredClone(goal));
    await committed;
  }

  async get(goalId: string): Promise<FrostAgentGoal | null> {
    const database = await this.database();
    if (!database) return this.fallback.get(goalId);
    const transaction = database.transaction('goals', 'readonly');
    const committed = transactionDone(transaction);
    const goal = await requestValue(transaction.objectStore('goals').get(goalId)) as FrostAgentGoal | undefined;
    await committed;
    return goal ? structuredClone(goal) : null;
  }

  async listSession(sessionId: string): Promise<FrostAgentGoal[]> {
    const database = await this.database();
    if (!database) return this.fallback.listSession(sessionId);
    const transaction = database.transaction('goals', 'readonly');
    const committed = transactionDone(transaction);
    const goals = await requestValue(transaction.objectStore('goals').index('session_id').getAll(sessionId)) as FrostAgentGoal[];
    await committed;
    return goals.map((goal) => structuredClone(goal));
  }

  async listDue(sessionId: string, now: string): Promise<FrostAgentGoal[]> {
    return (await this.listSession(sessionId))
      .filter((goal) => goal.status === 'active' && goal.next_run_at <= now)
      .sort((left, right) => left.next_run_at.localeCompare(right.next_run_at) || left.goal_id.localeCompare(right.goal_id));
  }

  async compareAndSwap(goalId: string, expectedRevision: number, next: FrostAgentGoal): Promise<boolean> {
    const database = await this.database();
    if (!database) return this.fallback.compareAndSwap(goalId, expectedRevision, next);
    const transaction = database.transaction('goals', 'readwrite');
    const committed = transactionDone(transaction);
    const store = transaction.objectStore('goals');
    const current = await requestValue(store.get(goalId)) as FrostAgentGoal | undefined;
    if (!current || current.revision !== expectedRevision || next.goal_id !== goalId || next.revision !== expectedRevision + 1) {
      transaction.abort();
      await committed.catch(() => {});
      return false;
    }
    store.put(structuredClone(next));
    await committed;
    return true;
  }

  private database(): Promise<IDBDatabase | null> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve) => {
      if (!this.factory) { resolve(null); return; }
      try {
        const request = this.factory.open(this.databaseName, 1);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains('goals')) {
            const goals = database.createObjectStore('goals', { keyPath: 'goal_id' });
            goals.createIndex('session_id', 'session_id', { unique: false });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => { this.databasePromise = null; resolve(null); };
        request.onblocked = () => { this.databasePromise = null; resolve(null); };
      } catch { this.databasePromise = null; resolve(null); }
    });
    return this.databasePromise;
  }
}

export interface FrostGoalDriverOptions {
  now?: () => Date;
  lease_ms?: number;
}

function nextRevision(goal: FrostAgentGoal, patch: Partial<FrostAgentGoal>, now: string): FrostAgentGoal {
  return { ...structuredClone(goal), ...patch, revision: goal.revision + 1, updated_at: now };
}

/** Durable wake-up driver: claim by revision first, then enqueue exactly one goal round. */
export class FrostGoalDriver {
  private readonly now: () => Date;
  private readonly leaseMs: number;

  constructor(private readonly loop: FrostAgentLoop, private readonly store: FrostGoalStore, options: FrostGoalDriverOptions = {}) {
    this.now = options.now || (() => new Date());
    this.leaseMs = options.lease_ms ?? 60_000;
  }

  async runDue(): Promise<string[]> {
    await this.reconcileWaiting();
    const session = this.loop.getSession();
    if (session.status !== 'idle' || this.loop.inbox.has()) return [];
    const now = this.now().toISOString();
    const due = await this.store.listDue(session.session_id, now);
    const started: string[] = [];
    for (const goal of due) {
      if (this.loop.getSession().status !== 'idle' || this.loop.inbox.has()) break;
      if (goal.budget.rounds >= goal.budget.max_rounds) {
        const exhausted = nextRevision(goal, { status: 'exhausted' }, now);
        await this.store.compareAndSwap(goal.goal_id, goal.revision, exhausted);
        continue;
      }
      const nextAt = goal.interval_ms
        ? new Date(this.now().getTime() + goal.interval_ms).toISOString()
        : new Date(this.now().getTime() + this.leaseMs).toISOString();
      const claimed = nextRevision(goal, {
        status: 'running',
        next_run_at: nextAt,
        budget: { ...goal.budget, rounds: goal.budget.rounds + 1 },
      }, now);
      if (!await this.store.compareAndSwap(goal.goal_id, goal.revision, claimed)) continue;
      started.push(goal.goal_id);
      await this.loop.followup({
        goal_id: goal.goal_id,
        objective: goal.objective,
        context: structuredClone(goal.context),
        round: claimed.budget.rounds,
        max_rounds: claimed.budget.max_rounds,
      }, 'goal');
      await this.loop.whenIdle();
      const current = await this.store.get(goal.goal_id);
      if (!current || current.revision !== claimed.revision) continue;
      const loopStatus = this.loop.getSession().status;
      if (loopStatus === 'idle') {
        const status: FrostGoalStatus = current.interval_ms && current.budget.rounds < current.budget.max_rounds ? 'active' : 'completed';
        await this.store.compareAndSwap(current.goal_id, current.revision, nextRevision(current, { status }, this.now().toISOString()));
      } else {
        const status: FrostGoalStatus = loopStatus === 'waiting_user' || loopStatus === 'waiting_external' ? 'waiting' : 'paused';
        await this.store.compareAndSwap(current.goal_id, current.revision, nextRevision(current, { status }, this.now().toISOString()));
      }
    }
    return started;
  }

  private async reconcileWaiting(): Promise<void> {
    const session = this.loop.getSession();
    if (session.status !== 'idle') return;
    const waiting = (await this.store.listSession(session.session_id)).filter((goal) => goal.status === 'waiting');
    for (const goal of waiting) {
      const status: FrostGoalStatus = goal.interval_ms && goal.budget.rounds < goal.budget.max_rounds ? 'active' : 'completed';
      await this.store.compareAndSwap(goal.goal_id, goal.revision, nextRevision(goal, { status }, this.now().toISOString()));
    }
  }
}

export function createFrostGoal(input: {
  goal_id: string;
  session_id: string;
  user_id: string;
  objective: string;
  context?: JsonObject;
  run_at?: string;
  interval_ms?: number;
  max_rounds?: number;
  now?: Date;
}): FrostAgentGoal {
  const now = input.now || new Date();
  return {
    protocol: FROST_GOAL_PROTOCOL,
    goal_id: input.goal_id,
    session_id: input.session_id,
    user_id: input.user_id,
    objective: input.objective.trim(),
    context: structuredClone(input.context || {}),
    status: 'active',
    next_run_at: input.run_at || now.toISOString(),
    ...(input.interval_ms ? { interval_ms: input.interval_ms } : {}),
    budget: { rounds: 0, max_rounds: input.max_rounds ?? 1 },
    revision: 1,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
}
