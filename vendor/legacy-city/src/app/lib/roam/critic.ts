// 反思层：云脑返回的地点建议先过护栏再入库。
// 护栏：字段/枚举校验（非法即丢弃，不猜）、坐标范围、文本长度、按名去重、总量封顶。

import type { RoamConfidence, RoamPlace, RoamPlaceStatus } from './types';

const STATUS: RoamPlaceStatus[] = ['extant', 'rebuilt', 'memory-only'];
const CONF: RoamConfidence[] = ['high', 'medium', 'low'];

const str = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;

/** 云脑原始输出 → 合法 RoamPlace[]；非法条目直接丢弃（舱壁：宁缺毋假） */
export function clampCloudPlaces(bookId: string, raw: unknown, max = 20): RoamPlace[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: RoamPlace[] = [];
  for (const item of raw) {
    if (out.length >= max) break;
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const name = str(o.name, 24);
    if (!name || seen.has(name)) continue;
    const status = STATUS.includes(o.status as RoamPlaceStatus) ? (o.status as RoamPlaceStatus) : null;
    if (!status) continue;   // 状态是诚实口径的核心字段，非法不猜
    const confidence = CONF.includes(o.confidence as RoamConfidence) ? (o.confidence as RoamConfidence) : 'low';
    const lat = typeof o.lat === 'number' && o.lat >= -90 && o.lat <= 90 ? o.lat : null;
    const lng = typeof o.lng === 'number' && o.lng >= -180 && o.lng <= 180 ? o.lng : null;
    seen.add(name);
    out.push({
      id: `${bookId}-c${out.length + 1}`,
      bookId,
      name,
      modernName: str(o.modernName, 24),
      status,
      confidence,
      quote: str(o.quote, 120),
      chapter: str(o.chapter, 30),
      note: str(o.note, 80) ?? '',
      geo: lat !== null && lng !== null ? { lat, lng, accuracy: 'approx' } : null,
      order: out.length + 1,
      suggest: 'suggested',
      createdAt: new Date().toISOString(),
    });
  }
  return out;
}
