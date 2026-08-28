// 杭州赏花地图 .skill · 状态（pe.flowerSkill.v1，照 hangzhou-exhibitions/store.ts 的两级开关模式）
//   loaded  —— skill 是否加载：卸载后从图例和地图整体消失，可在图例「可加载」区一键装回
//   visible —— 图层开关：加载着但暂时关灯（图例行 ON/OFF）
//   volumesOff —— 册级开关：只看桂花、关掉春日群芳……四季四册各自一盏灯
// 内置目录在代码里（demo 每刷新回默认，与全站纪律一致）；截图导入的花讯落 localStorage。
import { HANGZHOU_FLOWER_SKILL, buildCuratedSpots } from './catalog';
import type { BloomStatus, FlowerSpot, FlowerVolume } from './types';
import { BLOOM_LABEL, bloomStatus } from './types';

const KEY = 'pe.flowerSkill.v1';

interface FlowerSkillState {
  loaded: boolean;
  visible: boolean;
  volumesOff: string[];          // 关灯的花册 id
  imported: FlowerSpot[];        // 截图导入的花讯点
  hiddenIds: string[];           // 用户「不想看」隐藏的内置点
}

function defaults(): FlowerSkillState {
  return { loaded: true, visible: true, volumesOff: [], imported: [], hiddenIds: [] };
}

function load(): FlowerSkillState {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as FlowerSkillState) : null;
    if (s && typeof s.loaded === 'boolean' && Array.isArray(s.imported)) {
      return {
        ...defaults(),
        ...s,
        volumesOff: Array.isArray(s.volumesOff) ? s.volumesOff : [],
        hiddenIds: Array.isArray(s.hiddenIds) ? s.hiddenIds : [],
      };
    }
  } catch { /* 首次/隐私模式 */ }
  return defaults();
}

let state: FlowerSkillState = load();
const subs = new Set<() => void>();
function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 内存可用 */ } }
function emit() { subs.forEach((fn) => fn()); }

export function subscribeFlowerSkill(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

export function isFlowerSkillLoaded(): boolean { return state.loaded; }
export function isFlowerLayerVisible(): boolean { return state.loaded && state.visible; }
export function isVolumeOn(volumeId: string): boolean { return !state.volumesOff.includes(volumeId); }

export function setFlowerSkillLoaded(v: boolean) {
  if (state.loaded === v) return;
  state = { ...state, loaded: v, visible: v ? true : state.visible };
  persist(); emit();
}

export function setFlowerLayerVisible(v: boolean) {
  if (state.visible === v) return;
  state = { ...state, visible: v };
  persist(); emit();
}

export function toggleVolume(volumeId: string) {
  state = {
    ...state,
    volumesOff: state.volumesOff.includes(volumeId)
      ? state.volumesOff.filter((id) => id !== volumeId)
      : [...state.volumesOff, volumeId],
  };
  persist(); emit();
}

export function listFlowerVolumes(): FlowerVolume[] { return HANGZHOU_FLOWER_SKILL.volumes; }
export function getFlowerVolume(id: string): FlowerVolume | undefined {
  return HANGZHOU_FLOWER_SKILL.volumes.find((v) => v.id === id);
}

/** 带花期状态的点位（图例/marker/详情共用）；today 可注入方便测试 */
export interface FlowerSpotView {
  spot: FlowerSpot;
  volume: FlowerVolume;
  status: BloomStatus;
}

/** 全部点位（内置 + 截图导入 − 隐藏），不分册开关——调用方按需过滤 */
export function listFlowerSpots(today: Date = new Date()): FlowerSpotView[] {
  const hidden = new Set(state.hiddenIds);
  const out: FlowerSpotView[] = [];
  for (const spot of [...buildCuratedSpots(), ...state.imported]) {
    if (hidden.has(spot.id)) continue;
    const volume = getFlowerVolume(spot.volumeId);
    if (!volume) continue;
    out.push({ spot, volume, status: bloomStatus(volume, spot.window, today) });
  }
  return out;
}

/** 上图的点位：图层可见 + 所属册开灯 */
export function listVisibleFlowerSpots(today: Date = new Date()): FlowerSpotView[] {
  if (!isFlowerLayerVisible()) return [];
  return listFlowerSpots(today).filter((v) => isVolumeOn(v.spot.volumeId));
}

/** 图例摘要：此刻哪册在花，如「荷花盛放 · 35 处」；全歇则报下一季 */
export function flowerSummary(today: Date = new Date()): string {
  const spots = listFlowerSpots(today);
  const order: BloomStatus[] = ['peak', 'blooming', 'coming'];
  for (const st of order) {
    const hit = HANGZHOU_FLOWER_SKILL.volumes.find((v) => bloomStatus(v, undefined, today) === st);
    if (hit) return `${hit.flower}${BLOOM_LABEL[st]} · ${spots.length} 处`;
  }
  return `四季花历 · ${spots.length} 处`;
}

export function addImportedFlowerSpot(spot: FlowerSpot) {
  state = { ...state, imported: [...state.imported.filter((x) => x.id !== spot.id), spot] };
  persist(); emit();
}

export function updateImportedFlowerSpot(id: string, patch: Partial<FlowerSpot>) {
  if (!state.imported.some((x) => x.id === id)) return;
  state = { ...state, imported: state.imported.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
  persist(); emit();
}

export function removeImportedFlowerSpot(id: string) {
  if (!state.imported.some((x) => x.id === id)) return;
  state = { ...state, imported: state.imported.filter((x) => x.id !== id) };
  persist(); emit();
}

export function importedFlowerCount(): number { return state.imported.length; }

/** 隐藏/恢复内置点（「不想看」不等于删数据——目录是包的一部分） */
export function hideFlowerSpot(id: string) {
  if (state.hiddenIds.includes(id)) return;
  state = { ...state, hiddenIds: [...state.hiddenIds, id] };
  persist(); emit();
}
export function unhideAllFlowerSpots() {
  if (!state.hiddenIds.length) return;
  state = { ...state, hiddenIds: [] };
  persist(); emit();
}
export function hiddenFlowerCount(): number { return state.hiddenIds.length; }

/** 导出 .skill 文件内容：内置目录 + 我导入的花讯，自包含 JSON（复制即安装） */
export function exportFlowerSkill(): string {
  const pack = {
    ...HANGZHOU_FLOWER_SKILL,
    // 导出包可能同时含内置点与用户导入点，统一写成业务域 WGS84，
    // 避免一个 coordinateSystem 声明覆盖两套坐标而在再次导入时二次偏移。
    coordinateSystem: 'wgs84' as const,
    spots: [
      ...buildCuratedSpots().map(({ origin: _o, ...spot }) => spot),
      ...state.imported.map(({ origin: _o, sourceNote: _s, addedAt: _a, ...rest }) => rest),
    ],
  };
  return JSON.stringify(pack, null, 2);
}

// 浏览页开关（会话级，不落盘——照 hangzhou-exhibitions 的 browserOpen 模式）
let browserOpen = false;
export function isFlowerBrowserOpen(): boolean { return browserOpen; }
export function setFlowerBrowserOpen(v: boolean) {
  if (browserOpen === v) return;
  browserOpen = v;
  emit();
}

/** 测试/演示复位 */
export function resetFlowerSkill() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
  state = defaults();
  browserOpen = false;
  emit();
}
