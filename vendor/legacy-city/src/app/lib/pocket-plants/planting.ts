import type { GeoPosition } from '../maps/runtime';
import { normalizePocketPlantAssetId } from './catalog';

export const POCKET_SEED_POUCH_LIMIT = 6;
export const POCKET_PLANT_GROWTH_MS = 12_000;

const SEED_POUCH_KEY = 'carrythecosmos:pocket-seed-pouch:v1';
const LEGACY_PLANTINGS_KEY = 'carrythecosmos:pocket-plantings:v1';
export const POCKET_PLANTINGS_STORAGE_KEY = 'carrythecosmos:pocket-plantings:device-local:v2';
export const POCKET_PLANT_PERSISTENCE = 'device-local' as const;

export type PocketPlanting = {
  id: string;
  storageScope: typeof POCKET_PLANT_PERSISTENCE;
  assetId: string;
  position: GeoPosition;
  plantedAt: string;
  place: string;
  poemDraftId?: string;
  sentence?: string;
  magic: string[];
  sentenceVisibility: 'hidden' | 'public';
  /** Map presentation on this device. `public` never publishes to a server. */
  visibility: 'private' | 'public';
  publishedAt?: string;
  revisitCount: number;
  lastRevisitedAt?: string;
  visitors: PocketPlantVisitor[];
  source?: 'app' | 't5';
  sourceEventId?: string;
  wgs84Position?: GeoPosition;
  accuracyM?: number;
  evidenceSteps?: number;
  collectedAt?: string;
};

export type PocketPlantVisitor = {
  id: string;
  kind: 'magical-animal' | 'agent' | 'scout';
  name: string;
  note: string;
  visitedAt: string;
  seenAt?: string;
};

export type PocketPlantingContext = {
  place?: string;
  poemDraftId?: string;
  sentence?: string;
  magic?: readonly string[];
  sentenceVisibility?: 'hidden' | 'public';
};

const subscribers = new Set<() => void>();
const emit = () => subscribers.forEach((subscriber) => subscriber());
let storageListenerAttached = false;

const attachStorageListener = () => {
  if (
    storageListenerAttached ||
    typeof window === 'undefined' ||
    typeof window.addEventListener !== 'function'
  ) return;
  window.addEventListener('storage', (event) => {
    if (
      event.key === POCKET_PLANTINGS_STORAGE_KEY ||
      event.key === LEGACY_PLANTINGS_KEY
    ) emit();
  });
  storageListenerAttached = true;
};

export function subscribePocketPlantings(subscriber: () => void) {
  attachStorageListener();
  void requestPocketPlantStoragePersistence();
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

const storage = () =>
  typeof window === 'undefined' ? null : window.localStorage;

export function readPocketSeedPouch(): string[] {
  try {
    const parsed = JSON.parse(storage()?.getItem(SEED_POUCH_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed
      .filter((value): value is string => typeof value === 'string')
      .map(normalizePocketPlantAssetId))]
      .slice(0, POCKET_SEED_POUCH_LIMIT);
  } catch {
    return [];
  }
}

export function writePocketSeedPouch(assetIds: readonly string[]) {
  storage()?.setItem(
    SEED_POUCH_KEY,
    JSON.stringify([...new Set(assetIds)].slice(0, POCKET_SEED_POUCH_LIMIT)),
  );
}

export function readPocketPlantings(): PocketPlanting[] {
  try {
    const localStorage = storage();
    const currentRaw = localStorage?.getItem(POCKET_PLANTINGS_STORAGE_KEY) ?? null;
    const legacyRaw = currentRaw === null
      ? localStorage?.getItem(LEGACY_PLANTINGS_KEY) ?? null
      : null;
    const parsed = JSON.parse(currentRaw ?? legacyRaw ?? '[]');
    if (!Array.isArray(parsed)) return [];
    const plantings = parsed.filter((value): value is PocketPlanting => {
      if (!value || typeof value !== 'object') return false;
      const candidate = value as Partial<PocketPlanting>;
      return (
        typeof candidate.id === 'string' &&
        typeof candidate.assetId === 'string' &&
        typeof candidate.plantedAt === 'string' &&
        Array.isArray(candidate.position) &&
        candidate.position.length === 2 &&
        candidate.position.every(Number.isFinite)
      );
    }).map((planting): PocketPlanting => ({
      ...planting,
      storageScope: POCKET_PLANT_PERSISTENCE,
      assetId: normalizePocketPlantAssetId(planting.assetId),
      place: typeof planting.place === 'string' && planting.place.trim()
        ? planting.place
        : '杭州 · 城市落点',
      magic: Array.isArray(planting.magic)
        ? planting.magic.filter((trait): trait is string => typeof trait === 'string')
        : [],
      sentenceVisibility: planting.sentenceVisibility === 'public' ? 'public' : 'hidden',
      visibility: planting.visibility === 'public' ? 'public' : 'private',
      revisitCount: Number.isFinite(planting.revisitCount)
        ? Math.max(0, Math.floor(planting.revisitCount))
        : 0,
      visitors: Array.isArray(planting.visitors)
        ? planting.visitors.filter((visitor): visitor is PocketPlantVisitor => (
            visitor &&
            typeof visitor.id === 'string' &&
            typeof visitor.name === 'string' &&
            typeof visitor.note === 'string' &&
            typeof visitor.visitedAt === 'string' &&
            ['magical-animal', 'agent', 'scout'].includes(visitor.kind)
          ))
        : [],
    }));
    if (currentRaw === null && legacyRaw !== null) {
      try {
        localStorage?.setItem(POCKET_PLANTINGS_STORAGE_KEY, JSON.stringify(plantings));
      } catch {
        // Keep the readable legacy ledger even if this browser rejects writes.
      }
    }
    return plantings;
  } catch {
    return [];
  }
}

export function writePocketPlantings(plantings: readonly PocketPlanting[]) {
  try {
    storage()?.setItem(
      POCKET_PLANTINGS_STORAGE_KEY,
      JSON.stringify(plantings.map((planting) => ({
        ...planting,
        storageScope: POCKET_PLANT_PERSISTENCE,
      }))),
    );
  } catch {
    // Storage can be unavailable in private browsing; the mounted view keeps
    // its in-memory copy, while normal installed PWAs retain the device ledger.
  }
  void requestPocketPlantStoragePersistence();
  emit();
}

let persistenceRequested = false;
export async function requestPocketPlantStoragePersistence(): Promise<boolean> {
  if (persistenceRequested) return false;
  persistenceRequested = true;
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.storage?.persist !== 'function'
  ) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export function createPocketPlanting(
  assetId: string,
  position: GeoPosition,
  now = new Date(),
  context: PocketPlantingContext = {},
): PocketPlanting {
  return {
    id: `pocket-plant-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    storageScope: POCKET_PLANT_PERSISTENCE,
    assetId: normalizePocketPlantAssetId(assetId),
    position,
    plantedAt: now.toISOString(),
    place: context.place?.trim() || '杭州 · 城市落点',
    poemDraftId: context.poemDraftId,
    sentence: context.sentence?.trim() || undefined,
    magic: [...(context.magic ?? [])].slice(0, 3),
    sentenceVisibility: context.sentenceVisibility ?? 'hidden',
    visibility: 'private',
    revisitCount: 0,
    visitors: [],
  };
}

export function updatePocketPlanting(
  plantingId: string,
  updater: (planting: PocketPlanting) => PocketPlanting,
): PocketPlanting | null {
  const plantings = readPocketPlantings();
  const index = plantings.findIndex((planting) => planting.id === plantingId);
  if (index < 0) return null;
  const updated = updater(plantings[index]);
  const next = [...plantings];
  next[index] = updated;
  writePocketPlantings(next);
  return updated;
}

export function publishPocketPlanting(
  plantingId: string,
  now = new Date(),
): PocketPlanting | null {
  return updatePocketPlanting(plantingId, (planting) => ({
    ...planting,
    visibility: 'public',
    publishedAt: planting.publishedAt ?? now.toISOString(),
  }));
}

export function recordPocketPlantRevisit(
  plantingId: string,
  now = new Date(),
): PocketPlanting | null {
  return updatePocketPlanting(plantingId, (planting) => {
    const previous = planting.lastRevisitedAt
      ? Date.parse(planting.lastRevisitedAt)
      : 0;
    if (now.getTime() - previous < 6 * 60 * 60 * 1000) return planting;
    return {
      ...planting,
      revisitCount: planting.revisitCount + 1,
      lastRevisitedAt: now.toISOString(),
    };
  });
}

export function addPocketPlantVisitor(
  plantingId: string,
  visitor: PocketPlantVisitor,
): PocketPlanting | null {
  return updatePocketPlanting(plantingId, (planting) => (
    planting.visitors.some((entry) => entry.id === visitor.id)
      ? planting
      : { ...planting, visitors: [visitor, ...planting.visitors] }
  ));
}

export function markPocketPlantVisitorsSeen(
  plantingId: string,
  now = new Date(),
): PocketPlanting | null {
  return updatePocketPlanting(plantingId, (planting) => ({
    ...planting,
    visitors: planting.visitors.map((visitor) => (
      visitor.seenAt ? visitor : { ...visitor, seenAt: now.toISOString() }
    )),
  }));
}

const distanceMeters = (a: GeoPosition, b: GeoPosition) => {
  const latitude = ((a[1] + b[1]) / 2) * Math.PI / 180;
  const dx = (a[0] - b[0]) * 111_320 * Math.cos(latitude);
  const dy = (a[1] - b[1]) * 110_540;
  return Math.hypot(dx, dy);
};

export function recordNearbyPocketPlantRevisits(
  position: GeoPosition,
  radiusMeters = 24,
  now = new Date(),
): string[] {
  const nearby = readPocketPlantings().filter(
    (planting) => distanceMeters(planting.position, position) <= radiusMeters,
  );
  const updatedIds: string[] = [];
  nearby.forEach((planting) => {
    const before = planting.revisitCount;
    const updated = recordPocketPlantRevisit(planting.id, now);
    if (updated && updated.revisitCount > before) updatedIds.push(planting.id);
  });
  return updatedIds;
}

export function pocketPlantGrowth(
  plantedAt: string,
  now = Date.now(),
): { progress: number; scale: number; remainingMs: number } {
  const plantedTime = Date.parse(plantedAt);
  const elapsed = Number.isFinite(plantedTime)
    ? Math.max(0, now - plantedTime)
    : POCKET_PLANT_GROWTH_MS;
  const progress = Math.min(1, elapsed / POCKET_PLANT_GROWTH_MS);
  return {
    progress,
    scale: 0.18 + progress * 0.82,
    remainingMs: Math.max(0, POCKET_PLANT_GROWTH_MS - elapsed),
  };
}
