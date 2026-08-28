// 漫游手帐 · 页/元素持久层（两级：页含元素）。存储范式沿用 cutouts.ts/zine.ts：
//   元数据（页数组，元素含 blobId 指针）→ localStorage 'pe.journal.v1'（发布订阅，照 userMarks 模式）；
//   图 blob → IndexedDB 'pe-journal'（keyedStore，只存 id 指针 + objectURL LRU）。
// node 环境无 localStorage/IndexedDB 时静默降级（内存可用），页/元素逻辑照常可单测。
import { keyedStore } from '../skills/keyedStore';
import type { JournalBundle, JournalElement, JournalPage } from './types';

const KEY = 'pe.journal.v1';
interface StoredBlob { id: string; blob: Blob; ts: number }
const blobStore = keyedStore<StoredBlob>('pe-journal', 'id');

function load(): JournalPage[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    const arr = raw ? (JSON.parse(raw) as JournalPage[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

let pages: JournalPage[] = load();
let activeId: string | null = pages[0]?.id ?? null;
let hasUnpersistedChanges = false;
let deferredPersistTimer: ReturnType<typeof setTimeout> | null = null;
const subs = new Set<() => void>();
function persist() {
  if (deferredPersistTimer) {
    clearTimeout(deferredPersistTimer);
    deferredPersistTimer = null;
  }
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(pages));
  } catch { /* 内存可用 */ }
  hasUnpersistedChanges = false;
}
function scheduleDeferredPersist() {
  if (deferredPersistTimer || typeof setTimeout === 'undefined') return;
  // 连续手势最多每 400ms 写一次：兼顾异常退出容错与主线程/存储压力。
  deferredPersistTimer = setTimeout(() => {
    deferredPersistTimer = null;
    if (hasUnpersistedChanges) persist();
  }, 400);
}
function emit() { subs.forEach((fn) => fn()); }
const now = () => Date.now();
const rid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
const clampScale = (s: number) => Math.max(0.1, Math.min(8, s));

export function subscribeJournal(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }
export function getPages(): JournalPage[] { return pages; }
export function getPage(id: string | null): JournalPage | undefined { return pages.find((p) => p.id === id) ?? undefined; }
export function getActivePageId(): string | null { return activeId; }
export function setActivePage(id: string | null) { activeId = id; emit(); }

// —— 页 CRUD ——
export function createPage(init: Partial<JournalPage> = {}): string {
  const id = init.id ?? rid('pg');
  const page: JournalPage = {
    id, city: init.city, title: init.title, bg: init.bg ?? 'kraft',
    elements: init.elements ?? [], createdAt: init.createdAt ?? now(), updatedAt: now(),
  };
  pages = [page, ...pages.filter((p) => p.id !== id)];
  activeId = id;
  persist(); emit();
  return id;
}
/** 整页写入（buildInitialPage 用）：存在则替换、否则头插；置为当前页。 */
export function upsertPage(page: JournalPage): string {
  const exists = pages.some((p) => p.id === page.id);
  pages = exists ? pages.map((p) => (p.id === page.id ? { ...page, updatedAt: now() } : p)) : [{ ...page, updatedAt: now() }, ...pages];
  activeId = page.id;
  persist(); emit();
  return page.id;
}
export function removePage(id: string) {
  const page = pages.find((p) => p.id === id);
  pages = pages.filter((p) => p.id !== id);
  if (activeId === id) activeId = pages[0]?.id ?? null;
  persist(); emit();
  // 回收该页独占的图 blob
  page?.elements.forEach((el) => { if (el.blobId) void maybeDelBlob(el.blobId); });
}

// —— 元素增删改 ——
const maxZ = (p: JournalPage) => p.elements.reduce((m, e) => Math.max(m, e.z), 0);
const minZ = (p: JournalPage) => p.elements.reduce((m, e) => Math.min(m, e.z), 0);

function mutate(pageId: string, fn: (els: JournalElement[]) => JournalElement[], persistNow = true) {
  pages = pages.map((p) => (p.id === pageId ? { ...p, elements: fn(p.elements), updatedAt: now() } : p));
  if (persistNow) persist();
  else {
    hasUnpersistedChanges = true;
    scheduleDeferredPersist();
  }
  emit();
}

// 元素入参：id/z 由 store 分配；rot/scale/w 有默认值故可缺省。
export type ElementInput = Omit<JournalElement, 'id' | 'z' | 'rot' | 'scale' | 'w'> & { z?: number; rot?: number; scale?: number; w?: number };

/** 新增元素（z 缺省叠到最上）；返回元素 id。 */
export function addElement(pageId: string, el: ElementInput): string {
  const page = getPage(pageId);
  const id = rid('el');
  const full: JournalElement = { rot: 0, scale: 1, w: 0.3, ...el, id, z: el.z ?? (page ? maxZ(page) + 1 : 1) };
  mutate(pageId, (els) => [...els, full]);
  return id;
}
export function updateElement(pageId: string, elId: string, patch: Partial<Omit<JournalElement, 'id' | 'type'>>) {
  mutate(pageId, (els) => els.map((e) => (e.id === elId ? { ...e, ...patch, ...(patch.scale != null ? { scale: clampScale(patch.scale) } : {}) } : e)));
}
export function moveElement(pageId: string, elId: string, x: number, y: number) { updateElement(pageId, elId, { x, y }); }
/**
 * 连续手势专用：只更新内存并通知视图，不在每个 pointermove 上同步序列化整本手帐。
 * 手势结束后必须调用 commitJournalChanges()，现有持久化 API 的行为保持不变。
 */
export function updateElementTransient(pageId: string, elId: string, patch: Partial<Omit<JournalElement, 'id' | 'type'>>) {
  mutate(
    pageId,
    (els) => els.map((e) => (e.id === elId ? { ...e, ...patch, ...(patch.scale != null ? { scale: clampScale(patch.scale) } : {}) } : e)),
    false,
  );
}
export function moveElementTransient(pageId: string, elId: string, x: number, y: number) {
  updateElementTransient(pageId, elId, { x, y });
}
/** 把一段连续编辑的最终内存状态一次性写入本地存储；无暂存改动时不做无意义写盘。 */
export function commitJournalChanges() {
  if (hasUnpersistedChanges) persist();
}
export function bringToFront(pageId: string, elId: string) {
  const page = getPage(pageId); if (!page) return;
  updateElement(pageId, elId, { z: maxZ(page) + 1 });
}
export function sendToBack(pageId: string, elId: string) {
  const page = getPage(pageId); if (!page) return;
  updateElement(pageId, elId, { z: minZ(page) - 1 });
}
export function removeElement(pageId: string, elId: string) {
  const el = getPage(pageId)?.elements.find((e) => e.id === elId);
  mutate(pageId, (els) => els.filter((e) => e.id !== elId));
  if (el?.blobId) void maybeDelBlob(el.blobId);
}

// —— 图 blob（keyedStore）+ objectURL LRU ——
export async function putElementBlob(blob: Blob): Promise<string> {
  const id = rid('bl');
  await blobStore.put({ id, blob, ts: Date.now() });
  return id;
}
/** 存图 + 落一个图类元素（一步）；返回元素 id。 */
export async function addImageElement(pageId: string, blob: Blob, el: Omit<ElementInput, 'blobId'>): Promise<string> {
  const blobId = await putElementBlob(blob);
  return addElement(pageId, { ...el, blobId });
}
async function maybeDelBlob(blobId: string) {
  const stillUsed = pages.some((p) => p.elements.some((e) => e.blobId === blobId));
  if (stillUsed) return;
  releaseElementUrl(blobId);
  try { await blobStore.del(blobId); } catch { /* 已不在 */ }
}

const urlCache = new Map<string, string>();   // objectURL 缓存（上限 URL_CACHE_MAX，淘汰非在屏项）
const pending = new Map<string, Promise<string | null>>();   // 在途去重：同一 blobId 并发只建一个 URL
let pinnedBlobs = new Set<string>();          // 「当前屏上正在渲染」的 blobId——绝不淘汰它们
const URL_CACHE_MAX = 64;

/** 视图登记当前屏上渲染中的 blobId 集合；只有这些绝不被淘汰，其余按上限回收（守住内存）。 */
export function pinBlobs(ids: Iterable<string>) { pinnedBlobs = new Set(ids); }

export async function getElementUrl(blobId: string): Promise<string | null> {
  const hit = urlCache.get(blobId);
  if (hit) { urlCache.delete(blobId); urlCache.set(blobId, hit); return hit; }   // LRU touch
  const inflight = pending.get(blobId);
  if (inflight) return inflight;   // 在途去重：复用同一 Promise，杜绝并发重复 createObjectURL 泄漏
  const p = (async (): Promise<string | null> => {
    const rec = await blobStore.get(blobId);
    if (!rec) return null;
    const existing = urlCache.get(blobId);
    if (existing) return existing;
    const url = URL.createObjectURL(rec.blob);
    urlCache.set(blobId, url);
    if (urlCache.size > URL_CACHE_MAX) evictUnreferenced();
    return url;
  })();
  pending.set(blobId, p);
  try { return await p; } finally { pending.delete(blobId); }
}
// 只淘汰「当前不在屏上」的最旧项——绝不 revoke 正在展示的图（否则裂图），且不再护住所有历史页（否则无界增长）。
function evictUnreferenced() {
  for (const key of urlCache.keys()) {   // Map 迭代=插入序=最旧在前
    if (pinnedBlobs.has(key)) continue;
    const u = urlCache.get(key); if (u) URL.revokeObjectURL(u);
    urlCache.delete(key);
    return;
  }
}
export function releaseElementUrl(blobId: string) {
  const u = urlCache.get(blobId);
  if (u) { URL.revokeObjectURL(u); urlCache.delete(blobId); }
}

// —— 导出 / 导入（跨设备迁移；碎片图 base64 内联）——
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = () => rej(new Error('read blob 失败'));
    fr.readAsDataURL(blob);
  });
}
async function dataUrlToBlob(url: string): Promise<Blob> { return (await fetch(url)).blob(); }

/** 导出一页为可迁移 JSON（含图 base64）。 */
export async function exportPage(pageId: string): Promise<string> {
  const page = getPage(pageId);
  if (!page) throw new Error('页不存在');
  const blobs: Record<string, string> = {};
  for (const el of page.elements) {
    if (el.blobId && !blobs[el.blobId]) {
      const rec = await blobStore.get(el.blobId);
      if (rec) blobs[el.blobId] = await blobToDataUrl(rec.blob);
    }
  }
  const bundle: JournalBundle = { v: 1, page, blobs };
  return JSON.stringify(bundle);
}
/** 导入一页（重映射 blobId，避免与本地冲突）；返回新页 id。 */
export async function importPage(json: string): Promise<string> {
  const bundle = JSON.parse(json) as JournalBundle;
  if (bundle?.v !== 1 || !bundle.page) throw new Error('不是有效的手帐封包');
  const remap = new Map<string, string>();
  for (const [oldId, dataUrl] of Object.entries(bundle.blobs || {})) {
    const blob = await dataUrlToBlob(dataUrl);
    remap.set(oldId, await putElementBlob(blob));
  }
  const newId = rid('pg');
  const page: JournalPage = {
    ...bundle.page, id: newId, createdAt: now(), updatedAt: now(),
    // blob 缺失时置 undefined（缺图占位），不沿用源设备旧 id（避免与本地 blob 撞名错显）
    elements: bundle.page.elements.map((e) => ({ ...e, id: rid('el'), blobId: e.blobId ? remap.get(e.blobId) : undefined })),
  };
  return upsertPage(page);
}

/** 测试/演示复位（只清元数据；blob 库惰性遗留无碍）。 */
export function resetJournal() {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY); } catch { /* noop */ }
  pages = []; activeId = null;
  persist(); emit();
}
