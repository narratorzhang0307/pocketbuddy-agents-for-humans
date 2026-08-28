// 杭州古建筑地图 .skill · 状态（pe.archSkill.v1，照 hangzhou-flowers/store.ts 的两级开关模式）
//   loaded  —— skill 是否加载：卸载后从图例和地图整体消失，可在图例「可加载」区一键装回
//   visible —— 图层开关：加载着但暂时关灯（图例行 ON/OFF）
//   kindsOff —— 形制级开关：只看塔、关掉造像……塔/幢/寺/造像各自一盏灯
// 目录是确定性考据数据（17 处逐字核验），无截图导入/时效——比赏花包更简。demo 每刷新回默认。
import { HANGZHOU_ARCH_SKILL, buildArchSites } from './catalog';
import type { ArchKind, ArchSite } from './types';

const KEY = 'pe.archSkill.v1';

interface ArchSkillState {
  loaded: boolean;
  visible: boolean;
  kindsOff: ArchKind[];     // 关灯的形制
  hiddenIds: string[];      // 「不想看」隐藏的点
}

function defaults(): ArchSkillState {
  return { loaded: true, visible: true, kindsOff: [], hiddenIds: [] };
}

function load(): ArchSkillState {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as ArchSkillState) : null;
    if (s && typeof s.loaded === 'boolean') {
      return {
        ...defaults(),
        ...s,
        kindsOff: Array.isArray(s.kindsOff) ? s.kindsOff : [],
        hiddenIds: Array.isArray(s.hiddenIds) ? s.hiddenIds : [],
      };
    }
  } catch { /* 首次/隐私模式 */ }
  return defaults();
}

let state: ArchSkillState = load();
const subs = new Set<() => void>();
function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 内存可用 */ } }
function emit() { subs.forEach((fn) => fn()); }

export function subscribeArchSkill(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

export function isArchSkillLoaded(): boolean { return state.loaded; }
export function isArchLayerVisible(): boolean { return state.loaded && state.visible; }
export function isKindOn(kind: ArchKind): boolean { return !state.kindsOff.includes(kind); }

export function setArchSkillLoaded(v: boolean) {
  if (state.loaded === v) return;
  state = { ...state, loaded: v, visible: v ? true : state.visible };
  persist(); emit();
}

export function setArchLayerVisible(v: boolean) {
  if (state.visible === v) return;
  state = { ...state, visible: v };
  persist(); emit();
}

export function toggleKind(kind: ArchKind) {
  state = {
    ...state,
    kindsOff: state.kindsOff.includes(kind)
      ? state.kindsOff.filter((k) => k !== kind)
      : [...state.kindsOff, kind],
  };
  persist(); emit();
}

/** 全部点位（内置目录 − 隐藏）；调用方按需过滤形制 */
export function listArchSites(): ArchSite[] {
  const hidden = new Set(state.hiddenIds);
  return buildArchSites().filter((s) => !hidden.has(s.id));
}

/** 上图的点位：图层可见 + 所属形制开灯 */
export function listVisibleArchSites(): ArchSite[] {
  if (!isArchLayerVisible()) return [];
  return listArchSites().filter((s) => isKindOn(s.kind));
}

/** 图例摘要：如「古建筑 · 17 处 · 12 引」 */
export function archSummary(): string {
  const all = listArchSites();
  const q = all.filter((s) => s.quote).length;
  return `古建筑 · ${all.length} 处 · ${q} 引`;
}

/** 隐藏/恢复内置点（「不想看」不删数据——目录是包的一部分） */
export function hideArchSite(id: string) {
  if (state.hiddenIds.includes(id)) return;
  state = { ...state, hiddenIds: [...state.hiddenIds, id] };
  persist(); emit();
}
export function unhideAllArchSites() {
  if (!state.hiddenIds.length) return;
  state = { ...state, hiddenIds: [] };
  persist(); emit();
}
export function hiddenArchCount(): number { return state.hiddenIds.length; }

/** 导出 .skill 文件内容：自包含 JSON（复制即安装） */
export function exportArchSkill(): string {
  return JSON.stringify(HANGZHOU_ARCH_SKILL, null, 2);
}

// 浏览页开关（会话级，不落盘——照 hangzhou-flowers 的 browserOpen 模式）
let browserOpen = false;
export function isArchBrowserOpen(): boolean { return browserOpen; }
export function setArchBrowserOpen(v: boolean) {
  if (browserOpen === v) return;
  browserOpen = v;
  emit();
}

/** 测试/演示复位 */
export function resetArchSkill() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
  state = defaults();
  browserOpen = false;
  emit();
}
