import { keyedStore } from '../keyedStore';
import type { SoundObservation, StoredSoundBlob } from './types';
import { isValidSoundLocation } from './types';

const META_KEY = 'pe.citySounds.v1';
const LOADED_KEY = 'pe.citySounds.loaded.v1';
const VISIBLE_KEY = 'pe.citySounds.visible.v1';
const blobs = keyedStore<StoredSoundBlob>('pe-city-sounds', 'id', 'recordings');
const subs = new Set<() => void>();

let observations = loadMetadata();
let browserOpen = false;

function loadMetadata(): SoundObservation[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = JSON.parse(localStorage.getItem(META_KEY) || '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item): item is SoundObservation => {
        if (!item || typeof item !== 'object') return false;
        const value = item as Partial<SoundObservation>;
        return typeof value.id === 'string'
          && typeof value.title === 'string'
          && typeof value.recordedAt === 'string'
          && typeof value.mimeType === 'string'
          && typeof value.durationMs === 'number';
      })
      .map((item) => ({
        ...item,
        title: item.title.trim().slice(0, 40) || '未命名声音',
        note: String(item.note || '').slice(0, 160),
        durationMs: Math.max(0, item.durationMs),
        byteSize: Math.max(0, Number(item.byteSize) || 0),
        location: isValidSoundLocation(item.location) ? item.location : undefined,
      }))
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  } catch {
    return [];
  }
}

function persist(): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(observations));
  } catch {
    // 隐私模式或配额不足：本次会话仍保留内存态。
  }
}

function emit(): void {
  subs.forEach((fn) => fn());
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === '1';
  } catch {
    return fallback;
  }
}

function writeBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // 会话态仍可工作。
  }
}

export function createSoundId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `sound-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function listSoundObservations(): SoundObservation[] {
  return [...observations];
}

export function getSoundObservation(id: string): SoundObservation | null {
  return observations.find((item) => item.id === id) ?? null;
}

export function subscribeCitySounds(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

/** 音频先写入并回读验证，再提交元数据；避免地图上出现没有声音的空记录。 */
export async function saveSoundObservation(
  observation: SoundObservation,
  blob: Blob,
): Promise<{ ok: boolean; reason?: string }> {
  if (!blob.size) return { ok: false, reason: '录音为空' };
  await blobs.put({ id: observation.id, blob });
  const verified = await blobs.get(observation.id);
  if (!verified?.blob?.size) return { ok: false, reason: '设备未能保存音频，请检查浏览器存储权限' };
  observations = [
    observation,
    ...observations.filter((item) => item.id !== observation.id),
  ].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  persist();
  emit();
  return { ok: true };
}

export async function getSoundBlob(id: string): Promise<Blob | null> {
  return (await blobs.get(id))?.blob ?? null;
}

export async function createSoundObjectUrl(id: string): Promise<string | null> {
  const blob = await getSoundBlob(id);
  return blob ? URL.createObjectURL(blob) : null;
}

export async function removeSoundObservation(id: string): Promise<void> {
  await blobs.del(id);
  observations = observations.filter((item) => item.id !== id);
  persist();
  emit();
}

export function isCitySoundsLoaded(): boolean {
  return readBool(LOADED_KEY, true);
}

export function setCitySoundsLoaded(value: boolean): void {
  writeBool(LOADED_KEY, value);
  emit();
}

export function isCitySoundsVisible(): boolean {
  return readBool(VISIBLE_KEY, true);
}

export function setCitySoundsVisible(value: boolean): void {
  writeBool(VISIBLE_KEY, value);
  emit();
}

export function isCitySoundsBrowserOpen(): boolean {
  return browserOpen;
}

export function setCitySoundsBrowserOpen(value: boolean): void {
  browserOpen = value;
  emit();
}

