// 杭州赏花地图 · 截图导入管线：小红书/公号花讯截图 → 结构化花讯草稿 → 坐标锚定。
// 组合现成 skill（一处实现多处调用，自己不造轮子）：
//   [visionExtract]（原图只进端侧 VL，绝不出端）读出 花名/地点/花期/看点 →
//   本册别名表精确锚定（确定性数据优先，坐标不让模型猜）→
//   [resolvePlace]（本地表→高德）兜底 → 兜不住就落西湖，标 low 让用户拖动校正。
// 端侧 VL 未就绪时诚实降级：返回空草稿，导入界面转手填/粘贴文字（textExtract 同管线）。
import { visionExtract } from '../visionExtract';
import { textExtract } from '../textExtract';
import { resolvePlace } from '../resolvePlace';
import { buildCuratedSpots } from './catalog';
import { gcj02ToWgs84 } from '../../location/chinaCoordinates';
import type { FlowerConfidence, FlowerSpot } from './types';
import { matchVolume } from './types';

// 旧默认点来自高德展示坐标；和内置目录一样，在业务域先归一为 WGS84。
const HZ_CENTER = gcj02ToWgs84([120.14, 30.246]);

const FIELDS = [
  { key: 'flower', label: '花名', hint: '桂花/梅花/樱花/郁金香/荷花等' },
  { key: 'place', label: '地点名', hint: '公园/景点/村落/道路名' },
  { key: 'area', label: '城区或园区', hint: '如 西湖/滨江/萧山/植物园内' },
  { key: 'time', label: '花期或时间', hint: '如 3月中-4月上 / 本周末盛花' },
  { key: 'highlight', label: '一句话看点', hint: '图里对这处的描述' },
];

export interface FlowerShotDraft {
  flower: string;
  place: string;
  area: string;
  time: string;
  highlight: string;
  volumeId: string | null;       // 识别出的花册（识别不出让用户选）
  raw: string;                   // 端侧读出的原始文本（可展示/调试）
  visionOk: boolean;             // 端侧 VL 是否读到了内容
  onDevice: boolean;
}

/** 第一步：截图 → 花讯草稿（端侧优先；读不出返回空草稿，不把原图送云） */
export async function extractFlowerShot(imageDataUrl: string): Promise<FlowerShotDraft> {
  const r = await visionExtract({ imageDataUrl, domain: '杭州赏花花讯', fields: FIELDS });
  const f = r.fields;
  const joined = [f.flower, f.place, f.highlight, r.raw].filter(Boolean).join(' ');
  return {
    flower: f.flower ?? '',
    place: f.place ?? '',
    area: f.area ?? '',
    time: f.time ?? '',
    highlight: f.highlight ?? '',
    volumeId: matchVolume(joined),
    raw: r.raw,
    visionOk: r.ok,
    onDevice: r.onDevice,
  };
}

/** 备选：用户粘贴文字（无端侧 VL / 不想传图时），同 schema 结构化 */
export async function extractFlowerText(text: string): Promise<FlowerShotDraft> {
  const r = await textExtract({ text, domain: '杭州赏花花讯', fields: FIELDS });
  const f = r.fields;
  const joined = [f.flower, f.place, f.highlight, text].filter(Boolean).join(' ');
  return {
    flower: f.flower ?? '',
    place: f.place ?? '',
    area: f.area ?? '',
    time: f.time ?? '',
    highlight: f.highlight ?? '',
    volumeId: matchVolume(joined),
    raw: text,
    visionOk: r.ok,
    onDevice: r.via !== 'cloud',
  };
}

export interface FlowerGeoHit {
  lng: number;
  lat: number;
  confidence: FlowerConfidence;
  how: 'catalog' | 'geocode' | 'fallback';   // 别名精确锚定 / 城市级地理编码 / 西湖兜底
}

/** 第二步：地点名 → 坐标。内置别名表精确命中优先；高德兜底结果标 low，允许用户拖动校正。 */
export async function resolveFlowerGeo(place: string, area?: string): Promise<FlowerGeoHit> {
  const q = `${place ?? ''}`.trim();
  if (q) {
    for (const s of buildCuratedSpots()) {
      const names = [s.name, ...(s.aliases ?? [])];
      if (names.some((n) => n && (q.includes(n) || n.includes(q)))) {
        return { lng: s.lng, lat: s.lat, confidence: s.confidence, how: 'catalog' };
      }
    }
    const hit = await resolvePlace(`杭州 ${area ?? ''} ${q}`.trim(), { near: HZ_CENTER });
    if (hit) return { lng: hit.lng, lat: hit.lat, confidence: 'low', how: 'geocode' };
  }
  return { lng: HZ_CENTER[0], lat: HZ_CENTER[1], confidence: 'low', how: 'fallback' };
}

/** 第三步：草稿 + 落点 → 待入册的花讯点（id 带时间戳，与内置 id 永不冲突） */
export function draftToSpot(d: FlowerShotDraft, geo: FlowerGeoHit, volumeId: string, sourceNote?: string): FlowerSpot {
  const name = (d.place || d.flower || '花讯').trim().slice(0, 24);
  return {
    id: `shot-${Date.now().toString(36)}`,
    volumeId,
    name,
    area: d.area.trim().slice(0, 12) || undefined,
    lng: geo.lng,
    lat: geo.lat,
    mass: 'patch',
    crowd: 'hot',
    note: [d.highlight.trim(), d.time.trim() && `花期：${d.time.trim()}`].filter(Boolean).join('；') || '截图导入的花讯。',
    confidence: geo.confidence,
    origin: 'screenshot',
    sourceNote: sourceNote ?? '截图导入',
    addedAt: new Date().toISOString(),
  };
}
