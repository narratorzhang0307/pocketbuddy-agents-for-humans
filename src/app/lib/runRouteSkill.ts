export const RUN_ROUTE_SESSION_PROTOCOL = 'pocket-run-route-session/v1' as const;

export type RoutePoint = [number, number];
export type RunRoutePreference = 'scenic' | 'flat' | 'low_crossings' | 'lakeside' | 'quiet';
export type RunRouteShape = 'loop' | 'one_way' | 'out_and_back';

export type RunRouteMeasure =
  | { type: 'distance'; distance_m: number }
  | { type: 'duration'; duration_min: number; pace_min_per_km?: number };
export type RunRouteGoal = RunRouteMeasure | { type: 'destination'; query: string; target?: RunRouteMeasure };

export interface RunRouteInput {
  activity: 'running' | 'walking';
  start: 'current_location' | 'place';
  start_query?: string;
  goal: RunRouteGoal;
  shape: RunRouteShape;
  preferences: RunRoutePreference[];
  source: 'user' | 'agent' | 'taskmaster';
  source_task_id?: string;
  request_text?: string;
  /** Only the actual badge inbox may enable this, never model-supplied JSON. */
  auto_start?: boolean;
}

export interface RunRouteCue {
  id: string;
  point_index: number;
  instruction: string;
  source: 'amap' | 'geometry' | 'arrival';
}

export type RunRouteStatus =
  | 'created'
  | 'locating'
  | 'planning'
  | 'ready'
  | 'navigating'
  | 'paused'
  | 'off_route'
  | 'completed'
  | 'failed';

export interface RunRouteTrackPoint {
  position: RoutePoint;
  accuracy_m: number;
  recorded_at: string;
}

export interface RunRouteSession {
  protocol: typeof RUN_ROUTE_SESSION_PROTOCOL;
  session_id: string;
  input: RunRouteInput;
  status: RunRouteStatus;
  provider: 'amap-jsapi-v2';
  start?: RoutePoint;
  start_source?: 'gps' | 'sample' | 'place';
  start_label?: string;
  destination?: RoutePoint;
  destination_label?: string;
  planned_path: RoutePoint[];
  cues?: RunRouteCue[];
  actual_shape?: RunRouteShape;
  route_evidence?: { candidates: number; via: string[]; crossings: number; turns: number; target_met?: boolean; distance_tolerance_m?: number;
    geometry?: { valid: boolean; repeated_distance_m: number; retraced_distance_m: number; longest_retrace_m: number; reason?: string }; turnaround_index?: number };
  navigation_owner?: 'native' | 'web';
  navigation_revision?: string;
  navigation_message?: string;
  actual_track: RunRouteTrackPoint[];
  metrics: {
    target_distance_m?: number;
    planned_distance_m: number;
    actual_distance_m: number;
    elapsed_s: number;
    pace_min_per_km?: number;
    deviation_m?: number;
  };
  warnings: string[];
  error?: string;
  created_at: string;
  updated_at: string;
}

const STORAGE_KEY = 'pe.run-route.sessions.v1';
const ACTIVE_KEY = 'pe.run-route.active-session.v1';
const memorySessions = new Map<string, RunRouteSession>();
let memoryActive: string | null = null;
const listeners = new Set<(sessionId: string | null) => void>();
const openListeners = new Set<(sessionId: string | null) => void>();

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function readStoredSessions(): Record<string, RunRouteSession> {
  if (!canUseStorage()) return Object.fromEntries(memorySessions);
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, RunRouteSession>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredSessions(sessions: Record<string, RunRouteSession>): void {
  if (!canUseStorage()) {
    memorySessions.clear();
    Object.entries(sessions).forEach(([id, session]) => memorySessions.set(id, structuredClone(session)));
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function notify(sessionId: string | null): void {
  listeners.forEach((listener) => {
    try { listener(sessionId); } catch { /* A view observer must not interrupt the saved route's handoff. */ }
  });
}

function sessionId(): string {
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10);
  return `run-route:${Date.now().toString(36)}:${random}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function targetDistanceMeters(goal: RunRouteGoal): number | undefined {
  if (goal.type === 'destination') return goal.target ? targetDistanceMeters(goal.target) : undefined;
  if (goal.type === 'distance') return clamp(Math.round(goal.distance_m), 500, 50_000);
  if (goal.type === 'duration') {
    const pace = clamp(goal.pace_min_per_km ?? 7, 4, 15);
    return clamp(Math.round(goal.duration_min / pace * 1000), 500, 50_000);
  }
  return undefined;
}

/** Road routing is approximate; the same tolerance gates UI and voice auto-start. */
export const runRouteDistanceTolerance = (target: number): number => Math.max(100, target * .05);
export const runRouteDistanceMatches = (target: number | undefined, actual: number): boolean =>
  target === undefined || Math.abs(actual - target) <= runRouteDistanceTolerance(target);

const ROUTE_AMOUNT = /([负－-]?[\d.零一二两三四五六七八九十百千半点]+(?:个半)?)\s*(?:个)?\s*(公里|千米|km|米|分钟|小时)(半)?/gi;

function spokenNumber(value: string): number {
  if (/^[负－-]/.test(value)) return -spokenNumber(value.slice(1));
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (value === '半') return .5;
  if (value.endsWith('半')) return spokenNumber(value.slice(0, -1).replace(/个$/, '')) + .5;
  const digits: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value.includes('点')) {
    const [whole, fraction, extra] = value.split('点');
    if (extra !== undefined || !fraction || [...fraction].some(c => !(c in digits))) return NaN;
    return spokenNumber(whole || '零') + Number(`0.${[...fraction].map(c => digits[c]).join('')}`);
  }
  let total = 0, digit = 0;
  for (const char of value) {
    if (char === '十' || char === '百' || char === '千') { total += (digit || 1) * ({ 十: 10, 百: 100, 千: 1000 }[char]); digit = 0; }
    else if (char in digits) digit = digits[char];
    else return NaN;
  }
  return total + digit;
}

/** Shared by dialogue and Taskmaster's text fallback; later spoken corrections win. */
export function parseRunRouteMeasure(text: string): RunRouteMeasure | undefined {
  const amount = [...text.matchAll(ROUTE_AMOUNT)].at(-1);
  if (!amount) return undefined;
  const value = spokenNumber(amount[1]) + (amount[3] ? .5 : 0);
  if (!Number.isFinite(value)) return undefined;
  return /分钟|小时/.test(amount[2])
    ? { type: 'duration', duration_min: value * (amount[2] === '小时' ? 60 : 1) }
    : { type: 'distance', distance_m: value * (amount[2] === '米' ? 1 : 1000) };
}

export function parseRunRouteDestination(text: string): string | undefined {
  const match = text.match(/(?:慢跑到|跑到|跑去|走到)\s*([^，,。！？；;\n]{2,80})/)
    || text.match(/(?:去|到)\s*([^，,。！？；;\n]{2,30}?)(?:跑步|慢跑|跑)(?=\s*[\d零一二两三四五六七八九十百半])/)
    || (/(?:规划|设计|安排|推荐|生成).*(?:路线|线路)/.test(text) ? text.match(/(?:去|到)\s*([^，,。！？；;\n]{2,80})/) : null);
  if (!match) return undefined;
  let query = match[1].replace(/(?:的)?(?:跑步|慢跑|夜跑|晨跑|步行)?(?:路线|线路).*$/, '');
  const amountAt = query.search(ROUTE_AMOUNT);
  if (amountAt >= 0) query = query.slice(0, amountAt).replace(/(?:全程|总共|总程|大约|约|跑步|慢跑|跑|的)\s*$/, '');
  return query.trim() || undefined;
}

export function parseRunRouteText(text: string): RunRouteInput {
  const normalized = text.trim();
  const measure = parseRunRouteMeasure(normalized), destination = parseRunRouteDestination(normalized);
  const goal: RunRouteGoal = destination ? { type: 'destination', query: destination, ...(measure ? { target: measure } : {}) }
    : measure || { type: 'distance', distance_m: 5000 };

  const preferences: RunRoutePreference[] = [];
  if (/(风景|好看|公园|绿道)/.test(normalized)) preferences.push('scenic');
  if (/(平坦|少爬坡)/.test(normalized)) preferences.push('flat');
  if (/(少红绿灯|少路口)/.test(normalized)) preferences.push('low_crossings');
  if (/(沿湖|沿江|沿河|水边)/.test(normalized)) preferences.push('lakeside');
  if (/(安静|少人|不吵)/.test(normalized)) preferences.push('quiet');

  return {
    activity: /(走|散步|快走)/.test(normalized) ? 'walking' : 'running',
    start: 'current_location',
    goal,
    shape: /(往返|原路返回)/.test(normalized) ? 'out_and_back' : goal.type === 'destination' ? 'one_way' : 'loop',
    preferences,
    source: 'user',
    ...(normalized ? { request_text: normalized.slice(0, 240) } : {}),
  };
}

function inputFromUnknown(value: Record<string, unknown>, source: RunRouteInput['source']): RunRouteInput {
  const fromText = parseRunRouteText(typeof value.user_text === 'string' ? value.user_text : '');
  const goalType = value.goal_type;
  let goal = fromText.goal;
  if (goalType === 'distance' && typeof value.distance_m === 'number') goal = { type: 'distance', distance_m: value.distance_m };
  else if (goalType === 'duration' && typeof value.duration_min === 'number') goal = { type: 'duration', duration_min: value.duration_min };
  else if (goalType === 'destination' && typeof value.destination === 'string' && value.destination.trim()) {
    const target: RunRouteMeasure | undefined = typeof value.distance_m === 'number' ? { type: 'distance', distance_m: value.distance_m }
      : typeof value.duration_min === 'number' ? { type: 'duration', duration_min: value.duration_min } : fromText.goal.type === 'destination' ? fromText.goal.target : undefined;
    goal = { type: 'destination', query: value.destination.trim(), ...(target ? { target } : {}) };
  }
  const shape = value.shape === 'one_way' || value.shape === 'out_and_back' || value.shape === 'loop'
    ? value.shape
    : goal.type === 'destination' ? 'one_way' : fromText.shape;
  const preferences = Array.isArray(value.preferences)
    ? value.preferences.filter((item): item is RunRoutePreference => ['scenic', 'flat', 'low_crossings', 'lakeside', 'quiet'].includes(String(item)))
    : fromText.preferences;
  return {
    ...fromText,
    goal,
    shape,
    preferences,
    source,
    ...(value.start === 'place' && typeof value.start_query === 'string' && value.start_query.trim()
      ? { start: 'place', start_query: value.start_query.trim().slice(0, 80) } : {}),
    ...(value.auto_start === true ? { auto_start: true } : {}),
    ...(typeof value.source_task_id === 'string' ? { source_task_id: value.source_task_id } : {}),
    ...(typeof value.user_text === 'string' && value.user_text.trim()
      ? { request_text: value.user_text.trim().slice(0, 240) }
      : {}),
  };
}

export function runRouteTaskInput(input: RunRouteInput): Record<string, unknown> {
  const goal = input.goal.type === 'distance'
    ? { goal_type: 'distance', distance_m: input.goal.distance_m }
    : input.goal.type === 'duration'
      ? { goal_type: 'duration', duration_min: input.goal.duration_min }
      : { goal_type: 'destination', destination: input.goal.query, ...(input.goal.target?.type === 'distance' ? { distance_m: input.goal.target.distance_m }
        : input.goal.target?.type === 'duration' ? { duration_min: input.goal.target.duration_min } : {}) };
  return {
    ...goal,
    activity: input.activity,
    start: input.start,
    ...(input.start_query ? { start_query: input.start_query } : {}),
    ...(input.auto_start ? { auto_start: true } : {}),
    shape: input.shape,
    preferences: [...input.preferences],
    ...(input.request_text ? { user_text: input.request_text.slice(0, 240) } : {}),
  };
}

export function createRunRouteSession(input: RunRouteInput): RunRouteSession {
  const activeId = getActiveRunRouteSessionId();
  const active = activeId ? readRunRouteSession(activeId) : null;
  if (active && ['navigating', 'off_route'].includes(active.status)) throw new Error('已有路线正在导航，请先在行动地图暂停或结束当前路线；蓝牙无需断开。');
  const now = new Date().toISOString();
  const id = sessionId();
  const session: RunRouteSession = {
    protocol: RUN_ROUTE_SESSION_PROTOCOL,
    session_id: id,
    input: structuredClone(input),
    status: 'created',
    provider: 'amap-jsapi-v2',
    planned_path: [],
    actual_track: [],
    metrics: {
      target_distance_m: targetDistanceMeters(input.goal),
      planned_distance_m: 0,
      actual_distance_m: 0,
      elapsed_s: 0,
    },
    warnings: [],
    created_at: now,
    updated_at: now,
  };
  const sessions = readStoredSessions();
  sessions[id] = session;
  writeStoredSessions(sessions);
  setActiveRunRouteSession(id);
  return structuredClone(session);
}

export function createRunRouteSessionFromTaskmaster(input: Record<string, unknown>): RunRouteSession {
  return createRunRouteSession(inputFromUnknown(input, 'taskmaster'));
}

export function readRunRouteSession(id: string): RunRouteSession | null {
  const session = readStoredSessions()[id];
  return session ? structuredClone(session) : null;
}

export function updateRunRouteSession(id: string, update: Partial<RunRouteSession> | ((current: RunRouteSession) => RunRouteSession)): RunRouteSession {
  const sessions = readStoredSessions();
  const current = sessions[id];
  if (!current) throw new Error(`run_route_session_not_found:${id}`);
  const next = typeof update === 'function' ? update(structuredClone(current)) : { ...current, ...structuredClone(update) };
  next.updated_at = new Date().toISOString();
  sessions[id] = next;
  writeStoredSessions(sessions);
  notify(id);
  return structuredClone(next);
}

export function getActiveRunRouteSessionId(): string | null {
  if (!canUseStorage()) return memoryActive;
  try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}

export function setActiveRunRouteSession(id: string | null): void {
  if (!canUseStorage()) memoryActive = id;
  else if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
  notify(id);
  openListeners.forEach((listener) => {
    try { listener(id); } catch { /* Other mounted surfaces still need the request. */ }
  });
}

/** Open a saved result, including retries; never create a new route or stop live navigation. */
export function openRunRouteSession(id: string): RunRouteSession {
  const session = readRunRouteSession(id);
  if (!session) throw new Error('这条路线已不可用，请重新规划。');
  const activeId = getActiveRunRouteSessionId();
  const active = activeId ? readRunRouteSession(activeId) : null;
  if (active && activeId !== id && ['navigating', 'off_route'].includes(active.status)) {
    throw new Error('已有路线正在导航，请先在行动地图暂停或结束当前路线；蓝牙无需断开。');
  }
  setActiveRunRouteSession(id);
  return session;
}

export function subscribeRunRouteSession(listener: (sessionId: string | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function subscribeRunRouteOpen(listener: (sessionId: string | null) => void): () => void {
  openListeners.add(listener);
  // App / lazy map effects can mount after Taskmaster saved the result.
  const activeId = getActiveRunRouteSessionId();
  if (activeId && readRunRouteSession(activeId)) {
    try { listener(activeId); } catch { /* Keep the subscription available for the next request. */ }
  }
  return () => openListeners.delete(listener);
}

export function distanceInMeters(left: RoutePoint, right: RoutePoint): number {
  const latitude = ((left[1] + right[1]) / 2) * Math.PI / 180;
  const x = (left[0] - right[0]) * 111_320 * Math.cos(latitude);
  const y = (left[1] - right[1]) * 110_540;
  return Math.hypot(x, y);
}

export function routeDistance(points: RoutePoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += distanceInMeters(points[index - 1], points[index]);
  return total;
}

function distanceToSegment(point: RoutePoint, start: RoutePoint, end: RoutePoint): number {
  const latitude = point[1] * Math.PI / 180;
  const scaleX = 111_320 * Math.cos(latitude);
  const scaleY = 110_540;
  const ax = (start[0] - point[0]) * scaleX;
  const ay = (start[1] - point[1]) * scaleY;
  const bx = (end[0] - point[0]) * scaleX;
  const by = (end[1] - point[1]) * scaleY;
  const dx = bx - ax;
  const dy = by - ay;
  const denominator = dx * dx + dy * dy;
  const t = denominator > 0 ? clamp(-(ax * dx + ay * dy) / denominator, 0, 1) : 0;
  return Math.hypot(ax + dx * t, ay + dy * t);
}

export function nearestDistanceToRoute(point: RoutePoint, route: RoutePoint[]): number {
  if (route.length === 0) return Number.POSITIVE_INFINITY;
  if (route.length === 1) return distanceInMeters(point, route[0]);
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < route.length; index += 1) nearest = Math.min(nearest, distanceToSegment(point, route[index - 1], route[index]));
  return nearest;
}

export function appendRunRouteTrackPoint(id: string, point: RunRouteTrackPoint): RunRouteSession {
  return updateRunRouteSession(id, (session) => {
    if (point.accuracy_m > 100) return session;
    const previous = session.actual_track.at(-1);
    if (previous && Date.parse(point.recorded_at) <= Date.parse(previous.recorded_at)) return session;
    const stepMeters = previous ? distanceInMeters(previous.position, point.position) : 0;
    if (previous && stepMeters > 250) return session;
    session.actual_track = [...session.actual_track.slice(-4_998), structuredClone(point)];
    if (stepMeters >= 1) session.metrics.actual_distance_m += stepMeters;
    const startedAt = session.actual_track[0]?.recorded_at;
    session.metrics.elapsed_s = startedAt
      ? Math.max(0, Math.round((Date.parse(point.recorded_at) - Date.parse(startedAt)) / 1000))
      : 0;
    if (session.metrics.actual_distance_m >= 100 && session.metrics.elapsed_s > 0) {
      session.metrics.pace_min_per_km = session.metrics.elapsed_s / 60 / (session.metrics.actual_distance_m / 1000);
    }
    const deviation = nearestDistanceToRoute(point.position, session.planned_path);
    session.metrics.deviation_m = Number.isFinite(deviation) ? deviation : undefined;
    session.status = deviation > 55 && point.accuracy_m <= 50 ? 'off_route' : 'navigating';
    return session;
  });
}

export function resetRunRouteSkillForTests(): void {
  memorySessions.clear();
  memoryActive = null;
  if (canUseStorage()) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ACTIVE_KEY);
  }
}
