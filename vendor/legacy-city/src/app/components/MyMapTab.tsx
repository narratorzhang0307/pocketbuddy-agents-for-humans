import { Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import AmapEarth from './AmapEarth';
import GardenKnowledgeMap from './GardenKnowledgeMap';
import { cancelVoiceMapMode, getVoiceMapState, subscribeVoiceMapMode } from '../lib/location/voiceMapMode';
import MapSkillLayerHost from './MapSkillLayerHost';
import MapSkillsLegend from './MapSkillsLegend';
import WorldLayerSwitch, {
  type StreetWorkspaceView,
} from './WorldLayerSwitch';
import type { WorldLayer } from '../lib/city-world/types';
import {
  ensureDefaultPublicCitySkills,
  subscribeCitySkills,
} from '../lib/city-world/skills';
import { type MarkerKind, KIND_COLOR, toGeoJSON, MAP_MARKERS, photoById, museumById } from '../data/mapMarkers';
import { subscribeRoam, ROAM_STATUS_LABEL, type RoamPlaceStatus } from '../lib/roam';
import { getRoamCity, setRoamCity, subscribeRoamCity } from '../lib/roam/city';
import { listAtlasSpots, type AtlasSpot } from '../lib/roam/atlas';
import journalWestLake1 from '../assets/journal/west-lake-1.webp';
import journalWestLake2 from '../assets/journal/west-lake-2.webp';
import journalWestLake3 from '../assets/journal/west-lake-3.webp';
import { ATLAS_JOURNAL_STICKERS } from '../data/atlasJournalSeeds';
import { requestMappingPane } from '../data/mappingFocus';
import { venueVisitStats } from '../lib/exhibition/venues';
import { getUserMarks, getUserMarksByKind, subscribeUserMarks, removeUserMark } from '../data/userMarks';
import { buildTripLines, getTrip } from '../lib/travel';
import { getPlanets, getVisiblePlanets, subscribePlanets, togglePlanet, removePlanet } from '../data/planets';
import { trackDownload } from '../data/themePlanet';
import { showcasePhotos } from '../data/photos';
import { getMoodStickers, addMoodSticker, removeMoodSticker, updateMoodStickerPos, commitStickers, subscribeMood, resolveMoodPlace, pickStickerColor, pickRot } from '../data/geoStickers';
import { applyOverride, setOverride, commitOverrides, subscribeOverrides } from '../data/markerOverrides';
import { consumePendingMapFocus, subscribeMapFocus, type MapFocusReq } from '../data/mapFocus';
import { BookOpen, Footprints, Pause, Play, Plus, Sprout, X } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import MapLegend from './MapLegend';
import AtlasLegend from './AtlasLegend';
import ShellPortal from './ShellPortal';
import type { MarkerDetailData } from './MarkerDetail';
import Viewer3D from './Viewer3D';
import type { MapSongMarker } from '../data/songMarkers';
import type { CityMapRuntime } from '../lib/maps/runtime';
import { MAP_LAYER_SKILLS, type MapLayerSkillDescriptor } from '../lib/skills/mapLayers';
import {
  focusFromSkillCoordinates,
  type MapSkillFocus,
} from '../lib/skills/mapSkillFocus';
import {
  ensureGlobalMapSkillsLoaded,
} from '../lib/skills/worldLayer';
import {
  consumePendingStreetPane,
  subscribeStreetPane,
} from '../data/streetFocus';
import {
  ROAMING_KNOWLEDGE_SKILLS,
  getLoadedKnowledgeMarkerKinds,
  isKnowledgeSkillLoaded,
  setAllRoamingKnowledgeSkillsLoaded,
  setKnowledgeSkillLoaded,
  subscribeKnowledgeSkills,
} from '../lib/knowledge/skills';
import { importWithChunkRecovery, lazyRetry } from '../lib/runtime/lazyRetry';
import { NATURE_SOUND_SPECIES } from '../lib/nature-sound/speciesCatalog';
import { createEmptyNatureSoundRecognition, readHungNatureSoundCards, readNatureSoundRecognition } from '../lib/nature-sound/store';
import type { NatureSoundObservation } from '../lib/nature-sound/types';
import NatureSoundMapCardViewer from './NatureSoundMapCardViewer';
import './SoundWalkHeader.css';

// “街头”地图是中间 Tab 的首屏；种植物与手帐在用户点击后才下载。
const PoemGardenPage = lazyRetry(() => import('./PoemGardenPage'));
const JournalPane = lazyRetry(() => import('./JournalPane'));
const ZinePane = lazyRetry(() => import('./ZinePane'));
const NatureSoundDeckPage = lazyRetry(() => import('./NatureSoundDeckPage'));
// 标记详情会继续读取书影资料、相关记忆与 3D 展品信息；只有用户真正点开
// 地图标记时才下载，避免公共街头首屏把整份书目目录带下来。
const MarkerDetail = lazyRetry(() => import('./MarkerDetail'));

const StreetSubpageFallback = () => (
  <div className="grid h-full w-full place-items-center bg-[#EAEAEA]">
    <div className="flex items-center gap-2 font-pixel text-[8px] tracking-widest text-black/45">
      <span className="h-2.5 w-2.5 animate-pulse border border-black bg-[#00ff88]" />
      按需载入
    </div>
  </div>
);

// 星球图层数据：把所有「可见星球」的照片摊平成 circle 要素（每点带星球色）
function planetsToGeoJSON() {
  const features = [];
  for (const pl of getVisiblePlanets()) {
    for (const ph of pl.photos) {
      const [lng, lat] = applyOverride(ph.id, ph.lng, ph.lat); // 拖动校正后的落点
      features.push({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [lng, lat] },
        properties: { id: ph.id, planetId: pl.id, color: pl.color },
      });
    }
  }
  return { type: 'FeatureCollection' as const, features };
}
function planetPhotoById(id: string) {
  for (const pl of getPlanets()) { const ph = pl.photos.find((x) => x.id === id); if (ph) return ph; }
  return null;
}

// 总舆图（mapping 视图）：存续状态色与 mapping 漫游图同一语言；GeoJSON 组装纯函数
const ATLAS_STATUS_COLOR: Record<RoamPlaceStatus, string> = { extant: '#7CFF6B', rebuilt: '#ff8a3d', 'memory-only': '#9aa7b5' };
// 汇文明朝体（活字油墨感）：舆图书摘票根 / 出处气泡引文用，最像古书印刷摘录；缺字回退老宋/宋体
const MINCHO = "'Huiwen Mincho Guji Standard','Huiwen Mincho Guji Standard Rare','Songti SC','STSong',serif";
// 合并：静态标记（音乐/照片/电影/书）+ 用户运行时落点（各 agent 写入），实时给地球图层
function buildMarksData() {
  const base = toGeoJSON();
  // 静态标记：应用拖动校正后的落点
  const baseFeats = base.features.map((f) => {
    const c = f.geometry.coordinates as [number, number];
    const [lng, lat] = applyOverride(String(f.properties.id), c[0], c[1]);
    return { ...f, geometry: { ...f.geometry, coordinates: [lng, lat] as [number, number] } };
  });
  const extra = getUserMarks().map((m) => {
    const [lng, lat] = applyOverride(m.id, m.lng, m.lat);
    return {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [lng, lat] },
      properties: { kind: m.kind, label: m.label || '', id: m.id },
    };
  });
  return { type: 'FeatureCollection' as const, features: [...baseFeats, ...extra] };
}

// 照片标记（含 thumb/full，已带散开坐标）—— 放大后做缩略预览用
const PHOTO_MARKERS = MAP_MARKERS.filter((m) => m.kind === 'photo');
const PREVIEW_ZOOM = 5.5; // 放大到此缩放以上，照片以缩略图预览
const SONG_ZOOM = PREVIEW_ZOOM;  // 放大到此缩放以上：城市级音乐点散开成 621 首歌的落点卡片
const SONG_CARD_MAX = 80;        // 视口内同时渲染的歌曲点上限
function songHash(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function songFallbackAudio(i: number): string { return `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${(i % 8) + 1}.mp3`; }

// 点击标记 → 取详情（用户落点优先，其次静态查找表）
async function resolveDetail(id: string, kind: MarkerKind, label: string): Promise<MarkerDetailData | null> {
  const um = getUserMarks().find((m) => m.id === id);
  if (um) {
    const meta = (um.meta || {}) as Record<string, unknown>;
    if (kind === 'movie') return { kind, title: um.label, original: String(meta.original || ''), director: String(meta.director || ''), country: String(meta.country || ''), year: meta.year as number, rating: meta.rating as number, date: String(meta.date || ''), synopsis: String(meta.synopsis || meta.plot || ''), genre: String(meta.genre || ''), movement: String(meta.movement || ''), cast: Array.isArray(meta.cast) ? (meta.cast as string[]) : [], place: String(meta.place || ''), geoKind: String(meta.geoKind || '') };
    if (kind === 'book') return { kind, title: um.label, author: String(meta.author || ''), place: String(meta.place || ''), year: meta.year as number, note: String(meta.note || ''), synopsis: String(meta.synopsis || meta.plot || ''), genre: String(meta.genre || ''), movement: String(meta.movement || ''), translator: String(meta.translator || ''), country: String(meta.country || ''), geoKind: String(meta.geoKind || '') };
    if (kind === 'travel') {
      const tripId = String(meta.tripId || '');
      const trip = tripId ? getTrip(tripId) : null;
      return { kind, markId: um.id, title: um.label, city: String(meta.city || ''), tag: String(meta.tag || ''), note: String(meta.note || ''), date: String(meta.date || ''), tripId: tripId || undefined, trip: trip && trip.stops.length > 1 ? trip : undefined };
    }
    if (kind === 'photo') return { kind, full: String(meta.full || ''), thumb: String(meta.thumb || ''), city: String(meta.city || um.label || ''), arAnchorId: (meta.ar as { anchorId?: string } | undefined)?.anchorId };
    if (kind === 'council') return { kind, title: um.label, verdict: String(meta.verdict || ''), confidence: meta.confidence as number, ruleEstablished: String(meta.ruleEstablished || ''), place: String(meta.place || ''), date: String(meta.date || '') };
    // custom：用户自建 agent 的落点。通用渲染——meta 里带 agent 身份 + 标签，地球不认识具体哪个 agent。
    if (kind === 'custom') return { kind, title: um.label, agentName: String(meta.agentName || ''), emoji: String(meta.emoji || '📍'), domain: String(meta.domain || ''), color: String(meta.color || '#ff8a3d'), tags: (meta.tags && typeof meta.tags === 'object') ? (meta.tags as Record<string, string>) : {}, note: String(meta.note || ''), place: String(meta.place || ''), date: String(meta.date || '') };
    // poemtree：种下的诗歌植物（meta 全字段由 lib/poemtree/pin.ts 写入）
    if (kind === 'poemtree') return { kind, markId: um.id, poemPoet: String(meta.poet || ''), poemTitle: String(meta.title || ''), poemExcerpt: String(meta.excerpt || ''), poemLines: Array.isArray(meta.lines) ? (meta.lines as string[]) : [], poemSeed: typeof meta.seed === 'number' ? meta.seed : 0, poemLux: typeof meta.lux === 'number' ? meta.lux : 0, poemTemp: typeof meta.temp === 'number' ? meta.temp : 0, poemFlux: typeof meta.flux === 'number' ? meta.flux : 0, poemGrav: typeof meta.grav === 'number' ? meta.grav : 0, place: String(meta.place || '') };
    if (kind === 'exhibition') return { kind, markId: um.id, title: um.label, original: String(meta.nameEn || ''), aliases: Array.isArray(meta.aliases) ? (meta.aliases as string[]) : [], gmiConfidence: typeof meta.gmiConfidence === 'number' ? meta.gmiConfidence : undefined, gmiContributions: Array.isArray(meta.gmiContributions) ? (meta.gmiContributions as string[]) : [], gmiContributionSummary: String(meta.gmiContributionSummary || ''), museum: String(meta.museum || ''), exhibitionName: String(meta.exhibition || ''), dynasty: String(meta.dynastyLabel || ''), eraStart: typeof meta.eraStart === 'number' ? meta.eraStart : null, material: Array.isArray(meta.material) ? (meta.material as string[]) : [], category: String(meta.category || ''), culture: String(meta.culture || ''), findspot: String(meta.findspot || ''), dimensions: String(meta.dimensions || ''), labelZh: String(meta.labelZh || ''), curatorNote: String(meta.curatorNote || ''), timelineNote: String(meta.timelineNote || ''), splatUrl: String(meta.splatUrl || ''), splatStatus: String(meta.splatStatus || ''), splatId: String(meta.splatId || ''), splatFormat: String(meta.splatFormat || ''), splatCaptureQualityWarn: String(meta.splatCaptureQualityWarn || ''), photos: Array.isArray(meta.photos) ? (meta.photos as string[]) : [], rating: meta.rating as number, place: String(meta.place || ''), date: String(meta.visitDate || '') };
    // museum：用户自定义场馆（地球博物馆图层）。观展沉淀实时聚合，卡片常看常新。
    if (kind === 'museum') {
      const name = String(meta.name || um.label || '');
      const stats = venueVisitStats(name);
      return { kind, markId: um.id, title: name, city: String(meta.city || ''), country: String(meta.country || ''), venueType: meta.type === 'gallery' ? 'gallery' : 'museum', blurb: String(meta.blurb || ''), customVenue: true, visitedCount: stats.count, lastVisit: stats.lastVisit || undefined, visitedItems: stats.items };
    }
    return { kind: 'music', title: um.label, city: String(meta.city || '') };
  }
  if (kind === 'photo') { const p = photoById.get(id); return p ? { kind, full: p.full, thumb: p.thumb, city: (p.city || '').split(',')[0], authorName: p.author, authorLink: p.authorLink, photoLink: p.photoLink } : null; }
  if (kind === 'movie' || kind === 'book') {
    const { getHeavyMarkerDetail } = await importWithChunkRecovery(
      () => import('../data/heavyMapMarkers'),
    );
    const heavy = await getHeavyMarkerDetail(id, kind);
    if (!heavy) return null;
    if (kind === 'movie') {
      const movie = heavy as import('../data/movies').MoviePoint;
      return { kind, title: movie.title, original: movie.original, director: movie.director, country: movie.country, year: movie.year, rating: movie.rating, date: movie.date, synopsis: movie.synopsis };
    }
    const book = heavy as import('../data/books').BookPoint;
    return { kind, title: book.title, author: book.author, country: book.country, place: book.country, year: book.year, synopsis: book.synopsis, date: book.date, rating: book.rating };
  }
  if (kind === 'music') return { kind, title: label, city: label };
  if (kind === 'museum') {
    const s = museumById.get(id);
    if (!s) return null;
    const stats = venueVisitStats(s.name);
    return { kind, title: s.name, city: s.city, country: s.country, venueType: s.type, blurb: s.blurb, url: s.url, visitedCount: stats.count, lastVisit: stats.lastVisit || undefined, visitedItems: stats.items };
  }
  return null;
}

interface MyMapTabProps {
  onViewInAR?: () => void;
  onLiveOutingChange?: (active: boolean) => void;
  recognizedSpeciesCount?: number;
  workspace?: 'city' | 'universe';
  natureObservationFocus?: NatureSoundObservation | null;
  journalContent?: 'zine' | 'nature-deck';
  /** Pocket Earth 宿主使用健康行动账本信息架构；独立“生声不息”界面保持原样。 */
  pocketEarthMode?: boolean;
  /** 宿主能力只叠加在原地图画布上，不替换花草、卡片与地图工具。 */
  renderMapOverlay?: (map: CityMapRuntime | null) => ReactNode;
}

// 标定点：固定到西湖周边真实经纬度（WGS84，源自 OpenStreetMap / Wikidata）。
// 其中的「文字卡片」现已解耦为可拖动便贴（见 seedStickers）；此处保留绿点 + 照片 + 连线。
const ANNOTATIONS = [
  { id: 1, lng: 120.14703, lat: 30.260901, place: '断桥残雪', date: '03.14', text: '一株黄色的树变成了许多飞燕', dir: 'right', dx: 30, dy: -20, img: showcasePhotos[0]?.thumb, full: showcasePhotos[0]?.full, imgProps: { w: 60, h: 80, rot: -5, dx: -20, dy: 30 } },
  { id: 2, lng: 120.1416133, lat: 30.2542019, place: '平湖秋月', date: '03.15', text: '傍晚的光线金黄而辽远', dir: 'left', dx: -40, dy: 20, img: showcasePhotos[1]?.thumb, full: showcasePhotos[1]?.full, imgProps: { w: 70, h: 70, rot: 8, dx: 40, dy: -10 } },
  { id: 3, lng: 120.1405, lat: 30.2408, place: '三潭印月', date: '03.18', text: '月光啊，忧伤，美丽，静寂', dir: 'right', dx: 35, dy: 15, img: showcasePhotos[2]?.thumb, full: showcasePhotos[2]?.full, imgProps: { w: 80, h: 60, rot: -3, dx: -50, dy: 40 } },
  { id: 4, lng: 120.13739, lat: 30.23439, place: '花港观鱼', date: '03.20', text: '友好的夜晚被点亮', dir: 'left', dx: -20, dy: -30, img: showcasePhotos[3]?.thumb, full: showcasePhotos[3]?.full, imgProps: { w: 65, h: 85, rot: 6, dx: 25, dy: 35 } },
  { id: 5, lng: 120.14501, lat: 30.23388, place: '雷峰塔', date: '03.21', text: '只有湖中的一对天鹅', dir: 'left', dx: -35, dy: -10, img: showcasePhotos[4]?.thumb, full: showcasePhotos[4]?.full, imgProps: { w: 82, h: 60, rot: -4, dx: -28, dy: 32 } },
  { id: 6, lng: 120.12868, lat: 30.25217, place: '曲院风荷', date: '03.22', text: '一切的峰巅沉寂', dir: 'right', dx: 25, dy: -25, img: showcasePhotos[5]?.thumb, full: showcasePhotos[5]?.full, imgProps: { w: 84, h: 60, rot: 5, dx: 32, dy: 30 } },
];

// “我的街道”从个人知识库的世界尺度打开：以中欧为中心，保持截图中的
// 纯俯视总览；具体城市与西湖卡片仍可由原有标记和 Skill 一键飞入。
const PERSONAL_WORLD_CENTER: [number, number] = [13.405, 51.2];
const PERSONAL_WORLD_ZOOM = 4.3;
const POCKET_ACTION_CENTER: [number, number] = [120.14703, 30.260901];
const POCKET_ACTION_ZOOM = 12.4;

// —— 缩放阈值 ——
// 照片 / 紫色图钉 / 文字卡片 / 连线：放大到街道级别才出现
const DETAIL_START = 11.5;
const DETAIL_FULL = 13.0;

// 首屏自带的三张西湖照片放进 tracked assets，不依赖被 gitignore 排除的本地照片库；
// 这样源码换机、CI 构建和后续交付都能稳定复现同一张丰富手帐。
const ATLAS_JOURNAL_PHOTOS = [
  { id: 'atlas-wl-1', url: journalWestLake1, place: '断桥残雪', date: '2025-03-14' },
  { id: 'atlas-wl-2', url: journalWestLake2, place: '平湖秋月', date: '2025-03-15' },
  { id: 'atlas-wl-3', url: journalWestLake3, place: '三潭印月', date: '2025-03-18' },
];
const EMPTY_JOURNAL_PHOTOS: typeof ATLAS_JOURNAL_PHOTOS = [];

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
// 古籍/个人知识内容统一走 CITY_CONTENT_PACKS_LAYER_SKILL；不再并行挂载
// 六套重复的专用图层和一个“城市总包”图层。
const CITY_MAP_SKILLS = MAP_LAYER_SKILLS;

// 中间地球页的透明展品试摆：只在 ?exhibitMapDemo=1 时出现，不写入用户地图。
// 坐标是拱宸桥西侧的交互演示位，并非这件哈佛藏品的真实馆藏位置。
const EXHIBIT_MAP_DEMO = {
  coordinates: [120.1478, 30.3208] as [number, number],
  cutoutUrl: '/assets/exhibit-2_5d/harvard-200497-li-museum-refined-v2/views/view-00-000.webp',
  manifestUrl: '/assets/exhibit-2_5d/harvard-200497-li-museum-refined-v2/exhibit.json',
  inscriptionUrl: '/assets/exhibit-2_5d/harvard-200497-li-museum-matting/details/inscription.jpg',
};

const EXHIBIT_MAP_DEMO_DETAIL: MarkerDetailData = {
  kind: 'exhibition',
  title: '西周青铜鬲',
  original: "'Li' Ritual Food Vessel",
  dynasty: '西周',
  material: ['青铜'],
  category: '鬲',
  culture: '礼制青铜器',
  museum: '个人知识地图 · 重建记录',
  place: '拱宸桥西',
  city: '杭州',
  photos: [EXHIBIT_MAP_DEMO.cutoutUrl, EXHIBIT_MAP_DEMO.inscriptionUrl],
  labelZh: '六个真实观察视角经博物馆抠图 MNN、相对深度与确定性 Builder 组成 2.5D 展品。本坐标是个人重建记录点，不代表馆藏地。',
  curatorNote: '鬲是古代炊煮器。三足下部中空，可扩大受热面积；这件器物的局部铭文另以独立近拍保存。',
  inscriptionRaw: '季貞作尊鬲',
  inscriptionModern: '这是西周时期铸造的青铜鬲，由季贞制作。',
  inscriptionImage: EXHIBIT_MAP_DEMO.inscriptionUrl,
  inscriptionMethod: '馆方释文确认原字 · 原生 Qwen 断句与解释',
  splatUrl: EXHIBIT_MAP_DEMO.manifestUrl,
  splatStatus: 'ready',
  splatFormat: 'multiview-2_5d',
  lat: EXHIBIT_MAP_DEMO.coordinates[1],
  lng: EXHIBIT_MAP_DEMO.coordinates[0],
};

export default function MyMapTab({
  onLiveOutingChange,
  recognizedSpeciesCount = 0,
  workspace = 'city',
  natureObservationFocus,
  journalContent = 'zine',
  pocketEarthMode = false,
  renderMapOverlay,
}: MyMapTabProps) {
  const annotations = ANNOTATIONS;
  const universeOnly = workspace === 'universe';

  const [map, setMap] = useState<CityMapRuntime | null>(null);
  const skillMapRef = useRef<CityMapRuntime | null>(null);
  const handleMapReady = useCallback((nextMap: CityMapRuntime | null) => {
    skillMapRef.current = nextMap;
    setMap(nextMap);
    if (nextMap) setZoom(nextMap.getZoom());
  }, []);
  const pendingMapFocusRef = useRef<MapFocusReq | null>(null);
  const [focusedPocketPlantingId, setFocusedPocketPlantingId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(PERSONAL_WORLD_ZOOM);
  const [worldLayer, setWorldLayer] = useState<WorldLayer>(
    universeOnly ? 'personal' : 'public',
  );
  const treeFromUrl = typeof location !== 'undefined'
    ? new URLSearchParams(location.search).get('tree')
    : null;
  const showExhibitMapDemo = typeof location !== 'undefined'
    && new URLSearchParams(location.search).get('exhibitMapDemo') === '1';
  const autoOpenExhibitMapDemo = typeof location !== 'undefined'
    && new URLSearchParams(location.search).get('exhibitMapOpen') === '1';
  const [streetView, setStreetView] = useState<StreetWorkspaceView>(
    treeFromUrl ? '种植物' : '街头',
  );
  const [liveOuting, setLiveOuting] = useState(false);
  const [voiceMapRequest, setVoiceMapRequest] = useState(getVoiceMapState);
  const handleLiveOutingChange = useCallback((active: boolean) => {
    setLiveOuting(active);
    onLiveOutingChange?.(active);
  }, [onLiveOutingChange]);
  const [openNatureSpeciesId, setOpenNatureSpeciesId] = useState<string | null>(null);
  const [mapNatureFocus, setMapNatureFocus] = useState<NatureSoundObservation | null>(
    natureObservationFocus ?? null,
  );
  const isPersonalStreet = universeOnly;
  const isPlantView = !universeOnly && streetView === '种植物';
  const isPublicStreet = !universeOnly && streetView === '街头';
  const isJournalView = !universeOnly && streetView === '手帐';
  const isPocketAmapStreet = isPublicStreet && pocketEarthMode && !voiceMapRequest;
  useEffect(() => {
    if (!pocketEarthMode || universeOnly) return;
    return subscribeVoiceMapMode(request => {
      setVoiceMapRequest(request);
      if (request?.status !== 'opening') return;
      setStreetView('街头');
      setWorldLayer('public');
      setOpenNatureSpeciesId(null);
    });
  }, [pocketEarthMode, universeOnly]);
  useEffect(() => () => {
    if (!pocketEarthMode) return;
    const request = getVoiceMapState();
    if (request) cancelVoiceMapMode(request.inputId, '已离开地图，这次真实 GPS 定位已取消。');
  }, [pocketEarthMode]);
  // 宇宙与图谱共用同一套 Knowledge Skill 装载状态：图谱负责管理，宇宙只负责呈现。
  const [knowledgeSkillRevision, refreshKnowledgeSkills] = useReducer((value: number) => value + 1, 0);
  useEffect(() => subscribeKnowledgeSkills(refreshKnowledgeSkills), []);
  const visibleKinds = useMemo(
    () => getLoadedKnowledgeMarkerKinds(),
    [knowledgeSkillRevision],
  );
  const loadedKnowledgeSkillIds = useMemo(
    () => new Set(
      ROAMING_KNOWLEDGE_SKILLS
        .filter((skill) => isKnowledgeSkillLoaded(skill.id))
        .map((skill) => skill.id),
    ),
    [knowledgeSkillRevision],
  );
  // 电影/书标记懒加载完成后翻转，触发统计与图层重算
  const [markersReady, setMarkersReady] = useState(false);
  const toggleKnowledgeSkill = (skillId: string) =>
    setKnowledgeSkillLoaded(skillId, !isKnowledgeSkillLoaded(skillId));
  const allKindsOn = loadedKnowledgeSkillIds.size === ROAMING_KNOWLEDGE_SKILLS.length;
  const toggleAllKinds = () => setAllRoamingKnowledgeSkillsLoaded(!allKindsOn);
  // 个人宇宙已迁入 Mapping；中间工作区只保留种植物、公共街头和手帐。
  const [recentSkillId, setRecentSkillId] = useState<string | null>(null);
  const focusedMapSkill = recentSkillId
    ? CITY_MAP_SKILLS.find((skill) => skill.id === recentSkillId) ?? null
    : null;
  const [openMapControl, setOpenMapControl] = useState<'skills' | 'knowledge' | null>(null);
  const [, refreshCitySkills] = useReducer((value: number) => value + 1, 0);
  const [showAtlasJournal, setShowAtlasJournal] = useState(false);
  const [atlasSel, setAtlasSel] = useState<AtlasSpot | null>(null);          // 点开的考据点出处卡
  const [atlasCitiesOff, setAtlasCitiesOff] = useState<Set<string>>(new Set());   // 舆图 LAYERS：关掉的城市
  const [atlasStatusOff, setAtlasStatusOff] = useState<Set<string>>(new Set());   // 舆图 LAYERS：关掉的存续状态
  const [roamV, bumpRoam] = useState(0);
  useEffect(() => {
    const offs = [subscribeRoam(() => bumpRoam((v) => v + 1)), subscribeRoamCity(() => bumpRoam((v) => v + 1))];
    return () => offs.forEach((off) => off());
  }, []);
  useEffect(() => subscribeCitySkills(refreshCitySkills), []);
  useEffect(
    () => {
      if (universeOnly) return;
      const openPane = (pane: StreetWorkspaceView) => setStreetView(pane);
      const pending = consumePendingStreetPane();
      if (pending) openPane(pending);
      return subscribeStreetPane(openPane);
    },
    [universeOnly],
  );
  useEffect(() => {
    if (worldLayer !== 'public') return;
    ensureDefaultPublicCitySkills();
    ensureGlobalMapSkillsLoaded(CITY_MAP_SKILLS, worldLayer);
  }, [worldLayer]);
  // 总舆图数据：内容包 + 用户研究成果（roam store 变更即重算）
  const atlasSpots = useMemo(() => listAtlasSpots(), [roamV]);
  const journalCity = getRoamCity();
  const journalPhotos = journalCity === '杭州' ? ATLAS_JOURNAL_PHOTOS : EMPTY_JOURNAL_PHOTOS;
  const birdJournalRecords = [
    ...(readNatureSoundRecognition()?.detections ?? []),
    ...readHungNatureSoundCards().map((card) => card.detection),
  ].filter((detection, index, records) => (
    detection.group === 'bird'
    && records.findIndex((candidate) => candidate.id === detection.id) === index
  ));
  const birdJournalSpeciesCount = new Set(
    birdJournalRecords.map((detection) => detection.speciesId),
  ).size;
  const natureRecognition = readNatureSoundRecognition()
    ?? createEmptyNatureSoundRecognition('苏堤 · 柳岸');
  const natureRecognizedSpeciesCount = new Set(
    natureRecognition.detections.map((detection) => detection.speciesId),
  ).size;
  const journalPlaces = useMemo(
    () => atlasSpots
      .filter((spot) => spot.city === journalCity)
      .slice(0, 5)
      .map((spot, order) => ({ name: spot.name, quote: spot.quote, status: spot.status, order })),
    [atlasSpots, journalCity],
  );
  const atlasSpotsRef = useRef<AtlasSpot[]>([]);
  atlasSpotsRef.current = atlasSpots;
  const atlasCityInfo = useMemo(() => {
    const m = new Map<string, { name: string; count: number; lat: number; lng: number }>();
    for (const s of atlasSpots) {
      const c = m.get(s.city) ?? { name: s.city, count: 0, lat: 0, lng: 0 };
      c.count += 1; c.lat += s.lat; c.lng += s.lng;
      m.set(s.city, c);
    }
    return [...m.values()].map((c) => ({ ...c, lat: c.lat / c.count, lng: c.lng / c.count }));
  }, [atlasSpots]);
  const toggleAtlasCity = (name: string) =>
    setAtlasCitiesOff((prev) => { const next = new Set(prev); next.has(name) ? next.delete(name) : next.add(name); return next; });
  const toggleAtlasStatus = (st: RoamPlaceStatus) =>
    setAtlasStatusOff((prev) => { const next = new Set(prev); next.has(st) ? next.delete(st) : next.add(st); return next; });
  const jumpToAtlasCity = (name: string) => {
    const c = atlasCityInfo.find((x) => x.name === name);
    if (!c || !map) return;
    // 纯看层：只动镜头，不改 mapping 那边的城市语境（工作台的状态归工作台）
    map.flyTo({ center: [c.lng, c.lat], zoom: 11.8, duration: 1400 });
  };
  // 相机投影与业务数据分开失效：平移只重投影，不重复组装所有 GeoJSON/行程/星球数据。
  const [, refreshProjection] = useReducer((x) => x + 1, 0);
  const [mapDataVersion, bumpMapDataVersion] = useReducer((x) => x + 1, 0);
  const [mapFocusVersion, bumpMapFocusVersion] = useReducer((x) => x + 1, 0);
  const refreshMapSources = useCallback(() => bumpMapDataVersion(), []);
  const markFeatures = useMemo(
    () => worldLayer === 'personal' ? buildMarksData().features : [],
    [mapDataVersion, markersReady, worldLayer],
  );
  const knowledgeSkillFocuses = useMemo(() => new Map(
    ROAMING_KNOWLEDGE_SKILLS.map((skill) => {
      const markerKinds = new Set<MarkerKind>(skill.markerKinds);
      const points = markFeatures
        .filter((feature) => markerKinds.has(feature.properties.kind as MarkerKind))
        .map((feature) => {
          const [lng, lat] = feature.geometry.coordinates;
          return { lng, lat };
        });
      return [skill.id, focusFromSkillCoordinates(points)] as const;
    }),
  ), [markFeatures]);
  const knowledgeSkillPointCounts = useMemo(() => new Map(
    [...knowledgeSkillFocuses].map(([skillId, focus]) => [
      skillId,
      focus?.pointCount ?? 0,
    ]),
  ), [knowledgeSkillFocuses]);
  const flyToSkillFocus = useCallback((focus: MapSkillFocus | null) => {
    if (!map || !focus) return;
    map.flyTo({
      center: [focus.lng, focus.lat],
      zoom: focus.zoom,
      duration: 1500,
    });
  }, [map]);
  const focusKnowledgeSkill = useCallback((skillId: string) => {
    flyToSkillFocus(knowledgeSkillFocuses.get(skillId) ?? null);
  }, [flyToSkillFocus, knowledgeSkillFocuses]);
  const focusMapLayerSkill = useCallback((skill: MapLayerSkillDescriptor) => {
    const focus = skill.focus?.(worldLayer) ?? null;
    if (!focus) return;
    setRecentSkillId(skill.id);
    setOpenMapControl('skills');
    flyToSkillFocus(focus);
  }, [flyToSkillFocus, worldLayer]);
  const planetFeatures = useMemo(
    () => worldLayer === 'personal' ? planetsToGeoJSON().features : [],
    [mapDataVersion, worldLayer],
  );
  const tripLineFeatures = useMemo(
    () => worldLayer === 'personal' ? buildTripLines().features.slice(0, 24) : [],
    [mapDataVersion, worldLayer],
  );
  const moodStickers = useMemo(
    () => worldLayer === 'personal'
      ? getMoodStickers().filter((sticker) => sticker.variant !== 'card')
      : [],
    [mapDataVersion, worldLayer],
  );
  const planets = useMemo(
    () => worldLayer === 'personal' ? getPlanets() : [],
    [mapDataVersion, worldLayer],
  );
  const handleInstallCitySkill = useCallback((skillId: string) => {
    setRecentSkillId(skillId);
    setShowAtlasJournal(false);
    if (universeOnly) {
      setWorldLayer('personal');
      return;
    }
    requestMappingPane('宇宙');
  }, [universeOnly]);
  const closeAtlasJournal = useCallback(() => setShowAtlasJournal(false), []);
  // 心情贴：左上角加号 → 写心情 → 端侧判经纬度 → 钉到地图
  const [moodOpen, setMoodOpen] = useState(false);
  const [moodText, setMoodText] = useState('');
  const [moodBusy, setMoodBusy] = useState(false);
  const [moodStyle, setMoodStyle] = useState<'color' | 'card'>('color'); // 「+」可产出两种便贴：彩色 / 白卡片
  // 点击标记后的详情弹层
  const [selected, setSelected] = useState<MarkerDetailData | null>(null);
  const [view3D, setView3D] = useState<{ url: string; format: string } | null>(null);   // 地球点开展品 → 全屏 3D（mesh/高斯泼溅由 Viewer3D 按 format 分发）
  const exhibitMapDemoCenteredRef = useRef(false);
  // 歌曲落点卡片三态：折叠点 →(点击)展开卡片(songSel) →(点击播放)就地迷你播放器(songPlaying)
  const [songSel, setSongSel] = useState<string | null>(null);
  const [songDetail, setSongDetail] = useState(false);
  const [songPlaying, setSongPlaying] = useState<string | null>(null);
  const [songPaused, setSongPaused] = useState(false);
  const [songProg, setSongProg] = useState(0);
  const [songSrcMode, setSongSrcMode] = useState<'real' | 'fallback'>('real');
  const [songMarkers, setSongMarkers] = useState<MapSongMarker[]>([]);
  const songMarkerByKey = useMemo(
    () => new Map(songMarkers.map((song) => [song.key, song])),
    [songMarkers],
  );
  const songAudioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!focusedMapSkill) return;
    setSelected(null);
    setSongSel(null);
    setSongPlaying(null);
    setMoodOpen(false);
    return focusedMapSkill.subscribe(() => {
      if (!focusedMapSkill.isLoaded(worldLayer) || !focusedMapSkill.isVisible(worldLayer)) {
        setRecentSkillId(null);
      }
    });
  }, [focusedMapSkill, worldLayer]);
  useEffect(() => {
    if (focusedMapSkill || !isPersonalStreet || zoom < SONG_ZOOM || !visibleKinds.has('music') || songMarkers.length > 0) return;
    let active = true;
    void importWithChunkRecovery(() => import('../data/songMarkers')).then((module) => {
      if (active) setSongMarkers(module.SONG_MARKERS);
    });
    return () => { active = false; };
  }, [focusedMapSkill, isPersonalStreet, songMarkers.length, visibleKinds, zoom]);
  // 切歌：设音源 + 自动播；真实源 7s 不可达 → 回落示例音源（沿用 MusicLibraryView 的范式）
  useEffect(() => {
    const a = songAudioRef.current;
    if (!a) return;
    if (!songPlaying) { a.pause(); a.removeAttribute('src'); a.load(); setSongProg(0); return; }
    const sm = songMarkerByKey.get(songPlaying);
    if (!sm) return;
    let active = true;
    let fell = false;
    const play = () => {
      void a.play().catch(() => {
        if (active) setSongPaused(true);
      });
    };
    setSongSrcMode('real');
    a.src = sm.audioUrl || '';
    a.load();
    play();   // 自动播放被拦 → UI 同步成暂停
    const fallback = () => {
      if (!active || fell) return;
      fell = true;
      setSongSrcMode('fallback');
      a.src = songFallbackAudio(songHash(sm.trackId) % 8); a.load();
      play();
    };
    a.addEventListener('error', fallback);
    const t = window.setTimeout(() => { if (a.readyState < 2) fallback(); }, 7000);
    return () => {
      active = false;
      window.clearTimeout(t);
      a.removeEventListener('error', fallback);
      a.pause();
      a.removeAttribute('src');
      a.load();
    };
  }, [songMarkerByKey, songPlaying]);
  useEffect(() => {   // 暂停/播放切换
    const a = songAudioRef.current;
    if (!a || !songPlaying) return;
    if (songPaused) a.pause(); else a.play().catch(() => setSongPaused(true));
  }, [songPaused, songPlaying]);
  useEffect(() => {   // 关掉「音乐」图层时停播 + 收起
    if (!visibleKinds.has('music')) { setSongPlaying(null); setSongSel(null); }
  }, [visibleKinds]);

  // 通用 DOM 拖动：便贴与照片拍立得共用。记录被拖 id、「光标↔锚点」初始偏移、update/commit 回调。
  // 拖动中只走 update（更新内存 + 重渲染重投影），松手才 commit 落盘并刷新底层源。
  const dragRef = useRef<{ id: string; ox: number; oy: number; moved: boolean; update: (id: string, lat: number, lng: number) => void; commit: () => void } | null>(null);
  const suppressClick = useRef(false); // 拖动过则吞掉随后那次 click（避免误开详情/灯箱）
  const beginDrag = (e: React.PointerEvent, id: string, anchor: { x: number; y: number }, update: (id: string, lat: number, lng: number) => void, commit: () => void) => {
    if (!map) return;
    e.stopPropagation();
    suppressClick.current = false;
    const r = map.getContainer().getBoundingClientRect();
    dragRef.current = { id, ox: e.clientX - r.left - anchor.x, oy: e.clientY - r.top - anchor.y, moved: false, update, commit };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !map) return;
    d.moved = true;
    const r = map.getContainer().getBoundingClientRect();
    const ll = map.unproject([e.clientX - r.left - d.ox, e.clientY - r.top - d.oy]);
    d.update(d.id, ll.lat, ll.lng);
  };
  const onDragEnd = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (d.moved) { d.commit(); refreshMapSources(); suppressClick.current = true; }
    dragRef.current = null;
  };
  // 便贴拖动入口（update 用经纬度顺序 lat,lng → 心情贴存储）
  const stickerDragStart = (e: React.PointerEvent, id: string, anchor: { x: number; y: number }) =>
    beginDrag(e, id, anchor, updateMoodStickerPos, commitStickers);
  // 照片拖动入口（update 转成覆盖存储的 lng,lat 顺序）
  const photoDragStart = (e: React.PointerEvent, id: string, anchor: { x: number; y: number }) =>
    beginDrag(e, id, anchor, (pid, lat, lng) => setOverride(pid, lng, lat), commitOverrides);

  // 只有用户在私人知识地图启用“电影/书”后，才下载对应大 JSON 并补进 marks 源。
  // 仅打开地图或启用别的 Skill，不再顺带加载整个电影/书总库。
  // 竞态安全：若懒加载先于 marks 源建立而 resolve，则等地图 idle 后再刷新。
  useEffect(() => {
    if (
      !map
      || worldLayer !== 'personal'
      || (!visibleKinds.has('movie') && !visibleKinds.has('book'))
    ) return;
    let alive = true;
    importWithChunkRecovery(() => import('../data/heavyMapMarkers'))
      .then(({ ensureHeavyMarkers }) => ensureHeavyMarkers())
      .then(() => {
        if (!alive) return;
        setMarkersReady(true);
        refreshMapSources();
      })
      .catch(() => { if (alive) setMarkersReady(true); });   // 懒加载失败也认定「已就绪」：宁可少几百点，也不让统计条带永久省略号
    return () => { alive = false; };
  }, [map, refreshMapSources, visibleKinds, worldLayer]);

  // 一般知识落点回“我的街道”；种诗档案明确声明 public 时回公共街道，
  // 聚焦对应的真实植物。两个世界仍各自持有地图实例与覆盖物。
  useEffect(() => {
    const queueMapFocus = (focus: MapFocusReq) => {
      pendingMapFocusRef.current = focus;
      const targetWorld = focus.world ?? 'personal';
      const requestedMapSkill = focus.mapSkillId
        ? CITY_MAP_SKILLS.find((skill) => skill.id === focus.mapSkillId)
        : null;
      setRecentSkillId(requestedMapSkill ? requestedMapSkill.id : null);
      if (requestedMapSkill) setOpenMapControl('skills');
      setWorldLayer(targetWorld);
      if (!universeOnly && targetWorld === 'public') setStreetView('街头');
      setFocusedPocketPlantingId(focus.plantingId ?? null);
      bumpMapFocusVersion();
    };
    const pending = consumePendingMapFocus();
    if (pending) queueMapFocus(pending);
    return subscribeMapFocus(queueMapFocus);
  }, [universeOnly]);

  useEffect(() => {
    const focus = pendingMapFocusRef.current;
    const targetWorld = focus?.world ?? 'personal';
    if (!map || !focus || worldLayer !== targetWorld) return;
    pendingMapFocusRef.current = null;
    let alive = true;
    const fly = () => {
      let tries = 0;
      const tick = () => {
        if (!alive) return;
        if (map.isStyleLoaded()) {
          map.flyTo({
            center: [focus.lng, focus.lat],
            zoom: focus.zoom,
            duration: 1600,
          });
        }
        else if (tries++ < 50) setTimeout(tick, 100);
      };
      tick();
    };
    fly();
    return () => { alive = false; };
  }, [map, mapFocusVersion, worldLayer]);

  useEffect(() => {
    if (!map) return;
    // 公共街道默认由高德原生覆盖物驱动；只有个人知识 DOM 覆盖物或
    // 公共街道的手帐票根打开时，才需要在移动中触发 React 重投影。
    const needsDomProjection =
      (worldLayer === 'personal' && !focusedMapSkill) || showAtlasJournal || atlasSel !== null || showExhibitMapDemo;
    if (!needsDomProjection) return;
    let frame = 0;
    const onMove = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setZoom(map.getZoom());
        refreshProjection();
      });
    };
    map.on('move', onMove);
    onMove();
    return () => {
      cancelAnimationFrame(frame);
      map.off('move', onMove);
    };
  }, [focusedMapSkill, map, showAtlasJournal, atlasSel, showExhibitMapDemo, worldLayer]);

  // 演示链接只改变镜头与临时覆盖物；刷新掉 query 即恢复普通地图。
  useEffect(() => {
    if (!map || (!isPersonalStreet && !isPublicStreet) || !showExhibitMapDemo || exhibitMapDemoCenteredRef.current) return;
    let alive = true;
    let tries = 0;
    const focusDemo = () => {
      if (!alive) return;
      if (map.isStyleLoaded()) {
        exhibitMapDemoCenteredRef.current = true;
        // 公共街道为 staticPresentation（高德 animateEnable=false），必须立即切镜头。
        map.flyTo({ center: EXHIBIT_MAP_DEMO.coordinates, zoom: 15.2, duration: 0 });
        return;
      }
      if (tries++ < 50) window.setTimeout(focusDemo, 100);
    };
    focusDemo();
    return () => { alive = false; };
  }, [isPersonalStreet, isPublicStreet, map, showExhibitMapDemo]);

  useEffect(() => {
    if (!map || !showExhibitMapDemo || !autoOpenExhibitMapDemo) return;
    setSelected(EXHIBIT_MAP_DEMO_DETAIL);
  }, [autoOpenExhibitMapDemo, map, showExhibitMapDemo]);

  // 切换世界时只清理另一世界的临时 UI；两边地图组件会各自卸载，
  // 因而相机、覆盖物和事件监听不会跨层残留。
  useEffect(() => {
    setAtlasSel(null); setSelected(null); setSongSel(null); setSongPlaying(null); setMoodOpen(false);
  }, [streetView, worldLayer]);

  // 个人知识数据只在“我的街道”订阅；公共街道不会因私人数据变化而刷新。
  useEffect(() => {
    if (worldLayer !== 'personal') return;
    return subscribeUserMarks(refreshMapSources);
  }, [refreshMapSources, worldLayer]);
  useEffect(
    () => worldLayer === 'personal'
      ? subscribePlanets(refreshMapSources)
      : undefined,
    [refreshMapSources, worldLayer],
  );
  useEffect(
    () => worldLayer === 'personal'
      ? subscribeMood(refreshMapSources)
      : undefined,
    [refreshMapSources, worldLayer],
  );
  useEffect(
    () => worldLayer === 'personal'
      ? subscribeOverrides(refreshMapSources)
      : undefined,
    [refreshMapSources, worldLayer],
  );

  // 细节层（照片/紫点/文字/连线）显隐程度
  const detail = clamp01((zoom - DETAIL_START) / (DETAIL_FULL - DETAIL_START));

  // 贴心情：端侧从文字判地名 → 经纬度（判不出用当前地图中心）→ 钉下并飞过去
  const submitMood = async () => {
    const t = moodText.trim();
    if (!t || moodBusy) return;
    setMoodBusy(true);
    const center: [number, number] = map ? [map.getCenter().lng, map.getCenter().lat] : PERSONAL_WORLD_CENTER;
    const { place, lng, lat } = await resolveMoodPlace(t, center);
    const id = 'mood-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);   // 加随机尾，免同毫秒撞 id（两条写入路径共用 store）→ React key 重复 / removeMoodSticker 误删两条
    const d = new Date();
    const date = `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    addMoodSticker({
      id, lat, lng, text: t, place, rot: pickRot(id),
      variant: moodStyle,
      color: moodStyle === 'card' ? '#ffffff' : pickStickerColor(t),
      date: moodStyle === 'card' ? date : undefined,
    });
    setMoodText(''); setMoodOpen(false); setMoodBusy(false);
    if (map) map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 3.2) });
  };

  const WorkspaceHeroIcon = isPlantView ? Sprout : isJournalView ? BookOpen : Footprints;
  const showsNatureDeck = isJournalView && journalContent === 'nature-deck';
  const treeCount = getUserMarksByKind('poemtree').length;
  const momentCount = natureRecognition.detections.length + readHungNatureSoundCards().length;
  const workspaceHeroTitle = pocketEarthMode ? 'EARTH' : isPlantView ? 'CITY PLANTS' : showsNatureDeck ? 'NATURE DECK' : isJournalView ? 'BIRD JOURNAL' : 'SOUND WALK';
  const workspaceHeroEyebrow = pocketEarthMode ? 'POCKET EARTH · ACTION LEDGER' : isPlantView ? '生声不息 · 02 种植物' : showsNatureDeck ? '生声不息 · 03 自然图鉴' : isJournalView ? '生声不息 · 02 观鸟手帐' : '生声不息 · 02 上街';
  const workspaceHeroSubtitle = pocketEarthMode
    ? isPlantView
      ? '每一次真实完成，都会长成一棵可以重访的树。'
      : isJournalView
        ? '把主动记录的声音和照片挂回真实路线。'
        : '今天的行动，长成一条可以重访的路线。'
    : isPlantView ? '把城市里的相遇种回真实地点。' : showsNatureDeck ? '把一路听见的鸟、虫与蛙收进声音卡组。' : isJournalView ? '苏堤观鸟与声音遇见。' : '沿着西湖展开一场识声之旅。';

  return (
    <div className="flex flex-col h-full bg-[#EAEAEA] font-sans relative overflow-hidden">
      {!universeOnly && (
        <>
          <header className={`soundwalk-workspace-hero ${pocketEarthMode ? 'is-pocket-earth' : ''}`}>
            <div>
              <small><WorkspaceHeroIcon size={12} /> {workspaceHeroEyebrow}</small>
              <h1>{workspaceHeroTitle}</h1>
              <p>{workspaceHeroSubtitle}</p>
            </div>
            <div
              className={`soundwalk-workspace-progress ${pocketEarthMode && liveOuting ? 'is-live' : ''}`}
              aria-label={isPlantView
                ? `当前城市 ${journalCity}`
                : showsNatureDeck
                  ? `已听见 ${natureRecognizedSpeciesCount} 种，目标 ${NATURE_SOUND_SPECIES.length} 种`
                  : isJournalView
                  ? `已收录 ${birdJournalSpeciesCount} 种鸟，共 ${birdJournalRecords.length} 条记录`
                  : `已听见 ${recognizedSpeciesCount} 种，目标 ${NATURE_SOUND_SPECIES.length} 种`}
            >
              {pocketEarthMode ? (
                isPlantView
                  ? <><strong>{treeCount}</strong><span>已种下</span></>
                  : isJournalView
                    ? <><strong>{momentCount}</strong><span>自然时刻</span></>
                    : <><strong>{liveOuting ? 'LIVE' : 'READY'}</strong><span>{liveOuting ? '行动记录中' : '等待出门'}</span></>
              ) : isPlantView ? (
                <><strong>{journalCity}</strong><span>当前城市</span></>
              ) : showsNatureDeck ? (
                <><strong>{natureRecognizedSpeciesCount}<i>/</i>{NATURE_SOUND_SPECIES.length}</strong><span>已听见</span></>
              ) : isJournalView ? (
                <><strong>{birdJournalSpeciesCount}<i>/</i>12</strong><span>{birdJournalRecords.length} 条记录</span></>
              ) : (
                <><strong>{recognizedSpeciesCount}<i>/</i>{NATURE_SOUND_SPECIES.length}</strong><span>已听见</span></>
              )}
            </div>
          </header>

          {pocketEarthMode && (
            <section className="earth-ledger-strip" aria-label="今日行动状态">
              <div><small>TODAY</small><strong>{liveOuting ? '行动中' : '等待开始'}</strong></div>
              <div><small>CITY</small><strong>{journalCity}</strong></div>
              <div><small>MOMENTS</small><strong>{momentCount} 条</strong></div>
              <div><small>VISIBILITY</small><strong>PRIVATE</strong></div>
            </section>
          )}

          <WorldLayerSwitch
            value={streetView}
            journalMode={journalContent === 'nature-deck' ? 'nature-deck' : 'journal'}
            mode={pocketEarthMode ? 'health-ledger' : 'default'}
            onChange={(nextView) => {
              const request = getVoiceMapState();
              if (pocketEarthMode && nextView !== '街头' && request) {
                cancelVoiceMapMode(request.inputId, '已离开地图，这次真实 GPS 定位已取消。');
              }
              setOpenNatureSpeciesId(null);
              setShowAtlasJournal(false);
              setStreetView(nextView);
              setWorldLayer('public');
            }}
          />
        </>
      )}

      {universeOnly && (
        <div className="shrink-0 border-b-2 border-black bg-[#f5efdf] px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="border border-black bg-black px-1.5 py-1 font-pixel text-[5.5px] text-[#7CFF6B]">PRIVATE LAYER</span>
            <p className="min-w-0 text-[8.5px] font-bold text-black/55">Skills Plaza 的内容先落入私人知识地图；审核通过后可发布到城市漫游公共层。</p>
          </div>
        </div>
      )}

      {/* Map Canvas Hero */}
      <div className="city-map-canvas relative flex-1 bg-black border-b-2 border-black overflow-hidden shadow-inner">
        <div className="contents">
        {/* Pocket Earth 的默认行动地图必须是真实高德底图；只有用户明确
            发起 3D 伙伴/GPS 地图模式时，才进入原城市花园运行时。 */}
        {isPersonalStreet ? (
          <AmapEarth
            className="z-0"
            center={showExhibitMapDemo ? EXHIBIT_MAP_DEMO.coordinates : PERSONAL_WORLD_CENTER}
            zoom={showExhibitMapDemo ? 15.2 : PERSONAL_WORLD_ZOOM}
            onReady={handleMapReady}
          />
        ) : isPublicStreet ? (
          showExhibitMapDemo ? (
            <AmapEarth
              className="z-0"
              center={EXHIBIT_MAP_DEMO.coordinates}
              zoom={15.2}
              onReady={handleMapReady}
            />
          ) : isPocketAmapStreet ? (
            <AmapEarth
              className="z-0"
              center={POCKET_ACTION_CENTER}
              zoom={POCKET_ACTION_ZOOM}
              onReady={handleMapReady}
            />
          ) : (
            <GardenKnowledgeMap
              onReady={handleMapReady}
              voiceTreePlanting={pocketEarthMode}
              onLiveOutingChange={handleLiveOutingChange}
              focusPocketPlantingId={focusedPocketPlantingId}
              onOpenNatureCard={setOpenNatureSpeciesId}
              natureObservationFocus={mapNatureFocus}
            />
          )
        ) : null}

        {/* Mapping 的地图 Skill 全部通过注册表落到中间地图：
            Host 按 worldLayer 过滤，私人安装绝不会进入公共街道。 */}
        {isPersonalStreet && (
          <>
            <MapSkillLayerHost
              mapRef={skillMapRef}
              mapReady={!!map}
              skills={CITY_MAP_SKILLS}
              worldLayer={worldLayer}
            />
            <MapSkillsLegend
              skills={CITY_MAP_SKILLS}
              defaultOpen={false}
              open={openMapControl === 'skills'}
              onOpenChange={(open) => setOpenMapControl(open ? 'skills' : null)}
              title="MAPPING SKILLS"
              worldLayer={worldLayer}
              focusSkillId={recentSkillId}
              onInstallToPersonal={handleInstallCitySkill}
              onFocusSkill={focusMapLayerSkill}
              position={isPersonalStreet ? 'right' : 'left'}
            />
            {focusedMapSkill && (
              <div className="absolute left-1/2 top-3 z-[24] flex max-w-[calc(100%_-_24px)] -translate-x-1/2 items-center gap-2 border-2 border-black bg-black px-2.5 py-1.5 text-[#7CFF6B] shadow-[2px_2px_0_rgba(0,0,0,0.35)]">
                <span className="min-w-0 truncate font-pixel text-[6px] tracking-wider">
                  只看 · {focusedMapSkill.legendLabel}
                </span>
                <button
                  type="button"
                  onClick={() => setRecentSkillId(null)}
                  className="shrink-0 border border-[#7CFF6B]/70 px-1.5 py-0.5 text-[8px] font-bold active:translate-y-px"
                >
                  退出聚焦
                </button>
              </div>
            )}
          </>
        )}

        {/* 透明展品地图试摆：只由演示 query 开启，避免把验证样本写进真实私人数据。 */}
        {showExhibitMapDemo && (isPersonalStreet || isPublicStreet) && map && (() => {
          if (!map.getBounds().contains(EXHIBIT_MAP_DEMO.coordinates)) return null;
          const point = map.project(EXHIBIT_MAP_DEMO.coordinates);
          return (
            <div className="absolute inset-0 z-[18] pointer-events-none">
              <button
                type="button"
                aria-label="查看地图上的西周青铜鬲 2.5D 展品"
                className="absolute h-[142px] w-[118px] pointer-events-auto group focus:outline-none"
                style={{
                  left: `${point.x}px`,
                  top: `${point.y}px`,
                  transform: 'translate(-50%, -88%)',
                }}
                onClick={() => setSelected(EXHIBIT_MAP_DEMO_DETAIL)}
              >
                <span className="absolute bottom-[22px] left-1/2 h-3 w-16 -translate-x-1/2 rounded-[50%] bg-black/25 blur-[1px] transition-transform group-hover:scale-110" />
                <img
                  src={EXHIBIT_MAP_DEMO.cutoutUrl}
                  alt=""
                  draggable={false}
                  className="absolute inset-x-0 top-0 h-[116px] w-full object-contain transition-transform duration-200 group-hover:-translate-y-1 group-hover:scale-105"
                  style={{ filter: 'drop-shadow(0 5px 4px rgba(0,0,0,.42))' }}
                />
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 whitespace-nowrap border-2 border-black bg-white px-2 py-1 font-pixel text-[7px] leading-none text-black shadow-[2px_2px_0_#000]">
                  西周青铜鬲 · 2.5D
                </span>
              </button>
            </div>
          );
        })()}

        {isPlantView && (
          <div className="absolute inset-0 z-[60] bg-[#EAEAEA]">
            <Suspense fallback={<StreetSubpageFallback />}>
              <PoemGardenPage initialTreeId={treeFromUrl} mode="personal" />
            </Suspense>
          </div>
        )}

        {/* 漫游首页上的可编辑手帐层仍保留原交互。 */}
        {isPublicStreet && showAtlasJournal && (
          <div className="absolute inset-0 z-[30] bg-transparent">
            <Suspense fallback={<StreetSubpageFallback />}>
              <JournalPane
                city={journalCity}
                photos={journalPhotos}
                places={journalPlaces}
                date="2026-07"
                storagePageId={`pg-atlas-home-v8-${journalCity}`}
                initialStickers={ATLAS_JOURNAL_STICKERS}
                mapBackdrop
                onBack={closeAtlasJournal}
              />
            </Suspense>
          </div>
        )}

        {/* 拍照已并入手帐；ZINE 仍沿用同一份本地照片与拼贴状态。 */}
        {isJournalView && (
          <div className="absolute inset-0 z-[60] overflow-y-auto bg-[#EAEAEA]">
            <Suspense fallback={<StreetSubpageFallback />}>
              {journalContent === 'nature-deck' ? (
                <NatureSoundDeckPage
                  embedded
                  recognition={natureRecognition}
                  onOpenListen={() => setStreetView('街头')}
                  onViewObservationOnMap={(observation) => {
                    setMapNatureFocus(observation);
                    setStreetView('街头');
                  }}
                />
              ) : (
                <ZinePane active onBack={() => setStreetView('街头')} />
              )}
            </Suspense>
          </div>
        )}

        {/* 知识点、星球和行程线：高德负责投影，DOM/SVG 只画当前视口。
            数量有硬上限，避免手机在世界尺度一次挂载成百上千个节点。 */}
        {isPersonalStreet && !focusedMapSkill && map && (() => {
          const bounds = map.getBounds();
          const markScale = Math.max(
            0.28,
            Math.min(1, 0.28 + Math.max(0, zoom - 1) * 0.08),
          );
          const marks = markFeatures
            .filter((feature) => {
              const kind = feature.properties.kind as MarkerKind;
              const coordinates = feature.geometry.coordinates as [number, number];
              return (
                visibleKinds.has(kind) &&
                !(kind === 'music' && zoom >= SONG_ZOOM) &&
                bounds.contains(coordinates)
              );
            })
            .slice(0, 180);
          const visiblePlanetFeatures = planetFeatures
            .filter((feature) =>
              bounds.contains(
                feature.geometry.coordinates as [number, number],
              ),
            )
            .slice(0, 80);
          const tripLines = tripLineFeatures as Array<{
            geometry: {
              type: string;
              coordinates: [number, number][];
            };
            properties?: {
              tripId?: string;
            };
          }>;

          return (
            <div className="absolute inset-0 z-[3] pointer-events-none">
              <svg
                className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none"
                aria-hidden="true"
              >
                {tripLines.map((feature, index) => {
                  if (feature.geometry.type !== 'LineString') return null;
                  const points = feature.geometry.coordinates
                    .map((position) => map.project(position as [number, number]))
                    .map((point) => `${point.x},${point.y}`)
                    .join(' ');
                  return (
                    <polyline
                      key={String(feature.properties?.tripId ?? index)}
                      points={points}
                      fill="none"
                      stroke="#ff3b6b"
                      strokeWidth={Math.max(1, Math.min(4, zoom / 3.5))}
                      strokeDasharray="6 4"
                      opacity="0.7"
                    />
                  );
                })}
              </svg>

              {marks.map((feature) => {
                const properties = feature.properties;
                const kind = properties.kind as MarkerKind;
                const id = String(properties.id);
                const coordinates = feature.geometry.coordinates as [number, number];
                const point = map.project(coordinates);
                const baseSize = kind === 'movie' ? 11 : 18;
                const size = Math.max(5, Math.round(baseSize * markScale));
                return (
                  <button
                    key={`${kind}-${id}`}
                    type="button"
                    aria-label={String(properties.label || kind)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 border-2 border-black pointer-events-auto touch-none"
                    style={{
                      left: `${point.x}px`,
                      top: `${point.y}px`,
                      width: `${size}px`,
                      height: `${size}px`,
                      background: KIND_COLOR[kind],
                    }}
                    onPointerDown={(event) =>
                      beginDrag(
                        event,
                        id,
                        point,
                        (markId, lat, lng) =>
                          setOverride(markId, lng, lat),
                        () => {
                          commitOverrides();
                          refreshMapSources();
                        },
                      )
                    }
                    onPointerMove={onDragMove}
                    onPointerUp={onDragEnd}
                    onClick={async () => {
                      if (suppressClick.current) {
                        suppressClick.current = false;
                        return;
                      }
                      const detailValue = await resolveDetail(
                        id,
                        kind,
                        String(properties.label || ''),
                      );
                      if (!detailValue) return;
                      const userMark = getUserMarks().find(
                        (entry) => entry.id === id,
                      );
                      setSelected({
                        ...detailValue,
                        selfId: id,
                        lng: userMark?.lng ?? coordinates[0],
                        lat: userMark?.lat ?? coordinates[1],
                        createdAt: userMark?.createdAt,
                      });
                    }}
                  />
                );
              })}

              {visiblePlanetFeatures.map((feature) => {
                const properties = feature.properties;
                const id = String(properties.id);
                const coordinates = feature.geometry.coordinates as [number, number];
                const point = map.project(coordinates);
                const radius = Math.max(3, Math.min(9, 1 + zoom * 0.62));
                return (
                  <button
                    key={`planet-${id}`}
                    type="button"
                    aria-label="查看星球照片"
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-black pointer-events-auto touch-none"
                    style={{
                      left: `${point.x}px`,
                      top: `${point.y}px`,
                      width: `${radius * 2}px`,
                      height: `${radius * 2}px`,
                      background: String(properties.color || '#ff00ff'),
                    }}
                    onPointerDown={(event) =>
                      beginDrag(
                        event,
                        id,
                        point,
                        (photoId, lat, lng) =>
                          setOverride(photoId, lng, lat),
                        () => {
                          commitOverrides();
                          refreshMapSources();
                        },
                      )
                    }
                    onPointerMove={onDragMove}
                    onPointerUp={onDragEnd}
                    onClick={() => {
                      if (suppressClick.current) {
                        suppressClick.current = false;
                        return;
                      }
                      const photo = planetPhotoById(id);
                      if (!photo) return;
                      setSelected({
                        kind: 'photo',
                        full: photo.full,
                        thumb: photo.thumb,
                        city: photo.alt || '照片',
                        authorName: photo.author,
                        authorLink: photo.authorUrl,
                        photoLink: photo.link,
                      });
                      trackDownload(photo.downloadLocation);
                    }}
                  />
                );
              })}
            </div>
          );
        })()}

        {/* 标定点图层（地理锚定）——知识库视图专属 */}
        {isPersonalStreet && !focusedMapSkill && map && annotations.map((ann) => {
          const p = map.project([ann.lng, ann.lat]);
          const showDetail = detail > 0.01;

          return (
            <div
              key={ann.id}
              className="absolute z-10 pointer-events-none"
              style={{ left: `${p.x}px`, top: `${p.y}px` }}
            >
              {/* 连线层（仅细节可见时） */}
              {showDetail && (
                <svg className="absolute overflow-visible w-0 h-0 z-0 pointer-events-none" style={{ opacity: detail }}>
                  <line x1="0" y1="0" x2={ann.dx} y2={ann.dy} stroke="black" strokeWidth="1.5" />
                  {ann.img && ann.imgProps && (
                    <line x1="0" y1="0" x2={ann.imgProps.dx} y2={ann.imgProps.dy} stroke="#ff00ff" strokeWidth="1" strokeDasharray="3,3" />
                  )}
                </svg>
              )}

              {/* 照片（含紫色图钉）：仅街道级别出现 */}
              {showDetail && ann.img && ann.imgProps && (
                <div
                  role="button" tabIndex={0}
                  aria-label={`查看「${ann.place}」照片大图`}
                  onClick={() => setSelected({ kind: 'photo', full: ann.full || ann.img, thumb: ann.img, city: ann.place })}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected({ kind: 'photo', full: ann.full || ann.img, thumb: ann.img, city: ann.place }); } }}
                  className="group pointer-events-auto cursor-pointer absolute bg-white p-1 border border-black shadow-[3px_3px_0px_rgba(0,0,0,0.8)] z-0"
                  style={{
                    width: `${ann.imgProps.w}px`,
                    height: `${ann.imgProps.h}px`,
                    transform: `translate(${ann.imgProps.dx}px, ${ann.imgProps.dy}px) rotate(${ann.imgProps.rot}deg)`,
                    opacity: detail,
                  }}
                >
                  {/* 紫色图钉（只有放大看清街道后才存在） */}
                  <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#ff00ff] border border-black shadow-sm z-10"></div>
                  <ImageWithFallback src={ann.img} alt={ann.text} className="w-full h-full object-cover grayscale group-hover:grayscale-0 group-active:grayscale-0 opacity-90 group-hover:opacity-100 contrast-125 transition-all duration-500 border border-black/20" />
                </div>
              )}

              {/* 文字卡片已解耦为可拖动的「白卡片便贴」（见心情贴图层 / seedStickers） */}
            </div>
          );
        })}

        {/* 放大后照片缩略预览（DOM 叠层，仅渲染视口内、可见、有图的照片，点开看大图） */}
        {isPersonalStreet && !focusedMapSkill && map && zoom >= PREVIEW_ZOOM && visibleKinds.has('photo') && (() => {
          const b = map.getBounds();
          const out: React.ReactNode[] = [];
          const phash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
          // 拍立得照片贴：白边 + 紫钉（星球用星球色钉）+ 方形/竖版随机 + 黑白，触碰变彩色
          // 拍立得照片贴：可鼠标拖动重新摆放（解耦校对落点）；未拖动则点击看大图
          const polaroid = (key: string, oid: string, lng: number, lat: number, thumb: string, h: number, pin: string, onClick: () => void) => {
            const [olng, olat] = applyOverride(oid, lng, lat); // 拖动校正后的落点
            const pt = map.project([olng, olat]);
            const tall = h % 2 === 0; const rot = (h % 7) - 3;
            return (
              <button key={key}
                aria-label="查看照片大图"
                onPointerDown={(e) => photoDragStart(e, oid, pt)}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onClick(); }}
                className="absolute z-[15] bg-white p-1 pb-2.5 border border-black/50 shadow-[2px_3px_6px_rgba(0,0,0,0.4)] active:scale-95 cursor-grab active:cursor-grabbing touch-none select-none"
                style={{ left: `${pt.x}px`, top: `${pt.y}px`, width: '58px', transform: `translate(-50%,-50%) rotate(${rot}deg)` }}>
                <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border border-black" style={{ background: pin }} />
                <div className={`w-full ${tall ? 'aspect-[3/4]' : 'aspect-square'} overflow-hidden bg-[#d8d8d6]`}>
                  <img src={thumb} alt="" className="w-full h-full object-cover grayscale hover:grayscale-0 active:grayscale-0 transition-all duration-500" loading="lazy" draggable={false} onError={(e) => { e.currentTarget.style.opacity = '0'; }} />
                </div>
              </button>
            );
          };
          for (const m of PHOTO_MARKERS) {
            if (!m.thumb) continue;
            const [mlng, mlat] = applyOverride(m.id, m.lng, m.lat);
            if (!b || !b.contains([mlng, mlat])) continue;
            out.push(polaroid('pv-' + m.id, m.id, m.lng, m.lat, m.thumb, phash(m.id), '#ff00ff',
              () => setSelected({ kind: 'photo', full: m.full, thumb: m.thumb, city: (m.label || '').split(',')[0], authorName: m.author, authorLink: m.authorLink, photoLink: m.photoLink })));
            if (out.length >= 70) break;
          }
          // 用户自己钉的照片（照片整理 agent 写入 userMarks）：青钉拍立得，点开看缩略大图
          for (const m of getUserMarksByKind('photo')) {
            const meta = (m.meta || {}) as Record<string, unknown>;
            const thumb = String(meta.thumb || '');
            if (!thumb) continue;
            const [mlng, mlat] = applyOverride(m.id, m.lng, m.lat);
            if (!b || !b.contains([mlng, mlat])) continue;
            out.push(polaroid('um-' + m.id, m.id, m.lng, m.lat, thumb, phash(m.id), '#00e5ff',
              () => setSelected({ kind: 'photo', full: String(meta.full || thumb), thumb, city: String(meta.city || m.label || '我的照片'), arAnchorId: (meta.ar as { anchorId?: string } | undefined)?.anchorId })));
            if (out.length >= 130) break;
          }
          for (const pl of getVisiblePlanets()) {
            for (const ph of pl.photos) {
              const [plng, plat] = applyOverride(ph.id, ph.lng, ph.lat);
              if (!b || !b.contains([plng, plat])) continue;
              out.push(polaroid('pp-' + ph.id, ph.id, ph.lng, ph.lat, ph.thumb, phash(ph.id), pl.color,
                () => { setSelected({ kind: 'photo', full: ph.full, thumb: ph.thumb, city: ph.alt || '照片', authorName: ph.author, authorLink: ph.authorUrl, photoLink: ph.link }); trackDownload(ph.downloadLocation); }));
              if (out.length >= 130) break;
            }
            if (out.length >= 130) break;
          }
          return out;
        })()}

        {/* 音乐落点：放大到街区，城市级音乐点散开成 621 首歌的卡片（点击展开介绍 → 再点就地变迷你播放器） */}
        {isPersonalStreet && !focusedMapSkill && map && zoom >= SONG_ZOOM && visibleKinds.has('music') && (() => {
          const b = map.getBounds();
          const out: React.ReactNode[] = [];
          for (const sm of songMarkers) {
            if (!b || !b.contains([sm.lng, sm.lat])) continue;
            const pt = map.project([sm.lng, sm.lat]);
            const left = `${pt.x}px`; const top = `${pt.y}px`;
            if (songPlaying === sm.key) {
              out.push(
                <div key={sm.key} className="absolute z-[20] -translate-x-1/2 -translate-y-full" style={{ left, top }} onClick={(e) => e.stopPropagation()}>
                  <div className="w-[212px] bg-black text-[#7CFF6B] border-2 border-black shadow-[2px_2px_0_rgba(0,0,0,0.85)] p-2">
                    <div className="flex items-center gap-2">
                      <img src={sm.cover} alt="" className="w-10 h-10 object-cover border border-[#7CFF6B]/40 shrink-0" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.opacity = '0'; }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold truncate text-white">{sm.title}</div>
                        <div className="text-[9px] text-[#7CFF6B]/70 truncate">{sm.artist} · {sm.cityNameZh}{songSrcMode === 'fallback' ? ' · 示例音源' : ''}</div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); setSongPaused((p) => !p); }} className="w-7 h-7 border border-[#7CFF6B]/50 flex items-center justify-center shrink-0 active:scale-95" aria-label={songPaused ? '播放' : '暂停'}>
                        {songPaused ? <Play size={13} fill="currentColor" strokeWidth={0} className="ml-0.5" /> : <Pause size={13} fill="currentColor" strokeWidth={0} />}
                      </button>
                    </div>
                    <div className="mt-2 h-1 bg-[#7CFF6B]/20">
                      <div className="h-full bg-[#7CFF6B]" style={{ width: `${Math.round(songProg * 100)}%` }} />
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setSongPlaying(null); }} className="mt-1.5 w-full font-pixel text-[8px] tracking-widest text-[#7CFF6B]/60 hover:text-[#7CFF6B] py-0.5">收起 ▾</button>
                  </div>
                  <div className="w-2.5 h-2.5 bg-[#00ff88] border border-black rotate-45 mx-auto -mt-[7px]" />
                </div>
              );
            } else if (songSel === sm.key) {
              out.push(
                <div key={sm.key} className="absolute z-[19] -translate-x-1/2 -translate-y-full" style={{ left, top }} onClick={(e) => e.stopPropagation()}>
                  <div className="w-[212px] bg-[#FFFCF2] border-2 border-black shadow-[2px_2px_0_rgba(0,0,0,0.85)] p-2">
                    <div className="flex items-center justify-between mb-1 gap-1">
                      <span className="font-pixel text-[7px] tracking-widest text-[#0a8] truncate">◍ {sm.cityNameZh} · {sm.anchorLabel}</span>
                      <button onClick={(e) => { e.stopPropagation(); setSongSel(null); }} className="text-black/40 hover:text-[#d23b3b] shrink-0" aria-label="收起卡片"><X className="w-3 h-3" strokeWidth={3} /></button>
                    </div>
                    <div className="text-[12px] font-bold leading-snug break-words">《{sm.title}》</div>
                    <div className="text-[10px] text-black/55 mb-1">{sm.artist} · {sm.duration}</div>
                    <div className={`text-[10px] text-black/75 leading-snug ${songDetail ? 'max-h-[160px] overflow-y-auto' : 'line-clamp-5'}`}>{songDetail ? sm.detail : sm.summary}</div>
                    <div className="flex gap-1.5 mt-2">
                      <button onClick={(e) => { e.stopPropagation(); setSongDetail((v) => !v); }} className="flex-1 border border-black bg-white text-[9px] py-1 active:translate-y-px">{songDetail ? '收起' : '完整介绍'}</button>
                      <button onClick={(e) => { e.stopPropagation(); setSongPlaying(sm.key); setSongPaused(false); setSongDetail(false); }} className="flex-1 flex items-center justify-center gap-1 border border-black bg-[#00ff88] text-black text-[9px] font-bold py-1 active:translate-y-px"><Play size={11} fill="currentColor" strokeWidth={0} /> 播放</button>
                    </div>
                  </div>
                  <div className="w-2.5 h-2.5 bg-[#00ff88] border border-black rotate-45 mx-auto -mt-[7px]" />
                </div>
              );
            } else {
              out.push(
                <button key={sm.key} aria-label={`${sm.title} · ${sm.cityNameZh}`} onClick={(e) => { e.stopPropagation(); setSongSel(sm.key); setSongDetail(false); }}
                  className="absolute z-[16] w-2.5 h-2.5 bg-[#00ff88] border border-black shadow-[1px_1px_0_rgba(0,0,0,0.6)] -translate-x-1/2 -translate-y-1/2 hover:scale-150 transition-transform cursor-pointer"
                  style={{ left, top }} />
              );
            }
            if (out.length >= SONG_CARD_MAX) break;
          }
          return out;
        })()}

        {/* 心情贴：缩小时收成小图钉（和标记点一样钉在地球，不浮动），放大才展开成卡片 */}
        {isPersonalStreet && !focusedMapSkill && map && moodStickers.map((s) => {
          const pt = map.project([s.lng, s.lat]);
          if (zoom < 6.5) {
            // 小图钉：居中锚定在落点（与方块标记同机制），尺寸随缩放走，地球尺度下和方块点一样小
            const sz = Math.max(6, Math.min(13, Math.round(2 + zoom * 1.7)));
            return (
              <button
                key={s.id}
                title={s.text}
                aria-label={`心情：${s.text}`}
                onClick={() => map.flyTo({ center: [s.lng, s.lat], zoom: 8 })}
                className="absolute z-[18] -translate-x-1/2 -translate-y-1/2 rounded-full border border-black shadow-[1px_1px_0_rgba(0,0,0,0.4)] pointer-events-auto active:scale-90"
                style={{ left: `${pt.x}px`, top: `${pt.y}px`, width: `${sz}px`, height: `${sz}px`, background: (s.variant === 'card' || !s.color) ? '#ff00ff' : s.color }}
              />
            );
          }
          // 放大后：展开成卡片，鼠标可拖动重新摆放（白卡片 / 彩色两种风格）
          const isCard = s.variant === 'card';
          return (
            <div
              key={s.id}
              className="absolute z-[18] -translate-x-1/2 -translate-y-full group pointer-events-auto cursor-grab active:cursor-grabbing select-none touch-none"
              style={{ left: `${pt.x}px`, top: `${pt.y}px` }}
              onPointerDown={(e) => stickerDragStart(e, s.id, pt)}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
            >
              <div
                className={`relative border-2 border-black shadow-[2px_3px_0_rgba(0,0,0,0.6)] px-2 py-1.5 max-w-[160px] ${isCard ? 'bg-white' : ''}`}
                style={{ ...(isCard ? {} : { background: s.color }), transform: `rotate(${s.rot}deg)` }}
              >
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#ff00ff] border-2 border-black" />
                {isCard ? (
                  <>
                    <div className="font-pixel text-[6px] text-black/60 mb-1 tracking-widest">{s.date} • LOC_SYNC</div>
                    <div className="text-[11px] font-bold leading-none text-black break-words">{s.text}</div>
                  </>
                ) : (
                  <>
                    <div className="text-[11px] leading-snug text-black font-medium break-words">{s.text}</div>
                    <div className="font-pixel text-[6px] text-black/55 tracking-wider mt-1">◍ {s.place} · 心情贴</div>
                  </>
                )}
                <button
                  aria-label="删除这条心情"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => removeMoodSticker(s.id)}
                  className="absolute -top-2.5 -right-2.5 w-4 h-4 bg-black border border-black text-white flex items-center justify-center opacity-50 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-2.5 h-2.5" strokeWidth={3} />
                </button>
              </div>
              <div className="w-px h-2 bg-black/50 mx-auto" />
            </div>
          );
        })}

        {/* 左上角：贴一条心情（知识库视图专属；舆图是纯看层，不产内容） */}
        {isPersonalStreet && !focusedMapSkill && (
        <div className="absolute top-3 left-3 z-20 pointer-events-auto">
          {moodOpen ? (
            <div className="bg-white border-2 border-black shadow-[2px_2px_0_#000] p-2 w-[210px]">
              <div className="font-pixel text-[7px] tracking-widest mb-1.5 text-black/55">此刻的心情 · MOOD</div>
              {/* 风格切换：彩色心情贴 / 白色 LOC_SYNC 卡片 */}
              <div className="flex gap-1.5 mb-1.5">
                <button onClick={() => setMoodStyle('color')} className={`flex-1 border-2 border-black text-[9px] py-0.5 ${moodStyle === 'color' ? 'bg-[#ffe08a] font-bold' : 'bg-white text-black/55'}`}>彩色</button>
                <button onClick={() => setMoodStyle('card')} className={`flex-1 border-2 border-black text-[9px] py-0.5 ${moodStyle === 'card' ? 'bg-black text-white font-bold' : 'bg-white text-black/55'}`}>白卡片</button>
              </div>
              <textarea value={moodText} onChange={(e) => setMoodText(e.target.value)} rows={2} placeholder="留下此刻的心情（可带地名）…" className="w-full border-2 border-black px-2 py-1 text-[11px] bg-[#EAEAEA] focus:outline-none resize-none" />
              <div className="flex gap-1.5 mt-1.5">
                <button onClick={() => { setMoodOpen(false); setMoodText(''); }} className="flex-1 border-2 border-black bg-white text-[10px] py-1 active:translate-y-px">取消</button>
                <button onClick={submitMood} disabled={moodBusy || !moodText.trim()} className="flex-1 border-2 border-black bg-[#ffe08a] text-[10px] font-bold py-1 active:translate-y-px disabled:opacity-40">{moodBusy ? '识别中…' : '钉下 ◍'}</button>
              </div>
              <div className="font-pixel text-[6px] text-black/40 mt-1 leading-snug">端侧判地名 → 钉地理坐标，缩放不跟跑</div>
            </div>
          ) : (
            <button onClick={() => setMoodOpen(true)} title="贴一条心情" className="w-10 h-10 bg-[#ffe08a] border-2 border-black shadow-[2px_2px_0_#000] flex items-center justify-center active:translate-y-px">
              <Plus className="w-5 h-5" strokeWidth={3} />
            </button>
          )}
        </div>
        )}

        {/* 舆图地名标签（明朝体粗体 + 白描边）：地名走 DOM 层，
            与票根引文同一套油墨字。街区级才出（缩小太挤）；票根 z 更高会盖住有引文点的地名，无妨——票根自带地名 */}
        {!isPersonalStreet && showAtlasJournal && map && zoom >= 10 && (() => {
          const b = map.getBounds();
          const out: React.ReactNode[] = [];
          const placed: { x: number; y: number }[] = [];   // 稀疏化：横向近的地名跳过，密集区不叠成一团
          for (const s of atlasSpots) {
            if (atlasCitiesOff.has(s.city) || atlasStatusOff.has(s.status)) continue;
            if (!b || !b.contains([s.lng, s.lat])) continue;
            const pt = map.project([s.lng, s.lat]);
            if (placed.some((q) => Math.abs(q.x - pt.x) < 42 && Math.abs(q.y - pt.y) < 15)) continue;
            placed.push({ x: pt.x, y: pt.y });
            out.push(
              <div key={s.key} className="absolute z-[12] pointer-events-none -translate-x-1/2 whitespace-nowrap"
                style={{ left: `${pt.x}px`, top: `${pt.y + 7}px`, fontFamily: MINCHO, fontWeight: 700,
                  fontSize: '10.5px', color: '#1a1613', textShadow: '0 0 2px #fff,0 0 2px #fff,0 0 3px #fff,1px 1px 0 #fff' }}>
                {s.name}
              </div>,
            );
            if (out.length >= 60) break;
          }
          return out;
        })()}

        {/* 舆图书摘票根：有引文的考据点挂一张小票根（纸色票身 + 斜插朱图钉 + 明朝体引文），
            与知识库的诗签/拍立得同一套贴片语言、色调走纸朱墨。街区级才出现；
            点票根即开该点的出处气泡。视口内最多 10 张；空间稀疏化（相邻票根锚点 <96px 就跳过），
            让票根摊开而非在西湖那种密集区叠成一坨 */}
        {!isPersonalStreet && showAtlasJournal && map && zoom >= 10.5 && (() => {
          const b = map.getBounds();
          const out: React.ReactNode[] = [];
          const placed: { x: number; y: number }[] = [];   // 已落位票根锚点，供稀疏化判距
          const thash = (str: string) => { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); };
          for (const s of atlasSpots) {
            if (!s.quote) continue;
            if (atlasCitiesOff.has(s.city) || atlasStatusOff.has(s.status)) continue;
            if (!b || !b.contains([s.lng, s.lat])) continue;
            if (atlasSel?.key === s.key) continue;   // 气泡打开时这张票根让位，不与气泡叠罗汉
            const pt = map.project([s.lng, s.lat]);
            if (placed.some((q) => Math.hypot(q.x - pt.x, q.y - pt.y) < 96)) continue;   // 太挤就跳过这枚
            placed.push({ x: pt.x, y: pt.y });
            const h = thash(s.key);
            const rot = (h % 7) - 3;
            out.push(
              <button
                key={s.key}
                onClick={(e) => { e.stopPropagation(); setAtlasSel(s); }}
                aria-label={`看「${s.name}」出处`}
                className="absolute z-[14] pointer-events-auto text-left group"
                style={{ left: `${pt.x}px`, top: `${pt.y}px`, transform: `translate(-50%, calc(-100% - 9px)) rotate(${rot}deg)` }}
              >
                <div className="relative w-[148px] bg-[#fffcf2] border-2 border-black shadow-[2px_3px_0_rgba(0,0,0,0.55)] px-2.5 py-1.5 group-hover:shadow-[3px_4px_0_rgba(0,0,0,0.55)] group-active:translate-y-px">
                  {/* 斜插图钉（朱头·右上角斜插，区别于知识库的正方钉）*/}
                  <div className="absolute -top-1.5 right-2 z-10" style={{ transform: 'rotate(18deg)' }} aria-hidden>
                    <div className="relative w-3 h-3 rounded-full border border-black" style={{ background: 'radial-gradient(circle at 35% 30%, #c15542, #9e3c2f)' }}>
                      <div className="absolute left-1/2 top-full -translate-x-1/2 w-[2px] h-2 bg-black/55" />
                    </div>
                  </div>
                  <div className="text-[6px] tracking-[0.15em] text-black/45" style={{ fontFamily: MINCHO }}>古籍摘录 · {s.city}</div>
                  <div className="mt-0.5 text-[10.5px] leading-snug text-[#3a2418] line-clamp-2" style={{ fontFamily: MINCHO }}>「{s.quote}」</div>
                  <div className="mt-1 text-[7px] text-black/55 truncate" style={{ fontFamily: MINCHO }}>{s.name} ·《{s.books[0]}》</div>
                </div>
              </button>
            );
            if (out.length >= 10) break;
          }
          return out;
        })()}

        {/* 舆图出处气泡：锚在考据点上、菱形尾巴连着小点（同歌曲卡的锚定机制，随地图平移缩放走），
            不再压住左下角 LAYERS。内容：地名/今名/存续 + 引文（楷体）+ 出自书目 + 去书架 */}
        {!isPersonalStreet && atlasSel && map && (() => {
          const pt = map.project([atlasSel.lng, atlasSel.lat]);
          return (
            <div
              className="absolute z-[22] -translate-x-1/2 -translate-y-full pointer-events-auto"
              style={{ left: `${pt.x}px`, top: `${pt.y}px` }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative w-[236px] border-2 border-black bg-[#f5efdf] shadow-[3px_3px_0_rgba(0,0,0,0.85)] p-2.5">
                <button onClick={() => setAtlasSel(null)} aria-label="收起出处卡"
                  className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center text-black/45 hover:text-[#9e3c2f] active:translate-y-px">
                  <X className="w-3.5 h-3.5" strokeWidth={3} />
                </button>
                <div className="flex items-center gap-1.5 flex-wrap pr-6">
                  <span className="w-2.5 h-2.5 shrink-0 border border-black" style={{ background: ATLAS_STATUS_COLOR[atlasSel.status] }} />
                  <span className="text-[13px] font-bold">{atlasSel.name}</span>
                  {atlasSel.modernName && atlasSel.modernName !== atlasSel.name && (
                    <span className="text-[9px] text-black/50">今 · {atlasSel.modernName}</span>
                  )}
                  <span className="font-pixel text-[6px] border border-black bg-black text-[#f5efdf] px-1.5 py-0.5">
                    {atlasSel.city} · {ROAM_STATUS_LABEL[atlasSel.status]}
                  </span>
                </div>
                {atlasSel.quote && (
                  <div className="mt-1.5 text-[11px] leading-relaxed text-[#6b4226]" style={{ fontFamily: MINCHO }}>
                    「{atlasSel.quote}」{atlasSel.chapter && <span className="text-black/40 text-[9px]">　——{atlasSel.chapter}</span>}
                  </div>
                )}
                {atlasSel.note && <div className="mt-1 text-[9.5px] text-black/55 leading-snug">{atlasSel.note}</div>}
                <div className="mt-1.5 font-pixel text-[6px] tracking-wider text-black/45">
                  出自 {atlasSel.books.map((t) => `《${t}》`).join(' ')}
                </div>
                {/* 旅程出口：总舆图（看）→ 书架（做）。显式手势才切 mapping 的城市语境 */}
                <button
                  onClick={() => {
                    if (atlasSel.city && atlasSel.city !== '未标城') setRoamCity(atlasSel.city);
                    requestMappingPane('书籍');
                  }}
                  className="mt-2 w-full py-1.5 border-2 border-black bg-black text-[#7CFF6B] font-pixel text-[7px] uppercase tracking-widest active:translate-y-px"
                >
                  去书架翻{atlasSel.books.length > 1 ? '这几本书' : '这本书'} ▶
                </button>
              </div>
              {/* 对话框尾巴：纸色菱形，尖端搭在小点上 */}
              <div className="w-2.5 h-2.5 bg-[#f5efdf] border border-black rotate-45 mx-auto -mt-[7px]" />
            </div>
          );
        })()}

        {/* 左下角图例：知识库沿用原内容筛选；漫游由完整 Garden 自己提供控制。 */}
        {isPersonalStreet && !focusedMapSkill ? (
          <MapLegend
            open={openMapControl === 'knowledge'}
            onOpenChange={(open) => setOpenMapControl(open ? 'knowledge' : null)}
            loadedSkillIds={loadedKnowledgeSkillIds}
            onToggleSkill={toggleKnowledgeSkill}
            allOn={allKindsOn}
            onToggleAll={toggleAllKinds}
            onFocusSkill={focusKnowledgeSkill}
            skillPointCounts={knowledgeSkillPointCounts}
            planets={planets}
            onTogglePlanet={togglePlanet}
            onRemovePlanet={removePlanet}
          />
        ) : showAtlasJournal ? (
          <AtlasLegend
            cities={atlasCityInfo}
            citiesOff={atlasCitiesOff}
            onToggleCity={toggleAtlasCity}
            statusOff={atlasStatusOff}
            onToggleStatus={toggleAtlasStatus}
            onJumpCity={jumpToAtlasCity}
          />
        ) : null}

        {isPublicStreet && openNatureSpeciesId && (
          <NatureSoundMapCardViewer
            speciesId={openNatureSpeciesId}
            onClose={() => setOpenNatureSpeciesId(null)}
            onViewObservationOnMap={(observation) => {
              setMapNatureFocus(observation);
              setOpenNatureSpeciesId(null);
            }}
          />
        )}
        {renderMapOverlay?.(map)}
        </div>
      </div>

      {/* 标记详情弹层（照片灯箱 / 电影票根 / 藏书票 / 行程足迹 / 音乐城市） */}
      <AnimatePresence>
        {selected && (
          <Suspense fallback={null}>
            <MarkerDetail data={selected} onClose={() => setSelected(null)} onRemove={(id) => { removeUserMark(id); refreshMapSources(); }} onView3D={(url, format) => setView3D({ url, format })}
              onSelectRelated={async (r) => {
                // 相关记忆 → 顺藤摸瓜：打开那条记忆的详情并飞过去（mood 贴不在 resolveDetail 体系里，related 层已禁跳）
                const d = await resolveDetail(r.id, r.kind as MarkerKind, r.label);
                if (d) setSelected({ ...d, selfId: r.id, lat: r.lat, lng: r.lng, createdAt: r.createdAt });
                if (map && Number.isFinite(r.lat) && Number.isFinite(r.lng)) map.flyTo({ center: [r.lng, r.lat], zoom: Math.max(map.getZoom(), 3.2) });
              }} />
          </Suspense>
        )}
      </AnimatePresence>
      {/* 地球点开展品 → 全屏 3D viewer（mesh/高斯泼溅按 format 分发，懒加载）。
          ShellPortal 锁进手机壳（fixed 会盖满浏览器视口越出边界——铁律） */}
      {view3D && (
        <ShellPortal>
        <div className="absolute inset-0 z-[140] bg-black flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b-2 shrink-0" style={{ borderColor: '#C8A24B' }}>
            <span className="font-pixel text-[9px]" style={{ color: '#C8A24B' }}>◆ 3D 展品 · 拖动旋转</span>
            <button onClick={() => setView3D(null)} className="w-7 h-7 bg-black border-2 flex items-center justify-center" style={{ borderColor: '#C8A24B' }}>
              <X className="w-4 h-4" style={{ color: '#C8A24B' }} />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <Viewer3D url={view3D.url} format={view3D.format} onError={() => setView3D(null)} />
          </div>
        </div>
        </ShellPortal>
      )}
      {/* 歌曲落点迷你播放器共用的单个音频元素（一次只播一首） */}
      <audio ref={songAudioRef} onTimeUpdate={(e) => { const a = e.currentTarget; setSongProg(a.duration ? a.currentTime / a.duration : 0); }} onEnded={() => { setSongPaused(true); setSongProg(1); }} />
    </div>
  );
}
