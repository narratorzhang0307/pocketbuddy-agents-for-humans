// 个人花园 store：用户种下的树全量存档 + 展览「点亮」状态（到访记录）。
// localStorage 'pe.poemGarden.v1' + 发布订阅（照 userMarks 模式）。
// 点亮的语义：从 NFC/深链真实抵达打开树页（?tree=）才算「碰根开花」；App 内浏览不算。
import type { PoemTree } from './types';

const KEY = 'pe.poemGarden.v1';

interface GardenState {
  userTrees: PoemTree[];                 // 用户种下的树（含 spot / 可绑铭牌）
  lit: Record<string, string>;           // treeId → 首次点亮 ISO 时间
}

function load(): GardenState {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as GardenState) : null;
    if (s && Array.isArray(s.userTrees) && s.lit && typeof s.lit === 'object') return s;
  } catch { /* 首次/隐私模式 */ }
  return { userTrees: [], lit: {} };
}

let state: GardenState = load();
const subs = new Set<() => void>();
function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 内存可用 */ } }
function emit() { subs.forEach((fn) => fn()); }

export function subscribeGarden(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

export function getUserTrees(): PoemTree[] { return state.userTrees; }
export function getUserTree(id: string): PoemTree | undefined { return state.userTrees.find((t) => t.id === id); }

/** 存档一棵用户树（同 id 覆盖更新，如补种地点后） */
export function saveUserTree(tree: PoemTree) {
  const rest = state.userTrees.filter((t) => t.id !== tree.id);
  state = { ...state, userTrees: [tree, ...rest] };
  persist(); emit();
}

export function removeUserTree(id: string) {
  state = { ...state, userTrees: state.userTrees.filter((t) => t.id !== id) };
  persist(); emit();
}

/** 点亮一棵树（真实抵达：NFC/深链打开）。幂等，返回是否为首次点亮 */
export function lightTree(treeId: string): boolean {
  if (state.lit[treeId]) return false;
  state = { ...state, lit: { ...state.lit, [treeId]: new Date().toISOString() } };
  persist(); emit();
  return true;
}

export function isLit(treeId: string): boolean { return !!state.lit[treeId]; }
export function litCount(ids: string[]): number { return ids.filter((id) => state.lit[id]).length; }
export function litAt(treeId: string): string | undefined { return state.lit[treeId]; }

/** 测试/演示复位 */
export function resetGarden() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
  state = { userTrees: [], lit: {} };
  persist(); emit();
}

// —— Web NFC（树根写入）——
// 能力口径诚实：Web NFC 只在 Android Chrome + HTTPS 可用；iOS 请用任意 NFC 写卡 App 写入 treeUrl。
// 铭牌里只写一条 URL 记录（NDEF url record），后来者任何手机轻碰都能打开树页。
export function nfcWriteSupported(): boolean {
  return typeof window !== 'undefined' && 'NDEFReader' in window;
}

export async function writeTreeNfc(url: string): Promise<{ ok: boolean; error?: string }> {
  if (!nfcWriteSupported()) return { ok: false, error: 'unsupported' };
  try {
    // @ts-expect-error Web NFC 尚无内置类型
    const writer = new NDEFReader();
    await writer.write({ records: [{ recordType: 'url', data: url }] });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'write_failed' };
  }
}
