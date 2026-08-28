// 地图标记图层 · 统一数据模块（解耦、可扩展）
// 把不同来源的点（音乐城市 / 照片地点 / 将来更多）统一成 MapMarker，按 kind 区分颜色。
// 新增一类内容只要再 push 一组 marker + 在 MARKER_KINDS 里加一行即可，地图层与图例自动支持。

import musicCities from './music-cities.json';
import { mapPhotoPoints } from './photos';
import { MUSEUM_SEEDS, type MuseumSeed } from '../lib/exhibition/catalog';

// 'custom' = 用户用「造物主」meta-agent 自建的 agent 的落点（咖啡馆/球鞋/鸟类…全归这一类，
// 地球只认这一个通用类、不学习具体自定义 agent；各 agent 的身份/颜色在 meta 里，详见 lib/agent/）。
// 'museum' = 地球博物馆图层：内建全球场馆种子（静态点）+ 用户自定义场馆（userMarks，前缀 umu-）。
export type MarkerKind = 'music' | 'photo' | 'movie' | 'book' | 'travel' | 'council' | 'exhibition' | 'museum' | 'poemtree' | 'custom';

export interface MapMarker {
  id: string;
  kind: MarkerKind;
  lat: number;
  lng: number;
  label?: string;   // 地球档显示的名字（如城市名）
  thumb?: string;
  full?: string;
  author?: string; authorLink?: string; photoLink?: string;  // Unsplash 署名（世界照片）
}

// 图例 / 开关用的类型配置：标签 + 颜色（绿=音乐，青=照片，琥珀=电影，紫=书，玫红=行程，金=议事，橙=自建）
export const MARKER_KINDS: { kind: MarkerKind; label: string; color: string }[] = [
  { kind: 'music', label: '音乐', color: '#00ff88' },
  { kind: 'photo', label: '照片', color: '#00e5ff' },
  { kind: 'movie', label: '电影', color: '#ffb000' },
  { kind: 'book', label: '书', color: '#b388ff' },
  { kind: 'travel', label: '行程', color: '#ff3b6b' },
  { kind: 'council', label: '议事', color: '#caa64a' },
  { kind: 'exhibition', label: '看展', color: '#5A8F7B' },
  { kind: 'museum', label: '博物馆', color: '#2F6FED' },
  { kind: 'poemtree', label: '诗歌树', color: '#8bc34a' },
  { kind: 'custom', label: '自建', color: '#ff8a3d' },
];
export const KIND_COLOR: Record<MarkerKind, string> = { music: '#00ff88', photo: '#00e5ff', movie: '#ffb000', book: '#b388ff', travel: '#ff3b6b', council: '#caa64a', exhibition: '#5A8F7B', museum: '#2F6FED', poemtree: '#8bc34a', custom: '#ff8a3d' };

// 确定性微偏移：同城 / 重合的点在城市附近散开（约 ±0.03°≈3km），放大后能看出分布在不同位置；
// 缩小时这点偏移看不出来，由地图层的聚合再把重合的只显示一个。
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function jitter(id: string, lat: number, lng: number): [number, number] {
  const h = hashStr(id);
  const dlat = ((h & 0xffff) / 0xffff - 0.5) * 0.06;
  const dlng = (((h >>> 16) & 0xffff) / 0xffff - 0.5) * 0.06;
  return [lat + dlat, lng + dlng];
}

interface MusicCity { slug: string; nameZh: string; lat: number; lng: number }

const musicMarkers: MapMarker[] = (musicCities as MusicCity[]).map((c) => {
  const [lat, lng] = jitter('m-' + c.slug, c.lat, c.lng);
  return { id: 'm-' + c.slug, kind: 'music', lat, lng, label: c.nameZh };
});

const photoMarkers: MapMarker[] = mapPhotoPoints.map((p) => {
  const [lat, lng] = jitter('p-' + p.id, p.lat, p.lng);
  return { id: 'p-' + p.id, kind: 'photo', lat, lng, label: (p.city || '').split(',')[0], thumb: p.thumb, full: p.full,
    author: p.author, authorLink: p.authorLink, photoLink: p.photoLink };
});

// 地球博物馆图层：内建全球场馆种子直接上地球（真实坐标不 jitter——场馆是精确地点，抖散反而错）。
// 数据小（60+ 条纯文本），随首屏。用户自定义场馆走 userMarks(kind:'museum')，地图层合并渲染。
const museumMarkers: MapMarker[] = MUSEUM_SEEDS.map((s) => (
  { id: 'mu-' + s.id, kind: 'museum' as MarkerKind, lat: s.lat, lng: s.lng, label: s.name }
));

// 首屏地图只先渲染音乐 + 照片 + 博物馆标记（数据小）。电影 / 书标记体量大（含豆瓣简介，约 1.3MB JSON），
// 由 heavyMapMarkers.ts 在用户启用对应私人知识 Skill 后补入；本模块本身不再引用重目录，
// 防止打包器把动态 import 的目标误判成地图入口依赖。
export const MAP_MARKERS: MapMarker[] = [...musicMarkers, ...photoMarkers, ...museumMarkers];

// 点击查详情用的查找表（按带前缀的 marker id）：geojson 里只放 id，详情走这里查，保持要素轻量。
// 电影 / 书表初始为空，懒加载完成后填充（同一 Map 对象就地填充，外部持有的引用仍有效）。
export const photoById = new Map(mapPhotoPoints.map((p) => ['p-' + p.id, p]));
export const museumById = new Map<string, MuseumSeed>(MUSEUM_SEEDS.map((s) => ['mu-' + s.id, s]));

// 转 GeoJSON 供数据交换；中间地图最终由高德坐标投影与 DOM 覆盖物渲染。
export function toGeoJSON() {
  return {
    type: 'FeatureCollection' as const,
    features: MAP_MARKERS.map((m) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
      properties: { kind: m.kind, label: m.label || '', id: m.id },
    })),
  };
}
