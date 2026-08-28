import { useCallback, useEffect, useRef, useState } from 'react';
import { LocateFixed, MapPinned, Pause, Play, RefreshCw, Route, ShieldCheck, Square, X } from 'lucide-react';
import AmapEarth from './AmapEarth';
import {
  loadAmapNamespace,
  planRunRouteSession,
  replanRunRouteFromPosition,
  requestBrowserPosition,
  toAmapPosition,
} from '../lib/amapRunRoute';
import {
  appendRunRouteTrackPoint,
  getActiveRunRouteSessionId,
  readRunRouteSession,
  setActiveRunRouteSession,
  subscribeRunRouteOpen,
  subscribeRunRouteSession,
  updateRunRouteSession,
  type RoutePoint,
  type RunRouteSession,
} from '../lib/runRouteSkill';
import { completeRunWithTaskmaster } from '../lib/frostHealthTaskmaster';

interface MyMapTabProps {
  onOpenReadingJot?: () => void;
}

type MapRuntime = {
  add(item: unknown): void;
  remove(item: unknown): void;
  setCenter(position: RoutePoint): void;
  setFitView(items?: unknown[], immediately?: boolean, avoid?: number[]): void;
};

type MapOverlay = { setMap(map: MapRuntime | null): void };

const HANGZHOU_SAMPLE_START: RoutePoint = [120.14703, 30.260901];

function distanceLabel(value: number): string {
  return `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)} km`;
}

function requestLabel(session: RunRouteSession): string {
  if (session.input.request_text) return session.input.request_text;
  if (session.input.goal.type === 'distance') return `规划 ${distanceLabel(session.input.goal.distance_m)} 跑步路线`;
  if (session.input.goal.type === 'duration') return `规划 ${session.input.goal.duration_min} 分钟跑步路线`;
  return `规划跑到${session.input.goal.query}的路线`;
}

function statusLabel(status: RunRouteSession['status']): string {
  if (status === 'ready') return 'READY';
  if (status === 'navigating') return 'LIVE';
  if (status === 'paused') return 'PAUSED';
  if (status === 'off_route') return 'REPLAN';
  if (status === 'completed') return 'DONE';
  if (status === 'failed') return 'FAILED';
  if (status === 'locating') return 'LOCATING';
  return 'PLANNING';
}

export default function MyMapTab(_props: MyMapTabProps) {
  const [map, setMap] = useState<MapRuntime | null>(null);
  const [sessionId, setSessionId] = useState(getActiveRunRouteSessionId);
  const [session, setSession] = useState<RunRouteSession | null>(() => sessionId ? readRunRouteSession(sessionId) : null);
  const [locationState, setLocationState] = useState<'idle' | 'locating' | 'ready' | 'failed'>('idle');
  const [locationError, setLocationError] = useState('');
  const [finalizing, setFinalizing] = useState(false);
  const routeLayersRef = useRef<MapOverlay[]>([]);
  const locationMarkerRef = useRef<MapOverlay | null>(null);
  const watchRef = useRef<number | null>(null);
  const planningRef = useRef<string | null>(null);
  const replanRef = useRef(false);

  useEffect(() => subscribeRunRouteOpen((nextId) => {
    setSessionId(nextId);
    setSession(nextId ? readRunRouteSession(nextId) : null);
  }), []);

  useEffect(() => subscribeRunRouteSession((changedId) => {
    if (changedId === sessionId) setSession(sessionId ? readRunRouteSession(sessionId) : null);
  }), [sessionId]);

  useEffect(() => {
    if (!sessionId || session?.status !== 'created' || planningRef.current === sessionId) return;
    planningRef.current = sessionId;
    void planRunRouteSession(sessionId);
  }, [session, sessionId]);

  useEffect(() => {
    if (!sessionId || session?.status !== 'off_route' || !session.actual_track.length || replanRef.current) return;
    replanRef.current = true;
    void replanRunRouteFromPosition(sessionId, session.actual_track.at(-1)!.position)
      .finally(() => { replanRef.current = false; });
  }, [session, sessionId]);

  useEffect(() => {
    let cancelled = false;
    const clearLayers = () => {
      routeLayersRef.current.forEach((layer) => layer.setMap(null));
      routeLayersRef.current = [];
    };
    clearLayers();
    if (!map || !session || session.planned_path.length < 2) return clearLayers;
    void loadAmapNamespace().then((AMap) => {
      if (cancelled) return;
      const planned = new AMap.Polyline({
        path: session.planned_path,
        strokeColor: '#00ff88',
        strokeWeight: 7,
        strokeOpacity: 0.95,
        lineJoin: 'round',
        lineCap: 'round',
        showDir: true,
        zIndex: 45,
      });
      const overlays: MapOverlay[] = [planned];
      if (session.actual_track.length >= 2) {
        overlays.push(new AMap.Polyline({
          path: session.actual_track.map((point) => point.position),
          strokeColor: '#ff6b35',
          strokeWeight: 5,
          strokeOpacity: 0.95,
          zIndex: 50,
        }));
      }
      const current = session.actual_track.at(-1)?.position || session.start;
      if (current) overlays.push(new AMap.Marker({ position: current, title: '当前位置', zIndex: 60 }));
      map.add(overlays);
      routeLayersRef.current = overlays;
      map.setFitView([planned], false, [96, 40, 220, 40]);
    });
    return () => {
      cancelled = true;
      clearLayers();
    };
  }, [map, session]);

  const stopTracking = useCallback(() => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
  }, []);

  useEffect(() => () => stopTracking(), [stopTracking]);

  const locateMe = useCallback(async () => {
    if (!map || locationState === 'locating') return;
    setLocationState('locating');
    setLocationError('');
    try {
      const [AMap, position] = await Promise.all([loadAmapNamespace(), requestBrowserPosition()]);
      const converted = await toAmapPosition(AMap, [position.coords.longitude, position.coords.latitude]);
      locationMarkerRef.current?.setMap(null);
      const marker = new AMap.Marker({ position: converted, title: '我的位置', zIndex: 60 });
      map.add(marker);
      locationMarkerRef.current = marker;
      map.setCenter(converted);
      setLocationState('ready');
    } catch (error) {
      setLocationState('failed');
      setLocationError(error instanceof Error ? error.message : '定位失败');
    }
  }, [locationState, map]);

  const startTracking = useCallback(async () => {
    if (!sessionId || !session || watchRef.current !== null) return;
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

  const pauseTracking = () => {
    if (!sessionId) return;
    stopTracking();
    updateRunRouteSession(sessionId, { status: 'paused' });
  };

  const finishTracking = async () => {
    if (!sessionId || !session || finalizing) return;
    stopTracking();
    setFinalizing(true);
    try {
      if (session.actual_track.length >= 2 && session.metrics.actual_distance_m >= 50) {
        await completeRunWithTaskmaster({
          distance_m: Math.round(session.metrics.actual_distance_m),
          duration_s: session.metrics.elapsed_s,
          route_session_id: session.session_id,
          route_points: session.actual_track.map((point) => ({
            longitude: point.position[0], latitude: point.position[1],
            accuracy_m: point.accuracy_m, recorded_at: point.recorded_at,
          })),
        });
      }
      updateRunRouteSession(sessionId, { status: 'completed', error: undefined });
    } catch (error) {
      updateRunRouteSession(sessionId, { status: 'paused', error: error instanceof Error ? error.message : '运动记录写入失败' });
    } finally {
      setFinalizing(false);
    }
  };

  const closeSession = () => {
    stopTracking();
    setActiveRunRouteSession(null);
    setSessionId(null);
    setSession(null);
  };

  const useSampleStart = () => {
    if (!sessionId || !session) return;
    const warning = '当前使用杭州西湖示例起点，仅供路线预览；不会记录为你的真实位置。';
    updateRunRouteSession(sessionId, {
      start_source: 'sample',
      warnings: session.warnings.includes(warning) ? session.warnings : [...session.warnings, warning],
      error: undefined,
    });
    planningRef.current = sessionId;
    void planRunRouteSession(sessionId, HANGZHOU_SAMPLE_START);
  };

  const busy = !!session && ['created', 'locating', 'planning'].includes(session.status);
  const live = !!session && ['navigating', 'off_route'].includes(session.status);

  return (
    <div className="relative h-full overflow-hidden bg-black text-black">
      <AmapEarth center={HANGZHOU_SAMPLE_START} zoom={12.4} onReady={(runtime) => setMap(runtime as MapRuntime)} />

      <header className="pointer-events-none absolute left-3 right-3 top-3 z-20 flex items-center justify-between border-[3px] border-black bg-white/95 px-3 py-2 backdrop-blur-sm">
        <span><b className="block font-pixel text-[8px]">POCKET BUDDY · ACTION MAP</b><small className="mt-1 block text-[8px] font-bold text-black/45">运动路线、GPS 与实时行动</small></span>
        <span className="flex items-center gap-1 border-2 border-black bg-[#e8f8ef] px-2 py-1 font-pixel text-[5px] text-[#087a43]"><ShieldCheck className="h-3 w-3" /> PRIVATE</span>
      </header>

      {!session && (
        <section className="absolute bottom-3 left-3 right-3 z-20 border-[3px] border-black bg-[#f7f1df]/95 p-4 backdrop-blur-sm">
          <div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-black bg-[#7CFF6B]"><MapPinned className="h-5 w-5" /></span><span><b className="font-pixel text-[8px]">你的运动行动地图</b><p className="mt-2 text-[9px] leading-relaxed text-black/55">Skill 只交付标准化路线意图；定位、地图渲染和后台 GPS 由可信宿主执行。</p></span></div>
          {locationError && <p className="mt-3 border-2 border-[#b3261e] bg-[#fff0ed] px-3 py-2 text-[8px] text-[#b3261e]">{locationError}</p>}
          <button type="button" disabled={!map || locationState === 'locating'} onClick={() => void locateMe()} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 border-[3px] border-black bg-[#00ff88] px-3 font-pixel text-[7px] disabled:opacity-50">
            {locationState === 'locating' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
            {locationState === 'ready' ? '已定位 · 再次校准' : '授权并定位我'}
          </button>
          <small className="mt-2 block text-center text-[7px] text-black/40">不授权时仍可浏览地图；不会默认读取或上传位置。</small>
        </section>
      )}

      {session && (
        <section className="absolute bottom-3 left-3 right-3 z-20 border-[3px] border-black bg-white/95 p-3 backdrop-blur-sm">
          <div className="flex items-start gap-2"><Route className="mt-0.5 h-4 w-4 shrink-0 text-[#087a43]" /><div className="min-w-0 flex-1"><div className="font-pixel text-[6px] text-[#087a43]">FROST → RUN ROUTE → ACTION MAP</div><p className="mt-1 truncate text-[9px] font-bold">你说·“{requestLabel(session)}”</p><small className="mt-1 block text-[7px] text-black/45">{session.start_source === 'sample' ? '杭州示例起点 · 仅预览' : session.destination_label || '真实 GPS 起点'}</small></div><span className={`border-2 border-black px-2 py-1 font-pixel text-[5px] ${session.status === 'failed' ? 'bg-[#ff8f86]' : ['ready', 'navigating', 'completed'].includes(session.status) ? 'bg-[#7CFF6B]' : 'bg-[#fff0b5]'}`}>{statusLabel(session.status)}</span><button type="button" onClick={closeSession} aria-label="关闭路线会话" className="grid h-7 w-7 shrink-0 place-items-center border-2 border-black bg-white"><X className="h-4 w-4" /></button></div>
          <div className="mt-2 grid grid-cols-3 border-2 border-black bg-[#f7f1df]"><div className="border-r-2 border-black px-2 py-1.5 text-center"><small className="block font-pixel text-[5px] text-black/45">TARGET</small><b className="text-[10px]">{session.metrics.target_distance_m ? distanceLabel(session.metrics.target_distance_m) : '--'}</b></div><div className="border-r-2 border-black px-2 py-1.5 text-center"><small className="block font-pixel text-[5px] text-black/45">PLANNED</small><b className="text-[10px]">{session.metrics.planned_distance_m ? distanceLabel(session.metrics.planned_distance_m) : '--'}</b></div><div className="px-2 py-1.5 text-center"><small className="block font-pixel text-[5px] text-black/45">ACTUAL</small><b className="text-[10px]">{distanceLabel(session.metrics.actual_distance_m)}</b></div></div>
          {busy && <div className="mt-2 flex items-center justify-center gap-2 border-2 border-black bg-[#e8f8ef] px-3 py-3 text-[8px] font-bold"><RefreshCw className="h-4 w-4 animate-spin text-[#087a43]" />{session.status === 'locating' ? '等待定位授权' : 'TASKMASTER 正在规划'}</div>}
          {session.error && <p className="mt-2 border-2 border-[#b3261e] bg-[#fff0ed] px-2 py-1.5 text-[8px] text-[#b3261e]">{session.error}</p>}
          {session.status === 'failed' && !session.start && <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => { planningRef.current = sessionId; void planRunRouteSession(sessionId!); }} className="min-h-10 border-2 border-black bg-[#00ff88] px-2 font-pixel text-[6px]">重新定位</button><button type="button" onClick={useSampleStart} className="min-h-10 border-2 border-black bg-[#fff0b5] px-2 font-pixel text-[6px]">预览杭州示例</button></div>}
          {!busy && !(session.status === 'failed' && !session.start) && <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">{!live ? <button type="button" disabled={finalizing || session.status === 'failed' || session.status === 'completed' || session.start_source === 'sample'} onClick={() => void startTracking()} className="flex min-h-11 items-center justify-center gap-2 border-2 border-black bg-[#00ff88] px-3 font-pixel text-[7px] disabled:opacity-40"><Play className="h-4 w-4" fill="currentColor" />{session.start_source === 'sample' ? '需真实定位后开始' : '开始沿线跑'}</button> : <button type="button" onClick={pauseTracking} className="flex min-h-11 items-center justify-center gap-2 border-2 border-black bg-[#ffd65a] px-3 font-pixel text-[7px]"><Pause className="h-4 w-4" fill="currentColor" />暂停</button>}<button type="button" disabled={finalizing || session.status === 'completed'} onClick={() => void finishTracking()} aria-label="结束跑步" className="grid min-h-11 w-11 place-items-center border-2 border-black bg-white disabled:opacity-40"><Square className="h-4 w-4" fill="currentColor" /></button></div>}
        </section>
      )}
    </div>
  );
}
