// 漫游城市维度：mapping 的书籍/漫游内容按当前城市过滤，城市列表从书架动态归纳
//（内容包带来新城市的书，城市自动出现在切换列表里）。pe.roamCity.v1（garden 模式）。
import { getRoamBooks, getRoamPlaces } from './store';
import { gcj02ToWgs84 } from '../location/chinaCoordinates';
import { GUIJI_LIBRARY_STATS, listMapSkillCatalogBooks } from './mapSkills';

const KEY = 'pe.roamCity.v1';
const DEFAULT_CITY = '杭州';

// 城市落点兜底（书的 cityGeo 缺失时用；也是 MY MAP 漫游层跳转的目标）
const toBusinessGeo = (lng: number, lat: number): { lat: number; lng: number } => {
  const [wgsLng, wgsLat] = gcj02ToWgs84([lng, lat]);
  return { lng: wgsLng, lat: wgsLat };
};

const CITY_GEO_FALLBACK: Record<string, { lat: number; lng: number }> = {
  杭州: toBusinessGeo(120.14, 30.246),
  南京: toBusinessGeo(118.79, 32.041),
  苏州: toBusinessGeo(120.62, 31.32),
  广州: toBusinessGeo(113.26, 23.13),
  北京: toBusinessGeo(116.40, 39.90),
  上海: toBusinessGeo(121.44, 31.22),
  开封: toBusinessGeo(114.35, 34.79),
  '杭州—绍兴—台州': toBusinessGeo(120.14, 30.246),
};

function load(): string {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && typeof raw === 'string') return raw;
  } catch { /* 首次/隐私模式 */ }
  return DEFAULT_CITY;
}

let city: string = load();
const subs = new Set<() => void>();
function persist() { try { localStorage.setItem(KEY, city); } catch { /* 内存可用 */ } }
function emit() { subs.forEach((fn) => fn()); }

export function subscribeRoamCity(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

export function getRoamCity(): string { return city; }

export function getRoamCityDisplayName(name: string): string {
  return name === '杭州—绍兴—台州' ? '浙东唐诗之路' : name;
}

export function setRoamCity(next: string) {
  const t = next.trim();
  if (!t || t === city) return;
  city = t;
  persist(); emit();
}

export interface RoamCityInfo {
  name: string;
  geo: { lat: number; lng: number };
  books: number;
  confirmedPlaces: number;   // 已上图点位数（MY MAP 漫游层的汇聚数）
}

/**
 * 轻目录中的全部城市 + 用户后来加入的城市。
 *
 * 城市切换不能依赖完整 Skill 是否已经下载，否则首次打开只会剩下杭州；目录里的书量
 * 始终可见，具体书和地点仍维持点击后按需加载。
 */
export function listRoamCities(): RoamCityInfo[] {
  const map = new Map<string, RoamCityInfo>();
  const catalogBookIds = new Set(listMapSkillCatalogBooks().map((book) => book.id));
  for (const entry of GUIJI_LIBRARY_STATS.cityCounts) {
    map.set(entry.city, {
      name: entry.city,
      geo: CITY_GEO_FALLBACK[entry.city] ?? CITY_GEO_FALLBACK.杭州,
      books: entry.books,
      confirmedPlaces: 0,
    });
  }
  for (const b of getRoamBooks()) {
    const name = (b.city || '').trim();
    if (!name) continue;
    let info = map.get(name);
    if (!info) {
      info = { name, geo: b.cityGeo ?? CITY_GEO_FALLBACK[name] ?? CITY_GEO_FALLBACK.杭州, books: 0, confirmedPlaces: 0 };
      map.set(name, info);
    }
    if (b.cityGeo) info.geo = b.cityGeo;
    // 已加载的内建书已经计入轻目录；粘贴书和用户导入书才是目录之外的新增量。
    if (!catalogBookIds.has(b.id)) info.books += 1;
    info.confirmedPlaces += getRoamPlaces(b.id).filter((p) => p.suggest === 'confirmed' && p.geo).length;
  }
  if (!map.has(city)) {
    map.set(city, { name: city, geo: CITY_GEO_FALLBACK[city] ?? CITY_GEO_FALLBACK.杭州, books: 0, confirmedPlaces: 0 });
  }
  // 杭州（创始城市）恒排第一，其余按书量降序
  return [...map.values()].sort((a, b) => (a.name === DEFAULT_CITY ? -1 : b.name === DEFAULT_CITY ? 1 : b.books - a.books));
}

/** 测试/演示复位 */
export function resetRoamCity() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
  city = DEFAULT_CITY;
  emit();
}
