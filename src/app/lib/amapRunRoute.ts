import { loadAmap } from './amap';
import { distanceInMeters, readRunRouteSession, routeDistance, targetDistanceMeters, updateRunRouteSession,
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
}
type Place = { position: RoutePoint; label: string };
export const routePlaceAvailable = (label: string): boolean => !/暂停开放|暂停营业|停止营业|永久关闭|暂时关闭|施工封闭/.test(label);

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
    const abort = () => finish(null, new Error('路线规划已取消'));
    const timer = setTimeout(() => finish(null), 8000);
    signal.addEventListener('abort', abort, { once: true });
    AMap.plugin('AMap.Walking', () => {
      if (settled || signal.aborted) return;
      try {
        new AMap.Walking().search(new AMap.LngLat(...start), new AMap.LngLat(...end), (status, result) => {
          if (settled) return;
          const detail = String(typeof result === 'string' ? result : (result as { info?: string })?.info || '');
          if (/EXCEEDED|INVALID_USER|INVALID_KEY|SERVICE_NOT_AVAILABLE|INSUFFICIENT_PRIVILEGES/.test(detail)) return finish(null, new Error('高德路线服务限流或 Key 权限不可用，请检查配置或稍后重试。'));
          finish(status === 'complete' ? parseAmapWalkingResult(result) : null);
        });
      } catch { finish(null); }
    });
  });
}

function placesFromResult(result: unknown): Place[] {
  const pois = (result as { poiList?: { pois?: Array<{ name?: string; location?: unknown }> } })?.poiList?.pois || [];
  return pois.flatMap(poi => { const position = pointFromUnknown(poi.location); return position && routePlaceAvailable(poi.name || '') ? [{ position, label: poi.name || '高德地点' }] : []; });
}

async function searchPlaces(AMap: AmapNamespace, query: string, signal: AbortSignal, near?: RoutePoint, radius = 50_000): Promise<Place[]> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (places: Place[], error?: Error) => { if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort); if (error) reject(error); else resolve(places); };
    const abort = () => finish([]);
    const timer = setTimeout(() => finish([], new Error('高德地点查询超时，请检查网络后重试。')), 12000);
    signal.addEventListener('abort', abort, { once: true });
    AMap.plugin('AMap.PlaceSearch', () => {
      if (settled || signal.aborted) return;
      try {
        const search = new AMap.PlaceSearch({ pageSize: 8, extensions: 'base' });
        const callback = (status: string, result: unknown) => {
          if (status === 'error') {
            const info = String(typeof result === 'string' ? result : (result as { info?: string })?.info || 'service_error').replace(/[^A-Za-z0-9_]/g, '').slice(0, 80);
            finish([], new Error(`高德地点服务不可用（${info}），请检查 Key、服务代理和网络配置。`));
          } else finish(status === 'complete' ? placesFromResult(result) : []);
        };
        if (near) search.searchNearBy(query, near, radius, callback);
        else search.search(query, callback);
      } catch { finish([], new Error('高德地点查询组件不可用，请刷新后重试。')); }
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
    cues.push(...leg.cues.map(cue => ({ ...cue, point_index: cue.point_index + offset })));
  }
  if (points.length < 2) return null;
  // Intermediate waypoint arrivals are not the run's finish. Determine only
  // their junction direction from adjacent, real road segments.
  for (const index of junctions) {
    if (index < 1 || index >= points.length - 1 || cues.some(c => Math.abs(c.point_index - index) <= 1)) continue;
    const a = points[index - 1], b = points[index], c = points[index + 1];
    const heading = (p: RoutePoint, q: RoutePoint) => Math.atan2((q[0] - p[0]) * Math.cos(b[1] * Math.PI / 180), q[1] - p[1]);
    const angle = Math.atan2(Math.sin(heading(b, c) - heading(a, b)), Math.cos(heading(b, c) - heading(a, b))) * 180 / Math.PI;
    if (Math.abs(angle) > 40) cues.push({ id: 'junction', point_index: index, instruction: Math.abs(angle) > 150 ? '在安全位置掉头，沿规划道路返回' : angle > 0 ? '向右转' : '向左转', source: 'geometry' });
  }
  cues.sort((a, b) => a.point_index - b.point_index);
  cues.push({ id: 'arrival', point_index: points.length - 1, instruction: '已到达本段跑步路线终点，请安全停下', source: 'arrival' });
  return { points, cues: cues.map((cue, i) => ({ ...cue, id: `cue-${i}` })), distance_m: legs.reduce((n, leg) => n + leg.distance_m, 0), crossings: legs.reduce((n, leg) => n + leg.crossings, 0) };
}

async function through(AMap: AmapNamespace, waypoints: RoutePoint[], signal: AbortSignal): Promise<WalkingLeg | null> {
  const legs: WalkingLeg[] = [];
  for (let i = 1; i < waypoints.length; i++) {
    const leg = await requestWalking(AMap, waypoints[i - 1], waypoints[i], signal);
    if (!leg) return null;
    legs.push(leg);
  }
  return joinWalkingLegs(legs);
}

export function scoreRunRoute(plan: WalkingLeg, target: number, lowCrossings: boolean): number {
  return Math.abs(plan.distance_m - target) / target * 100 + (lowCrossings ? plan.crossings * 8 + plan.cues.length * .5 : 0);
}

/** Reject near-zero-area "loops" made mostly by walking the same road back. */
export function hasUsableLoopGeometry(points: RoutePoint[]): boolean {
  if (points.length < 4 || distanceInMeters(points[0], points.at(-1)!) > 40) return false;
  const origin = points[0], scale = 111320 * Math.cos(origin[1] * Math.PI / 180);
  const local = points.map(p => [(p[0] - origin[0]) * scale, (p[1] - origin[1]) * 110540]);
  let twiceArea = 0;
  for (let i = 1; i < local.length; i++) twiceArea += local[i - 1][0] * local[i][1] - local[i][0] * local[i - 1][1];
  const perimeter = routeDistance(points);
  return perimeter > 0 && Math.abs(twiceArea) / 2 / (perimeter * perimeter) >= .01;
}

async function planRoute(AMap: AmapNamespace, session: RunRouteSession, start: RoutePoint, signal: AbortSignal): Promise<{ plan: RoutePlan; candidates: number }> {
  if (session.input.goal.type === 'destination') {
    const query = session.input.goal.query;
    const places = await searchPlaces(AMap, query, signal, start);
    const place = places[0] || (await searchPlaces(AMap, query, signal))[0];
    if (!place) throw new Error(`未找到“${query}”，请补充城市和具体地点。`);
    if (distanceInMeters(start, place.position) > 50_000) throw new Error('目的地离起点超过 50 公里，请确认城市和地点。');
    const back = session.input.shape === 'out_and_back';
    const leg = await through(AMap, back ? [start, place.position, start] : [start, place.position], signal);
    if (!leg) throw new Error('高德未返回完整可步行路线，请换个地点重试。');
    return { plan: { ...leg, destination: back ? start : place.position, destination_label: place.label, shape: back ? 'out_and_back' : 'one_way', warnings: [], via: [place.label] }, candidates: 1 };
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
    if (shape === 'loop' && !hasUsableLoopGeometry(leg.points)) continue;
    const error = Math.abs(leg.distance_m - target) / target;
    if (!calibration || error < calibration.error) calibration = { bearing, scale: target / leg.distance_m, error };
    candidates.push({ ...leg, destination: waypoints[waypoints.length - 1], shape, warnings: [], via: via ? [via.label] : [] });
  }
  if (!candidates.length && session.input.shape === 'loop') {
    const leg = await through(AMap, [start, coordinateAt(start, target / 2.6, 90), start], signal);
    if (leg && leg.distance_m <= target * 2 && leg.distance_m >= target * .4) candidates.push({ ...leg, destination: start, shape: 'out_and_back', warnings: ['此处没有找到合适的完整环线，实际提供的是往返路线，请确认后再跑。'], via: [] });
  }
  if (!candidates.length) throw new Error('附近没有找到符合距离的完整步行路线，请调整距离或起点。');
  candidates.sort((a, b) => Number(Math.abs(a.distance_m - target) > target * .2) - Number(Math.abs(b.distance_m - target) > target * .2)
    || scoreRunRoute(a, target, preferences.includes('low_crossings')) - scoreRunRoute(b, target, preferences.includes('low_crossings')));
  const plan = candidates[0];
  if (Math.abs(plan.distance_m - target) / target > .2) plan.warnings.push(`受道路限制，实际规划 ${(plan.distance_m / 1000).toFixed(2)} 公里，与目标偏差超过 20%，请确认距离。`);
  if (poiQuery) plan.warnings.push(plan.via.length ? `经高德地点“${plan.via.join('、')}”选线；景观及开放情况请现场确认。` : '未找到距离合适的公园/滨水 POI，未声称已满足景观偏好。');
  return { plan, candidates: candidates.length };
}

export function requestBrowserPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('当前设备不支持 GPS 定位'));
    navigator.geolocation.getCurrentPosition(position => {
      if (!Number.isFinite(position.coords.accuracy) || position.coords.accuracy > 100) return reject(new Error('定位精度不足，请到开阔处重新定位。'));
      resolve(position);
    }, reject, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 });
  });
}

export function toAmapPosition(AMap: AmapNamespace, position: RoutePoint): Promise<RoutePoint> {
  if (!AMap.convertFrom) return Promise.reject(new Error('高德 GPS 坐标转换不可用'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('GPS 坐标转换超时')), 8000);
    AMap.convertFrom?.(position, 'gps', (status, result) => {
      clearTimeout(timer);
      const converted = status === 'complete' ? pointFromUnknown(result.locations?.[0]) : null;
      if (converted) resolve(converted); else reject(new Error('GPS 坐标转换失败，请稍后重试'));
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
  if (!current) throw new Error('路线会话不存在');
  updateRunRouteSession(id, { status: 'locating', error: undefined, planned_path: [], cues: [], warnings: current.start_source === 'sample' ? ['示例起点，仅供预览，不能作为真实位置开始导航。'] : [] });
  try {
    const AMap = await loadAmapNamespace();
    let start = startOverride, source: RunRouteSession['start_source'] = startOverride ? current.start_source || 'sample' : 'gps';
    let label: string | undefined;
    if (!start && current.input.start === 'place' && current.input.start_query) {
      const place = (await searchPlaces(AMap, current.input.start_query, signal))[0];
      if (!place) throw new Error('未找到指定起点，请提供城市和具体地点。');
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
    if (snapped > 50) warnings.push(`路线起点已对齐高德步行道路，距查询地点约 ${Math.round(snapped)} 米，请到地图起点标记附近开始。`);
    if (current.input.preferences.length) warnings.push('少路口依据高德过街指令和转弯数量比较，不等于完整红绿灯统计；坡度、人流、照明及治安未验证。');
    return updateRunRouteSession(id, { status: 'ready', start: plan.points[0], destination: plan.points.at(-1)!, destination_label: plan.destination_label,
      planned_path: plan.points, cues: plan.cues, actual_shape: plan.shape, route_evidence: { candidates, via: plan.via, crossings: plan.crossings, turns: plan.cues.length - 1 },
      metrics: { ...current.metrics, planned_distance_m: Math.round(plan.distance_m) }, warnings, error: undefined });
  } catch (error) {
    if (signal.aborted) return readRunRouteSession(id)!;
    const denied = (error as { code?: number })?.code === 1;
    return updateRunRouteSession(id, { status: 'failed', error: denied ? '请在系统设置中允许定位后重试；也可选择明确标注的示例预览。' : error instanceof Error ? error.message : '获取位置或高德路线失败，请重试。' });
  }
}

/** Explicit replan avoids unbounded quota consumption on every GPS fix. */
export async function replanRunRouteFromPosition(id: string, current: RoutePoint): Promise<RunRouteSession> {
  const session = readRunRouteSession(id);
  if (!session?.destination) throw new Error('路线终点缺失');
  updateRunRouteSession(id, { status: 'planning', error: undefined });
  try {
    const leg = await through(await loadAmapNamespace(), [current, session.destination], AbortSignal.timeout(20_000));
    if (!leg) throw new Error('偏航重算失败，请先停在安全位置后重试。');
    return updateRunRouteSession(id, { status: 'ready', start: current, start_source: 'gps', planned_path: leg.points, cues: leg.cues, actual_shape: 'one_way',
      metrics: { ...session.metrics, planned_distance_m: Math.round(leg.distance_m), deviation_m: 0 }, warnings: [...session.warnings, '已重算到原终点；请确认后继续。'], error: undefined });
  } catch (error) { return updateRunRouteSession(id, { status: 'paused', error: error instanceof Error ? error.message : '偏航重算失败' }); }
}

export async function loadAmapNamespace(): Promise<AmapNamespace> { return loadAmap() as Promise<AmapNamespace>; }
