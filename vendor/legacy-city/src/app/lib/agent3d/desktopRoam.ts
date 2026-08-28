import {
  distanceInMeters,
  type CircularRouteObstacle,
  type IndexedRoute,
  type RoutePoint,
} from '../spatial/amapWalkingRoute';

const LONGITUDE_METERS_AT_EQUATOR = 111_320;
const LATITUDE_METERS = 110_540;

/**
 * Converts the direction of the on-screen control disc into the yaw used by
 * the map character. Screen Y grows downward, so straight up is zero, right
 * is +90 degrees, down is 180 degrees and left is -90 degrees.
 */
export function screenHeadingFromControllerVector(x: number, y: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) < 0.001) {
    return null;
  }
  return Math.atan2(x, -y);
}

function offsetPosition(
  position: RoutePoint,
  eastMeters: number,
  northMeters: number,
): RoutePoint {
  const latitude = position[1] * (Math.PI / 180);
  return [
    position[0] +
      eastMeters / (LONGITUDE_METERS_AT_EQUATOR * Math.cos(latitude)),
    position[1] + northMeters / LATITUDE_METERS,
  ];
}

export function geographicHeadingBetween(
  from: RoutePoint,
  to: RoutePoint,
): number {
  const latitude = ((from[1] + to[1]) / 2) * (Math.PI / 180);
  const east =
    (to[0] - from[0]) * LONGITUDE_METERS_AT_EQUATOR * Math.cos(latitude);
  const north = (to[1] - from[1]) * LATITUDE_METERS;
  return Math.atan2(north, east);
}

export function nearestDistanceAlongRoute(
  position: RoutePoint,
  route: IndexedRoute,
): number {
  if (route.points.length === 0) return 0;
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  route.points.forEach((point, index) => {
    const distance = distanceInMeters(position, point);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });
  return route.cumulativeMeters[closestIndex] ?? 0;
}

export function advanceDesktopRoam(
  position: RoutePoint,
  headingRadians: number,
  distanceMeters: number,
  obstacles: readonly CircularRouteObstacle[],
): RoutePoint {
  if (!Number.isFinite(distanceMeters) || Math.abs(distanceMeters) < 0.001) {
    return position;
  }

  const direction = distanceMeters >= 0 ? 1 : -1;
  const travel = Math.abs(distanceMeters);
  const motionEast = Math.cos(headingRadians) * travel * direction;
  const motionNorth = Math.sin(headingRadians) * travel * direction;
  let candidate = offsetPosition(position, motionEast, motionNorth);

  for (const obstacle of obstacles) {
    const clearance = Math.max(0.5, obstacle.clearanceMeters + 1.2);
    if (distanceInMeters(candidate, obstacle.center) >= clearance) continue;

    const latitude = position[1] * (Math.PI / 180);
    const radialEast =
      (position[0] - obstacle.center[0]) *
      LONGITUDE_METERS_AT_EQUATOR *
      Math.cos(latitude);
    const radialNorth = (position[1] - obstacle.center[1]) * LATITUDE_METERS;
    const radialLength = Math.hypot(radialEast, radialNorth);

    // If a session starts inside a plant's clearance area, only allow an
    // outward move. This avoids trapping the character at legacy map anchors.
    if (radialLength < clearance) {
      const outwardDot = radialEast * motionEast + radialNorth * motionNorth;
      if (radialLength > 0.05 && outwardDot > 0) continue;
    }

    const normalEast = radialLength > 0.05 ? radialEast / radialLength : 1;
    const normalNorth = radialLength > 0.05 ? radialNorth / radialLength : 0;
    const tangentA = [-normalNorth, normalEast] as const;
    const tangentB = [normalNorth, -normalEast] as const;
    const tangent =
      tangentA[0] * motionEast + tangentA[1] * motionNorth >=
      tangentB[0] * motionEast + tangentB[1] * motionNorth
        ? tangentA
        : tangentB;
    candidate = offsetPosition(
      position,
      tangent[0] * travel,
      tangent[1] * travel,
    );

    if (distanceInMeters(candidate, obstacle.center) < clearance) {
      candidate = offsetPosition(
        obstacle.center,
        normalEast * (clearance + 0.2),
        normalNorth * (clearance + 0.2),
      );
    }
  }

  return candidate;
}
