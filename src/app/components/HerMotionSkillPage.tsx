import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import SkillAvatar from './SkillAvatar';
import { Activity, CheckCircle2, ChevronLeft } from 'lucide-react';
import { acceptTaskHandoff, peekTaskHandoff } from '../../../frost-agent/harness/taskHandoff';
import {
  applyHerMotionBridgeMessage,
  buildHerMotionSkillUrl,
  createHerMotionSession,
  getHerMotionSession,
  HER_MOTION_BRIDGE_PROTOCOL,
  installHerMotionBridge,
  isHerMotionFrameEvent,
  subscribeHerMotionSessions,
  type HerMotionSkillSession,
} from '../lib/health/herMotionSession';
import { completeHerMotionTask, startHerMotionTask } from '../lib/frostHealthTaskmaster';
import { verifyHerMotionPackage } from '../lib/health/herMotionPackage';
import { HerMotionBadgeAudio } from '../lib/health/herMotionAudio';
import { frostBadge } from '../lib/frostBadge';
import { getFrostCompanion, type FrostCompanion } from '../lib/frostCompanion';

interface Props {
  launchUrl: string;
  onBack: () => void;
  backLabel?: string;
  avatarSkillId?: string;
}


export default function HerMotionSkillPage({ launchUrl, onBack, backLabel = '返回 Skills', avatarSkillId = 'pocket.her-motion' }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [handoff] = useState(() => peekTaskHandoff('her-motion') ?? peekTaskHandoff('frost-motion-vision'));
  const [session, setSession] = useState<HerMotionSkillSession | null>(null);
  const [recordState, setRecordState] = useState<'pending' | 'recorded' | 'failed'>('pending');
  const [pageState, setPageState] = useState<'checking' | 'loading' | 'ready' | 'error'>('checking');
  const [pageError, setPageError] = useState('');
  const [retry, setRetry] = useState(0);
  const submittedSessionRef = useRef<string | null>(null);
  const badge = useSyncExternalStore(frostBadge.subscribe, frostBadge.snapshot);
  const hardwareSpeech = frostBadge.supported() && Capacitor.getPlatform() === 'ios';
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioStatus, setAudioStatus] = useState('运动提示仅由圆形硬件出声');
  const audioRef = useRef<HerMotionBadgeAudio | null>(null);
  const audioAllowed = useRef(false);
  audioAllowed.current = audioEnabled && pageState === 'ready' && session?.status === 'running';

  useEffect(() => {
    if (!session || !hardwareSpeech) return;
    let alive = true, companion: FrostCompanion | undefined, unobserve: (() => void) | undefined;
    const audio = new HerMotionBadgeAudio(session.sessionId, {
      connection: () => frostBadge.snapshot().status === 'connected' ? frostBadge.snapshot().connectionId : undefined,
      available: () => audioAllowed.current && document.visibilityState !== 'hidden' && !frostBadge.snapshot().recording
        && frostBadge.snapshot().endpoints.includes('speaker0') && !!companion
        && ['off', 'ready', 'error'].includes(companion.snapshot().voice.phase),
      speak: (text, signal) => frostBadge.speakText(text, signal),
      status: setAudioStatus, now: Date.now,
    });
    audioRef.current = audio;
    const changed = () => audio.stateChanged();
    void getFrostCompanion().then(value => {
      if (!alive) return;
      companion = value; unobserve = value.subscribe(changed);
    }).catch(() => { if (alive) setAudioStatus('硬件通道尚未就绪 · 手机静音'); });
    const unbadge = frostBadge.subscribe(changed);
    const receive = (event: MessageEvent) => {
      if (isHerMotionFrameEvent(event, launchUrl, () => iframeRef.current?.contentWindow ?? null)) void audio.receive(event.data);
    };
    window.addEventListener('message', receive);
    document.addEventListener('visibilitychange', changed);
    return () => {
      alive = false; unobserve?.(); unbadge(); audio.dispose(); audioRef.current = null;
      window.removeEventListener('message', receive); document.removeEventListener('visibilitychange', changed);
    };
  }, [session?.sessionId, launchUrl, hardwareSpeech]);

  useEffect(() => { audioRef.current?.stateChanged(); }, [audioEnabled, pageState, session?.status]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const task = await startHerMotionTask({
        taskId: handoff?.taskmasterTaskId,
        planId: handoff?.planId,
        stepId: handoff?.stepId,
        objective: handoff?.objective || '打开 Her Motion 做本地动作陪伴',
        confirmCamera: true,
      });
      if (!active) return;
      setSession(createHerMotionSession(handoff, task.task_id));
    })().catch(() => { if (active) setRecordState('failed'); });
    return () => { active = false; };
  }, [handoff]);

  useEffect(() => {
    const controller = new AbortController();
    setPageState('checking'); setPageError('');
    void verifyHerMotionPackage(launchUrl, window.location.href, fetch, controller.signal)
      .then(() => { if (!controller.signal.aborted) setPageState('loading'); })
      .catch(error => { if (!controller.signal.aborted) { setPageState('error'); setPageError(String(error)); } });
    return () => controller.abort();
  }, [launchUrl, retry]);

  useEffect(() => {
    if (pageState !== 'loading' || !session) return;
    const timer = window.setTimeout(() => {
      setPageState('error');
      setPageError('没有收到 Her Motion 当前会话的就绪回执；未把首页或错误页当作子 Agent。');
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [pageState, session?.sessionId]);

  useEffect(() => {
    if (!session) return undefined;
    let accepted = false;
    const refresh = () => {
      const next = getHerMotionSession(session.sessionId);
      setSession(next);
      if (!accepted && next?.events.some(event => event.type === 'opened')) {
        accepted = true; setPageState('ready');
        if (handoff) void acceptTaskHandoff(handoff.target);
        console.info('[HerMotion] page_ready source=bundled session_verified=true');
      }
      if (next?.status === 'completed' && next.taskmasterTaskId && submittedSessionRef.current !== next.sessionId) {
        submittedSessionRef.current = next.sessionId;
        void completeHerMotionTask(next.taskmasterTaskId, {
          facts: {
            session_id: next.sessionId,
            skill_id: next.skillId,
            pose_confirmed: next.poseConfirmed,
            duration_sec: next.durationSec ?? 0,
            ...(next.domain ? { domain: next.domain } : {}),
            ...(next.exerciseId ? { exercise_id: next.exerciseId } : {}),
            ...(next.exerciseName ? { exercise_name: next.exerciseName } : {}),
            ...(next.planId ? { plan_id: next.planId } : {}),
            ...(next.stepId ? { step_id: next.stepId } : {}),
          },
          confidence: next.confidence ?? (next.poseConfirmed ? 0.7 : 0.4),
          model_version: 'her-motion-bundled-mediapipe-pose/1.0',
          tool_version: 'her-motion-frost-adapter/1.1.0',
          input_hash: next.sessionId,
        }).then((task) => setRecordState(task.status === 'completed' ? 'recorded' : 'failed')).catch(() => setRecordState('failed'));
      }
    };
    const removeBridge = installHerMotionBridge(launchUrl, () => iframeRef.current?.contentWindow ?? null, session.sessionId);
    const removeSubscription = subscribeHerMotionSessions(refresh);
    return () => { removeBridge(); removeSubscription(); };
  }, [launchUrl, session?.sessionId]);

  const iframeUrl = useMemo(() => session ? buildHerMotionSkillUrl(launchUrl, session, handoff) : '', [launchUrl, session?.sessionId, handoff]);

  const close = () => {
    if (session?.status === 'running') {
      applyHerMotionBridgeMessage({
        protocol: HER_MOTION_BRIDGE_PROTOCOL,
        sessionId: session.sessionId,
        type: 'cancelled',
        at: new Date().toISOString(),
        stopReason: 'parent_closed',
      });
    }
    onBack();
  };

  if (!session) return (
    <div className="flex h-full min-h-0 flex-col bg-[#EAEAEA]">
      <header className="flex items-center gap-2 border-b-2 border-black bg-white px-3 py-2">
        <SkillAvatar skillId={avatarSkillId} size={36} />
        <button type="button" onClick={close} aria-label={backLabel} className="grid h-9 w-9 shrink-0 place-items-center border-2 border-black bg-white active:translate-y-px"><ChevronLeft className="h-4 w-4" strokeWidth={3} /></button>
        <div className="min-w-0"><div className="font-pixel text-[9px] tracking-wider">HER MOTION · FROST SKILL</div><p className="mt-0.5 text-[9px] text-black/50">本地姿态陪伴 · 私有会话</p></div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="flex items-center gap-2 font-pixel text-[8px]"><Activity className="h-4 w-4 animate-pulse" />FROST 正在创建私有会话…</div>
      </main>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-black">
      <header className="flex shrink-0 items-center gap-2 border-b-2 border-black bg-white px-2 py-2">
        <SkillAvatar skillId={avatarSkillId} size={36} />
        <button type="button" onClick={close} aria-label={backLabel} className="grid h-9 w-9 shrink-0 place-items-center border-2 border-black bg-white active:translate-y-px"><ChevronLeft className="h-4 w-4" strokeWidth={3} /></button>
        <div className="min-w-0 flex-1"><div className="font-pixel text-[8px] tracking-wider">HER MOTION · FROST SESSION</div><p className="mt-0.5 truncate text-[8px] text-black/45">{session.sessionId}</p></div>
        <span className={`flex items-center gap-1 border border-black px-2 py-1 font-pixel text-[6px] ${recordState === 'recorded' ? 'bg-[#00ff88]' : session.status === 'cancelled' || recordState === 'failed' ? 'bg-[#eeeeee]' : 'bg-[#eeecfb]'}`}><Activity className="h-3 w-3" />{recordState === 'recorded' ? 'TASKMASTER 已记录' : recordState === 'failed' ? '记录待重试' : session.status === 'completed' ? '正在写入健康事件' : session.status === 'cancelled' ? '已安全停止' : '运行中'}</span>
      </header>
      <div role="status" className="shrink-0 border-b border-black bg-[#e8f8ef] px-3 py-2 text-[10px] leading-relaxed">
        <div>声音 → 圆形硬件 · { !hardwareSpeech ? '需 iPhone App；网页保持静音' : badge.status !== 'connected' ? '未连接，请先在 Frost 连接吧唧；手机静音' : audioStatus }</div>
        {hardwareSpeech && <div className="mt-1 flex items-center gap-3">
          <label className="flex items-center gap-1"><input type="checkbox" checked={audioEnabled} onChange={event => setAudioEnabled(event.target.checked)} />硬件运动提示</label>
          <button type="button" className="border border-black bg-white px-2 py-1 disabled:opacity-40" disabled={!audioEnabled || badge.status !== 'connected' || badge.recording || pageState !== 'ready' || session.status !== 'running'} onClick={() => void audioRef.current?.test()}>测试硬件语音</button>
        </div>}
      </div>
      <div className="shrink-0 border-b border-black bg-[#fff0b5] px-3 py-1.5 text-[8px] leading-relaxed">出现锐痛、眩晕或明显不适请立即停止 · 画面仅做实时姿态处理，不保存</div>
      <div className="relative min-h-0 flex-1">
        {(pageState === 'loading' || pageState === 'ready') && <iframe ref={iframeRef} src={iframeUrl} title="Her Motion Frost Skill" allow="camera" className="h-full w-full border-0 bg-black" />}
        {pageState !== 'ready' && <div role="status" className="absolute inset-0 z-10 grid place-items-center bg-[#eeecfb] p-5 text-center text-black">
          <section className="max-w-sm space-y-3">
            <b>{pageState === 'error' ? '女性运动页面尚未就绪' : '正在打开 Her Motion 女性运动…'}</b>
            <p className="text-sm">{pageError || '正在校验手机内置页面与当前 Frost 会话。'}</p>
            {pageState === 'error' && <button className="border-2 border-black bg-white px-4 py-2" onClick={() => setRetry(value => value + 1)}>重新打开</button>}
          </section>
        </div>}
        {session.status !== 'running' && (
          <div className="absolute inset-0 grid place-items-center bg-black/75 p-5">
            <section className="w-full max-w-sm border-2 border-black bg-white p-4 text-center shadow-[4px_4px_0_#00ff88]">
              <CheckCircle2 className={`mx-auto h-8 w-8 ${session.status === 'completed' ? 'text-[#087c49]' : 'text-black/45'}`} />
              <h2 className="mt-3 font-pixel text-[10px]">{session.status === 'completed' ? recordState === 'recorded' ? '已由 Taskmaster 写入健康记忆' : recordState === 'failed' ? '动作已完成，健康记录待重试' : 'Taskmaster 正在核验结果' : '本次会话已安全结束'}</h2>
              <p className="mt-2 text-[10px] leading-relaxed text-black/55">{session.status === 'completed' ? `${session.exerciseName || '动作陪伴'} · ${session.durationSec ?? 0} 秒 · ${session.poseConfirmed ? '姿态已确认' : '未记录姿态确认'}` : '没有生成完成记录；摄像头画面未保存。'}</p>
              <button type="button" onClick={onBack} className="mt-4 w-full border-2 border-black bg-[#00ff88] px-3 py-2.5 font-pixel text-[7px]">{backLabel}</button>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
