// 跨 tab 跳转到 mapping 的某个子 pane（照 mapFocus 的 pending + 订阅模式）：
// 当前用途：直达 MAPPING 的书籍、宇宙或图谱工作区。
// “规划”是旧调用兼容键；MappingTab 会把它导向含旅行规划入口的宇宙地图。
// pending 兜住「MappingTab 尚未挂载」的时序：App 先切 tab，MappingTab 挂载时 consume。
export type MappingPane = '书籍' | '宇宙' | '图谱' | '规划';

let pending: MappingPane | null = null;
const subs = new Set<(p: MappingPane) => void>();

export function requestMappingPane(p: MappingPane): void {
  pending = p;
  subs.forEach((f) => f(p));
}

export function consumePendingMappingPane(): MappingPane | null {
  const p = pending;
  pending = null;
  return p;
}

export function subscribeMappingPane(f: (p: MappingPane) => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}

// —— 随跳转捎带的书页文本（OCR 试用台 → 丢书卡预填）——
// stash 后再 requestMappingPane('书籍')；丢书卡在订阅回调/挂载时 consume。
let pendingBookText: string | null = null;

export function stashBookText(text: string): void {
  pendingBookText = text.trim() || null;
}

export function consumePendingBookText(): string | null {
  const t = pendingBookText;
  pendingBookText = null;
  return t;
}
