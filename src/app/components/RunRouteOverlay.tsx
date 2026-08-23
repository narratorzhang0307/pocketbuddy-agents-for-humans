import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RefreshCw, Sparkles, Square, X } from 'lucide-react';
import type { CityMapRuntime } from '../integrations/soundWalk';
import { loadAmapNamespace, planRunRouteSession, replanRunRouteFromPosition, toAmapPosition } from '../lib/amapRunRoute';
import {
  appendRunRouteTrackPoint,
  readRunRouteSession,
  setActiveRunRouteSession,
  subscribeRunRouteSession,
  updateRunRouteSession,
  type RoutePoint,
  type RunRouteSession,
} from '../lib/runRouteSkill';
import { completeRunWithTaskmaster } from '../lib/healthTaskmasterRuntime';

interface Props {
  map: CityMapRuntime | null;
  sessionId: string;
}

const HANGZHOU_SAMPLE_START: RoutePoint = [120.14703, 30.260901];

function km(value: number): string {
  return `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)} km`;
}

function requestSummary(session: RunRouteSession): string {
  if (session.input.request_text) return session.input.request_text;
  if (session.input.goal.type === 'distance') return `规划 ${km(session.input.goal.distance_m)} 跑步路线`;
  if (session.input.goal.type === 'duration') return `规划 ${session.input.goal.duration_min} 分钟跑步路线`;
  return `规划跑到${session.input.goal.query}的路线`;
}

function statusCopy(status: RunRouteSession['status']): string {
  return ({ created: 'PLANNING', locating: 'LOCATING', planning: 'PLANNING', ready: 'READY', navigating: 'LIVE', paused: 'PAUSED', off_route: 'REPLAN', completed: 'DONE', failed: 'FAILED' })[status];
}

function routeCenter(points: RoutePoint[]): RoutePoint | null {
  if (!points.length) return null;
  const total = points.reduce<RoutePoint>((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
  return [total[0] / points.length, total[1] / points.length];
}

export default function RunRouteOverlay({ map, sessionId }: Props) {
  const [session, setSession] = useState<RunRouteSession | null>(() => readRunRouteSession(sessionId));
  const [mapRevision, redraw] = useState(0);
  const [finalizing, setFinalizing] = useState(false);
  const planningRef = useRef(false);
  const replanRef = useRef(false);
  const fittedPathRef = useRef('');
  const watchRef = useRef<number | null>(null);

  useEffect(() => subscribeRunRouteSession((changedId) => {
    if (changedId === sessionId) setSession(readRunRouteSession(sessionId));
  }), [sessionId]);

  useEffect(() => {
    if (!session || session.status !== 'created' || planningRef.current) return;
    planningRef.current = true;
    void planRunRouteSession(sessionId);
  }, [session, sessionId]);

  useEffect(() => {
    if (!map) return undefined;
    const update = () => redraw((value) => value + 1);
    map.on('move', update);
    return () => map.off('move', update);
  }, [map]);

  useEffect(() => {
    if (!map || !session || session.planned_path.length < 2) return;
    const key = `${session.planned_path[0].join(',')}:${session.planned_path.at(-1)!.join(',')}:${session.planned_path.length}`;
    if (fittedPathRef.current === key) return;
    fittedPathRef.current = key;
    const center = routeCenter(session.planned_path);
    if (center) map.flyTo({ center, zoom: 13.6, duration: 800 });
  }, [map, session]);

  const stopTracking = useCallback(() => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
  }, []);

  useEffect(() => () => stopTracking(), [stopTracking]);

  useEffect(() => {
    if (session?.status !== 'off_route' || replanRef.current) return;
    const latest = session.actual_track.at(-1)?.position;
    if (!latest) return;
    replanRef.current = true;
    void replanRunRouteFromPosition(sessionId, latest).finally(() => { replanRef.current = false; });
  }, [session, sessionId]);

  const startTracking = useCallback(async () => {
    if (!session || watchRef.current !== null) return;
    if (!navigator.geolocation) {
      updateRunRouteSession(sessionId, { status: 'paused', error: '当前设备不支持 GPS 跟踪。' });
      return;
    }
    try {
      const AMap = await loadAmapNamespace();
      updateRunRouteSession(sessionId, { status: 'navigating', error: undefined });
      watchRef.current = navigator.geolocation.watchPosition(async (position) => {
        try {
          const converted = await toAmapPosition(AMap, [position.coords.longitude, position.coords.latitude]);
          appendRunRouteTrackPoint(sessionId, {
            position: converted,
            accuracy_m: position.coords.accuracy,
            recorded_at: new Date(position.timestamp).toISOString(),
          });
        } catch (error) {
          stopTracking();
          updateRunRouteSession(sessionId, { status: 'paused', error: error instanceof Error ? error.message : 'GPS 坐标转换失败' });
        }
      }, (error) => {
        stopTracking();
        updateRunRouteSession(sessionId, { status: 'paused', error: error.message || 'GPS 跟踪中断' });
      }, { enableHighAccuracy: true, maximumAge: 1_000, timeout: 15_000 });
    } catch (error) {
      updateRunRouteSession(sessionId, { status: 'paused', error: error instanceof Error ? error.message : '地图加载失败' });
    }
  }, [session, sessionId, stopTracking]);

  const close = () => {
    stopTracking();
    setActiveRunRouteSession(null);
  };

  const retryRealLocation = () => {
    planningRef.current = true;
    updateRunRouteSession(sessionId, { start_source: undefined, error: undefined });
    void planRunRouteSession(sessionId);
  };

  const useSampleStart = () => {
    if (!session) return;
    const warning = '当前使用杭州西湖示例起点，仅供路线预览；不会记录为真实位置。';
    updateRunRouteSession(sessionId, {
      start_source: 'sample',
      warnings: session.warnings.includes(warning) ? session.warnings : [...session.warnings, warning],
      error: undefined,
    });
    planningRef.current = true;
    void planRunRouteSession(sessionId, HANGZHOU_SAMPLE_START);
  };

  const finishTracking = async () => {
    if (finalizing) return;
    stopTracking();
    const latest = readRunRouteSession(sessionId);
    if (!latest) return;
    setFinalizing(true);
    try {
      if (latest.actual_track.length >= 2 && latest.metrics.actual_distance_m >= 50) {
        await completeRunWithTaskmaster({
          distance_m: Math.round(latest.metrics.actual_distance_m),
          duration_s: latest.metrics.elapsed_s,
          route_session_id: latest.session_id,
          route_points: latest.actual_track.map((item) => ({ longitude: item.position[0], latitude: item.position[1], accuracy_m: item.accuracy_m, recorded_at: item.recorded_at })),
        });
      }
      updateRunRouteSession(sessionId, { status: 'completed', error: undefined });
    } catch (error) {
      updateRunRouteSession(sessionId, { status: 'paused', error: error instanceof Error ? error.message : '运动记录写入失败' });
    } finally {
      setFinalizing(false);
    }
  };

  const plannedPoints = useMemo(() => map && session
    ? session.planned_path.map((point) => map.project(point)).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    : [], [map, mapRevision, session]);
  const actualPoints = useMemo(() => map && session
    ? session.actual_track.map((item) => map.project(item.position)).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    : [], [map, mapRevision, session]);
  const marker = map && session?.start ? map.project(session.actual_track.at(-1)?.position || session.start) : null;

  if (!session) return null;
  const busy = ['created', 'locating', 'planning'].includes(session.status);
  const live = ['navigating', 'off_route'].includes(session.status);
  const sample = session.start_source === 'sample';

  return (
    <div className="pointer-events-none absolute inset-0 z-[38]" data-run-route-overlay={session.session_id}>
      <svg className="absolute inset-0 h-full w-full overflow-visible" aria-label="跑步规划路线">
        {plannedPoints.length >= 2 && <>
          <polyline points={plannedPoints.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#111" strokeWidth="10" strokeLinejoin="round" strokeLinecap="round" opacity=".82" />
          <polyline points={plannedPoints.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#00ff88" strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" />
        </>}
        {actualPoints.length >= 2 && <polyline points={actualPoints.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#ff6b35" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />}
        {marker && <><circle cx={marker.x} cy={marker.y} r="11" fill="#fff" stroke="#111" strokeWidth="3" /><circle cx={marker.x} cy={marker.y} r="5" fill="#ff6b35" /></>}
      </svg>

      {busy && <div className="absolute left-1/2 top-[42%] w-[72%] -translate-x-1/2 border-[3px] border-black bg-white p-4 text-center"><RefreshCw className="mx-auto h-6 w-6 animate-spin text-[#087a43]" /><b className="mt-2 block font-pixel text-[7px]">TASKMASTER 正在规划</b></div>}

      {session.status === 'failed' && !session.start && <section className="pointer-events-auto absolute bottom-3 left-3 right-3 border-[3px] border-black bg-white p-4"><div className="flex items-start justify-between gap-3"><span><b className="font-pixel text-[7px] text-[#b3261e]">LOCATION NEEDED</b><p className="mt-2 text-[9px] leading-relaxed">{session.error}</p></span><button type="button" onClick={close} className="grid h-8 w-8 shrink-0 place-items-center border-2 border-black bg-white"><X className="h-4 w-4" /></button></div><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={retryRealLocation} className="min-h-10 border-2 border-black bg-[#00ff88] px-2 font-pixel text-[6px]">重新定位</button><button type="button" onClick={useSampleStart} className="min-h-10 border-2 border-black bg-[#fff0b5] px-2 font-pixel text-[6px]">预览杭州示例</button></div></section>}

      {!busy && !(session.status === 'failed' && !session.start) && <section className="pointer-events-auto absolute bottom-3 left-3 right-3 border-[3px] border-black bg-white/95 p-3 backdrop-blur-sm">
        <div className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#087a43]" /><div className="min-w-0 flex-1"><div className="font-pixel text-[6px] text-[#087a43]">FROST → RUN ROUTE → SOUND WALK</div><p className="mt-1 truncate text-[9px] font-bold">你说·“{requestSummary(session)}”</p><small className="mt-1 block truncate text-[7px] text-black/45">{sample ? '杭州示例起点 · 仅预览' : session.destination_label || '真实 GPS 起点'}{session.input.source_task_id ? ` · TASK ${session.input.source_task_id.split(':').at(-1)}` : ''}</small></div><span className={`border-2 border-black px-2 py-1 font-pixel text-[5px] ${session.status === 'failed' ? 'bg-[#ff8f86]' : ['ready', 'navigating', 'completed'].includes(session.status) ? 'bg-[#7CFF6B]' : 'bg-[#fff0b5]'}`}>{statusCopy(session.status)}</span><button type="button" onClick={close} aria-label="收起路线规划" className="grid h-7 w-7 shrink-0 place-items-center border-2 border-black bg-white"><X className="h-4 w-4" /></button></div>
        <div className="mt-2 grid grid-cols-3 border-2 border-black bg-[#f7f1df]"><div className="border-r-2 border-black px-2 py-1.5 text-center"><small className="block font-pixel text-[5px] text-black/45">TARGET</small><b className="text-[10px]">{session.metrics.target_distance_m ? km(session.metrics.target_distance_m) : '--'}</b></div><div className="border-r-2 border-black px-2 py-1.5 text-center"><small className="block font-pixel text-[5px] text-black/45">PLANNED</small><b className="text-[10px]">{session.metrics.planned_distance_m ? km(session.metrics.planned_distance_m) : '--'}</b></div><div className="px-2 py-1.5 text-center"><small className="block font-pixel text-[5px] text-black/45">ACTUAL</small><b className="text-[10px]">{km(session.metrics.actual_distance_m)}</b></div></div>
        {session.error && <p className="mt-2 border-2 border-[#b3261e] bg-[#fff0ed] px-2 py-1.5 text-[8px] text-[#b3261e]">{session.error}</p>}
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">{!live ? <button type="button" disabled={finalizing || session.status === 'failed' || session.status === 'completed'} onClick={sample ? retryRealLocation : () => void startTracking()} className={`flex min-h-11 items-center justify-center gap-2 border-2 border-black px-3 font-pixel text-[7px] disabled:opacity-40 ${sample ? 'bg-[#fff0b5]' : 'bg-[#00ff88]'}`}><Play className="h-4 w-4" fill="currentColor" />{sample ? '获取真实定位后开始' : '开始沿线跑'}</button> : <button type="button" onClick={() => { stopTracking(); updateRunRouteSession(sessionId, { status: 'paused' }); }} className="flex min-h-11 items-center justify-center gap-2 border-2 border-black bg-[#ffd65a] px-3 font-pixel text-[7px]"><Pause className="h-4 w-4" fill="currentColor" />暂停</button>}<button type="button" disabled={finalizing || session.status === 'completed'} onClick={() => void finishTracking()} aria-label="结束跑步" className="grid min-h-11 w-11 place-items-center border-2 border-black bg-white disabled:opacity-40"><Square className="h-4 w-4" fill="currentColor" /></button></div>
      </section>}
    </div>
  );
}
