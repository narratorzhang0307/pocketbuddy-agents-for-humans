import { keyedStore } from '../skills/keyedStore';
import type { PhotoPreferenceVector } from './preference';
import type { PhotoRadarAnalysis } from './radarTypes';

export const PHOTO_CURATION_LEDGER_SCHEMA = 'pocketearth.photo-curation-ledger/v1' as const;
export const PHOTO_CURATION_FEATURE_SCHEMA = 'photo-preference-features/v1' as const;
export const PHOTO_CURATION_BASE_REVISION = 'Qwen3-VL-2B-Instruct@9e49ec71' as const;
export const PHOTO_CURATION_PROMPT_REVISION = 'pocket.photos.curator/v1' as const;

export type PhotoCurationAction =
  | 'prefer'
  | 'preference-undo'
  | 'preference-reset'
  | 'publish'
  | 'unpublish'
  | 'sync-earth'
  | 'keep-both'
  | 'skip';

export interface PhotoCurationScoreSnapshot {
  key: string;
  technicalQuality: number;
  universalAesthetic?: number;
  aestheticSource?: string;
  personalAffinity?: number;
  curationScore?: number;
}

export interface PhotoCurationPreferencePayload {
  winner: PhotoPreferenceVector;
  loser: PhotoPreferenceVector;
}

/**
 * Immutable user-decision event. It deliberately stores asset keys and derived
 * features only; original photos, thumbnails and OCR text never enter this DB.
 */
export interface PhotoCurationEvent {
  id: string;
  schema: typeof PHOTO_CURATION_LEDGER_SCHEMA;
  action: PhotoCurationAction;
  createdAt: number;
  assetKeys: string[];
  winnerKey?: string;
  loserKey?: string;
  groupId?: string;
  surface: 'cold-start' | 'decision-group' | 'search' | 'earth' | 'chronicle' | 'system';
  baseRevision: string;
  adapterRevision: string | null;
  adapterStatus: 'base-only' | 'research-candidate' | 'released';
  promptRevision: string;
  featureSchemaVersion: string;
  preference?: PhotoCurationPreferencePayload;
  scores: PhotoCurationScoreSnapshot[];
}

export interface PhotoCurationEventInput {
  action: PhotoCurationAction;
  assetKeys: string[];
  winnerKey?: string;
  loserKey?: string;
  groupId?: string;
  surface: PhotoCurationEvent['surface'];
  preference?: PhotoCurationPreferencePayload;
  analyses?: PhotoRadarAnalysis[];
  adapterRevision?: string | null;
  adapterStatus?: PhotoCurationEvent['adapterStatus'];
  now?: number;
  id?: string;
}

export interface PhotoCurationLedgerSummary {
  totalEvents: number;
  preferenceChoices: number;
  publishedKeys: Set<string>;
  earthSyncedKeys: Set<string>;
  skippedGroups: number;
  lastEventAt?: number;
}

const store = keyedStore<PhotoCurationEvent>('pe-photo-curation-ledger-v1', 'id');

const fallbackId = (now: number): string => `${now}-${Math.random().toString(36).slice(2, 10)}`;

export function createPhotoCurationEvent(input: PhotoCurationEventInput): PhotoCurationEvent {
  const createdAt = input.now ?? Date.now();
  const id = input.id || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : fallbackId(createdAt));
  const uniqueKeys = [...new Set(input.assetKeys.filter(Boolean))];
  const analysisByKey = new Map((input.analyses || []).map((analysis) => [analysis.key, analysis]));
  return {
    id,
    schema: PHOTO_CURATION_LEDGER_SCHEMA,
    action: input.action,
    createdAt,
    assetKeys: uniqueKeys,
    winnerKey: input.winnerKey,
    loserKey: input.loserKey,
    groupId: input.groupId,
    surface: input.surface,
    baseRevision: PHOTO_CURATION_BASE_REVISION,
    adapterRevision: input.adapterRevision ?? null,
    adapterStatus: input.adapterStatus ?? 'base-only',
    promptRevision: PHOTO_CURATION_PROMPT_REVISION,
    featureSchemaVersion: PHOTO_CURATION_FEATURE_SCHEMA,
    preference: input.preference,
    scores: uniqueKeys.map((key) => {
      const analysis = analysisByKey.get(key);
      return {
        key,
        technicalQuality: analysis?.technicalQuality ?? 0,
        universalAesthetic: analysis?.universalAesthetic,
        aestheticSource: analysis?.aestheticSource,
        personalAffinity: analysis?.personalAffinity,
        curationScore: analysis?.curationScore,
      };
    }),
  };
}

export async function appendPhotoCurationEvent(input: PhotoCurationEventInput): Promise<PhotoCurationEvent> {
  const event = createPhotoCurationEvent(input);
  await store.put(event);
  return event;
}

export async function getPhotoCurationEvents(): Promise<PhotoCurationEvent[]> {
  const events = await store.all();
  return events
    .filter((event) => event?.schema === PHOTO_CURATION_LEDGER_SCHEMA)
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
}

export function summarizePhotoCurationEvents(events: PhotoCurationEvent[]): PhotoCurationLedgerSummary {
  const publishedKeys = new Set<string>();
  const earthSyncedKeys = new Set<string>();
  let preferenceChoices = 0;
  let skippedGroups = 0;
  for (const event of events) {
    if (event.action === 'prefer') preferenceChoices += 1;
    if (event.action === 'preference-undo') preferenceChoices = Math.max(0, preferenceChoices - 1);
    if (event.action === 'preference-reset') preferenceChoices = 0;
    if (event.action === 'publish' || event.action === 'keep-both') {
      for (const key of event.assetKeys) publishedKeys.add(key);
    }
    if (event.action === 'unpublish') {
      for (const key of event.assetKeys) publishedKeys.delete(key);
    }
    if (event.action === 'sync-earth') {
      for (const key of event.assetKeys) earthSyncedKeys.add(key);
    }
    if (event.action === 'skip') skippedGroups += 1;
  }
  return {
    totalEvents: events.length,
    preferenceChoices,
    publishedKeys,
    earthSyncedKeys,
    skippedGroups,
    lastEventAt: events.at(-1)?.createdAt,
  };
}

export function publicationOverrides(events: PhotoCurationEvent[]): Map<string, boolean> {
  const state = new Map<string, boolean>();
  for (const event of events) {
    if (event.action !== 'publish' && event.action !== 'keep-both' && event.action !== 'unpublish') continue;
    const included = event.action !== 'unpublish';
    for (const key of event.assetKeys) state.set(key, included);
  }
  return state;
}

export function serializePhotoCurationLedger(events: PhotoCurationEvent[]): string {
  return JSON.stringify({
    schema: PHOTO_CURATION_LEDGER_SCHEMA,
    exportedAt: new Date().toISOString(),
    privacy: 'derived-features-only; no original image bytes; no OCR body text',
    events,
  }, null, 2);
}

export async function clearPhotoCurationLedger(): Promise<void> {
  const events = await store.all();
  await store.delMany(events.map((event) => event.id));
}
