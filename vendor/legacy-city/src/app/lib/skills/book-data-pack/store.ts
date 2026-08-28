import type { WorldLayer } from '../../city-world/types';
import {
  ensureActiveDataPack,
  getDataPackState,
  installDefaultDataPack,
  removeDataPack,
  subscribeDataPacks,
  type BookPackRecord,
} from '../../dataPack';

const LOADED_KEYS: Record<WorldLayer, string> = {
  personal: 'ctc.bookDataPack.map.loaded.personal.v1',
  public: 'ctc.bookDataPack.map.loaded.public.v1',
};
const VISIBLE_KEYS: Record<WorldLayer, string> = {
  personal: 'ctc.bookDataPack.map.visible.personal.v1',
  public: 'ctc.bookDataPack.map.visible.public.v1',
};

const listeners = new Set<() => void>();

function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === '1'; }
  catch { return false; }
}

function writeFlag(key: string, value: boolean) {
  try {
    if (value) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch { /* in-memory data pack state still remains usable */ }
}

const notify = () => listeners.forEach((listener) => listener());

export interface BookDataPackPoint {
  id: string;
  title: string;
  author: string;
  synopsis: string;
  place: string;
  lng: number;
  lat: number;
}

function pointFor(record: BookPackRecord): BookDataPackPoint | null {
  const location = record.locations?.find(
    (candidate) => Number.isFinite(candidate.lng) && Number.isFinite(candidate.lat),
  );
  if (!location) return null;
  return {
    id: record.id,
    title: record.title,
    author: record.author,
    synopsis: record.synopsis,
    place: location.place,
    lng: location.lng,
    lat: location.lat,
  };
}

export function listBookDataPackPoints(): BookDataPackPoint[] {
  const records = (getDataPackState('books').active?.records || []) as BookPackRecord[];
  return records.map(pointFor).filter((point): point is BookDataPackPoint => !!point);
}

export function isBookDataPackLayerLoaded(worldLayer: WorldLayer = 'personal'): boolean {
  return readFlag(LOADED_KEYS[worldLayer]) && Boolean(getDataPackState('books').active);
}

export function isBookDataPackLayerVisible(worldLayer: WorldLayer = 'personal'): boolean {
  return isBookDataPackLayerLoaded(worldLayer) && readFlag(VISIBLE_KEYS[worldLayer]);
}

export function setBookDataPackLayerVisible(
  visible: boolean,
  worldLayer: WorldLayer = 'personal',
) {
  writeFlag(VISIBLE_KEYS[worldLayer], visible);
  notify();
}

export async function loadBookDataPackLayer(
  worldLayer: WorldLayer = 'personal',
): Promise<boolean> {
  let pack = getDataPackState('books').active;
  if (!pack) pack = await ensureActiveDataPack('books');
  if (!pack) pack = await installDefaultDataPack('books');
  writeFlag(LOADED_KEYS[worldLayer], true);
  writeFlag(VISIBLE_KEYS[worldLayer], true);
  notify();
  return true;
}

export function unloadBookDataPackLayer(worldLayer: WorldLayer = 'personal') {
  writeFlag(LOADED_KEYS[worldLayer], false);
  writeFlag(VISIBLE_KEYS[worldLayer], false);
  notify();
}

export async function clearBookDataPackCache(): Promise<void> {
  unloadBookDataPackLayer('personal');
  unloadBookDataPackLayer('public');
  const packKey = getDataPackState('books').active?.packKey;
  if (packKey) await removeDataPack(packKey);
  notify();
}

export const subscribeBookDataPackLayers = (listener: () => void): (() => void) => {
  listeners.add(listener);
  const unsubscribeData = subscribeDataPacks(listener);
  return () => {
    listeners.delete(listener);
    unsubscribeData();
  };
};
