// 可复用 Skill（app 层）· 地理编码 / 地名→坐标（resolvePlace）
// 统一链路：本地地点表 → 高德 Geocoder → 缓存。
// 产品内部保存 WGS84；高德返回的 GCJ-02 只在本 Skill 边界转换一次。
import { geocodeCity } from '../../data/geoStickers';
import { loadAmap } from '../amap';
import { gcj02ToWgs84 } from '../location/chinaCoordinates';

const CACHE_KEY = 'pe.geocache.v2';

export interface GeoHit {
  place: string;
  lng: number;
  lat: number;
  source: 'local' | 'amap';
}

type AmapLocation = {
  getLng?: () => number;
  getLat?: () => number;
  lng?: number;
  lat?: number;
};

type AmapGeocode = {
  formattedAddress?: string;
  location?: AmapLocation;
};

type AmapGeocoderResult = {
  geocodes?: AmapGeocode[];
};

type AmapGeocoder = {
  getLocation: (
    address: string,
    callback: (status: string, result: AmapGeocoderResult | string) => void,
  ) => void;
};

type AmapNamespace = {
  plugin?: (name: string, callback: () => void) => void;
  Geocoder?: new (options?: {
    city?: string;
    batch?: boolean;
    extensions?: 'base' | 'all';
  }) => AmapGeocoder;
};

let cache: Record<string, GeoHit | null> = (() => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
})();

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // 隐私模式下仍保留当前会话内存缓存。
  }
}

const clean = (value: string) =>
  (value || '')
    .replace(/[·•，,/｜|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function loadGeocoder(AMap: AmapNamespace): Promise<AmapGeocoder | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (geocoder: AmapGeocoder | null) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      resolve(geocoder);
    };
    const timeout = globalThis.setTimeout(() => finish(null), 6_000);
    const create = () => {
      if (!AMap.Geocoder) {
        finish(null);
        return;
      }
      finish(
        new AMap.Geocoder({
          batch: false,
          extensions: 'base',
        }),
      );
    };
    if (AMap.Geocoder) {
      create();
      return;
    }
    if (!AMap.plugin) {
      finish(null);
      return;
    }
    AMap.plugin('AMap.Geocoder', create);
  });
}

async function geocodeWithAmap(query: string): Promise<GeoHit | null> {
  try {
    const AMap = (await loadAmap()) as AmapNamespace;
    const geocoder = await loadGeocoder(AMap);
    if (!geocoder) return null;
    return await new Promise((resolve) => {
      let settled = false;
      const finish = (hit: GeoHit | null) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        resolve(hit);
      };
      const timeout = globalThis.setTimeout(() => finish(null), 8_000);
      try {
        geocoder.getLocation(query, (status, result) => {
          if (status !== 'complete' || typeof result === 'string') {
            finish(null);
            return;
          }
          const geocode = result.geocodes?.[0];
          const gcjLng = Number(
            geocode?.location?.getLng?.() ?? geocode?.location?.lng,
          );
          const gcjLat = Number(
            geocode?.location?.getLat?.() ?? geocode?.location?.lat,
          );
          if (!Number.isFinite(gcjLng) || !Number.isFinite(gcjLat)) {
            finish(null);
            return;
          }
          const [lng, lat] = gcj02ToWgs84([gcjLng, gcjLat]);
          finish({
            place: geocode?.formattedAddress || query,
            lng,
            lat,
            source: 'amap',
          });
        });
      } catch {
        finish(null);
      }
    });
  } catch {
    return null;
  }
}

/** 解析任意地名 → WGS84 坐标。本地表优先，高德兜底；near 保留为调用兼容参数。 */
export async function resolvePlace(
  query: string,
  _opts?: { near?: [number, number] },
): Promise<GeoHit | null> {
  const raw = (query || '').trim();
  if (!raw) return null;

  const normalized = clean(raw);
  const local = geocodeCity(raw) || geocodeCity(normalized);
  if (local) return { ...local, source: 'local' };

  const cacheKey = normalized.toLowerCase();
  if (cacheKey in cache) return cache[cacheKey];

  const hit = await geocodeWithAmap(normalized);
  // 只缓存成功结果。定位权限、插件和网络的瞬时失败必须允许下次重试。
  if (hit) {
    cache[cacheKey] = hit;
    saveCache();
  }
  return hit;
}
