import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { gcj02ToWgs84, wgs84ToGcj02 } from '../../../vendor/legacy-city/src/app/lib/location/chinaCoordinates';
import { frostBadge, nativeFrostBadge } from './frostBadge';
import { assessRunRouteGeometry } from './runRouteGeometry';
import { appendRunRouteTrackPoint, distanceInMeters, readRunRouteSession, runRouteDistanceMatches, updateRunRouteSession,
  type RoutePoint, type RunRouteSession } from './runRouteSkill';

export interface RunNavigationSnapshot {
  sessionId: string;
  revision: string;
  state: 'idle' | 'acquiring' | 'navigating' | 'off_route' | 'paused' | 'stopped' | 'arrived' | 'error';
  active: boolean;
  message: string;
  progressM: number;
  distanceM: number;
  elapsedS: number;
  deviationM: number;
  distanceToTurnM: number;
  useBadge: boolean;
  badgeConnected: boolean;
  audioError: string;
  backgroundLocation: boolean;
  track?: Array<{ position: RoutePoint; accuracy: number; timestamp: number }>;
}
interface NativeRunNavigation {
  startRunNavigation(options: ReturnType<typeof nativeRunRoutePayload>): Promise<RunNavigationSnapshot>;
  pauseRunNavigation(): Promise<RunNavigationSnapshot>;
  stopRunNavigation(): Promise<RunNavigationSnapshot>;
  runNavigationStatus(): Promise<RunNavigationSnapshot>;
  addListener(event: 'runNavigation', callback: (state: RunNavigationSnapshot) => void): Promise<PluginListenerHandle>;
}
const native = nativeFrostBadge as unknown as NativeRunNavigation;
export const supportsNativeRunNavigation = () => Capacitor.getPlatform() === 'ios' && Capacitor.isNativePlatform();

export function routeRevision(session: RunRouteSession): string {
  let hash = 2166136261;
  const value = JSON.stringify([session.planned_path, session.cues]);
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return `route-${(hash >>> 0).toString(16)}`;
}

/** Map runtime and CoreLocation both use WGS84. Convert exactly once at their boundary. */
export function nativeRunRoutePayload(session: RunRouteSession, useBadge: boolean) {
  if (session.start_source === 'sample' || session.planned_path.length < 2 || !session.cues?.length) throw new Error('A sample route, or one without turn data, cannot start real navigation. Please plan the route again.');
  return { sessionId: session.session_id, revision: routeRevision(session), coordinateSystem: 'wgs84', provider: session.provider,
    points: session.planned_path.map(gcj02ToWgs84), cues: session.cues, useBadge,
    distanceOffsetM: session.metrics.actual_distance_m, elapsedOffsetS: session.metrics.elapsed_s };
}

export function applyNativeRunSnapshot(snapshot: RunNavigationSnapshot): void {
  const session = readRunRouteSession(snapshot.sessionId);
  if (!session || session.navigation_owner !== 'native' || snapshot.revision !== session.navigation_revision || session.status === 'completed') return;
  const seen = new Set(session.actual_track.map(p => p.recorded_at));
  const track = (snapshot.track || []).filter(p => p.accuracy >= 0 && p.accuracy <= 50 && Number.isFinite(p.timestamp)
    && p.position.length === 2 && p.position.every(Number.isFinite)).map(p => ({ position: wgs84ToGcj02(p.position), accuracy_m: p.accuracy, recorded_at: new Date(p.timestamp).toISOString() }))
    .filter(p => !seen.has(p.recorded_at));
  const elapsed = Math.max(0, Math.round(snapshot.elapsedS)), distance = Math.max(0, snapshot.distanceM);
  updateRunRouteSession(session.session_id, {
    actual_track: [...session.actual_track, ...track].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)).slice(-5000),
    status: snapshot.state === 'off_route' ? 'off_route' : snapshot.active ? 'navigating' : 'paused',
    navigation_message: snapshot.message, error: snapshot.audioError || (snapshot.state === 'error' ? snapshot.message : undefined),
    metrics: { ...session.metrics, actual_distance_m: distance, elapsed_s: elapsed,
      deviation_m: snapshot.deviationM, pace_min_per_km: distance >= 100 ? elapsed / 60 / (distance / 1000) : undefined },
  });
}

let initialized: Promise<void> | undefined;
let current: RunNavigationSnapshot | null = null;
const listeners = new Set<(state: RunNavigationSnapshot) => void>();
function accept(snapshot: RunNavigationSnapshot) {
  current = snapshot; applyNativeRunSnapshot(snapshot); listeners.forEach(listener => listener(snapshot));
}
export function getRunNavigationSnapshot() { return current; }
export function subscribeRunNavigation(listener: (state: RunNavigationSnapshot) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

export async function initializeRunNavigation(): Promise<void> {
  if (!supportsNativeRunNavigation()) return;
  if (!initialized) initialized = (async () => {
    await native.addListener('runNavigation', accept);
    const restore = () => {
      if (document.visibilityState !== 'hidden') void native.runNavigationStatus().then(accept).catch(() => {});
    };
    document.addEventListener('visibilitychange', restore);
    accept(await native.runNavigationStatus());
  })().catch(error => { initialized = undefined; throw error; });
  return initialized;
}

/** Monotonic local segment projection, so a loop does not finish while still at its start. */
export function projectRunProgress(point: RoutePoint, path: RoutePoint[], previous: number): { progress: number; deviation: number } {
  let cumulative = 0, best = Infinity, progress = previous;
  for (let i = 1; i < path.length; i++) {
    const length = distanceInMeters(path[i - 1], path[i]);
    if (cumulative + length >= previous - 25 && cumulative <= previous + 120) {
      const scale = 111320 * Math.cos(point[1] * Math.PI / 180);
      const ax = (path[i - 1][0] - point[0]) * scale, ay = (path[i - 1][1] - point[1]) * 110540;
      const dx = (path[i][0] - path[i - 1][0]) * scale, dy = (path[i][1] - path[i - 1][1]) * 110540;
      const t = dx * dx + dy * dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
      const along = cumulative + t * length;
      const lateral = Math.hypot(ax + dx * t, ay + dy * t) + (along < previous - 3 ? 4 : 0);
      if (along <= previous + 120 && lateral < best - .01) { best = lateral; progress = Math.max(previous, along); }
    }
    cumulative += length;
  }
  return { progress, deviation: best };
}

let webWatch: number | null = null, webId: string | null = null;
let webRun: { id: string; revision: string; progress: number; spoken: Set<string> } | undefined;
let webGeneration = 0;
let starting = false;

export async function startRunNavigation(id: string, requireBadge = false): Promise<void> {
  if (starting) return;
  starting = true;
  try {
    const session = readRunRouteSession(id);
    if (!session) throw new Error('This route session no longer exists.');
    if (requireBadge && (session.actual_shape !== session.input.shape || !runRouteDistanceMatches(session.metrics.target_distance_m, session.metrics.planned_distance_m)))
      throw new Error('The route shape or distance does not meet the target, so it did not start automatically. Please confirm it explicitly on the map first.');
    const geometry = assessRunRouteGeometry(session.planned_path, session.actual_shape || session.input.shape, session.route_evidence?.turnaround_index);
    if (!geometry.valid) throw new Error(geometry.reason);
    const useBadge = frostBadge.snapshot().status === 'connected';
    const payload = nativeRunRoutePayload(session, useBadge);
    if (supportsNativeRunNavigation()) {
      await initializeRunNavigation();
      if (current?.active && current.sessionId !== id) throw new Error('A route is already navigating. Please end the current route first.');
      if (requireBadge && !useBadge) throw new Error('The hardware is not connected, so it did not start automatically. Connect it and try again, or start navigation manually on your phone.');
      updateRunRouteSession(id, { navigation_owner: 'native', navigation_revision: payload.revision, error: undefined });
      accept(await native.startRunNavigation(payload));
      return;
    }
    if (!navigator.geolocation) throw new Error('This browser does not support location services');
    if (webId && webId !== id) await pauseRunNavigation(webId);
    if (webWatch !== null) return;
    const generation = ++webGeneration; webId = id;
    if (!webRun || webRun.id !== id || webRun.revision !== payload.revision) webRun = { id, revision: payload.revision, progress: 0, spoken: new Set() };
    let progress = webRun.progress, offCount = 0;
    let lastFix: { point: RoutePoint; time: number } | undefined;
    const spoken = webRun.spoken;
    const cumulative = [0];
    for (let i = 1; i < session.planned_path.length; i++) cumulative.push(cumulative[i - 1] + distanceInMeters(session.planned_path[i - 1], session.planned_path[i]));
    updateRunRouteSession(id, { status: 'navigating', navigation_owner: 'web', navigation_message: 'The web page only navigates in the foreground; lock-screen cues need the newer iOS app.', error: undefined });
    webWatch = navigator.geolocation.watchPosition(position => {
      if (generation !== webGeneration || webId !== id) return;
      if (!Number.isFinite(position.coords.accuracy) || position.coords.accuracy < 0 || position.coords.accuracy > 50 || Date.now() - position.timestamp > 15000 || position.timestamp > Date.now() + 2000) { updateRunRouteSession(id, { navigation_message: 'Location accuracy is too low, so turn cues are paused' }); return; }
      const point = wgs84ToGcj02([position.coords.longitude, position.coords.latitude]);
      if (lastFix && (position.timestamp <= lastFix.time || distanceInMeters(lastFix.point, point) > Math.max(30, (position.timestamp - lastFix.time) / 1000 * 9 + position.coords.accuracy))) return;
      if (progress < 1 && distanceInMeters(point, session.planned_path[0]) > 120) { updateRunRouteSession(id, { navigation_message: 'Please move closer to the route start before beginning; this was not recorded as a valid run' }); return; }
      const projected = projectRunProgress(point, session.planned_path, progress);
      offCount = projected.deviation > 55 ? offCount + 1 : 0;
      if (offCount === 0) progress = projected.progress;
      webRun!.progress = progress; lastFix = { point, time: position.timestamp };
      appendRunRouteTrackPoint(id, { position: point, accuracy_m: position.coords.accuracy, recorded_at: new Date(position.timestamp).toISOString() });
      const cue = session.cues?.find(c => cumulative[c.point_index] >= progress - 8);
      const remaining = cue ? Math.max(0, cumulative[cue.point_index] - progress) : 0;
      const message = offCount >= 3 ? 'You are off the route. Stop somewhere safe first and check the map' : cue?.instruction || 'Continue along the route';
      const snapshot: RunNavigationSnapshot = { sessionId: id, revision: payload.revision, state: offCount >= 3 ? 'off_route' : 'navigating', active: true, message,
        progressM: progress, deviationM: projected.deviation, distanceToTurnM: remaining, useBadge: false, badgeConnected: false, audioError: '', backgroundLocation: false,
        distanceM: readRunRouteSession(id)?.metrics.actual_distance_m || 0, elapsedS: readRunRouteSession(id)?.metrics.elapsed_s || 0 };
      current = snapshot; listeners.forEach(listener => listener(snapshot));
      updateRunRouteSession(id, { status: offCount >= 3 ? 'off_route' : 'navigating', navigation_message: message });
      const key = `${cue?.id}:${remaining < 20 ? 'now' : 'ahead'}`;
      if (cue && remaining <= 80 && projected.deviation <= 35 && !spoken.has(key) && 'speechSynthesis' in window && !window.speechSynthesis.speaking) {
        if (cue.source === 'arrival' && (progress < cumulative[cumulative.length - 1] - 18 || progress < cumulative[cumulative.length - 1] * .8)) return;
        const utterance = new SpeechSynthesisUtterance(cue.source === 'arrival' ? cue.instruction : `In about ${Math.round(remaining / 10) * 10} metres, ${cue.instruction}`);
        utterance.lang = 'en-US'; window.speechSynthesis.speak(utterance); spoken.add(key);
      }
      const total = cumulative[cumulative.length - 1];
      if (progress >= total - 18 && progress > total * .8 && distanceInMeters(point, session.planned_path.at(-1)!) < 30) {
        ++webGeneration;
        if (webWatch !== null) navigator.geolocation.clearWatch(webWatch);
        webWatch = null; webId = null;
        current = { ...snapshot, state: 'arrived', active: false, message: 'You have reached the end of the running route. Please stop safely' };
        listeners.forEach(listener => listener(current!));
        updateRunRouteSession(id, { status: 'paused', navigation_message: current.message });
      }
    }, error => {
      if (generation !== webGeneration) return;
      void pauseRunNavigation(id).then(() => updateRunRouteSession(id, { error: error.message || 'Location updates were interrupted' }));
    }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
  } finally { starting = false; }
}

export async function pauseRunNavigation(id: string): Promise<void> {
  if (supportsNativeRunNavigation()) {
    const state = await native.runNavigationStatus();
    if (state.sessionId === id) accept(await native.pauseRunNavigation());
  } else if (webId === id) {
    ++webGeneration;
    if (webWatch !== null) navigator.geolocation.clearWatch(webWatch);
    webWatch = null; webId = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    if (current?.sessionId === id) { current = { ...current, active: false, state: 'paused', message: 'Navigation paused' }; listeners.forEach(listener => listener(current!)); }
  }
  const session = readRunRouteSession(id);
  if (session && session.status !== 'completed') updateRunRouteSession(id, { status: 'paused' });
}

export async function stopRunNavigation(id: string): Promise<void> {
  if (supportsNativeRunNavigation()) {
    const state = await native.runNavigationStatus();
    if (state.sessionId === id) accept(await native.stopRunNavigation());
  } else { await pauseRunNavigation(id); if (webRun?.id === id) webRun = undefined; }
}

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
  if (!supportsNativeRunNavigation() && document.visibilityState === 'hidden' && webId) {
    const id = webId;
    void pauseRunNavigation(id).then(() => updateRunRouteSession(id, { navigation_message: 'The web page moved to the background, so navigation is paused; use the iOS app for lock-screen navigation.' }));
  }
});
