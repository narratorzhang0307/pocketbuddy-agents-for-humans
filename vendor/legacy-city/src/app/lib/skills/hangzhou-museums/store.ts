// 杭州博物馆地图 .skill · 状态（pe.museumSkill.v1，照 hangzhou-exhibitions/store.ts 的模块级 state 模式）
// 两级开关（用户语义）：
//   loaded  —— skill 是否加载：卸载后从图例和地图整体消失，可在图例「可加载」区一键装回
//   visible —— 图层开关：加载着但暂时关灯（图例行 ON/OFF）
// 内置目录在代码里（demo 每刷新回默认，与全站纪律一致）；截图导入的馆/特展落 localStorage。

import { HANGZHOU_MUSEUM_SKILL, buildCuratedMuseums } from './catalog';
import type { MuseumEntry, MuseumShow } from './types';
import { urgentShowDays } from './types';

const KEY = 'pe.museumSkill.v1';

interface MuseumSkillState {
  loaded: boolean;
  visible: boolean;
  imported: MuseumEntry[];                   // 截图导入的新馆（内置目录没有的）
  importedShows: Record<string, MuseumShow[]>; // 截图导入、挂到内置馆上的特展（key=museumId）
  hiddenIds: string[];                       // 用户「去过了/不想看」隐藏的馆
}

function defaults(): MuseumSkillState {
  return { loaded: true, visible: true, imported: [], importedShows: {}, hiddenIds: [] };
}

function load(): MuseumSkillState {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as MuseumSkillState) : null;
    if (s && typeof s.loaded === 'boolean' && Array.isArray(s.imported)) {
      return {
        ...defaults(),
        ...s,
        importedShows: s.importedShows && typeof s.importedShows === 'object' ? s.importedShows : {},
        hiddenIds: Array.isArray(s.hiddenIds) ? s.hiddenIds : [],
      };
    }
  } catch { /* 首次/隐私模式 */ }
  return defaults();
}

let state: MuseumSkillState = load();
const subs = new Set<() => void>();
function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 内存可用 */ } }
function emit() { subs.forEach((fn) => fn()); }

export function subscribeMuseumSkill(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

export function isMuseumSkillLoaded(): boolean { return state.loaded; }
export function isMuseumLayerVisible(): boolean { return state.loaded && state.visible; }

export function setMuseumSkillLoaded(v: boolean) {
  if (state.loaded === v) return;
  state = { ...state, loaded: v, visible: v ? true : state.visible };
  persist(); emit();
}

export function setMuseumLayerVisible(v: boolean) {
  if (state.visible === v) return;
  state = { ...state, visible: v };
  persist(); emit();
}

/** 全部收录馆（内置精选 + 截图导入 − 用户隐藏），导入特展合并挂馆；重点馆在前 */
export function listMuseums(today: Date = new Date()): MuseumEntry[] {
  const hidden = new Set(state.hiddenIds);
  const merged = buildCuratedMuseums().map((m) => {
    const extra = state.importedShows[m.id];
    return extra?.length ? { ...m, nowShowing: [...(m.nowShowing ?? []), ...extra] } : m;
  });
  return [...merged, ...state.imported]
    .filter((m) => !hidden.has(m.id))
    .sort(byImportance(today));
}

/** 排序：馆内重磅特展临闭幕的在前 → 级别 → 片区聚拢（同区相邻，逛起来顺路） */
function byImportance(today: Date) {
  const urgent = HANGZHOU_MUSEUM_SKILL.rules.urgentWithinDays;
  const tierRank = { S: 0, A: 1, B: 2 } as const;
  return (a: MuseumEntry, b: MuseumEntry) => {
    const ua = urgentShowDays(a, urgent, today) !== null ? 0 : 1;
    const ub = urgentShowDays(b, urgent, today) !== null ? 0 : 1;
    if (ua !== ub) return ua - ub;
    if (tierRank[a.tier] !== tierRank[b.tier]) return tierRank[a.tier] - tierRank[b.tier];
    return (a.area ?? '').localeCompare(b.area ?? '', 'zh');
  };
}

export function addImportedMuseum(m: MuseumEntry) {
  state = { ...state, imported: [...state.imported.filter((x) => x.id !== m.id), m] };
  persist(); emit();
}

export function removeImportedMuseum(id: string) {
  if (!state.imported.some((m) => m.id === id)) return;
  state = { ...state, imported: state.imported.filter((m) => m.id !== id) };
  persist(); emit();
}

/** 截图里的特展命中内置馆 → 挂到那座馆上（不重复钉点，信息归位） */
export function attachShowToMuseum(museumId: string, show: MuseumShow) {
  const cur = state.importedShows[museumId] ?? [];
  if (cur.some((s) => s.title === show.title)) return;
  state = { ...state, importedShows: { ...state.importedShows, [museumId]: [...cur, show] } };
  persist(); emit();
}

export function removeAttachedShow(museumId: string, title: string) {
  const cur = state.importedShows[museumId] ?? [];
  if (!cur.some((s) => s.title === title)) return;
  const next = cur.filter((s) => s.title !== title);
  const importedShows = { ...state.importedShows };
  if (next.length) importedShows[museumId] = next; else delete importedShows[museumId];
  state = { ...state, importedShows };
  persist(); emit();
}

/** 隐藏/恢复馆（「去过了」不等于删数据——目录是包的一部分） */
export function hideMuseum(id: string) {
  if (state.hiddenIds.includes(id)) return;
  state = { ...state, hiddenIds: [...state.hiddenIds, id] };
  persist(); emit();
}
export function unhideAllMuseums() {
  if (!state.hiddenIds.length) return;
  state = { ...state, hiddenIds: [] };
  persist(); emit();
}
export function hiddenMuseumCount(): number { return state.hiddenIds.length; }

/** 导出 .skill 文件内容：内置目录 + 我导入的馆与特展，自包含 JSON（复制即安装） */
export function exportMuseumSkill(): string {
  const pack = {
    ...HANGZHOU_MUSEUM_SKILL,
    museums: [
      ...HANGZHOU_MUSEUM_SKILL.museums.map((m) => {
        const extra = state.importedShows[m.id];
        return extra?.length ? { ...m, nowShowing: [...(m.nowShowing ?? []), ...extra] } : m;
      }),
      ...state.imported.map(({ source: _s, addedAt: _a, ...rest }) => rest),
    ],
  };
  return JSON.stringify(pack, null, 2);
}

// —— 浏览页开合（会话内瞬时态，不落盘）：图例行点名字 → 博物馆图鉴页 ——
let browserOpen = false;
export function isMuseumBrowserOpen(): boolean { return browserOpen; }
export function setMuseumBrowserOpen(v: boolean) {
  if (browserOpen === v) return;
  browserOpen = v;
  emit();
}

/** 测试/演示复位 */
export function resetMuseumSkill() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
  state = defaults();
  browserOpen = false;
  emit();
}
