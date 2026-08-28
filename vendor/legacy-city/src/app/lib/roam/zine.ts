// ZINE · 旅志照片库：漫游路上拍的照片，按城市分刊收藏（一城一刊）。
// 元数据进 localStorage 'pe.zine.v1'（发布订阅，照 cutouts 模式）；
// 照片 blob 进 IndexedDB 'pe-zine'（meta 只存 id 指针 + objectURL LRU）。
import { keyedStore } from '../skills/keyedStore';

export interface ZinePhoto {
  id: string;
  city: string;             // 收录时的漫游城市（一城一刊）
  date: string;             // ISO（收录时间）
  caption?: string;
}

const KEY = 'pe.zine.v1';

interface StoredBlob { id: string; blob: Blob; ts: number }
const blobStore = keyedStore<StoredBlob>('pe-zine', 'id');

function load(): ZinePhoto[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as ZinePhoto[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

let photos: ZinePhoto[] = load();
const subs = new Set<() => void>();
function persist() { try { localStorage.setItem(KEY, JSON.stringify(photos)); } catch { /* 内存可用 */ } }
function emit() { subs.forEach((fn) => fn()); }

export function subscribeZine(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

export function getZinePhotos(): ZinePhoto[] { return photos; }

/** 批量收录（当前城市刊）；返回成功张数 */
export async function addZinePhotos(files: File[], city: string): Promise<number> {
  let n = 0;
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    const id = `zn-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    try {
      await blobStore.put({ id, blob: f, ts: Date.now() });
      photos = [{ id, city: city.trim() || '杭州', date: new Date().toISOString() }, ...photos];
      n += 1;
    } catch { /* 单张失败不阻塞其余 */ }
  }
  if (n) { persist(); emit(); }
  return n;
}

export async function removeZinePhoto(id: string): Promise<void> {
  photos = photos.filter((p) => p.id !== id);
  persist(); emit();
  try { await blobStore.del(id); } catch { /* 元数据已删，blob 残留无害 */ }
}

// —— objectURL LRU（上限 24 张在册；刊内页一次最多摊 4 张）——
const urlCache = new Map<string, string>();
export async function getZineUrl(id: string): Promise<string | null> {
  const hit = urlCache.get(id);
  if (hit) { urlCache.delete(id); urlCache.set(id, hit); return hit; }
  const rec = await blobStore.get(id);
  if (!rec) return null;
  const url = URL.createObjectURL(rec.blob);
  urlCache.set(id, url);
  if (urlCache.size > 24) {
    const oldest = urlCache.keys().next().value as string;
    const u = urlCache.get(oldest);
    if (u) URL.revokeObjectURL(u);
    urlCache.delete(oldest);
  }
  return url;
}

export interface ZineIssue { city: string; photos: ZinePhoto[] }

/** 一城一刊：按城市分组，刊内新照在前；刊序按最新照片时间倒序 */
export function zineIssues(): ZineIssue[] {
  const map = new Map<string, ZinePhoto[]>();
  for (const p of photos) {
    const list = map.get(p.city) ?? [];
    list.push(p);
    map.set(p.city, list);
  }
  return [...map.entries()]
    .map(([city, list]) => ({ city, photos: list }))
    .sort((a, b) => (b.photos[0]?.date ?? '').localeCompare(a.photos[0]?.date ?? ''));
}

/** 测试/演示复位 */
export function resetZine() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
  photos = [];
  persist(); emit();
}
