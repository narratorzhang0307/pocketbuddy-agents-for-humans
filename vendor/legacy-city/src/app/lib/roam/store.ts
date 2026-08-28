// 记忆层：roam 域状态（书 + 地点建议），localStorage 'pe.roam.v1' + 发布订阅（照 userMarks 模式）。
// 书架由真实单书 .skill 注册；早期八本演示书只用于识别旧缓存并退役。

import { unmarkPlace } from '../skills/markPlace';
import { BUILTIN_BOOKS } from './catalog';
import type { RoamBook, RoamPlace, RoamResearchState, RoamResearchVia, RoamSuggestState } from './types';

const KEY = 'pe.roam.v1';
const PIN_PREFIX = 'ubk-roam-';

interface RoamState { books: RoamBook[]; places: RoamPlace[] }

function load(): RoamState {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as RoamState) : null;
    if (s && Array.isArray(s.books) && Array.isArray(s.places)) {
      // 研究任务只存在于当前页面。PWA 被系统回收或刷新后，不可能仍有
      // 后台任务接管旧的 running 状态，因此必须恢复为可重试状态。
      return {
        books: s.books.map((book) => (
          book.research === 'running'
            ? { ...book, research: 'idle' as const }
            : book
        )),
        places: s.places,
      };
    }
  } catch { /* 隐私模式/首次：走播种 */ }
  return { books: [], places: [] };
}

function retireLegacyBuiltins(s: RoamState): RoamState {
  const legacyIds = new Set(BUILTIN_BOOKS.map((book) => book.id));
  if (!s.books.some((book) => book.source === 'builtin' && legacyIds.has(book.id))) return s;
  for (const place of s.places) {
    if (legacyIds.has(place.bookId) && place.suggest === 'confirmed') unmarkPlace('book', PIN_PREFIX, place.id);
  }
  return {
    books: s.books.filter((book) => !(book.source === 'builtin' && legacyIds.has(book.id))),
    places: s.places.filter((place) => !legacyIds.has(place.bookId)),
  };
}

let state: RoamState = retireLegacyBuiltins(load());
const subs = new Set<() => void>();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 内存仍可用 */ }
}
function emit() { subs.forEach((fn) => fn()); }
function commit(next: RoamState) { state = next; persist(); emit(); }

export function subscribeRoam(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

export function getRoamBooks(): RoamBook[] { return state.books; }
export function getRoamBook(id: string): RoamBook | undefined { return state.books.find((b) => b.id === id); }

export function getRoamPlaces(bookId?: string): RoamPlace[] {
  const list = bookId ? state.places.filter((p) => p.bookId === bookId) : state.places;
  return [...list].sort((a, b) => (a.bookId === b.bookId ? a.order - b.order : a.bookId < b.bookId ? -1 : 1));
}
export function getRoamPlace(id: string): RoamPlace | undefined { return state.places.find((p) => p.id === id); }

export function addPastedBook(input: { title: string; text: string; author?: string; city?: string }): RoamBook {
  const book: RoamBook = {
    id: `pb-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
    title: input.title.trim().slice(0, 40),
    author: (input.author ?? '').trim().slice(0, 20) || '佚名',
    era: '',
    city: (input.city ?? '').trim().slice(0, 20),
    blurb: undefined,
    source: 'pasted',
    text: input.text,
    research: 'idle',
    addedAt: new Date().toISOString(),
  };
  commit({ ...state, books: [...state.books, book] });
  return book;
}

/** 只允许删粘贴书；顺带撤销其已上图的地球标记，避免孤儿数据 */
export function removeBook(id: string) {
  const book = getRoamBook(id);
  if (!book || book.source !== 'pasted') return;
  for (const p of state.places) {
    if (p.bookId === id && p.suggest === 'confirmed') unmarkPlace('book', PIN_PREFIX, p.id);
  }
  commit({
    books: state.books.filter((b) => b.id !== id),
    places: state.places.filter((p) => p.bookId !== id),
  });
}

export function setBookResearch(id: string, research: RoamResearchState, via?: RoamResearchVia) {
  commit({
    ...state,
    books: state.books.map((b) => (b.id === id ? { ...b, research, researchVia: via ?? b.researchVia } : b)),
  });
}

export function setBookCityGeo(id: string, geo: { lat: number; lng: number }) {
  commit({ ...state, books: state.books.map((b) => (b.id === id ? { ...b, cityGeo: geo } : b)) });
}

/** 替换某本书的建议清单。新清单里保留下来的已确认点位（同 id）地球标记不动；
 *  被淘汰的已确认点位先从地球撤下，避免孤儿。 */
export function replaceBookPlaces(bookId: string, places: RoamPlace[]) {
  const keepConfirmed = new Set(places.filter((p) => p.suggest === 'confirmed').map((p) => p.id));
  for (const p of state.places) {
    if (p.bookId === bookId && p.suggest === 'confirmed' && !keepConfirmed.has(p.id)) {
      unmarkPlace('book', PIN_PREFIX, p.id);
    }
  }
  commit({ ...state, places: [...state.places.filter((p) => p.bookId !== bookId), ...places] });
}

/** 内容包加载：把 skill 包的书注册进书架（同 id 幂等跳过；source='skill' 带 skillId） */
export function registerSkillBooks(books: RoamBook[]) {
  const have = new Set(state.books.map((b) => b.id));
  const fresh = books.filter((b) => !have.has(b.id));
  if (!fresh.length) return;
  commit({ ...state, books: [...state.books, ...fresh] });
}

/** 内容包卸载：撤下该包全部书与地点；已上图的先从地球撤标，避免孤儿 */
export function unregisterSkillBooks(skillId: string) {
  const ids = new Set(state.books.filter((b) => b.skillId === skillId).map((b) => b.id));
  if (!ids.size) return;
  for (const p of state.places) {
    if (ids.has(p.bookId) && p.suggest === 'confirmed') unmarkPlace('book', PIN_PREFIX, p.id);
  }
  commit({
    books: state.books.filter((b) => !ids.has(b.id)),
    places: state.places.filter((p) => !ids.has(p.bookId)),
  });
}

/** 版本迁移：移除已不在当前已加载注册表里的旧内容包书，保留用户粘贴书。 */
export function reconcileSkillBooks(validLoadedSkillIds: ReadonlySet<string>) {
  const staleBookIds = new Set(
    state.books
      .filter((book) => book.source === 'skill' && (!book.skillId || !validLoadedSkillIds.has(book.skillId)))
      .map((book) => book.id),
  );
  if (!staleBookIds.size) return;
  for (const place of state.places) {
    if (staleBookIds.has(place.bookId) && place.suggest === 'confirmed') unmarkPlace('book', PIN_PREFIX, place.id);
  }
  commit({
    books: state.books.filter((book) => !staleBookIds.has(book.id)),
    places: state.places.filter((place) => !staleBookIds.has(place.bookId)),
  });
}

/** 端侧 OCR「持续学习」：把新识别的书页文字累积进粘贴书正文 */
export function appendBookText(id: string, text: string) {
  const t = text.trim();
  if (!t) return;
  commit({
    ...state,
    books: state.books.map((b) => (b.id === id && b.source === 'pasted' ? { ...b, text: (b.text ? b.text + '\n\n' : '') + t } : b)),
  });
}

export function setPlaceSuggest(placeId: string, suggest: RoamSuggestState) {
  commit({ ...state, places: state.places.map((p) => (p.id === placeId ? { ...p, suggest } : p)) });
}

/** 测试/演示复位：清空书架；mapSkills.resetMapSkills 会把真实单书包重新注册。 */
export function resetRoamStore() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
  state = { books: [], places: [] };
  persist(); emit();
}

export { PIN_PREFIX as ROAM_PIN_PREFIX };
