import { loadAmap } from './amap';
import { assessRunRouteGeometry, type RunRouteGeometry } from './runRouteGeometry';
export { hasUsableLoopGeometry } from './runRouteGeometry';
import { distanceInMeters, readRunRouteSession, routeDistance, runRouteDistanceMatches, runRouteDistanceTolerance, targetDistanceMeters, updateRunRouteSession,
  type RoutePoint, type RunRouteCue, type RunRouteSession, type RunRouteShape } from './runRouteSkill';

type AmapNamespace = {
  Polyline: new (options: Record<string, unknown>) => { setPath(path: RoutePoint[]): void; setMap(map: unknown): void };
  Marker: new (options: Record<string, unknown>) => { setPosition(point: RoutePoint): void; setMap(map: unknown): void };
  LngLat: new (longitude: number, latitude: number) => unknown;
  Walking: new () => { search(start: unknown, destination: unknown, callback: (status: string, result: unknown) => void): void };
  PlaceSearch: new (options: Record<string, unknown>) => {
    search(query: string, callback: (status: string, result: unknown) => void): void;
    searchNearBy(query: string, center: RoutePoint, radius: number, callback: (status: string, result: unknown) => void): void;
  };
  plugin(names: string | string[], callback: () => void): void;
  convertFrom?: (position: RoutePoint, type: string, callback: (status: string, result: { locations?: unknown[] }) => void) => void;
};

export interface WalkingLeg {
  points: RoutePoint[];
  distance_m: number;
  cues: RunRouteCue[];
  crossings: number;
}
interface RoutePlan extends WalkingLeg {
  destination: RoutePoint;
  destination_label?: string;
  shape: RunRouteShape;
  warnings: string[];
  via: string[];
  turnaround_index?: number;
  geometry?: RunRouteGeometry;
}
type Place = { position: RoutePoint; label: string; type?: string; city?: string };
export const routePlaceAvailable = (label: string): boolean => !/暂停开放|暂停营业|停止营业|永久关闭|暂时关闭|施工封闭/.test(label);

const naturalPlaceQuery = (query: string) => /湖|公园|绿道|湿地|景区|风景|滨江|江边|河边|海边|山$/.test(query);
const naturalPlaceType = (type: string) => /风景名胜|公园|景点|湖泊|河流|山峰|自然地名/.test(type);
const normalizePlaceName = (text: string) => text.replace(/[\s·（）()\-]/g, '').replace(/市$/, '');

/** A nearby substring hit (e.g. the business 村上西湖) is not the requested lake. */
export function selectRunRoutePlace(query: string, places: Place[], near?: RoutePoint): Place | undefined {
  const ranked = places.flatMap(place => {
    if (!routePlaceAvailable(place.label)) return [];
    const city = normalizePlaceName(place.city || '');
    const stripCity = (text: string) => { const name = normalizePlaceName(text); return city && name.startsWith(city) ? name.slice(city.length).replace(/^市/, '') : name; };
    const name = stripCity(place.label), wanted = stripCity(query), exact = name === wanted;
    if (!wanted || !name.includes(wanted)) return [];
    const natural = naturalPlaceType(place.type || '');
    if (naturalPlaceQuery(wanted) && !exact) {
      const suffix = name.startsWith(wanted) ? name.slice(wanted.length) : '';
      // A scenic POI category can also contain sightseeing buses and ticket
      // offices. Require the landmark name itself, not just its substring.
      if (!natural || !/^(风景名胜区|风景区|景区|公园|湿地公园|国家湿地公园|湖区)/.test(suffix)) return [];
      if (/观光巴士|游船|售票|停车|服务中心|游客中心|旅行社|酒店|餐厅/.test(suffix)) return [];
    }
    return [{ place, score: (exact ? 100 : 50) + (naturalPlaceQuery(wanted) && natural ? 80 : 0), distance: near ? distanceInMeters(near, place.position) : 0 }];
  }).sort((a, b) => b.score - a.score || a.distance - b.distance);
  return ranked[0]?.place;
}

function pointFromUnknown(value: unknown): RoutePoint | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as { lng?: number; lat?: number; getLng?: () => number; getLat?: () => number };
  const lng = Number(Array.isArray(value) ? value[0] : p.getLng?.() ?? p.lng);
  const lat = Number(Array.isArray(value) ? value[1] : p.getLat?.() ?? p.lat);
  return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90 ? [lng, lat] : null;
}

/** Preserve AMap step endpoints; no LLM invents turns or road coordinates. */
export function parseAmapWalkingResult(result: unknown): WalkingLeg | null {
  const route = (result as { routes?: Array<{ distance?: number; steps?: Array<{ path?: unknown[]; instruction?: string; action?: string }> }> })?.routes?.[0];
  if (!route?.steps?.length) return null;
  const points: RoutePoint[] = [], cues: RunRouteCue[] = [];
  let crossings = 0;
  for (const step of route.steps) {
    if (!Array.isArray(step.path) || step.path.length < 2) return null;
    const path = step.path.map(pointFromUnknown);
    if (path.some(p => !p)) return null;
    if (points.length && distanceInMeters(points[points.length - 1], path[0]!) > 35) return null;
    for (const p of path as RoutePoint[]) if (!points.length || distanceInMeters(points[points.length - 1], p) > 0.5) points.push(p);
    const instruction = String(step.instruction || '');
    const action = String(step.action || '');
    if (/过马路|人行横道|红绿灯|穿过.*路口/.test(instruction)) crossings++;
    const turn = action.match(/向[左右](?:前|后)方|[左右]转(?:调头)?|直行|靠[左右]|进入环岛|离开环岛|通过人行横道/)?.[0]
      || instruction.match(/(?:然后|后|米)([左右]转|向[左右]前方|直行|通过人行横道)/)?.[1];
    if (turn) cues.push({ id: `step-${cues.length}`, point_index: points.length - 1, instruction: turn, source: 'amap' });
  }
  if (points.length < 2 || points.length > 30_000) return null;
  const distance = Number(route.distance);
  return { points, distance_m: Number.isFinite(distance) && distance > 0 ? distance : routeDistance(points), cues, crossings };
}

let nextWalkingRequestAt = 0;
async function requestWalking(AMap: AmapNamespace, start: RoutePoint, end: RoutePoint, signal: AbortSignal): Promise<WalkingLeg | null> {
  signal.throwIfAborted();
  const wait = Math.max(0, nextWalkingRequestAt - Date.now());
  nextWalkingRequestAt = Date.now() + wait + 1100;
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value: WalkingLeg | null, error?: Error) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value);
    };
    const abort = () => finish(null, new Error('Route planning was cancelled'));
    const timer = setTimeout(() => finish(null), 8000);
    signal.addEventListener('abort', abort, { once: true });
    AMap.plugin('AMap.Walking', () => {
      if (settled || signal.aborted) return;
      try {
        new AMap.Walking().search(new AMap.LngLat(...start), new AMap.LngLat(...end), (status, result) => {
          if (settled) return;
          const detail = String(typeof result === 'string' ? result : (result as { info?: string })?.info || '');
          if (/EXCEEDED|INVALID_USER|INVALID_KEY|SERVICE_NOT_AVAILABLE|INSUFFICIENT_PRIVILEGES/.test(detail)) return finish(null, new Error('The AMap routing service is rate-limited or the key has no permission. Check the configuration or try again later.'));
          finish(status === 'complete' ? parseAmapWalkingResult(result) : null);
        });
      } catch { finish(null); }
    });
  });
}

function placesFromResult(result: unknown): Place[] {
  const pois = (result as { poiList?: { pois?: Array<{ name?: string; location?: unknown; type?: string; cityname?: string }> } })?.poiList?.pois || [];
  return pois.flatMap(poi => { const position = pointFromUnknown(poi.location); return position && routePlaceAvailable(poi.name || '') ? [{ position, label: poi.name || 'AMap place', type: poi.type, city: poi.cityname }] : []; });
}

async function searchPlaces(AMap: AmapNamespace, query: string, signal: AbortSignal, near?: RoutePoint, radius = 50_000, type?: string): Promise<Place[]> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (places: Place[], error?: Error) => { if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort); if (error) reject(error); else resolve(places); };
    const abort = () => finish([]);
    const timer = setTimeout(() => finish([], new Error('The AMap place lookup timed out. Check the network and try again.')), 12000);
    signal.addEventListener('abort', abort, { once: true });
    AMap.plugin('AMap.PlaceSearch', () => {
      if (settled || signal.aborted) return;
      try {
        const search = new AMap.PlaceSearch({ pageSize: 25, extensions: 'all', ...(type ? { type } : {}) });
        const callback = (status: string, result: unknown) => {
          if (status === 'error') {
            const info = String(typeof result === 'string' ? result : (result as { info?: string })?.info || 'service_error').replace(/[^A-Za-z0-9_]/g, '').slice(0, 80);
            finish([], new Error(`The AMap place service is unavailable (${info}). Check the key, the service proxy and the network configuration.`));
          } else finish(status === 'complete' ? placesFromResult(result) : []);
        };
        if (near) search.searchNearBy(query, near, radius, callback);
        else search.search(query, callback);
      } catch { finish([], new Error('The AMap place lookup component is unavailable. Refresh and try again.')); }
    });
  });
}

function coordinateAt(origin: RoutePoint, distance: number, degrees: number): RoutePoint {
  const radians = degrees * Math.PI / 180;
  return [origin[0] + Math.sin(radians) * distance / (111_320 * Math.max(Math.cos(origin[1] * Math.PI / 180), .2)), origin[1] + Math.cos(radians) * distance / 110_540];
}

/** Join only connected walking legs, including a separately queried return leg. */
export function joinWalkingLegs(legs: WalkingLeg[]): WalkingLeg | null {
  const points: RoutePoint[] = [], cues: RunRouteCue[] = [], junctions: number[] = [];
  for (const leg of legs) {
    if (points.length && distanceInMeters(points[points.length - 1], leg.points[0]) > 35) return null;
    if (points.length) junctions.push(points.length - 1);
    const skip = points.length && distanceInMeters(points[points.length - 1], leg.points[0]) < .5 ? 1 : 0;
    const offset = points.length - skip;
    points.push(...leg.points.slice(skip));
    // A leg can itself be an already-joined outbound route. Its arrival must
    // not suppress the junction/turn-around cue when another leg follows.
    cues.push(...leg.cues.filter(cue => cue.source !== 'arrival').map(cue => ({ ...cue, point_index: cue.point_index + offset })));
  }
  if (points.length < 2) return null;
  // Intermediate waypoint arrivals are not the run's finish. Determine only
  // their junction direction from adjacent, real road segments.
  for (const index of junctions) {
    if (index < 1 || index >= points.length - 1 || cues.some(c => Math.abs(c.point_index - index) <= 1)) continue;
    const a = points[index - 1], b = points[index], c = points[index + 1];
    const heading = (p: RoutePoint, q: RoutePoint) => Math.atan2((q[0] - p[0]) * Math.cos(b[1] * Math.PI / 180), q[1] - p[1]);
    const angle = Math.atan2(Math.sin(heading(b, c) - heading(a, b)), Math.cos(heading(b, c) - heading(a, b))) * 180 / Math.PI;
    if (Math.abs(angle) > 40) cues.push({ id: 'junction', point_index: index, instruction: Math.abs(angle) > 150 ? 'Turn around where it is safe and follow the planned road back' : angle > 0 ? 'Turn right' : 'Turn left', source: 'geometry' });
  }
  cues.sort((a, b) => a.point_index - b.point_index);
  cues.push({ id: 'arrival', point_index: points.length - 1, instruction: 'You have reached the end of this leg of the running route. Please stop safely', source: 'arrival' });
  return { points, cues: cues.map((cue, i) => ({ ...cue, id: `cue-${i}` })), distance_m: legs.reduce((n, leg) => n + leg.distance_m, 0), crossings: legs.reduce((n, leg) => n + leg.crossings, 0) };
}

async function through(AMap: AmapNamespace, waypoints: RoutePoint[], signal: AbortSignal, cache?: Map<string, Promise<WalkingLeg | null>>): Promise<WalkingLeg | null> {
  const legs: WalkingLeg[] = [];
  for (let i = 1; i < waypoints.length; i++) {
    const key = `${waypoints[i - 1].join(',')}>${waypoints[i].join(',')}`;
    let request = cache?.get(key);
    if (!request) { request = requestWalking(AMap, waypoints[i - 1], waypoints[i], signal); cache?.set(key, request); }
    const leg = await request;
    if (!leg) return null;
    legs.push(leg);
  }
  return joinWalkingLegs(legs);
}

export function scoreRunRoute(plan: WalkingLeg, target: number, lowCrossings: boolean): number {
  return Math.abs(plan.distance_m - target) / target * 100 + (lowCrossings ? plan.crossings * 8 + plan.cues.length * .5 : 0);
}

async function destinationRoute(AMap: AmapNamespace, session: RunRouteSession, start: RoutePoint, place: Place, signal: AbortSignal): Promise<{ plan: RoutePlan; candidates: number }> {
  const back = session.input.shape === 'out_and_back', end = place.position;
  const cache = new Map<string, Promise<WalkingLeg | null>>();
  const route = async (vias: RoutePoint[] = []): Promise<RoutePlan | null> => {
    const outbound = await through(AMap, [start, ...vias, end], signal, cache);
    if (!outbound) return null;
    const inbound = back ? await through(AMap, [end, ...[...vias].reverse(), start], signal, cache) : undefined;
    const leg = back ? inbound && joinWalkingLegs([outbound, inbound]) : outbound;
    if (!leg) return null;
    const shape = back ? 'out_and_back' : 'one_way';
    const turnaround_index = back ? outbound.points.length - 1 : undefined;
    return { ...leg, destination: back ? start : end, destination_label: place.label, shape, warnings: [], via: [place.label],
      turnaround_index, geometry: assessRunRouteGeometry(leg.points, shape, turnaround_index) };
  };
  const direct = await route();
  if (!direct) throw new Error('AMap did not return a complete walkable route. Please try another place.');
  const target = targetDistanceMeters(session.input.goal);
  if (!target) {
    if (!direct.geometry!.valid) throw new Error(direct.geometry!.reason);
    return { plan: direct, candidates: 1 };
  }
  if (direct.geometry!.valid && runRouteDistanceMatches(target, direct.distance_m)) return { plan: direct, candidates: 1 };
  if (direct.distance_m > target + runRouteDistanceTolerance(target)) {
    throw new Error(`The AMap ${back ? 'out-and-back' : 'direct'} road to “${place.label}” is already about ${(direct.distance_m / 1000).toFixed(2)} km, more than the ${(target / 1000).toFixed(2)} km target. Increase the distance, choose a closer start, or run near the destination instead; your distance requirement was not ignored.`);
  }

  const center: RoutePoint = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  const separation = distanceInMeters(start, end);
  const heading = Math.atan2((end[0] - start[0]) * Math.cos(center[1] * Math.PI / 180), end[1] - start[1]) * 180 / Math.PI;
  const stretch = Math.max(1, Math.min(2, direct.distance_m / Math.max(50, separation) / (back ? 2 : 1)));
  const initialRadius = Math.max(80, (back ? (target - direct.distance_m) / 4 : (target - direct.distance_m * .3) / 3) / stretch);
  const candidates: RoutePlan[] = direct.geometry!.valid ? [direct] : [];
  let rejected = direct.geometry!.valid ? 0 : 1;
  const rejectedDetails: string[] = [];
  // Broad tour seeds (as in GraphHopper's round-trip architecture) avoid the
  // narrow corridor that snaps both waypoints onto one road and produces a T.
  // AMap exposes no visited-edge penalty, so validate each returned road before
  // mileage scoring. Coordinates remain queries, never drawn route segments.
  for (let seed = 0; seed < 4; seed++) {
    const bearing = [heading + 180, heading + 90, heading - 90, heading][seed];
    let radius = initialRadius;
    let lower = { radius: 0, distance: direct.distance_m }, upper: typeof lower | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      signal.throwIfAborted();
      // Explicit out-and-back spends only half its budget on the outbound leg;
      // bend that corridor, then independently route back over its waypoints.
      const fraction = seed < 2 ? .2 : 0;
      const anchor = (t: number): RoutePoint => [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
      const vias = back
        ? [coordinateAt(anchor(fraction), radius, heading + (seed % 2 ? -90 : 90)), coordinateAt(anchor(1 - fraction), radius, heading + (seed % 2 ? -90 : 90))]
        : [coordinateAt(start, radius, bearing - 30), coordinateAt(start, radius, bearing + 30)];
      const leg = await route(vias);
      if (!leg) { radius *= .7; continue; }
      if (leg.geometry!.valid) candidates.push(leg); else {
        rejected++;
        if (rejectedDetails.length < 3) rejectedDetails.push(`${(leg.distance_m / 1000).toFixed(2)} km candidate: about ${leg.geometry!.repeated_distance_m} m of repeated road and ${leg.geometry!.longest_retrace_m} m of continuous backtracking, so it was discarded.`);
      }
      if (leg.geometry!.valid && runRouteDistanceMatches(target, leg.distance_m)) break;
      if (leg.distance_m < target) lower = { radius, distance: leg.distance_m };
      else upper = { radius, distance: leg.distance_m };
      const next = upper && upper.distance > lower.distance
        ? lower.radius + (target - lower.distance) / (upper.distance - lower.distance) * (upper.radius - lower.radius)
        : radius * (target - direct.distance_m) / Math.max(50, leg.distance_m - direct.distance_m);
      // A road may snap several nearby queries onto the same junction. Move the
      // query far enough to test a different road, within a bounded search area.
      radius = Math.max(50, Math.min(target / 2, Math.abs(next - radius) < 25 ? radius + (leg.distance_m < target ? 60 : -60) : next));
    }
    if (candidates.some(leg => runRouteDistanceMatches(target, leg.distance_m))) break;
  }
  candidates.sort((a, b) => Number(!runRouteDistanceMatches(target, a.distance_m)) - Number(!runRouteDistanceMatches(target, b.distance_m))
    || scoreRunRoute(a, target, session.input.preferences.includes('low_crossings')) - scoreRunRoute(b, target, session.input.preferences.includes('low_crossings')));
  const best = candidates[0];
  if (!best) throw new Error('Every candidate road contained obvious side-street backtracking, so no distance-padding route was generated. Adjust the distance or the start, or explicitly choose out-and-back.');
  const warnings = ['Waypoint legs were queried to match the total distance; every leg comes from an AMap walking road, and scenery and opening status still need to be confirmed on site.'];
  if (rejected) warnings.push(`Discarded ${rejected} candidate(s) with obvious repeated road or side-street backtracking; backtracking was not used to pad the distance.`);
  warnings.push(...rejectedDetails);
  if (!runRouteDistanceMatches(target, best.distance_m)) warnings.push(`No road combination met the ${(target / 1000).toFixed(2)} km target; the closest result is ${(best.distance_m / 1000).toFixed(2)} km. It will not start automatically, so adjust the conditions or confirm explicitly.`);
  return { plan: { ...best, warnings }, candidates: candidates.length };
}

async function planRoute(AMap: AmapNamespace, session: RunRouteSession, start: RoutePoint, signal: AbortSignal): Promise<{ plan: RoutePlan; candidates: number }> {
  if (session.input.goal.type === 'destination') {
    const query = session.input.goal.query;
    const places = await searchPlaces(AMap, query, signal, start, 50_000, naturalPlaceQuery(query) ? '风景名胜|地名地址信息' : undefined);
    let place = selectRunRoutePlace(query, places, start);
    if (!place) place = selectRunRoutePlace(query, await searchPlaces(AMap, query, signal), start);
    if (!place) throw new Error(`No place matching the meaning of “${query}” was found, and a merchant with only a similar name was not used. Please add the city or a specific entrance.`);
    if (distanceInMeters(start, place.position) > 50_000) throw new Error('The destination is more than 50 km from the start. Please confirm the city and the place.');
    return destinationRoute(AMap, session, start, place, signal);
  }
  const target = targetDistanceMeters(session.input.goal)!;
  const preferences = session.input.preferences;
  const poiQuery = preferences.includes('lakeside') ? '滨水公园|湖滨公园|滨江公园' : preferences.includes('scenic') ? '公园|绿道' : '';
  const pois = poiQuery ? (await searchPlaces(AMap, poiQuery, signal, start, Math.min(12_000, Math.round(target / 2))))
    .filter(p => distanceInMeters(start, p.position) < target * .35 && distanceInMeters(start, p.position) > target * .08) : [];
  const candidates: RoutePlan[] = [];
  let calibration: { bearing: number; scale: number; error: number } | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt === 2 && (!calibration || calibration.error <= .2)) break;
    const shape = session.input.shape;
    const via = attempt < 2 ? pois[attempt] : undefined;
    const bearing = attempt === 2 ? calibration!.bearing : attempt === 0 ? 45 : 210;
    const scaledTarget = target * (attempt === 2 ? Math.max(.5, Math.min(1.8, calibration!.scale)) : 1);
    const a = via?.position || coordinateAt(start, scaledTarget / (shape === 'one_way' ? 1.25 : shape === 'loop' ? 4.1 : 2.6), bearing);
    const b = coordinateAt(start, scaledTarget / 4.1, bearing + 65);
    const waypoints = shape === 'one_way' ? [start, a] : shape === 'out_and_back' ? [start, a, start] : [start, a, b, start];
    const leg = await through(AMap, waypoints, signal);
    if (!leg || leg.distance_m > target * 2 || leg.distance_m < target * .4) continue;
    const geometry = assessRunRouteGeometry(leg.points, shape);
    if (!geometry.valid) continue;
    const error = Math.abs(leg.distance_m - target) / target;
    if (!calibration || error < calibration.error) calibration = { bearing, scale: target / leg.distance_m, error };
    candidates.push({ ...leg, destination: waypoints[waypoints.length - 1], shape, geometry, warnings: [], via: via ? [via.label] : [] });
  }
  if (!candidates.length && session.input.shape === 'loop') {
    const leg = await through(AMap, [start, coordinateAt(start, target / 2.6, 90), start], signal);
    if (leg && leg.distance_m <= target * 2 && leg.distance_m >= target * .4 && assessRunRouteGeometry(leg.points, 'out_and_back').valid) candidates.push({ ...leg, destination: start, shape: 'out_and_back', warnings: ['No suitable complete loop was found here, so this is an out-and-back route instead. Please confirm it before you run.'], via: [] });
  }
  if (!candidates.length) throw new Error('No complete walking route matching that distance was found nearby. Please adjust the distance or the start.');
  candidates.sort((a, b) => Number(!runRouteDistanceMatches(target, a.distance_m)) - Number(!runRouteDistanceMatches(target, b.distance_m))
    || scoreRunRoute(a, target, preferences.includes('low_crossings')) - scoreRunRoute(b, target, preferences.includes('low_crossings')));
  const plan = candidates[0];
  if (!runRouteDistanceMatches(target, plan.distance_m)) plan.warnings.push(`Road coverage limited the plan to ${(plan.distance_m / 1000).toFixed(2)} km, outside the tolerance allowed for the target distance. Please confirm the distance.`);
  if (poiQuery) plan.warnings.push(plan.via.length ? `Routed via the AMap place “${plan.via.join(', ')}”; please confirm scenery and opening status on site.` : 'No park or waterfront POI at a suitable distance was found, so the scenic preference is not claimed to be met.');
  return { plan, candidates: candidates.length };
}

export function requestBrowserPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This device does not support GPS positioning'));
    navigator.geolocation.getCurrentPosition(position => {
      if (!Number.isFinite(position.coords.accuracy) || position.coords.accuracy > 100) return reject(new Error('Location accuracy is too low. Please move to an open area and locate again.'));
      resolve(position);
    }, reject, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 });
  });
}

export function toAmapPosition(AMap: AmapNamespace, position: RoutePoint): Promise<RoutePoint> {
  if (!AMap.convertFrom) return Promise.reject(new Error('AMap GPS coordinate conversion is unavailable'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('GPS coordinate conversion timed out')), 8000);
    AMap.convertFrom?.(position, 'gps', (status, result) => {
      clearTimeout(timer);
      const converted = status === 'complete' ? pointFromUnknown(result.locations?.[0]) : null;
      if (converted) resolve(converted); else reject(new Error('GPS coordinate conversion failed. Please try again later'));
    });
  });
}

const jobs = new Map<string, { controller: AbortController; promise: Promise<RunRouteSession> }>();
export function cancelRunRoutePlanning(id: string): void { jobs.get(id)?.controller.abort(); }

export function planRunRouteSession(id: string, startOverride?: RoutePoint): Promise<RunRouteSession> {
  const existing = jobs.get(id);
  if (existing) return existing.promise;
  const controller = new AbortController();
  const promise = planSession(id, controller.signal, startOverride).finally(() => { jobs.delete(id); });
  jobs.set(id, { controller, promise });
  return promise;
}

async function planSession(id: string, signal: AbortSignal, startOverride?: RoutePoint): Promise<RunRouteSession> {
  const current = readRunRouteSession(id);
  if (!current) throw new Error('This route session no longer exists.');
  updateRunRouteSession(id, { status: 'locating', error: undefined, planned_path: [], cues: [], warnings: current.start_source === 'sample' ? ['Sample start point, for preview only; it cannot be used as a real position to start navigation.'] : [] });
  try {
    const AMap = await loadAmapNamespace();
    let start = startOverride, source: RunRouteSession['start_source'] = startOverride ? current.start_source || 'sample' : 'gps';
    let label: string | undefined;
    if (!start && current.input.start === 'place' && current.input.start_query) {
      const place = selectRunRoutePlace(current.input.start_query, await searchPlaces(AMap, current.input.start_query, signal));
      if (!place) throw new Error('The requested start was not found. Please provide the city and a specific place.');
      start = place.position; label = place.label; source = 'place';
    }
    if (!start) {
      const position = await requestBrowserPosition();
      signal.throwIfAborted();
      start = await toAmapPosition(AMap, [position.coords.longitude, position.coords.latitude]);
    }
    signal.throwIfAborted();
    updateRunRouteSession(id, { status: 'planning', start, start_source: source, start_label: label });
    const { plan, candidates } = await planRoute(AMap, current, start, signal);
    signal.throwIfAborted();
    const warnings = [...(readRunRouteSession(id)?.warnings || []), ...plan.warnings];
    const snapped = distanceInMeters(start, plan.points[0]);
    if (snapped > 50) warnings.push(`The route start was snapped to an AMap walking road about ${Math.round(snapped)} m from the place you asked for; please begin near the start marker on the map.`);
    if (current.input.preferences.length) warnings.push('Few crossings is based on comparing AMap crossing instructions and turn counts; it is not a full traffic-light count. Gradient, foot traffic, lighting and safety are not verified.');
    const target = targetDistanceMeters(current.input.goal);
    return updateRunRouteSession(id, { status: 'ready', start: plan.points[0], destination: plan.points.at(-1)!, destination_label: plan.destination_label,
      planned_path: plan.points, cues: plan.cues, actual_shape: plan.shape, route_evidence: { candidates, via: plan.via, crossings: plan.crossings, turns: plan.cues.length - 1,
        geometry: plan.geometry || assessRunRouteGeometry(plan.points, plan.shape), turnaround_index: plan.turnaround_index,
        ...(target ? { target_met: runRouteDistanceMatches(target, plan.distance_m), distance_tolerance_m: runRouteDistanceTolerance(target) } : {}) },
      metrics: { ...current.metrics, planned_distance_m: Math.round(plan.distance_m) }, warnings, error: undefined });
  } catch (error) {
    if (signal.aborted) return readRunRouteSession(id)!;
    const denied = (error as { code?: number })?.code === 1;
    return updateRunRouteSession(id, { status: 'failed', error: denied ? 'Please allow location access in system settings and try again; you can also choose the clearly labelled sample preview.' : error instanceof Error ? error.message : 'Getting your location or the AMap route failed. Please try again.' });
  }
}

/** Explicit replan avoids unbounded quota consumption on every GPS fix. */
export async function replanRunRouteFromPosition(id: string, current: RoutePoint): Promise<RunRouteSession> {
  const session = readRunRouteSession(id);
  if (!session?.destination) throw new Error('The route destination is missing');
  updateRunRouteSession(id, { status: 'planning', error: undefined });
  try {
    const leg = await through(await loadAmapNamespace(), [current, session.destination], AbortSignal.timeout(20_000));
    if (!leg) throw new Error('Off-route recalculation failed. Please stop somewhere safe and try again.');
    const geometry = assessRunRouteGeometry(leg.points, 'one_way');
    if (!geometry.valid) throw new Error(geometry.reason);
    return updateRunRouteSession(id, { status: 'ready', start: current, start_source: 'gps', planned_path: leg.points, cues: leg.cues, actual_shape: 'one_way',
      route_evidence: { candidates: 1, via: [], crossings: leg.crossings, turns: leg.cues.length - 1, geometry,
        target_met: runRouteDistanceMatches(session.metrics.target_distance_m, leg.distance_m) },
      metrics: { ...session.metrics, planned_distance_m: Math.round(leg.distance_m), deviation_m: 0 }, warnings: [...session.warnings, 'Recalculated to the original destination; please confirm before continuing.'], error: undefined });
  } catch (error) { return updateRunRouteSession(id, { status: 'paused', error: error instanceof Error ? error.message : 'Off-route recalculation failed' }); }
}

export async function loadAmapNamespace(): Promise<AmapNamespace> { return loadAmap() as Promise<AmapNamespace>; }
