export interface MappingGeocodePoint { lat?: number; lng?: number }

function compact(value: string): string {
  return value.normalize('NFKC').replace(/[\s·・—－()（）]/g, '').toLowerCase();
}

export function isPlausibleMappingGeocode(
  candidateName: string,
  geocodeName: string,
  lat: number,
  lng: number,
  cityReferencePoints: MappingGeocodePoint[],
): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  const target = compact(candidateName);
  const hit = compact(geocodeName);
  if (!target || !hit || (!hit.includes(target) && !target.includes(hit))) return false;
  // “石头 → 石头河”这类两字短名极易把历史称谓扩成同城另一处 POI。
  // 没有本地地名志精确命中时，短名只接受地理服务的严格同名结果。
  if (target.length <= 2 && target !== hit) return false;

  const points = cityReferencePoints.filter((point): point is { lat: number; lng: number } => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (points.length < 3) return true;
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  // 约 75–85 km 的容差覆盖城市行政边缘，但会拒绝跨省同名 POI。
  const margin = 0.75;
  return lat >= Math.min(...lats) - margin
    && lat <= Math.max(...lats) + margin
    && lng >= Math.min(...lngs) - margin
    && lng <= Math.max(...lngs) + margin;
}
