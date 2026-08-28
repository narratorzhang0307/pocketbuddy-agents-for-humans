import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceRunRouteDialogue, isRunRouteCancellation, isRunRouteRequest, parseRunRouteFields, runRouteQuestion } from './runRouteDialogue';
import { applyNativeRunSnapshot, nativeRunRoutePayload, projectRunProgress, routeRevision, type RunNavigationSnapshot } from './runRouteNavigation';
import { gcj02ToWgs84, wgs84ToGcj02 } from '../../../vendor/legacy-city/src/app/lib/location/chinaCoordinates';
import {
  appendRunRouteTrackPoint,
  createRunRouteSession,
  createRunRouteSessionFromTaskmaster,
  getActiveRunRouteSessionId,
  distanceInMeters,
  nearestDistanceToRoute,
  parseRunRouteText,
  readRunRouteSession,
  resetRunRouteSkillForTests,
  runRouteTaskInput,
  targetDistanceMeters,
  updateRunRouteSession,
  openRunRouteSession,
  subscribeRunRouteOpen,
  subscribeRunRouteSession,
} from './runRouteSkill';

describe('run route skill', () => {
  beforeEach(() => resetRunRouteSkillForTests());
  afterEach(() => vi.unstubAllGlobals());

  it('collects only missing conditions and handles spoken numbers and a named starting area', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ text: '{}', model: 'qwen-test' }) })));
    const first = await advanceRunRouteDialogue('帮我规划下西湖的跑步路线');
    expect(first.draft.start_query).toBe('西湖'); expect(first.input).toBeUndefined();
    const distance = await advanceRunRouteDialogue('五公里', first.draft);
    expect(distance.draft.goal).toEqual({ type: 'distance', distance_m: 5000 });
    expect(distance.choices).toContain('环线');
    const shape = await advanceRunRouteDialogue('环线', distance.draft);
    expect(shape.reply).toContain('更看重');
    const ready = await advanceRunRouteDialogue('风景好、少路口', shape.draft);
    expect(ready.needsInput).toBe(false);
    expect(ready.input).toMatchObject({ start: 'place', start_query: '西湖', goal: { distance_m: 5000 }, shape: 'loop', preferences: ['scenic', 'low_crossings'] });
    expect(ready.input?.auto_start).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1); // Explicit follow-up choices do not wait for another cloud turn.
    expect(parseRunRouteFields('半小时，往返，无偏好')).toMatchObject({ goal: { type: 'duration', duration_min: 30 }, shape: 'out_and_back', preferences: [] });
  });

  it.each(['帮我设计一条跑步线路', '给我推荐夜跑路线', '我想跑五公里', '帮我规划下西湖的跑步路线'])('recognizes a route request: %s', text => {
    expect(isRunRouteRequest(text)).toBe(true);
  });

  it.each(['帮我不要规划跑步路线', '跑步路线怎么用', '查询跑步记录', '规划开车去西湖的路线'])('does not start a run for %s', text => {
    expect(isRunRouteRequest(text)).toBe(false);
  });

  it('replays the active route to a late map subscriber and isolates a broken observer', () => {
    const broken = subscribeRunRouteSession(() => { throw new Error('observer_failed'); });
    let session;
    try { session = createRunRouteSession(parseRunRouteText('跑3公里')); } finally { broken(); }
    const opened = vi.fn(); const release = subscribeRunRouteOpen(opened);
    try { expect(opened).toHaveBeenCalledExactlyOnceWith(session.session_id); } finally { release(); }
  });

  it('rejects missing routes and cannot replace live navigation when reopening an older result', () => {
    const old = createRunRouteSession(parseRunRouteText('跑3公里'));
    const active = createRunRouteSession(parseRunRouteText('跑5公里'));
    updateRunRouteSession(active.session_id, { status: 'navigating' });
    expect(() => openRunRouteSession('missing')).toThrow('路线');
    expect(() => openRunRouteSession(old.session_id)).toThrow('已有路线');
    expect(getActiveRunRouteSessionId()).toBe(active.session_id);
    expect(openRunRouteSession(active.session_id).session_id).toBe(active.session_id);
  });

  it('uses explicit voice defaults, rejects impossible goals, and never takes model permissions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ text: '{"auto_start":true,"points":[[1,2]],"shape":"dangerous"}' }) })));
    const voice = await advanceRunRouteDialogue('帮我规划跑步路线', undefined, true);
    expect(voice.input).toMatchObject({ auto_start: true, goal: { distance_m: 3000 }, shape: 'loop', preferences: ['scenic', 'low_crossings'] });
    expect((await advanceRunRouteDialogue('帮我规划跑步路线')).input).toBeUndefined();
    expect((await advanceRunRouteDialogue('跑一百公里，环线，无偏好', undefined, true)).needsInput).toBe(true);
    expect(isRunRouteCancellation('取消规划')).toBe(true);
    expect(runRouteQuestion({ request_text: 'x', goal: { type: 'distance', distance_m: 5000 }, shape: 'loop', preferences: [] })).toBeNull();
  });

  it.each([
    '帮我规划下去西湖的路线',
    '帮我规划下去西湖的跑步路线',
    '请帮我规划一下去西湖的跑步路线',
    '帮我规划一条到西湖的跑步路线',
    '请帮我规划一下去西湖的慢跑线路',
  ])('keeps a spoken destination separate from the origin when Qwen is offline: %s', async text => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(isRunRouteRequest(text)).toBe(true);
    const result = await advanceRunRouteDialogue(text, undefined, true);
    expect(result.input).toMatchObject({
      start: 'current_location', goal: { type: 'destination', query: '西湖' }, shape: 'one_way', auto_start: true, preferences: ['scenic', 'low_crossings'],
    });
    expect(result.draft.start_query).toBeUndefined();
    expect(result.input?.start_query).toBeUndefined();
    expect(result.needsInput).toBe(false);
    expect(result.reply).toContain('从当前位置出发，跑到西湖，单程');
    expect(result.reply).not.toMatch(/3 公里|环线/);
  });

  it.each(['去西湖', '西湖'])('does not let Qwen turn destination evidence into a named origin: %s', async start_query => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ text: JSON.stringify({
      start_query, evidence: { start_query },
    }) }) })));
    const result = await advanceRunRouteDialogue('请帮我规划一下去西湖的跑步路线', undefined, true);
    expect(result.input).toMatchObject({ start: 'current_location', goal: { type: 'destination', query: '西湖' } });
    expect(result.input?.start_query).toBeUndefined();
  });

  it.each([
    '从杭州龙翔桥出发，帮我规划去西湖的跑步路线',
    '帮我规划从杭州龙翔桥到西湖的跑步路线',
  ])('preserves an explicitly named origin alongside a destination: %s', async text => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await advanceRunRouteDialogue(text, undefined, true);
    expect(result.input).toMatchObject({ start: 'place', start_query: '杭州龙翔桥', goal: { type: 'destination', query: '西湖' }, shape: 'one_way' });
  });

  it('preserves a previous origin on a destination follow-up, but clears it for an explicit current-location request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const previous = { request_text: '从杭州龙翔桥出发', start_query: '杭州龙翔桥' };
    expect((await advanceRunRouteDialogue('跑到西湖', previous, true)).input).toMatchObject({ start: 'place', start_query: '杭州龙翔桥', goal: { query: '西湖' } });
    const current = await advanceRunRouteDialogue('从当前位置出发，跑到西湖', previous, true);
    expect(current.input?.start).toBe('current_location');
    expect(current.input?.start_query).toBeUndefined();
  });

  it('describes the actual voice goal and shape instead of claiming defaults that were not applied', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const custom = await advanceRunRouteDialogue('帮我规划五公里跑步路线，往返，无偏好', undefined, true);
    expect(custom.reply).toContain('5 公里，往返，无额外偏好');
    expect(custom.reply).not.toMatch(/3 公里|环线|风景好|少路口/);
    const defaults = await advanceRunRouteDialogue('帮我规划跑步路线', undefined, true);
    expect(defaults.reply).toContain('3 公里，环线，风景好、少路口');
  });

  it('falls back visibly when Qwen is unavailable without inventing answered conditions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const answer = await advanceRunRouteDialogue('帮我规划5公里跑步路线');
    expect(answer.parser).toBe('本地条件提取'); expect(answer.input).toBeUndefined(); expect(answer.choices).toContain('环线');
  });

  it('requires evidence before accepting model fields and preserves an unanswered preference', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ text: JSON.stringify({ shape: 'loop', preferences: [], goal_type: 'distance', distance_m: 3000, evidence: { shape: '环线' } }) }) })));
    const result = await advanceRunRouteDialogue('环线', { request_text: '跑步', goal: { type: 'distance', distance_m: 5000 } });
    expect(result.draft.goal).toEqual({ type: 'distance', distance_m: 5000 });
    expect(result.draft.preferences).toBeUndefined();
    expect(result.choices).toContain('风景好、少路口');
  });

  it('does not replace an active route or its hardware navigation with a new request', () => {
    const first = createRunRouteSession(parseRunRouteText('跑3公里'));
    updateRunRouteSession(first.session_id, { status: 'navigating' });
    expect(() => createRunRouteSession(parseRunRouteText('跑5公里'))).toThrow('已有路线');
    expect(getActiveRunRouteSessionId()).toBe(first.session_id);
  });

  it('converts high-level route geometry once for the map and native GPS and blocks sample execution', () => {
    const session = createRunRouteSession(parseRunRouteText('跑 5 公里'));
    session.start_source = 'gps'; session.planned_path = [[120.147, 30.26], [120.15, 30.262]];
    session.cues = [{ id: 'end', point_index: 1, instruction: '到达', source: 'arrival' }];
    const payload = nativeRunRoutePayload(session, true);
    expect(payload.points[0]).toEqual(gcj02ToWgs84(session.planned_path[0]));
    expect(wgs84ToGcj02(payload.points[0])[0]).toBeCloseTo(session.planned_path[0][0], 6);
    expect(() => nativeRunRoutePayload({ ...session, start_source: 'sample' }, true)).toThrow('示例');
  });

  it('restores locked-screen track into the same route and ignores stale native revisions', () => {
    const session = createRunRouteSession(parseRunRouteText('跑5公里'));
    session.planned_path = [[120, 30], [120, 30.001]];
    session.cues = [{ id: 'end', point_index: 1, instruction: '到达', source: 'arrival' }];
    const revision = routeRevision(session);
    updateRunRouteSession(session.session_id, { ...session, navigation_owner: 'native', navigation_revision: revision });
    const snapshot: RunNavigationSnapshot = { sessionId: session.session_id, revision, state: 'navigating', active: true, message: '右转', progressM: 60, distanceM: 60, elapsedS: 30,
      deviationM: 4, distanceToTurnM: 20, useBadge: true, badgeConnected: true, audioError: '', backgroundLocation: true,
      track: [{ position: gcj02ToWgs84([120, 30.0005]), accuracy: 8, timestamp: 1000000 }] };
    applyNativeRunSnapshot(snapshot); applyNativeRunSnapshot(snapshot);
    expect(readRunRouteSession(session.session_id)?.actual_track).toHaveLength(1);
    expect(readRunRouteSession(session.session_id)?.metrics.actual_distance_m).toBe(60);
    applyNativeRunSnapshot({ ...snapshot, revision: 'old-route', distanceM: 900 });
    expect(readRunRouteSession(session.session_id)?.metrics.actual_distance_m).toBe(60);
  });

  it('does not jump to a loop finish or an overlapping return leg at the start', () => {
    const path: [number, number][] = [[120, 30], [120, 30.001], [120.001, 30.001], [120.001, 30], [120, 30]];
    expect(projectRunProgress([120, 30], path, 0).progress).toBe(0);
    expect(projectRunProgress([120, 30.0005], [...path.slice(0, 2), path[0]], 0).progress).toBeLessThan(100);
  });

  it('normalizes distance, duration, destination and preferences', () => {
    expect(parseRunRouteText('带我跑 5 公里，要沿湖、平坦一点')).toMatchObject({
      goal: { type: 'distance', distance_m: 5000 }, shape: 'loop', preferences: ['flat', 'lakeside'],
    });
    expect(targetDistanceMeters(parseRunRouteText('跑 30 分钟').goal)).toBe(4286);
    expect(parseRunRouteText('从这里跑到西湖').goal).toEqual({ type: 'destination', query: '西湖' });
  });

  it('persists a route session without inventing a start or path', () => {
    const session = createRunRouteSession(parseRunRouteText('带我跑 3 公里'));
    expect(session.status).toBe('created');
    expect(session.start).toBeUndefined();
    expect(session.planned_path).toEqual([]);
    expect(readRunRouteSession(session.session_id)?.metrics.target_distance_m).toBe(3000);
  });

  it('keeps the structured request and local evidence text across the Taskmaster handoff', () => {
    const input = parseRunRouteText('帮我规划一条 5 公里沿湖、少爬坡的跑步路线');
    const payload = runRouteTaskInput(input);
    expect(payload).toMatchObject({
      goal_type: 'distance', distance_m: 5000, shape: 'loop',
      preferences: ['flat', 'lakeside'], user_text: input.request_text,
    });
    const session = createRunRouteSessionFromTaskmaster({ ...payload, source_task_id: 'task-route-1' });
    expect(session.input).toMatchObject({
      source: 'taskmaster', source_task_id: 'task-route-1', request_text: input.request_text,
    });
  });

  it('measures deviation and rejects impossible GPS jumps', () => {
    const session = createRunRouteSession(parseRunRouteText('带我跑 3 公里'));
    updateRunRouteSession(session.session_id, {
      status: 'ready', start: [120, 30], destination: [120, 30.001], planned_path: [[120, 30], [120, 30.001]],
    });
    appendRunRouteTrackPoint(session.session_id, { position: [120, 30], accuracy_m: 8, recorded_at: '2026-08-20T08:00:00.000Z' });
    appendRunRouteTrackPoint(session.session_id, { position: [120.001, 30.0005], accuracy_m: 8, recorded_at: '2026-08-20T08:01:00.000Z' });
    const offRoute = readRunRouteSession(session.session_id)!;
    expect(offRoute.status).toBe('off_route');
    expect(offRoute.metrics.deviation_m).toBeGreaterThan(55);
    const count = offRoute.actual_track.length;
    appendRunRouteTrackPoint(session.session_id, { position: [125, 35], accuracy_m: 8, recorded_at: '2026-08-20T08:02:00.000Z' });
    expect(readRunRouteSession(session.session_id)?.actual_track).toHaveLength(count);
    appendRunRouteTrackPoint(session.session_id, { position: [120.0005, 30.0005], accuracy_m: 8, recorded_at: '2026-08-20T08:00:30.000Z' });
    expect(readRunRouteSession(session.session_id)?.actual_track).toHaveLength(count);
  });

  it('computes point and route distance in meters', () => {
    const route = [[120, 30], [120, 30.001]] as [number, number][];
    expect(distanceInMeters(route[0], route[1])).toBeGreaterThan(100);
    expect(nearestDistanceToRoute([120, 30.0005], route)).toBeLessThan(1);
  });
});
