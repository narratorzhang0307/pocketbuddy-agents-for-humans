import type { HeritageRecord } from './types';

const KEY = 'carry.heritage.records.v1';
const VISIBLE_KEY = 'carry.heritage.map-visible.v1';
const listeners = new Set<() => void>();
let pendingFocusId: string | null = null;

function read(): HeritageRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function listHeritageRecords(): HeritageRecord[] {
  return read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveHeritageRecord(record: HeritageRecord): void {
  if (typeof localStorage === 'undefined') return;
  const next = [record, ...read().filter((item) => item.id !== record.id)].slice(0, 24);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 存储满时不破坏当前工作台 */ }
  listeners.forEach((listener) => listener());
}

export function removeHeritageRecord(id: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(read().filter((item) => item.id !== id)));
  listeners.forEach((listener) => listener());
}

export function subscribeHeritageRecords(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function isHeritageMapVisible(): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(VISIBLE_KEY) !== '0';
}

export function setHeritageMapVisible(visible: boolean): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(VISIBLE_KEY, visible ? '1' : '0');
  listeners.forEach((listener) => listener());
}

export function requestHeritageRecordFocus(id: string): void {
  pendingFocusId = id;
  listeners.forEach((listener) => listener());
}

export function consumeHeritageRecordFocus(): string | null {
  const id = pendingFocusId;
  pendingFocusId = null;
  return id;
}
