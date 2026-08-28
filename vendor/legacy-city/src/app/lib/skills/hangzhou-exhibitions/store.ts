// 杭州展览地图 .skill · 状态（pe.exhibitionSkill.v1，照 mapSkills.ts 的模块级 state 模式）
// 两级开关（用户语义）：
//   loaded  —— skill 是否加载：卸载后从图例和地图整体消失，可在图例「可加载」区一键装回
//   visible —— 图层开关：加载着但暂时关灯（图例行 ON/OFF）
// 内置目录在代码里（demo 每刷新回默认，与全站纪律一致）；截图导入的展讯落 localStorage。

import { HANGZHOU_EXHIBITION_SKILL, buildCuratedEntries } from './catalog';
import type { ExhibitionEntry } from './types';
import { exStatus } from './types';

const KEY = 'pe.exhibitionSkill.v1';

interface ExhibitionSkillState {
  loaded: boolean;
  visible: boolean;
  imported: ExhibitionEntry[];   // 截图导入的展讯
  hiddenIds: string[];           // 用户「看过了/不想看」隐藏的内置展
}

function defaults(): ExhibitionSkillState {
  return { loaded: true, visible: true, imported: [], hiddenIds: [] };
}

function load(): ExhibitionSkillState {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as ExhibitionSkillState) : null;
    if (s && typeof s.loaded === 'boolean' && Array.isArray(s.imported)) {
      return { ...defaults(), ...s, hiddenIds: Array.isArray(s.hiddenIds) ? s.hiddenIds : [] };
    }
  } catch { /* 首次/隐私模式 */ }
  return defaults();
}

let state: ExhibitionSkillState = load();
const subs = new Set<() => void>();
function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 内存可用 */ } }
function emit() { subs.forEach((fn) => fn()); }

export function subscribeExhibitionSkill(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

export function isExSkillLoaded(): boolean { return state.loaded; }
export function isExLayerVisible(): boolean { return state.loaded && state.visible; }

export function setExSkillLoaded(v: boolean) {
  if (state.loaded === v) return;
  state = { ...state, loaded: v, visible: v ? true : state.visible };
  persist(); emit();
}

export function setExLayerVisible(v: boolean) {
  if (state.visible === v) return;
  state = { ...state, visible: v };
  persist(); emit();
}

/** 全部在展/待展展讯（内置精选 + 截图导入 − 用户隐藏 − 已闭幕），闭幕紧迫的在前 */
export function listExhibitions(today: Date = new Date()): ExhibitionEntry[] {
  const hidden = new Set(state.hiddenIds);
  const urgent = HANGZHOU_EXHIBITION_SKILL.rules.urgentWithinDays;
  return [...buildCuratedEntries(), ...state.imported]
    .filter((e) => !hidden.has(e.id))
    .filter((e) => exStatus(e, urgent, today) !== 'ended')
    .sort(byUrgency(today));
}

/** 排序：闭幕倒计时（S/A 且临期）在前 → 级别 → 剩余天数少的在前 */
function byUrgency(today: Date) {
  const urgent = HANGZHOU_EXHIBITION_SKILL.rules.urgentWithinDays;
  const tierRank = { S: 0, A: 1, B: 2 } as const;
  return (a: ExhibitionEntry, b: ExhibitionEntry) => {
    const ua = a.tier !== 'B' && exStatus(a, urgent, today) === 'closing' ? 0 : 1;
    const ub = b.tier !== 'B' && exStatus(b, urgent, today) === 'closing' ? 0 : 1;
    if (ua !== ub) return ua - ub;
    if (tierRank[a.tier] !== tierRank[b.tier]) return tierRank[a.tier] - tierRank[b.tier];
    const da = a.dateEnd ?? '9999-12-31';
    const db = b.dateEnd ?? '9999-12-31';
    return da < db ? -1 : da > db ? 1 : 0;
  };
}

export function addImportedExhibition(e: ExhibitionEntry) {
  state = { ...state, imported: [...state.imported.filter((x) => x.id !== e.id), e] };
  persist(); emit();
}

export function removeImportedExhibition(id: string) {
  if (!state.imported.some((e) => e.id === id)) return;
  state = { ...state, imported: state.imported.filter((e) => e.id !== id) };
  persist(); emit();
}

/** 隐藏/恢复内置展（「看过了」不等于删数据——目录是包的一部分） */
export function hideExhibition(id: string) {
  if (state.hiddenIds.includes(id)) return;
  state = { ...state, hiddenIds: [...state.hiddenIds, id] };
  persist(); emit();
}
export function unhideAll() {
  if (!state.hiddenIds.length) return;
  state = { ...state, hiddenIds: [] };
  persist(); emit();
}
export function hiddenCount(): number { return state.hiddenIds.length; }

/** 导出 .skill 文件内容：内置目录 + 我导入的展讯，自包含 JSON（复制即安装） */
export function exportExhibitionSkill(): string {
  const pack = {
    ...HANGZHOU_EXHIBITION_SKILL,
    exhibitions: [
      ...HANGZHOU_EXHIBITION_SKILL.exhibitions,
      ...state.imported.map(({ source: _s, addedAt: _a, ...rest }) => rest),
    ],
  };
  return JSON.stringify(pack, null, 2);
}

// —— 浏览页开合（会话内瞬时态，不落盘）：图例行点名字 → 展览浏览页 ——
let browserOpen = false;
export function isExBrowserOpen(): boolean { return browserOpen; }
export function setExBrowserOpen(v: boolean) {
  if (browserOpen === v) return;
  browserOpen = v;
  emit();
}

/** 测试/演示复位 */
export function resetExhibitionSkill() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
  state = defaults();
  browserOpen = false;
  emit();
}
