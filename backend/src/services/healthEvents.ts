import { getFirestore } from 'firebase-admin/firestore';
import type { StoredHealthEvent } from '../schemas/healthEvent.js';

export interface HealthEventSyncOutcome {
  event_id: string;
  status: 'synced' | 'duplicate' | 'conflict';
  revision: number;
  error?: string;
}

export interface HealthEventRepository {
  sync(uid: string, event: StoredHealthEvent): Promise<HealthEventSyncOutcome>;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([key, item]) => key !== 'sync' && item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export class InMemoryHealthEventRepository implements HealthEventRepository {
  readonly events = new Map<string, StoredHealthEvent>();

  async sync(uid: string, event: StoredHealthEvent): Promise<HealthEventSyncOutcome> {
    const key = `${uid}/${event.event_id}`;
    const existing = this.events.get(key);
    if (existing) {
      if (canonical(existing) === canonical(event)) {
        return { event_id: event.event_id, status: 'duplicate', revision: existing.sync.revision };
      }
      return { event_id: event.event_id, status: 'conflict', revision: existing.sync.revision, error: 'event_id exists with different content' };
    }
    const stored = structuredClone({ ...event, user_id: uid, sync: { state: 'synced' as const, revision: 1 } });
    this.events.set(key, stored);
    return { event_id: event.event_id, status: 'synced', revision: 1 };
  }
}

export class FirestoreHealthEventRepository implements HealthEventRepository {
  private readonly firestore = getFirestore();

  async sync(uid: string, event: StoredHealthEvent): Promise<HealthEventSyncOutcome> {
    const reference = this.firestore.doc(`users/${uid}/health_events/${event.event_id}`);
    return this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (snapshot.exists) {
        const existing = snapshot.data() as StoredHealthEvent;
        if (canonical(existing) === canonical(event)) {
          return { event_id: event.event_id, status: 'duplicate' as const, revision: existing.sync.revision };
        }
        return { event_id: event.event_id, status: 'conflict' as const, revision: existing.sync.revision, error: 'event_id exists with different content' };
      }
      const stored: StoredHealthEvent = { ...event, user_id: uid, sync: { state: 'synced', revision: 1 } };
      transaction.create(reference, JSON.parse(JSON.stringify(stored)) as StoredHealthEvent);
      return { event_id: event.event_id, status: 'synced' as const, revision: 1 };
    });
  }
}
