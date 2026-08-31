import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAmap } from './amap';
import { advanceRunRouteDialogue } from './runRouteDialogue';
import { createRunRouteSessionFromTaskmaster, resetRunRouteSkillForTests, routeDistance, runRouteDistanceMatches, runRouteTaskInput, type RoutePoint } from './runRouteSkill';
import { hasUsableLoopGeometry, joinWalkingLegs, parseAmapWalkingResult, planRunRouteSession, routePlaceAvailable, scoreRunRoute, selectRunRoutePlace, toAmapPosition } from './amapRunRoute';
import { assessRunRouteGeometry } from './runRouteGeometry';

vi.mock('./amap', () => ({ loadAmap: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); resetRunRouteSkillForTests(); });

/** A deterministic grid road provider. These points are test fixtures, not live map evidence. */
function gridRoads(start: RoutePoint, end: RoutePoint, fixedRoad: boolean | RoutePoint[] = false) {
  type Position = { lng: number; lat: number };
  type Callback = (status: string, result: unknown) => void;
  const requests: RoutePoint[][] = [];
  const search = (_query: string, callback: Callback) => callback('complete', { poiList: { pois: [
    { name: '村上西湖', type: '餐饮服务;餐厅', location: start },
    { name: '西湖', type: '风景名胜;湖泊', cityname: '杭州市', location: end },
  ] } });
  vi.mocked(loadAmap).mockResolvedValue({
    plugin: (_names: unknown, callback: () => void) => callback(),
    convertFrom: (point: RoutePoint, _type: string, callback: Callback) => callback('complete', { locations: [point] }),
    LngLat: class { constructor(public lng: number, public lat: number) {} },
    PlaceSearch: class { search = search; searchNearBy(query: string, _center: RoutePoint, _radius: number, callback: Callback) { search(query, callback); } },
    Walking: class {
      search(from: Position, to: Position, callback: Callback) {
        const a: RoutePoint = [from.lng, from.lat], b: RoutePoint = [to.lng, to.lat];
        requests.push([a, b]);
        const road: RoutePoint[] = Array.isArray(fixedRoad) ? fixedRoad : fixedRoad ? [start, end] : [a, [b[0], a[1]], b];
        callback('complete', { routes: [{ distance: routeDistance(road), steps: [{ path: road }] }] });
      }
    },
  });
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (callback: PositionCallback) =>
    callback({ coords: { longitude: start[0], latitude: start[1], accuracy: 8 }, timestamp: Date.now() } as GeolocationPosition) } });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline fixture')));
  return requests;
}

describe('AMap run route adapter', () => {
  it.each(['one_way', 'out_and_back'] as const)('builds different complete roads for 3/4/5 km with the same destination (%s)', async shape => {
    vi.useFakeTimers();
    const start: RoutePoint = [120.17, 30.26], end: RoutePoint = [120.16, 30.26];
    const requests = gridRoads(start, end);
    const paths = new Set<string>();
    for (const km of [3, 4, 5]) {
      const dialogue = await advanceRunRouteDialogue(`帮我规划去西湖的跑步路线，${km}公里，${shape === 'one_way' ? '单程' : '往返'}`, undefined, true);
      const session = createRunRouteSessionFromTaskmaster(runRouteTaskInput(dialogue.input!));
      const job = planRunRouteSession(session.session_id);
      await vi.runAllTimersAsync();
      const result = await job;
      expect(result.status).toBe('ready');
      expect(result.metrics.target_distance_m).toBe(km * 1000);
      expect(runRouteDistanceMatches(km * 1000, result.metrics.planned_distance_m), JSON.stringify({ shape, km, metrics: result.metrics, warnings: result.warnings })).toBe(true);
      expect(result.route_evidence?.target_met).toBe(true);
      expect(result.destination_label).toBe('西湖');
      expect(result.route_evidence?.geometry?.valid).toBe(true);
      expect(assessRunRouteGeometry(result.planned_path, shape, result.route_evidence?.turnaround_index).valid).toBe(true);
      expect(result.planned_path[0]).toEqual(start);
      expect(result.planned_path.at(-1)).toEqual(shape === 'one_way' ? end : start);
      expect(result.planned_path).toContainEqual(end);
      expect(result.actual_track).toEqual([]);
      paths.add(JSON.stringify(result.planned_path));
    }
    expect(paths.size).toBe(3);
    // Independent return requests, not a reversed outbound polyline.
    if (shape === 'out_and_back') expect(requests.some(([from]) => from[0] === end[0] && from[1] === end[1])).toBe(true);
  });

  it('plans an English distance request on the same AMap roads and reports the caveats in English', async () => {
    vi.useFakeTimers();
    const start: RoutePoint = [120.17, 30.26];
    gridRoads(start, [120.16, 30.26]);
    const dialogue = await advanceRunRouteDialogue('Plan a 5 km running route, scenic, few crossings, loop', undefined, true);
    expect(dialogue.input).toMatchObject({ goal: { type: 'distance', distance_m: 5000 }, shape: 'loop', preferences: ['scenic', 'low_crossings'] });
    const session = createRunRouteSessionFromTaskmaster(runRouteTaskInput(dialogue.input!));
    const job = planRunRouteSession(session.session_id);
    await vi.runAllTimersAsync();
    const result = await job;
    expect(result.status).toBe('ready');
    expect(result.metrics.target_distance_m).toBe(5000);
    expect(result.warnings.join(' ')).toContain('Few crossings is based on comparing AMap crossing instructions');
  });

  it('does not ignore a distance target shorter than the direct road', async () => {
    vi.useFakeTimers();
    const requests = gridRoads([120.17, 30.26], [120.11, 30.26]);
    const dialogue = await advanceRunRouteDialogue('帮我规划去西湖的跑步路线，三公里', undefined, true);
    const session = createRunRouteSessionFromTaskmaster(runRouteTaskInput(dialogue.input!));
    const job = planRunRouteSession(session.session_id);
    await vi.runAllTimersAsync();
    const result = await job;
    expect(result.status).toBe('failed');
    expect(result.error).toContain('more than the 3.00 km target');
    expect(result.planned_path).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  it('never stretches a fixed provider road to fake the requested distance', async () => {
    vi.useFakeTimers();
    const start: RoutePoint = [120.17, 30.26], end: RoutePoint = [120.16, 30.26];
    const requests = gridRoads(start, end, true);
    const dialogue = await advanceRunRouteDialogue('帮我规划去西湖的跑步路线，三公里', undefined, true);
    const session = createRunRouteSessionFromTaskmaster(runRouteTaskInput(dialogue.input!));
    const job = planRunRouteSession(session.session_id);
    await vi.runAllTimersAsync();
    const result = await job;
    expect(result.planned_path).toEqual([start, end]);
    expect(result.metrics.planned_distance_m).toBe(Math.round(routeDistance([start, end])));
    expect(result.route_evidence?.target_met).toBe(false);
    expect(result.warnings.join(' ')).toContain('will not start automatically');
    expect(requests.length).toBeLessThanOrEqual(37);
  });

  it('does not accept a mileage-matching T-shaped direct road', async () => {
    vi.useFakeTimers();
    const start: RoutePoint = [120.17, 30.26], end: RoutePoint = [120.16, 30.265];
    const junction: RoutePoint = [120.17, 30.265];
    const spur: RoutePoint = [120.1777, 30.265];
    const road = [start, junction, spur, [120.174, 30.265] as RoutePoint, junction, end];
    gridRoads(start, end, road);
    const dialogue = await advanceRunRouteDialogue('帮我规划去西湖的跑步路线，三公里', undefined, true);
    const session = createRunRouteSessionFromTaskmaster(runRouteTaskInput(dialogue.input!));
    const job = planRunRouteSession(session.session_id); await vi.runAllTimersAsync();
    const result = await job;
    expect(runRouteDistanceMatches(3000, routeDistance(road))).toBe(true);
    expect(result.status).toBe('failed');
    expect(result.planned_path).toEqual([]);
    expect(result.error).toContain('side-street backtracking');
  });

  it('detects retracing with different vertex segmentation, without rejecting a proper U or deliberate return', () => {
    const p = (x: number, y: number): RoutePoint => [120 + x / 96405, 30 + y / 110540];
    const t = [p(0, 0), p(0, 300), p(-400, 300), p(-137, 300), p(100, 300), p(500, 300)];
    expect(assessRunRouteGeometry(t, 'one_way')).toMatchObject({ valid: false });
    expect(assessRunRouteGeometry(t, 'one_way').retraced_distance_m).toBeGreaterThan(300);
    const u = [p(0, 0), p(0, 500), p(300, 500), p(300, 0)];
    expect(assessRunRouteGeometry(u, 'one_way').valid).toBe(true);
    const returned = [...u, p(300, 220), p(300, 500), p(0, 500), p(0, 0)];
    expect(assessRunRouteGeometry(returned, 'one_way').valid).toBe(false);
    expect(assessRunRouteGeometry(returned, 'out_and_back', u.length - 1).valid).toBe(true);
    const branchedReturn = [...t, p(100, 300), p(0, 300), p(0, 0)];
    expect(assessRunRouteGeometry(branchedReturn, 'out_and_back', t.length - 1).valid).toBe(false);
    const square = [p(0, 0), p(0, 400), p(400, 400), p(400, 0), p(0, 0)];
    expect(assessRunRouteGeometry(square, 'loop').valid).toBe(true);
    expect(assessRunRouteGeometry([...square, ...square.slice(1)], 'loop').valid).toBe(false);
    // Adjacent, distinct roads are not the same road traversed backwards.
    expect(assessRunRouteGeometry([p(0, 0), p(0, 300), p(16, 300), p(16, 0)], 'one_way').valid).toBe(true);
  });

  it('matches landmark meaning before proximity, while preserving explicit business names', () => {
    const business = { label: '村上西湖', position: [120, 30] as RoutePoint, type: '餐饮服务;餐厅', city: '杭州市' };
    const lake = { label: '杭州西湖风景名胜区-五公园', position: [120.01, 30] as RoutePoint, type: '风景名胜;公园', city: '杭州市' };
    expect(selectRunRoutePlace('西湖', [business, lake], business.position)).toBe(lake);
    expect(selectRunRoutePlace('杭州西湖', [business, lake], business.position)).toBe(lake);
    expect(selectRunRoutePlace('西湖', [business], business.position)).toBeUndefined();
    expect(selectRunRoutePlace('西湖', [{ ...lake, label: '杭州西湖观光巴士' }, lake], business.position)).toBe(lake);
    expect(selectRunRoutePlace('西湖', [{ ...lake, label: '杭州西湖风景名胜区-游船售票处' }])).toBeUndefined();
    expect(selectRunRoutePlace('村上西湖', [business, lake], business.position)).toBe(business);
    expect(selectRunRoutePlace('西湖', [{ ...lake, label: '西湖（暂停开放）' }])).toBeUndefined();
  });

  it('rejects retraced roads posing as loops and excludes explicitly closed places', () => {
    expect(hasUsableLoopGeometry([[120, 30], [120, 30.001], [120.001, 30.001], [120.001, 30], [120, 30]])).toBe(true);
    expect(hasUsableLoopGeometry([[120, 30], [120, 30.001], [120.001, 30.001], [120, 30.001], [120, 30]])).toBe(false);
    expect(routePlaceAvailable('杭州西湖风景名胜区(暂停开放)')).toBe(false);
    expect(routePlaceAvailable('杭州西湖·柳浪闻莺')).toBe(true);
  });
  it('preserves turn instructions at real step endpoints and counts explicit crossing evidence', () => {
    const leg = parseAmapWalkingResult({ routes: [{ distance: 200, steps: [
      { path: [[120, 30], [120, 30.001]], instruction: '步行110米左转', action: '左转' },
      { path: [[120, 30.001], [120.001, 30.001]], instruction: '通过人行横道' },
    ] }] });
    expect(leg?.cues).toEqual([{ id: 'step-0', point_index: 1, instruction: '左转', source: 'amap' }]);
    expect(leg?.crossings).toBe(1);
    expect(leg?.distance_m).toBe(200);
    expect(joinWalkingLegs([leg!])?.cues.at(-1)?.source).toBe('arrival');
    expect(scoreRunRoute(leg!, 200, true)).toBeGreaterThan(scoreRunRoute({ ...leg!, crossings: 0 }, 200, true));
  });
  it('rejects broken geometry and refuses to invent a connector between disconnected legs', () => {
    expect(parseAmapWalkingResult({ routes: [{ steps: [{ path: [[120, 30], [NaN, 30]] }] }] })).toBeNull();
    const leg = parseAmapWalkingResult({ routes: [{ steps: [{ path: [[120, 30], [120, 30.001]] }] }] })!;
    expect(joinWalkingLegs([leg, { ...leg, points: [[121, 30], [121, 30.001]] }])).toBeNull();
    const back = { ...leg, points: [...leg.points].reverse(), cues: [] };
    const joined = joinWalkingLegs([leg, back]);
    expect(joined?.cues[0]).toMatchObject({ point_index: 1, source: 'geometry' });
    expect(joined?.cues.filter(c => c.source === 'arrival')).toHaveLength(1);
  });
  it('converts browser WGS84 GPS points before putting them on the AMap route', async () => {
    const AMap = {
      convertFrom(_point: [number, number], type: string, callback: (status: string, result: unknown) => void) {
        expect(type).toBe('gps');
        callback('complete', { locations: [{ getLng: () => 120.01, getLat: () => 30.02 }] });
      },
    };
    await expect(toAmapPosition(AMap as never, [120, 30])).resolves.toEqual([120.01, 30.02]);
  });

  it('keeps the turn-around cue when joining previously completed outbound and return legs', () => {
    const outbound = joinWalkingLegs([{ points: [[120, 30], [120, 30.003]], distance_m: 333, cues: [], crossings: 0 }])!;
    const inbound = joinWalkingLegs([{ points: [[120, 30.003], [120, 30]], distance_m: 333, cues: [], crossings: 0 }])!;
    const combined = joinWalkingLegs([outbound, inbound])!;
    expect(combined.cues).toContainEqual(expect.objectContaining({ point_index: 1, source: 'geometry', instruction: 'Turn around where it is safe and follow the planned road back' }));
    expect(combined.cues.filter(c => c.source === 'arrival')).toEqual([expect.objectContaining({ point_index: 2 })]);
  });

  it('fails closed instead of drawing unconverted GPS coordinates', async () => {
    await expect(toAmapPosition({} as never, [120, 30])).rejects.toThrow('coordinate conversion is unavailable');
  });

  it.each([false, true])('plans the exact spoken destination through Taskmaster using current GPS (permission denied: %s)', async denied => {
    vi.useFakeTimers();
    resetRunRouteSkillForTests();
    // Explicit fixtures: this verifies the planner chain, not physical GPS or a live AMap response.
    const gps: RoutePoint = [120.15, 30.26], start: RoutePoint = [120.154, 30.258], end: RoutePoint = [120.152, 30.259];
    const road: RoutePoint[] = [start, [120.153, 30.258], end];
    const locate = vi.fn((success: PositionCallback, failure: PositionErrorCallback) => {
      if (denied) failure({ code: 1 } as GeolocationPositionError);
      else success({ coords: { longitude: gps[0], latitude: gps[1], accuracy: 8 }, timestamp: Date.now() } as GeolocationPosition);
    });
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: locate } });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ text: JSON.stringify({
      start_query: '去西湖', evidence: { start_query: '去西湖' },
    }) }) })));
    type Callback = (status: string, result: unknown) => void;
    const search = vi.fn((_query: string, callback: Callback) => callback('no_data', {}));
    const nearby = vi.fn((_query: string, _center: RoutePoint, _radius: number, callback: Callback) =>
      callback('complete', { poiList: { pois: [{ name: '西湖', type: '风景名胜;湖泊', location: end }] } }));
    const walk = vi.fn((_from: unknown, _to: unknown, callback: Callback) => callback('complete', { routes: [{ distance: 250, steps: [
      { path: road.slice(0, 2), instruction: '步行后右转', action: '右转' },
      { path: road.slice(1), instruction: '到达目的地' },
    ] }] }));
    const convert = vi.fn((_position: RoutePoint, _type: string, callback: Callback) => callback('complete', { locations: [start] }));
    vi.mocked(loadAmap).mockResolvedValue({
      plugin: (_names: unknown, callback: () => void) => callback(),
      convertFrom: convert,
      LngLat: class { constructor(public lng: number, public lat: number) {} },
      Walking: class { search = walk; },
      PlaceSearch: class { search = search; searchNearBy = nearby; },
    });
    const dialogue = await advanceRunRouteDialogue('请帮我规划一下去西湖的跑步路线', undefined, true);
    const session = createRunRouteSessionFromTaskmaster(runRouteTaskInput(dialogue.input!));
    const job = planRunRouteSession(session.session_id);
    await vi.runAllTimersAsync();
    const planned = await job;
    expect(locate).toHaveBeenCalledOnce();
    expect(search).not.toHaveBeenCalled(); // Never geocode “去西湖” as an origin.
    expect(planned.actual_track).toEqual([]);
    if (denied) {
      expect(planned.status).toBe('failed');
      expect(planned.error).toContain('allow location access');
      expect(planned.planned_path).toEqual([]);
      expect(walk).not.toHaveBeenCalled();
      expect(nearby).not.toHaveBeenCalled();
    } else {
      expect(convert).toHaveBeenCalledWith(gps, 'gps', expect.any(Function));
      expect(nearby).toHaveBeenCalledExactlyOnceWith('西湖', start, 50_000, expect.any(Function));
      expect(walk).toHaveBeenCalledExactlyOnceWith({ lng: start[0], lat: start[1] }, { lng: end[0], lat: end[1] }, expect.any(Function));
      expect(planned).toMatchObject({ status: 'ready', start_source: 'gps', actual_shape: 'one_way', planned_path: road, metrics: { planned_distance_m: 250, target_distance_m: undefined } });
      expect(planned.cues).toMatchObject([{ instruction: '右转', source: 'amap' }, { source: 'arrival' }]);
    }
  });
});
