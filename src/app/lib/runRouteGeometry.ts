import { distanceInMeters, routeDistance, type RoutePoint, type RunRouteShape } from './runRouteSkill';

export interface RunRouteGeometry {
  valid: boolean;
  repeated_distance_m: number;
  retraced_distance_m: number;
  longest_retrace_m: number;
  reason?: string;
}

/** Compare metre-spaced road samples, not provider vertex IDs: the return
 * direction often has completely different step/vertex segmentation. */
function roadOverlap(points: RoutePoint[]) {
  type Sample = { x: number; y: number; dx: number; dy: number; along: number };
  const cells = new Map<string, Sample[]>();
  const origin = points[0], scale = 111320 * Math.cos(origin[1] * Math.PI / 180);
  let along = 0, repeated = 0, retraced = 0, run = 0, longest = 0;
  for (let i = 1; i < points.length; i++) {
    const ax = (points[i - 1][0] - origin[0]) * scale, ay = (points[i - 1][1] - origin[1]) * 110540;
    const vx = (points[i][0] - points[i - 1][0]) * scale, vy = (points[i][1] - points[i - 1][1]) * 110540;
    const length = Math.hypot(vx, vy);
    if (length < .5) continue;
    const count = Math.ceil(length / 8), step = length / count;
    for (let j = 0; j < count; j++) {
      const sample: Sample = { x: ax + vx * (j + .5) / count, y: ay + vy * (j + .5) / count, dx: vx / length, dy: vy / length, along: along + step * (j + .5) };
      const cx = Math.floor(sample.x / 10), cy = Math.floor(sample.y / 10);
      let same = false, reverse = false;
      for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) {
        for (const prior of cells.get(`${x},${y}`) || []) {
          if (sample.along - prior.along < 40 || Math.hypot(sample.x - prior.x, sample.y - prior.y) > 8) continue;
          const dot = sample.dx * prior.dx + sample.dy * prior.dy;
          if (Math.abs(dot) > .9) same = true;
          if (dot < -.9) reverse = true;
        }
      }
      if (same) repeated += step;
      if (reverse) { retraced += step; run += step; longest = Math.max(longest, run); } else run = 0;
      const key = `${cx},${cy}`, bucket = cells.get(key) || [];
      bucket.push(sample); cells.set(key, bucket);
    }
    along += length;
  }
  return { repeated_distance_m: Math.round(repeated), retraced_distance_m: Math.round(retraced), longest_retrace_m: Math.round(longest) };
}

export function hasUsableLoopGeometry(points: RoutePoint[]): boolean {
  if (points.length < 4 || distanceInMeters(points[0], points.at(-1)!) > 40) return false;
  const origin = points[0], scale = 111320 * Math.cos(origin[1] * Math.PI / 180);
  const local = points.map(p => [(p[0] - origin[0]) * scale, (p[1] - origin[1]) * 110540]);
  let twiceArea = 0;
  for (let i = 1; i < local.length; i++) twiceArea += local[i - 1][0] * local[i][1] - local[i][0] * local[i - 1][1];
  const perimeter = routeDistance(points);
  return perimeter > 0 && Math.abs(twiceArea) / 2 / (perimeter * perimeter) >= .01;
}

/** A deliberate out-and-back may reuse its outbound road once, but neither
 * half may contain additional spurs. Single-way/loop routes get no exemption. */
export function assessRunRouteGeometry(points: RoutePoint[], shape: RunRouteShape, turnaroundIndex?: number): RunRouteGeometry {
  const empty = { valid: false, repeated_distance_m: 0, retraced_distance_m: 0, longest_retrace_m: 0 };
  if (points.length < 2 || points.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return { ...empty, reason: 'The road data for this route is incomplete. Please plan it again.' };
  if (shape === 'out_and_back') {
    // Legacy saved routes have no boundary. Their furthest point is only a
    // candidate boundary; both halves still have to pass the same checks.
    const turn = turnaroundIndex ?? points.reduce((best, p, i) => distanceInMeters(points[0], p) > distanceInMeters(points[0], points[best]) ? i : best, 0);
    if (turn < 1 || turn >= points.length - 1 || distanceInMeters(points[0], points.at(-1)!) > 40) return { ...empty, reason: 'The out-and-back route is missing a complete outbound or return leg. Please plan it again.' };
    const outbound = assessRunRouteGeometry(points.slice(0, turn + 1), 'one_way');
    const inbound = assessRunRouteGeometry(points.slice(turn), 'one_way');
    return { valid: outbound.valid && inbound.valid,
      repeated_distance_m: outbound.repeated_distance_m + inbound.repeated_distance_m,
      retraced_distance_m: outbound.retraced_distance_m + inbound.retraced_distance_m,
      longest_retrace_m: Math.max(outbound.longest_retrace_m, inbound.longest_retrace_m),
      ...(!outbound.valid || !inbound.valid ? { reason: 'One side of the out-and-back route contains extra side-street backtracking, so it was blocked. Please plan it again.' } : {}) };
  }
  const overlap = roadOverlap(points), length = routeDistance(points);
  if (overlap.longest_retrace_m > 45 || overlap.retraced_distance_m > Math.max(35, Math.min(70, length * .025))
    || overlap.repeated_distance_m > Math.max(50, Math.min(100, length * .04))) {
    return { valid: false, ...overlap, reason: 'This route contains obvious repeated road or side-street backtracking, so it cannot be used as a one-way or loop route. Please plan it again.' };
  }
  if (shape === 'loop' && !hasUsableLoopGeometry(points)) return { valid: false, ...overlap, reason: 'The roads do not form a complete loop. Please plan it again.' };
  return { valid: true, ...overlap };
}
