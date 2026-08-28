import {
  distanceInMeters,
  type RoutePoint,
} from '../spatial/amapWalkingRoute';

export type NearbyBloomCandidate = {
  id: string;
  position: RoutePoint;
};

export type NearbyBloomMatch<T extends NearbyBloomCandidate> = {
  bloom: T;
  distanceMeters: number;
};

export function findNearestBloomWithin<
  T extends NearbyBloomCandidate,
>(
  position: RoutePoint,
  blooms: readonly T[],
  radiusMeters: number,
): NearbyBloomMatch<T> | null {
  if (!Number.isFinite(radiusMeters) || radiusMeters < 0) return null;

  let nearest: NearbyBloomMatch<T> | null = null;
  for (const bloom of blooms) {
    const distanceMeters = distanceInMeters(position, bloom.position);
    if (
      distanceMeters <= radiusMeters &&
      (!nearest || distanceMeters < nearest.distanceMeters)
    ) {
      nearest = { bloom, distanceMeters };
    }
  }
  return nearest;
}
