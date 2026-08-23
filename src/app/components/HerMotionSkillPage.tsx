import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Camera, CheckCircle2, ChevronLeft, Square } from 'lucide-react';
import { acceptTaskHandoff, peekTaskHandoff } from '../../../frost-agent/harness/taskHandoff';
import {
  applyHerMotionBridgeMessage,
  buildHerMotionSkillUrl,
  createHerMotionSession,
  getHerMotionSession,
  HER_MOTION_BRIDGE_PROTOCOL,
  installHerMotionBridge,
  subscribeHerMotionSessions,
  type HerMotionSkillSession,
} from '../lib/health/herMotionSession';
import { completeHerMotionTask, startHerMotionTask } from '../lib/healthTaskmasterRuntime';

interface Props {
  launchUrl: string;
  onBack: () => void;
  backLabel?: string;
}

const LOCAL_DOMAINS = [
  { id: 'yoga', label: '瑜伽', exercise: '瑜伽热身' },
  { id: 'pilates', label: '普拉提', exercise: '普拉提热身' },
  { id: 'postpartum', label: '产后恢复', exercise: '产后恢复练习' },
] as const;

function LocalHerMotionRuntime({ session }: { session: HerMotionSkillSession }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const startedAtRef = useRef(Date.now());
  const [seconds, setSeconds] = useState(0);
  const [domain, setDomain] = useState<(typeof LOCAL_DOMAINS)[number]['id']>('yoga');
  const [cameraState, setCameraState] = useState<'starting' | 'ready' | 'unavailable'>('starting');
  const selected = LOCAL_DOMAINS.find((item) => item.id === domain) || LOCAL_DOMAINS[0];

  useEffect(() => {
    const timer = setInterval(() => setSeconds(Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000))), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let active = true;
    void navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user' }, audio: false }).then((next) => {
      if (!active) { next.getTracks().forEach((track) => track.stop()); return; }
      stream = next;
      if (videoRef.current) videoRef.current.srcObject = next;
      setCameraState('ready');
      applyHerMotionBridgeMessage({
        protocol: HER_MOTION_BRIDGE_PROTOCOL,
        sessionId: session.sessionId,
        type: 'workout-started',
        at: new Date().toISOString(),
        domain: selected.id,
        exerciseId: `${selected.id}-warmup`,
        exerciseName: selected.exercise,
      });
    }).catch(() => { if (active) setCameraState('unavailable'); });
    return () => {
      active = false;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [session.sessionId]);

  const complete = () => applyHerMotionBridgeMessage({
    protocol: HER_MOTION_BRIDGE_PROTOCOL,
    sessionId: session.sessionId,
    type: 'completed',
    at: new Date().toISOString(),
    domain: selected.id,
    exerciseId: `${selected.id}-warmup`,
    exerciseName: selected.exercise,
    durationSec: Math.max(1, seconds),
    poseConfirmed: false,
    confidence: cameraState === 'ready' ? 0.55 : 0.4,
  });

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#111] text-white">
      <div className="grid grid-cols-3 gap-2 border-b border-white/25 bg-black p-2">
        {LOCAL_DOMAINS.map((item) => (
          <button key={item.id} type="button" onClick={() => setDomain(item.id)} className={`border px-2 py-2 text-[10px] font-bold ${domain === item.id ? 'border-[#00ff88] bg-[#00ff88] text-black' : 'border-white/45 bg-black text-white'}`}>{item.label}</button>
        ))}
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#171717]">
        <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
        <div className="absolute left-3 top-3 border border-white/40 bg-black/75 px-2 py-1 font-pixel text-[7px]">
          {cameraState === 'ready' ? 'LOCAL CAMERA · READY' : cameraState === 'starting' ? 'LOCAL CAMERA · STARTING' : 'CAMERA UNAVAILABLE · TIMER MODE'}
        </div>
        <div className="absolute inset-x-3 bottom-3 border-2 border-black bg-[#f5f0e4] p-3 text-black shadow-[4px_4px_0_#00ff88]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-pixel text-[8px]">{selected.exercise.toUpperCase()}</div>
              <p className="mt-1 text-[9px] text-black/55">本地摄像头画面不保存、不上传 · 首版仅记录动作会话，不宣称姿态识别</p>
            </div>
            <strong className="font-pixel text-[12px]">{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</strong>
          </div>
          <button type="button" onClick={complete} className="mt-3 flex w-full items-center justify-center gap-2 border-2 border-black bg-[#00ff88] px-3 py-2.5 font-pixel text-[8px] text-black active:translate-y-px">
            {cameraState === 'ready' ? <Square className="h-4 w-4" fill="currentColor" /> : <Camera className="h-4 w-4" />}完成并交回 Taskmaster
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HerMotionSkillPage({ launchUrl, onBack, backLabel = '返回 Skills' }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [handoff] = useState(() => peekTaskHandoff('her-motion'));
  const [session, setSession] = useState<HerMotionSkillSession | null>(null);
  const [recordState, setRecordState] = useState<'pending' | 'recorded' | 'failed'>('pending');
  const submittedSessionRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const task = await startHerMotionTask({
        taskId: handoff?.taskmasterTaskId,
        planId: handoff?.planId,
        stepId: handoff?.stepId,
        objective: handoff?.objective || '打开 Her Motion 做本地动作陪伴',
      });
      if (!active) return;
      setSession(createHerMotionSession(handoff, task.task_id));
      if (handoff) await acceptTaskHandoff('her-motion');
    })().catch(() => { if (active) setRecordState('failed'); });
    return () => { active = false; };
  }, [handoff]);

  useEffect(() => {
    if (!session) return undefined;
    const refresh = () => {
      const next = getHerMotionSession(session.sessionId);
      setSession(next);
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
          model_version: 'mediapipe-pose+yoga-82',
          tool_version: 'her-motion-frost-adapter/1.1.0',
          input_hash: next.sessionId,
        }).then((task) => setRecordState(task.status === 'completed' ? 'recorded' : 'failed')).catch(() => setRecordState('failed'));
      }
    };
    const removeBridge = installHerMotionBridge(launchUrl, () => iframeRef.current?.contentWindow ?? null);
    const removeSubscription = subscribeHerMotionSessions(refresh);
    return () => { removeBridge(); removeSubscription(); };
  }, [launchUrl, session?.sessionId]);

  const iframeUrl = useMemo(() => session ? buildHerMotionSkillUrl(launchUrl, session) : '', [launchUrl, session?.sessionId]);

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
        <button type="button" onClick={close} aria-label={backLabel} className="grid h-9 w-9 shrink-0 place-items-center border-2 border-black bg-white active:translate-y-px"><ChevronLeft className="h-4 w-4" strokeWidth={3} /></button>
        <div className="min-w-0 flex-1"><div className="font-pixel text-[8px] tracking-wider">HER MOTION · FROST SESSION</div><p className="mt-0.5 truncate text-[8px] text-black/45">{session.sessionId}</p></div>
        <span className={`flex items-center gap-1 border border-black px-2 py-1 font-pixel text-[6px] ${recordState === 'recorded' ? 'bg-[#00ff88]' : session.status === 'cancelled' || recordState === 'failed' ? 'bg-[#eeeeee]' : 'bg-[#eeecfb]'}`}><Activity className="h-3 w-3" />{recordState === 'recorded' ? 'TASKMASTER 已记录' : recordState === 'failed' ? '记录待重试' : session.status === 'completed' ? '正在写入健康事件' : session.status === 'cancelled' ? '已安全停止' : '运行中'}</span>
      </header>
      <div className="shrink-0 border-b border-black bg-[#fff0b5] px-3 py-1.5 text-[8px] leading-relaxed">出现锐痛、眩晕或明显不适请立即停止 · 画面仅做实时姿态处理，不保存</div>
      <div className="relative min-h-0 flex-1">
        {import.meta.env.DEV
          ? <LocalHerMotionRuntime session={session} />
          : <iframe ref={iframeRef} src={iframeUrl} title="Her Motion Frost Skill" allow="camera" className="h-full w-full border-0 bg-black" />}
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
