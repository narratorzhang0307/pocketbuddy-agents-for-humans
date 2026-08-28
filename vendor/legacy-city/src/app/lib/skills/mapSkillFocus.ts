export interface SkillCoordinate {
  lng: number;
  lat: number;
}

export interface MapSkillFocus {
  lng: number;
  lat: number;
  zoom: number;
  pointCount: number;
}

export function isValidSkillCoordinate(
  point: Partial<SkillCoordinate> | null | undefined,
): point is SkillCoordinate {
  return Boolean(
    point &&
      Number.isFinite(point.lng) &&
      Number.isFinite(point.lat) &&
      point.lng! >= -180 &&
      point.lng! <= 180 &&
      point.lat! >= -90 &&
      point.lat! <= 90,
  );
}

function zoomForSpan(span: number): number {
  if (span > 40) return 3.2;
  if (span > 12) return 4.5;
  if (span > 3) return 6.2;
  if (span > 0.6) return 8.5;
  if (span > 0.12) return 11.2;
  return 13.6;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * A Skill can contain a dense group of useful places plus a few remote ones.
 * Using every point for the initial camera makes the dense group unreadable,
 * so larger collections open on their representative core. All points remain
 * loaded on the map and can still be reached by panning or zooming out.
 */
function representativeCore(points: readonly SkillCoordinate[]): SkillCoordinate[] {
  if (points.length <= 4) return [...points];

  const medianLng = median(points.map((point) => point.lng));
  const medianLat = median(points.map((point) => point.lat));
  const lngScale = Math.max(0.2, Math.cos((medianLat * Math.PI) / 180));
  const coreSize = Math.max(4, Math.ceil(points.length * 0.5));

  return [...points]
    .sort((a, b) => {
      const aLng = (a.lng - medianLng) * lngScale;
      const bLng = (b.lng - medianLng) * lngScale;
      const aDistance = aLng * aLng + (a.lat - medianLat) ** 2;
      const bDistance = bLng * bLng + (b.lat - medianLat) ** 2;
      return aDistance - bDistance;
    })
    .slice(0, coreSize);
}

/**
 * Turns a Skill-owned coordinate collection into one map-camera target.
 * Invalid records are ignored; an empty collection deliberately has no
 * fallback so a Skill with no user data never invents a location.
 */
export function focusFromSkillCoordinates(
  points: readonly (Partial<SkillCoordinate> | null | undefined)[],
): MapSkillFocus | null {
  const valid = points.filter(isValidSkillCoordinate);
  if (valid.length === 0) return null;

  const focusPoints = representativeCore(valid);
  const lngs = focusPoints.map((point) => point.lng);
  const lats = focusPoints.map((point) => point.lat);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const span = Math.max(maxLng - minLng, maxLat - minLat);

  return {
    lng: (minLng + maxLng) / 2,
    lat: (minLat + maxLat) / 2,
    zoom: zoomForSpan(span),
    pointCount: valid.length,
  };
}
