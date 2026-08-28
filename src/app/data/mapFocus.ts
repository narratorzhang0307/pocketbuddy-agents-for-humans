// 跨组件「飞到某坐标」通道：记一笔/各 agent 钉完后，让地图自动飞过去并放大到「便签/卡片展开可见」的尺度，
// 免去用户手动切地球 tab + 手动转地球 + 手动放大才看得到刚钉的点。仿 geoStickers 的 subscribe 写法、零依赖。
// pending：给地图组件「挂载/切回 earth tab」时消费（用户钉完切过来才看到地图的情形）；
// subs：给已挂载可见的地图组件实时响应。
export interface MapFocusReq { lng: number; lat: number; zoom: number }

let pending: MapFocusReq | null = null;
const subs = new Set<(r: MapFocusReq) => void>();
const MAP_FOCUS_STORAGE_KEY = 'pe.pendingMapFocus.v1';

function persistPending(value: MapFocusReq | null): void {
  try {
    if (value) sessionStorage.setItem(MAP_FOCUS_STORAGE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(MAP_FOCUS_STORAGE_KEY);
  } catch { /* WebView / private mode may deny storage; memory channel still works. */ }
}

// 请求把地图飞到 (lng,lat)。zoom 默认 6.8——必须 > 心情贴展开阈值 6.5，否则只飞到方位、便签仍不展开。
export function requestMapFocus(lng: number, lat: number, zoom = 6.8): void {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
  const r: MapFocusReq = { lng, lat, zoom };
  pending = r;
  persistPending(r);
  subs.forEach((f) => { try { f(r); } catch { /* 单个订阅者异常不影响其它 */ } });
}

// 地图组件挂载/变可见时先读取，等 style 就绪并真正执行 flyTo 后再清空。
// React StrictMode 会在开发态重复挂载 effect；如果读取时立即清空，第一次 effect
// 可能在地图样式就绪前被清理，第二次便永远拿不到落点。
export function peekPendingMapFocus(): MapFocusReq | null {
  if (pending) return pending;
  try {
    const stored = JSON.parse(sessionStorage.getItem(MAP_FOCUS_STORAGE_KEY) || 'null') as Partial<MapFocusReq> | null;
    if (stored && Number.isFinite(stored.lng) && Number.isFinite(stored.lat) && Number.isFinite(stored.zoom)) {
      pending = { lng: stored.lng!, lat: stored.lat!, zoom: stored.zoom! };
    }
  } catch { /* malformed/stale storage is ignored */ }
  return pending;
}

export function clearPendingMapFocus(expected: MapFocusReq): void {
  const current = peekPendingMapFocus();
  if (current && current.lng === expected.lng && current.lat === expected.lat && current.zoom === expected.zoom) {
    pending = null;
    persistPending(null);
  }
}

export function subscribeMapFocus(f: (r: MapFocusReq) => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}
