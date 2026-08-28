export type RoutePoint = [number, number];

export type IndexedRoute = {
  points: RoutePoint[];
  cumulativeMeters: number[];
  totalMeters: number;
};

type AmapWalkingStep = {
  path?: unknown[];
};

type WalkingRouteOptions = {
  timeoutMs?: number;
  maxSegmentMeters?: number;
  minRouteMeters?: number;
};

type SnappedWalkingRouteOptions = WalkingRouteOptions & {
  snapRadiiMeters?: number[];
  candidatesPerRing?: number;
};

export type CircularRouteObstacle = {
  center: RoutePoint;
  clearanceMeters: number;
  side?: -1 | 1;
  influenceMeters?: number;
};

type CircularRouteObstacleOptions = Omit<CircularRouteObstacle, 'center'>;

export function distanceInMeters(a: RoutePoint, b: RoutePoint) {
  const latitude = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const x = (a[0] - b[0]) * 111_320 * Math.cos(latitude);
  const y = (a[1] - b[1]) * 110_540;
  return Math.hypot(x, y);
}

function toRoutePoint(point: unknown): RoutePoint | null {
  if (Array.isArray(point)) {
    const lng = Number(point[0]);
    const lat = Number(point[1]);
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
  }
  if (!point || typeof point !== 'object') return null;
  const value = point as {
    lng?: number;
    lat?: number;
    getLng?: () => number;
    getLat?: () => number;
  };
  const lng = Number(value.getLng?.() ?? value.lng);
  const lat = Number(value.getLat?.() ?? value.lat);
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}

function densifyPath(points: RoutePoint[], maxSegmentMeters: number) {
  if (points.length < 2) return points;
  const dense: RoutePoint[] = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const segmentMeters = distanceInMeters(start, end);
    const divisions = Math.max(1, Math.ceil(segmentMeters / maxSegmentMeters));
    for (let division = 1; division <= divisions; division += 1) {
      const progress = division / divisions;
      dense.push([
        start[0] + (end[0] - start[0]) * progress,
        start[1] + (end[1] - start[1]) * progress,
      ]);
    }
  }
  return dense;
}

export function indexRoute(
  rawPoints: RoutePoint[],
  maxSegmentMeters = 3,
): IndexedRoute {
  const deduplicated = rawPoints.filter(
    (point, index, points) =>
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]) &&
      (index === 0 || distanceInMeters(point, points[index - 1]) > 0.12),
  );
  const points = densifyPath(deduplicated, Math.max(maxSegmentMeters, 0.5));
  const cumulativeMeters = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulativeMeters.push(
      cumulativeMeters[index - 1] + distanceInMeters(points[index - 1], points[index]),
    );
  }
  return {
    points,
    cumulativeMeters,
    totalMeters: cumulativeMeters[cumulativeMeters.length - 1] || 0,
  };
}

export function pointAlongRoute(route: IndexedRoute, distanceMeters: number): RoutePoint {
  const { points, cumulativeMeters, totalMeters } = route;
  if (points.length === 0) return [0, 0];
  if (points.length === 1 || totalMeters <= 0) return points[0];

  const distance = Math.min(Math.max(distanceMeters, 0), totalMeters);
  let low = 1;
  let high = cumulativeMeters.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (cumulativeMeters[middle] < distance) low = middle + 1;
    else high = middle;
  }

  const segmentIndex = low;
  const segmentStart = cumulativeMeters[segmentIndex - 1];
  const segmentMeters = Math.max(
    cumulativeMeters[segmentIndex] - segmentStart,
    0.001,
  );
  const progress = (distance - segmentStart) / segmentMeters;
  return [
    points[segmentIndex - 1][0] +
      (points[segmentIndex][0] - points[segmentIndex - 1][0]) * progress,
    points[segmentIndex - 1][1] +
      (points[segmentIndex][1] - points[segmentIndex - 1][1]) * progress,
  ];
}

export function trimRoute(
  route: IndexedRoute,
  startMeters: number,
  endMeters = 0,
): IndexedRoute {
  const start = Math.min(Math.max(startMeters, 0), route.totalMeters);
  const end = Math.max(start, route.totalMeters - Math.max(endMeters, 0));
  if (end - start < 1) return route;

  const points: RoutePoint[] = [pointAlongRoute(route, start)];
  route.points.forEach((point, index) => {
    const distance = route.cumulativeMeters[index];
    if (distance > start && distance < end) points.push(point);
  });
  points.push(pointAlongRoute(route, end));
  return indexRoute(points);
}

// 把道路折线中穿过圆形占地的部分替换为一段同半径圆弧。角色、宠物和
// 地图对象仍共享经纬度路线；这里改变的是运动路径，不是屏幕上的视觉偏移。
export function avoidCircularRouteObstacle(
  route: IndexedRoute,
  obstacle: RoutePoint,
  {
    clearanceMeters,
    side = 1,
    influenceMeters = clearanceMeters + 6,
  }: CircularRouteObstacleOptions,
): IndexedRoute {
  if (route.points.length < 2 || clearanceMeters <= 0) return route;

  const latitude = obstacle[1] * (Math.PI / 180);
  const metersPerLongitude = 111_320 * Math.max(Math.cos(latitude), 0.2);
  const toLocal = (point: RoutePoint): [number, number] => [
    (point[0] - obstacle[0]) * metersPerLongitude,
    (point[1] - obstacle[1]) * 110_540,
  ];
  const toGeo = ([x, y]: [number, number]): RoutePoint => [
    obstacle[0] + x / metersPerLongitude,
    obstacle[1] + y / 110_540,
  ];
  const distances = route.points.map((point) => {
    const [x, y] = toLocal(point);
    return Math.hypot(x, y);
  });
  const firstInside = distances.findIndex(
    (distance) => distance < influenceMeters,
  );
  if (firstInside < 0) return route;

  let lastInside = firstInside;
  while (
    lastInside + 1 < distances.length &&
    distances[lastInside + 1] < influenceMeters
  ) {
    lastInside += 1;
  }
  const entryIndex = Math.max(0, firstInside - 1);
  const exitIndex = Math.min(route.points.length - 1, lastInside + 1);
  if (entryIndex === exitIndex) return route;

  const entry = toLocal(route.points[entryIndex]);
  const exit = toLocal(route.points[exitIndex]);
  const entryAngle = Math.atan2(entry[1], entry[0]);
  const exitAngle = Math.atan2(exit[1], exit[0]);
  const fullTurn = Math.PI * 2;
  const counterClockwise =
    ((exitAngle - entryAngle) % fullTurn + fullTurn) % fullTurn;
  const clockwise = counterClockwise - fullTurn;
  const pathDirection: [number, number] = [exit[0] - entry[0], exit[1] - entry[1]];
  const directionLength = Math.max(Math.hypot(...pathDirection), 0.001);
  const preferredNormal: [number, number] = [
    (-pathDirection[1] / directionLength) * side,
    (pathDirection[0] / directionLength) * side,
  ];
  const midpointScore = (delta: number) => {
    const angle = entryAngle + delta / 2;
    return (
      Math.cos(angle) * preferredNormal[0] +
      Math.sin(angle) * preferredNormal[1]
    );
  };
  const arcDelta =
    midpointScore(counterClockwise) >= midpointScore(clockwise)
      ? counterClockwise
      : clockwise;
  const arcSteps = Math.max(
    5,
    Math.ceil((Math.abs(arcDelta) * clearanceMeters) / 2.5),
  );
  const detour: RoutePoint[] = [];
  for (let step = 0; step <= arcSteps; step += 1) {
    const angle = entryAngle + arcDelta * (step / arcSteps);
    detour.push(
      toGeo([
        Math.cos(angle) * clearanceMeters,
        Math.sin(angle) * clearanceMeters,
      ]),
    );
  }

  return indexRoute([
    ...route.points.slice(0, entryIndex + 1),
    ...detour,
    ...route.points.slice(exitIndex),
  ]);
}

export function avoidCircularRouteObstacles(
  route: IndexedRoute,
  obstacles: readonly CircularRouteObstacle[],
): IndexedRoute {
  return obstacles.reduce(
    (safeRoute, obstacle) =>
      avoidCircularRouteObstacle(safeRoute, obstacle.center, obstacle),
    route,
  );
}

// 往返路线在终点处沿原路折返，并在起点无缝重新开始，避免循环时瞬移。
export function createPatrolRoute(route: IndexedRoute): IndexedRoute {
  if (route.points.length < 2) return route;
  return indexRoute([
    ...route.points,
    ...route.points.slice(0, -1).reverse(),
  ]);
}

export function loopRouteDistance(distanceMeters: number, totalMeters: number) {
  if (totalMeters <= 0) return 0;
  return ((distanceMeters % totalMeters) + totalMeters) % totalMeters;
}

export function createNearbyRouteTargets(
  destination: RoutePoint,
  radiusMeters: number,
  count = 8,
): RoutePoint[] {
  const latitude = destination[1] * (Math.PI / 180);
  return Array.from({ length: Math.max(4, count) }, (_, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(4, count);
    return [
      destination[0] +
        (Math.cos(angle) * radiusMeters) /
          (111_320 * Math.max(Math.cos(latitude), 0.2)),
      destination[1] + (Math.sin(angle) * radiusMeters) / 110_540,
    ];
  });
}

// 只取规划结果，不把高德默认路线、图标或面板加到地图上。
export function requestAmapWalkingRoute(
  AMap: any,
  start: RoutePoint,
  destination: RoutePoint,
  options: WalkingRouteOptions = {},
): Promise<IndexedRoute | null> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxSegmentMeters = options.maxSegmentMeters ?? 3;
  const minRouteMeters = options.minRouteMeters ?? 20;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (route: IndexedRoute | null) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      resolve(route);
    };
    const timeout = globalThis.setTimeout(() => finish(null), timeoutMs);

    try {
      AMap.plugin('AMap.Walking', () => {
        try {
          const walking = new AMap.Walking();
          walking.search(start, destination, (status: string, result: any) => {
            if (status !== 'complete') {
              finish(null);
              return;
            }
            const steps = result?.routes?.[0]?.steps as AmapWalkingStep[] | undefined;
            if (!Array.isArray(steps)) {
              finish(null);
              return;
            }
            const points = steps
              .flatMap((step) => step.path || [])
              .map(toRoutePoint)
              .filter((point): point is RoutePoint => point !== null);
            const route = indexRoute(points, maxSegmentMeters);
            finish(
              route.points.length >= 2 && route.totalMeters >= minRouteMeters
                ? route
                : null,
            );
          });
        } catch {
          finish(null);
        }
      });
    } catch {
      finish(null);
    }
  });
}

function firstAvailableRoute(
  AMap: any,
  start: RoutePoint,
  candidates: RoutePoint[],
  options: WalkingRouteOptions,
) {
  return new Promise<IndexedRoute | null>((resolve) => {
    let remaining = candidates.length;
    let settled = false;
    if (remaining === 0) {
      resolve(null);
      return;
    }
    candidates.forEach((candidate) => {
      requestAmapWalkingRoute(AMap, start, candidate, options).then((route) => {
        remaining -= 1;
        if (!settled && route) {
          settled = true;
          resolve(route);
          return;
        }
        if (!settled && remaining === 0) resolve(null);
      });
    });
  });
}

// 用户可以点建筑、绿地边缘或道路外的任意位置。高德步行服务拒绝直达时，
// 逐圈探测附近候选点，把目标吸附到最先找到的可步行道路，而不是画穿越障碍的直线。
export async function requestAmapWalkingRouteNearDestination(
  AMap: any,
  start: RoutePoint,
  destination: RoutePoint,
  options: SnappedWalkingRouteOptions = {},
): Promise<IndexedRoute | null> {
  const perAttemptTimeout = options.timeoutMs ?? 4_500;
  const direct = await requestAmapWalkingRoute(AMap, start, destination, {
    ...options,
    timeoutMs: perAttemptTimeout,
  });
  if (direct) return direct;

  const {
    snapRadiiMeters = [18, 36, 58],
    candidatesPerRing = 8,
    ...routeOptions
  } = options;
  for (const radius of snapRadiiMeters) {
    const route = await firstAvailableRoute(
      AMap,
      start,
      createNearbyRouteTargets(destination, radius, candidatesPerRing),
      { ...routeOptions, timeoutMs: perAttemptTimeout },
    );
    if (route) return route;
  }
  return null;
}
