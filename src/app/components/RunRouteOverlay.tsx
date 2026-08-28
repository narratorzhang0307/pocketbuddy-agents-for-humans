import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RefreshCw, Sparkles, Square, X } from 'lucide-react';
import type { CityMapRuntime } from '../../../vendor/legacy-city/src/app/lib/maps/runtime';
import { cancelRunRoutePlanning, planRunRouteSession, replanRunRouteFromPosition } from '../lib/amapRunRoute';
import { gcj02ToWgs84 } from '../../../vendor/legacy-city/src/app/lib/location/chinaCoordinates';
import { getRunNavigationSnapshot, initializeRunNavigation, pauseRunNavigation, startRunNavigation, stopRunNavigation, subscribeRunNavigation, supportsNativeRunNavigation } from '../lib/runRouteNavigation';
import {
  readRunRouteSession,
  setActiveRunRouteSession,
  subscribeRunRouteSession,
  updateRunRouteSession,
  type RoutePoint,
  type RunRouteSession,
} from '../lib/runRouteSkill';
import { completeRunWithTaskmaster } from '../lib/frostHealthTaskmaster';

interface Props {
  map: CityMapRuntime | null;
  sessionId: string;
  collapsed?: boolean;
  onExpand?: () => void;
  onClose: () => void;
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

export default function RunRouteOverlay({ map, sessionId, onClose, collapsed = false, onExpand }: Props) {
  const [session, setSession] = useState<RunRouteSession | null>(() => readRunRouteSession(sessionId));
  const [mapRevision, redraw] = useState(0);
  const [finalizing, setFinalizing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [navigation, setNavigation] = useState(getRunNavigationSnapshot);
  const planningRef = useRef(false);
  const autoStartedRef = useRef(false);
  const fittedPathRef = useRef('');

  useEffect(() => subscribeRunRouteSession((changedId) => {
    if (changedId === sessionId) setSession(readRunRouteSession(sessionId));
  }), [sessionId]);
  useEffect(() => {
    const release = subscribeRunNavigation(state => { if (state.sessionId === sessionId) setNavigation(state); });
    void initializeRunNavigation().catch(() => {});
    return release; // Removing the view never stops native location or disconnects BLE.
  }, [sessionId]);

  useEffect(() => {
    if (!session || session.status !== 'created' || planningRef.current) return;
    planningRef.current = true;
    void planRunRouteSession(sessionId).catch(() => {}); // The planner persists a visible failure in the session.
  }, [session, sessionId]);

  useEffect(() => {
    if (!map) return undefined;
    const update = () => redraw((value) => value + 1);
    map.on('move', update);
    return () => map.off('move', update);
  }, [map]);

  useEffect(() => {
    if (!map || !session || session.planned_path.length < 2) return;
    const key = `${session.planned_path[0].join(',')}:${session.planned_path.at(-1)!.join(',')}:${session.planned_path.length}:${collapsed}`;
    if (fittedPathRef.current === key) return;
    fittedPathRef.current = key;
    const pixels = session.planned_path.map(p => map.project(gcj02ToWgs84(p)));
    const xs = pixels.map(p => p.x), ys = pixels.map(p => p.y);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    const container = map.getContainer();
    const width = container.clientWidth, height = container.clientHeight;
    const panel = collapsed ? 60 : Math.min(275, height * .65);
    const usableHeight = Math.max(100, height - panel - 50);
    const factor = Math.min(Math.max(120, width - 100) / Math.max(1, right - left), usableHeight / Math.max(1, bottom - top));
    const zoom = Math.max(10, Math.min(18, map.getZoom() + Math.log2(factor)));
    const actualFactor = 2 ** (zoom - map.getZoom());
    const center = map.unproject([(left + right) / 2, (top + bottom) / 2 + panel / 2 / actualFactor]);
    if (Number.isFinite(center.lng) && Number.isFinite(center.lat)) map.flyTo({ center: [center.lng, center.lat], zoom, duration: 600 });
  }, [map, session, collapsed]);

  const startTracking = useCallback(async (automatic = false) => {
    if (starting) return;
    setStarting(true);
    try {
      await startRunNavigation(sessionId, automatic);
    } catch (error) {
      updateRunRouteSession(sessionId, { status: 'paused', error: error instanceof Error ? error.message : '导航未启动，请更新 iOS App 或检查定位权限。' });
    } finally { setStarting(false); }
  }, [sessionId, starting]);

  useEffect(() => {
    if (!session?.input.auto_start || session.status !== 'ready' || autoStartedRef.current) return;
    autoStartedRef.current = true;
    const target = session.metrics.target_distance_m;
    if (session.actual_shape !== session.input.shape || (target && Math.abs(session.metrics.planned_distance_m - target) / target > .2)) {
      updateRunRouteSession(sessionId, { error: '路线形状或距离与请求有偏差，未自动开始。请确认地图后手动开始。' }); return;
    }
    void startTracking(true);
  }, [session, sessionId, startTracking]);

  const pause = async () => {
    try { await pauseRunNavigation(sessionId); }
    catch { updateRunRouteSession(sessionId, { error: '未能确认导航已暂停，请重试；不要将此状态当作停止。' }); }
  };

  const replan = async () => {
    await pause();
    const latest = readRunRouteSession(sessionId);
    const point = latest?.actual_track.at(-1)?.position;
    if (point && latest?.status === 'paused') await replanRunRouteFromPosition(sessionId, point);
  };

  const close = () => {
    if (session?.status === 'completed' || session?.status === 'failed') {
      cancelRunRoutePlanning(sessionId); setActiveRunRouteSession(null);
    }
    onClose();
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
    setFinalizing(true);
    try {
      await stopRunNavigation(sessionId);
      const latest = readRunRouteSession(sessionId);
      if (!latest) return;
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
    ? session.planned_path.map((point) => map.project(gcj02ToWgs84(point))).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    : [], [map, mapRevision, session]);
  const actualPoints = useMemo(() => map && session
    ? session.actual_track.map((item) => map.project(gcj02ToWgs84(item.position))).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    : [], [map, mapRevision, session]);
  const marker = map && session?.start ? map.project(gcj02ToWgs84(session.actual_track.at(-1)?.position || session.start)) : null;

  if (!session) return null;
  const busy = ['created', 'locating', 'planning'].includes(session.status);
  const live = ['navigating', 'off_route'].includes(session.status);
  const sample = session.start_source === 'sample';
  const adjusted = (session.actual_shape && session.actual_shape !== session.input.shape)
    || (session.metrics.target_distance_m && Math.abs(session.metrics.planned_distance_m - session.metrics.target_distance_m) > session.metrics.target_distance_m * .2);
  const nav = navigation?.sessionId === sessionId ? navigation : null;

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

      {collapsed && <button type="button" onClick={onExpand} className="pointer-events-auto absolute bottom-5 left-4 min-h-11 border-[3px] border-black bg-[#00ff88] px-4 text-[13px] font-bold">返回跑步路线 / 导航</button>}

      {busy && <div className="pointer-events-auto absolute left-1/2 top-[42%] w-[72%] -translate-x-1/2 border-[3px] border-black bg-white p-4 text-center"><RefreshCw className="mx-auto h-6 w-6 animate-spin text-[#087a43]" /><b className="mt-2 block text-[13px]">{session.status === 'locating' ? '正在确定起点' : '高德正在计算真实道路'}</b><p className="mt-2 text-[11px] text-black/60">会比较完整路段，不使用直线冒充路线</p><button type="button" onClick={() => { cancelRunRoutePlanning(sessionId); updateRunRouteSession(sessionId, { status: 'failed', error: '已取消规划' }); setActiveRunRouteSession(null); onClose(); }} className="mt-3 min-h-9 border-2 border-black px-3 text-[12px]">取消规划</button></div>}

      {session.status === 'failed' && !session.start && <section className="pointer-events-auto absolute bottom-3 left-3 right-3 border-[3px] border-black bg-white p-4"><div className="flex items-start justify-between gap-3"><span><b className="font-pixel text-[7px] text-[#b3261e]">LOCATION NEEDED</b><p className="mt-2 text-[9px] leading-relaxed">{session.error}</p></span><button type="button" onClick={close} className="grid h-8 w-8 shrink-0 place-items-center border-2 border-black bg-white"><X className="h-4 w-4" /></button></div><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={retryRealLocation} className="min-h-10 border-2 border-black bg-[#00ff88] px-2 font-pixel text-[6px]">重新定位</button><button type="button" onClick={useSampleStart} className="min-h-10 border-2 border-black bg-[#fff0b5] px-2 font-pixel text-[6px]">预览杭州示例</button></div></section>}

      {!collapsed && !busy && !(session.status === 'failed' && !session.start) && <section className="pointer-events-auto absolute bottom-3 left-3 right-3 border-[3px] border-black bg-white/95 p-3 backdrop-blur-sm">
        <div className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#087a43]" /><div className="min-w-0 flex-1"><div className="font-pixel text-[6px] text-[#087a43]">FROST → RUN ROUTE → ACTION MAP</div><p className="mt-1 truncate text-[9px] font-bold">你说·“{requestSummary(session)}”</p><small className="mt-1 block truncate text-[7px] text-black/45">{sample ? '杭州示例起点 · 仅预览' : session.start_label || session.destination_label || '真实 GPS 起点'}{session.input.source_task_id ? ` · TASK ${session.input.source_task_id.split(':').at(-1)}` : ''}</small></div><span className={`border-2 border-black px-2 py-1 font-pixel text-[5px] ${session.status === 'failed' ? 'bg-[#ff8f86]' : ['ready', 'navigating', 'completed'].includes(session.status) ? 'bg-[#7CFF6B]' : 'bg-[#fff0b5]'}`}>{statusCopy(session.status)}</span><button type="button" onClick={close} aria-label="收起路线规划" className="grid h-7 w-7 shrink-0 place-items-center border-2 border-black bg-white"><X className="h-4 w-4" /></button></div>
        <div className="mt-2 grid grid-cols-3 border-2 border-black bg-[#f7f1df]"><div className="border-r-2 border-black px-2 py-1.5 text-center"><small className="block font-pixel text-[5px] text-black/45">TARGET</small><b className="text-[10px]">{session.metrics.target_distance_m ? km(session.metrics.target_distance_m) : '--'}</b></div><div className="border-r-2 border-black px-2 py-1.5 text-center"><small className="block font-pixel text-[5px] text-black/45">PLANNED</small><b className="text-[10px]">{session.metrics.planned_distance_m ? km(session.metrics.planned_distance_m) : '--'}</b></div><div className="px-2 py-1.5 text-center"><small className="block font-pixel text-[5px] text-black/45">ACTUAL</small><b className="text-[10px]">{km(session.metrics.actual_distance_m)}</b></div></div>
        {session.error && <p className="mt-2 border-2 border-[#b3261e] bg-[#fff0ed] px-2 py-1.5 text-[8px] text-[#b3261e]">{session.error}</p>}
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]"><span>🟢 规划线</span><span>🟠 实跑轨迹</span><b>{session.actual_shape ? { loop: '环线', out_and_back: '往返', one_way: '单程' }[session.actual_shape] : ''}</b>{session.start_label && <span>起点：{session.start_label}</span>}</div>
        {nav?.active && <div className="mt-2 border-2 border-black bg-[#e4f7ed] p-2" aria-live="polite"><b className="block text-[16px]">{nav.state === 'navigating' && nav.distanceToTurnM > 20 ? `前方 ${Math.round(nav.distanceToTurnM)} 米 · ` : ''}{nav.message}</b><p className="mt-1 text-[11px]">{nav.backgroundLocation ? 'iOS 原生定位 · 可锁屏继续' : '仅前台定位'} · {nav.useBadge ? nav.badgeConnected ? '硬件蓝牙已连接' : '硬件断连，正在重连' : '手机语音'}</p></div>}
        {!nav?.active && <p className="mt-2 text-[11px] text-black/65">{session.navigation_message || (supportsNativeRunNavigation() ? '开始后由 iOS 持续定位，锁屏不主动断开蓝牙。' : '网页版仅前台导航；锁屏硬件播报需新版 iOS App。')}</p>}
        {session.warnings.length > 0 && <details className="mt-2 text-[11px]"><summary className="cursor-pointer font-bold">路线依据与限制 · {session.route_evidence?.candidates || 1} 个可用方案</summary><ul className="mt-1 max-h-24 list-disc overflow-y-auto pl-4 text-black/65">{session.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
        {session.status === 'off_route' && <button type="button" onClick={() => void replan()} className="mt-2 min-h-10 w-full border-2 border-black bg-[#fff0b5] px-3 text-[12px] font-bold">安全停下后，重算到原终点</button>}
        {session.status === 'failed' && <button type="button" onClick={retryRealLocation} className="mt-2 min-h-10 w-full border-2 border-black px-3 text-[12px]">重新规划</button>}
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">{!live ? <button type="button" disabled={starting || finalizing || session.status === 'failed' || session.status === 'completed'} onClick={sample ? retryRealLocation : () => void startTracking()} className={`flex min-h-11 items-center justify-center gap-2 border-2 border-black px-3 text-[13px] font-bold disabled:opacity-40 ${sample ? 'bg-[#fff0b5]' : 'bg-[#00ff88]'}`}><Play className="h-4 w-4" fill="currentColor" />{starting ? '正在启动定位…' : sample ? '获取真实定位后开始' : session.status === 'paused' ? '继续沿线跑' : adjusted ? `确认 ${km(session.metrics.planned_distance_m)} 后开始` : '开始沿线跑'}</button> : <button type="button" onClick={() => void pause()} className="flex min-h-11 items-center justify-center gap-2 border-2 border-black bg-[#ffd65a] px-3 text-[13px] font-bold"><Pause className="h-4 w-4" fill="currentColor" />暂停导航</button>}<button type="button" disabled={finalizing || starting || session.status === 'completed'} onClick={() => void finishTracking()} aria-label="结束跑步" className="grid min-h-11 w-11 place-items-center border-2 border-black bg-white disabled:opacity-40"><Square className="h-4 w-4" fill="currentColor" /></button></div>
        {live && <p className="mt-1 text-center text-[10px] text-black/55">右上角收起面板后导航继续；点 ■ 结束定位。两者都不会断蓝牙。</p>}
      </section>}
    </div>
  );
}
