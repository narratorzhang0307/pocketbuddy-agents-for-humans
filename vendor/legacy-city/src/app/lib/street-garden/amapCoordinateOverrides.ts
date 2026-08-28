import overrideManifest from '../../data/amap-coordinate-overrides.json';
import admissionManifest from '../../data/amap-map-admission.json';

type Coordinate = [number, number];

type CoordinateOverride = {
  skillId: string;
  placeId: string;
  newWgs84: {
    lng: number;
    lat: number;
  };
};

const OVERRIDES = new Map(
  (overrideManifest.overrides as CoordinateOverride[])
    .map((entry) => [
      `${entry.skillId}:${entry.placeId}`,
      [entry.newWgs84.lng, entry.newWgs84.lat] as Coordinate,
    ]),
);

const WITHHELD = new Set(
  admissionManifest.records
    .filter((entry) => entry.admitted === false)
    .map((entry) => `${entry.skillId}:${entry.placeId}`),
);

export function isAmapMapAdmitted(skillId: string, placeId: string): boolean {
  return !WITHHELD.has(`${skillId}:${placeId}`);
}

export function resolveAmapVerifiedPosition(
  skillId: string,
  placeId: string,
  fallback: Coordinate,
): Coordinate {
  return OVERRIDES.get(`${skillId}:${placeId}`) ?? fallback;
}
