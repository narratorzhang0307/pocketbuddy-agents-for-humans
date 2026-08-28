import type { AtlasSpot } from '../../roam/atlas';
import type { WorldLayer } from '../../city-world/types';
import { getBookDisplayTitle } from '../../roam/bookTitle';
import {
  FEATURED_GUIJI_SKILL_NAME,
  isMapSkillPublishedToPublic,
  listMapSkills,
  loadMapSkill,
  normalizeMapSkillPlace,
  publishMapSkillToPublic,
  subscribeMapSkills,
  unpublishMapSkillFromPublic,
  unloadMapSkill,
} from '../../roam/mapSkills';
import { formatGujiDisplayText } from '../../roam/gujiText';
import { isGujiSpotReadyForMap } from '../gujiAtlasStore';

const ACTIVE_KEY = 'shangjie.cityContentPacks.active.v1';
const VISIBLE_KEY = 'shangjie.cityContentPacks.visible.v1';
const ACTIVE_KEYS: Record<WorldLayer, string> = {
  personal: 'shangjie.cityContentPacks.active.personal.v2',
  public: 'shangjie.cityContentPacks.active.public.v2',
};
const VISIBLE_KEYS: Record<WorldLayer, string> = {
  personal: 'shangjie.cityContentPacks.visible.personal.v2',
  public: 'shangjie.cityContentPacks.visible.public.v2',
};

const readStored = (key: string, fallback: string | null): string | null => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const readVisible = (key: string, fallback: boolean): boolean => {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value !== '0';
  } catch {
    return fallback;
  }
};

// The v1 values belonged to the private map. Migrate them only there; the
// public map starts with an independent state so it can never overwrite the
// user's private current pack or visibility.
const activePackIds: Record<WorldLayer, string | null> = {
  personal: readStored(ACTIVE_KEYS.personal, readStored(ACTIVE_KEY, FEATURED_GUIJI_SKILL_NAME)),
  public: readStored(ACTIVE_KEYS.public, null),
};
const visibleByWorld: Record<WorldLayer, boolean> = {
  personal: readVisible(VISIBLE_KEYS.personal, readVisible(VISIBLE_KEY, true)),
  public: readVisible(VISIBLE_KEYS.public, true),
};
const subscribers = new Set<() => void>();

function emit() {
  subscribers.forEach((subscriber) => subscriber());
}

export function subscribeCityContentPacks(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  const offMapSkills = subscribeMapSkills(subscriber);
  return () => {
    subscribers.delete(subscriber);
    offMapSkills();
  };
}

const isAvailableInWorld = (
  pack: ReturnType<typeof listMapSkills>[number],
  worldLayer: WorldLayer,
) => pack.loaded && (
  worldLayer === 'personal' || isMapSkillPublishedToPublic(pack.name)
);

export function getActiveCityContentPackId(
  worldLayer: WorldLayer = 'personal',
): string | null {
  const packs = listMapSkills();
  const activePackId = activePackIds[worldLayer];
  if (activePackId && packs.some(
    (pack) => pack.name === activePackId && isAvailableInWorld(pack, worldLayer),
  )) {
    return activePackId;
  }
  const fallbackId = packs.find((pack) => isAvailableInWorld(pack, worldLayer))?.name ?? null;
  if (fallbackId !== activePackId) {
    activePackIds[worldLayer] = fallbackId;
    try {
      if (fallbackId) localStorage.setItem(ACTIVE_KEYS[worldLayer], fallbackId);
      else localStorage.removeItem(ACTIVE_KEYS[worldLayer]);
    } catch { /* memory state remains */ }
  }
  return fallbackId;
}

export function setActiveCityContentPack(
  packId: string,
  worldLayer: WorldLayer = 'personal',
) {
  if (!listMapSkills().some(
    (pack) => pack.name === packId && isAvailableInWorld(pack, worldLayer),
  )) return;
  activePackIds[worldLayer] = packId;
  visibleByWorld[worldLayer] = true;
  try {
    localStorage.setItem(ACTIVE_KEYS[worldLayer], packId);
    localStorage.setItem(VISIBLE_KEYS[worldLayer], '1');
  } catch { /* memory state remains */ }
  emit();
}

export async function loadAndActivateCityContentPack(
  packId: string,
  worldLayer: WorldLayer = 'personal',
): Promise<boolean> {
  if (!(await loadMapSkill(packId))) return false;
  if (worldLayer === 'public' && !publishMapSkillToPublic(packId)) return false;
  setActiveCityContentPack(packId, worldLayer);
  return true;
}

/** Reset only the layer-selection state; the catalog itself is reset separately. */
export function resetCityContentPackLayerStateForTests() {
  activePackIds.personal = FEATURED_GUIJI_SKILL_NAME;
  activePackIds.public = null;
  visibleByWorld.personal = true;
  visibleByWorld.public = true;
  try {
    Object.values(ACTIVE_KEYS).forEach((key) => localStorage.removeItem(key));
    Object.values(VISIBLE_KEYS).forEach((key) => localStorage.removeItem(key));
  } catch { /* memory state is enough for non-browser tests */ }
}

export function removeCityContentPackFromPublic(packId: string): boolean {
  const removed = unpublishMapSkillFromPublic(packId);
  if (removed && activePackIds.public === packId) {
    activePackIds.public = null;
    getActiveCityContentPackId('public');
    emit();
  }
  return removed;
}

export function unloadCityContentPack(packId: string): boolean {
  const unloaded = unloadMapSkill(packId);
  if (!unloaded) return false;
  for (const worldLayer of ['personal', 'public'] as const) {
    if (activePackIds[worldLayer] !== packId) continue;
    activePackIds[worldLayer] = null;
    getActiveCityContentPackId(worldLayer);
  }
  emit();
  return true;
}

export function isCityContentPacksVisible(
  worldLayer: WorldLayer = 'personal',
): boolean {
  return visibleByWorld[worldLayer];
}

export function setCityContentPacksVisible(
  next: boolean,
  worldLayer: WorldLayer = 'personal',
) {
  if (visibleByWorld[worldLayer] === next) return;
  visibleByWorld[worldLayer] = next;
  try { localStorage.setItem(VISIBLE_KEYS[worldLayer], next ? '1' : '0'); } catch { /* memory state remains */ }
  emit();
}

export function countLoadedCityContentPacks(): number {
  return listMapSkills().filter((pack) => pack.loaded).length;
}

export function listCityContentPackSpots(
  packId: string | null | undefined = undefined,
  worldLayer: WorldLayer = 'personal',
): AtlasSpot[] {
  const resolvedPackId = packId ?? getActiveCityContentPackId(worldLayer);
  if (!resolvedPackId) return [];
  const pack = listMapSkills().find((candidate) => candidate.name === resolvedPackId);
  if (!pack || !isAvailableInWorld(pack, worldLayer)) return [];
  if (!pack.hydrated) {
    void loadMapSkill(resolvedPackId);
    return [];
  }

  const spots: AtlasSpot[] = [];
  for (const book of pack.books) {
    const bookTitle = getBookDisplayTitle(book);
    for (const place of book.places) {
      const normalized = normalizeMapSkillPlace(pack, place);
      const spot: AtlasSpot = {
        key: `${pack.name}:${book.id}:${place.id}`,
        name: formatGujiDisplayText(place.name),
        modernName: formatGujiDisplayText(place.modernName),
        city: book.city,
        status: place.status,
        confidence: place.confidence,
        lat: normalized.lat,
        lng: normalized.lng,
        coordinateType: place.coordinateType,
        coordinateAccuracy: place.coordinateAccuracy,
        mapReady: place.mapReady,
        mapAdmissionReason: place.mapAdmissionReason,
        books: [bookTitle],
        quote: formatGujiDisplayText(place.quote),
        chapter: formatGujiDisplayText(place.chapter),
        note: formatGujiDisplayText(place.note),
        sources: [{
          key: `${pack.name}:${book.id}:${place.id}`,
          skillId: pack.name,
          skillName: pack.displayName,
          bookId: book.id,
          bookTitle,
          author: book.author,
          era: book.era,
          quote: formatGujiDisplayText(place.quote),
          chapter: formatGujiDisplayText(place.chapter),
          note: formatGujiDisplayText(place.note),
        }],
      };
      if (isGujiSpotReadyForMap(spot)) spots.push(spot);
    }
  }
  return spots;
}

export function getCityContentPackLegendCounts(
  worldLayer: WorldLayer = 'personal',
) {
  const packs = listMapSkills();
  return {
    loaded: packs.filter((pack) => isAvailableInWorld(pack, worldLayer)).length,
    total: packs.length,
  };
}
