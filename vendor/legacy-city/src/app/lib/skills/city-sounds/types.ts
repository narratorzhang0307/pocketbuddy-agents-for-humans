export type SoundCategory = 'bird' | 'nature' | 'city' | 'human' | 'music' | 'other';

export interface SoundLocation {
  /** 浏览器 Geolocation API 的 WGS84 纬度；CityMapRuntime 负责高德边界转换。 */
  lat: number;
  /** 浏览器 Geolocation API 的 WGS84 经度；CityMapRuntime 负责高德边界转换。 */
  lng: number;
  accuracy: number;
}

export interface BrowserLocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/**
 * 浏览器 GPS 本身是 WGS84；这里刻意只做字段映射，不能在保存前转成 GCJ-02。
 * CityMapRuntime 是全站唯一的「业务 WGS84 → 高德 GCJ-02」渲染边界。
 */
export function browserLocationToSoundLocation(
  coordinates: BrowserLocationCoordinates,
): SoundLocation {
  return {
    lat: coordinates.latitude,
    lng: coordinates.longitude,
    accuracy: Math.max(0, coordinates.accuracy),
  };
}

export interface BirdIdentity {
  status: 'pending' | 'suggested' | 'confirmed';
  commonName?: string;
  scientificName?: string;
  confidence?: number;
  source?: 'human' | 'model';
}

export interface SoundObservation {
  id: string;
  title: string;
  category: SoundCategory;
  note: string;
  recordedAt: string;
  durationMs: number;
  mimeType: string;
  byteSize: number;
  location?: SoundLocation;
  bird?: BirdIdentity;
}

export interface StoredSoundBlob {
  id: string;
  blob: Blob;
}

export const SOUND_CATEGORY_LABEL: Record<SoundCategory, string> = {
  bird: '鸟鸣',
  nature: '自然',
  city: '城市',
  human: '人声',
  music: '音乐',
  other: '其他',
};

export const SOUND_CATEGORY_GLYPH: Record<SoundCategory, string> = {
  bird: '鸟',
  nature: '野',
  city: '街',
  human: '人',
  music: '音',
  other: '声',
};

export const SOUND_CATEGORY_COLOR: Record<SoundCategory, string> = {
  bird: '#ffcc57',
  nature: '#7bdc78',
  city: '#ff956d',
  human: '#b7a5ff',
  music: '#ff7e8d',
  other: '#54d6c7',
};

export function isValidSoundLocation(value: SoundLocation | undefined): value is SoundLocation {
  return !!value
    && Number.isFinite(value.lat)
    && Number.isFinite(value.lng)
    && value.lat >= -90
    && value.lat <= 90
    && value.lng >= -180
    && value.lng <= 180
    && Number.isFinite(value.accuracy)
    && value.accuracy >= 0;
}

export function formatSoundDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
