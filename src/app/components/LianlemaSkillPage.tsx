import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import SkillAvatar from './SkillAvatar';
import { Activity, ChevronLeft } from 'lucide-react';
import { acceptTaskHandoff, peekTaskHandoff } from '../../../frost-agent/harness/taskHandoff';
import { isLianlemaReadyMessage, resolveLianlemaConnection, shouldAutoStartLianlema } from '../lib/health/lianlemaConnection';
import { reportFrostSkillPageResult } from '../lib/frostAgentRuntime';
import FrostSkillResultButton from './FrostSkillResultButton';
import type { FrostSkillPageResult } from '../../../frost-agent/harness/skillPageResult';
import { validWorkoutResult } from '../lib/frostHealthMemory';
import { frostBadge } from '../lib/frostBadge';
import { COACH_AUDIO_PROTOCOL, LianlemaBadgeAudio, loadCoachPcm } from '../lib/lianlemaBadgeAudio';

interface Props {
  launchUrl: string;
  onBack: () => void;
  backLabel?: string;
}

function embeddedUrl(launchUrl: string, objective?: string, runId?: string, audioSession?: string, autoStart = false): string {
  try {
    const url = new URL(launchUrl, window.location.href);
    if (url.hostname === 'localhost' && window.location.hostname === '127.0.0.1') url.hostname = '127.0.0.1';
    url.searchParams.set('embed', 'frost');
    if (objective) url.searchParams.set('frostTask', objective);
    if (runId) url.searchParams.set('frostRunId', runId);
    if (autoStart) {
      url.searchParams.set('frostAutoStart', '1');
      url.searchParams.set('frostParentOrigin', `${window.location.protocol}//${window.location.host}`);
    }
    if (audioSession) {
      url.searchParams.set('frostAudio', 'badge-v1');
      url.searchParams.set('frostAudioSession', audioSession);
      url.searchParams.set('frostParentOrigin', `${window.location.protocol}//${window.location.host}`);
    }
    return url.toString();
  } catch {
    return launchUrl;
  }
}

export default function LianlemaSkillPage({ launchUrl, onBack, backLabel = '返回 Skills' }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hosted = ['https://pocketbuddy.throughtheglass.art/', 'https://pocket-buddy.throughtheglass.art/']
    .some(origin => launchUrl.startsWith(origin));
  const connection = useMemo(() => resolveLianlemaConnection(launchUrl, window.location.href, Capacitor.isNativePlatform()), [launchUrl]);
  const [handoff] = useState(() => peekTaskHandoff('lianlema-coach'));
  const [autoStart] = useState(() => shouldAutoStartLianlema(handoff));
  const [serviceState, setServiceState] = useState<'checking' | 'ready' | 'unavailable'>(() => connection.url ? 'checking' : 'unavailable');
  const [retryCount, setRetryCount] = useState(0);
  const badge = useSyncExternalStore(frostBadge.subscribe, frostBadge.snapshot);
  const badgeAudio = frostBadge.supported() && Capacitor.getPlatform() === 'ios';
  const audioSession = useMemo(() => badgeAudio ? crypto.randomUUID() : undefined, [badgeAudio, retryCount]);
  const [audioStatus, setAudioStatus] = useState('教练原声 · 仅吧唧出声');
  const [completedReport, setCompletedReport] = useState<FrostSkillPageResult>();
  const serviceTimeoutRef = useRef<number | null>(null);
  const iframeUrl = useMemo(() => connection.url ? embeddedUrl(connection.url, handoff?.objective, handoff?.runId, audioSession, autoStart) : '', [handoff?.objective, handoff?.runId, connection.url, audioSession, autoStart]);

  useEffect(() => {
    if (handoff && serviceState === 'ready') void acceptTaskHandoff('lianlema-coach');
  }, [handoff, serviceState]);

  useEffect(() => {
    setServiceState(iframeUrl ? 'checking' : 'unavailable');
    if (serviceTimeoutRef.current !== null) window.clearTimeout(serviceTimeoutRef.current);
    if (!iframeUrl) return;
    const expectedOrigin = new URL(iframeUrl).origin;
    const audio = audioSession ? new LianlemaBadgeAudio(audioSession, {
      connection: () => frostBadge.snapshot().status === 'connected' ? frostBadge.snapshot().connectionId : undefined,
      available: () => document.visibilityState !== 'hidden' && !frostBadge.snapshot().recording,
      load: loadCoachPcm, play: (pcm, options) => frostBadge.playPcm(pcm, options), stop: () => frostBadge.stopPlayback(),
      reply: data => iframeRef.current?.contentWindow?.postMessage(data, expectedOrigin),
      status: setAudioStatus,
    }) : undefined;
    const changed = () => audio?.stateChanged();
    const unbadge = frostBadge.subscribe(changed);
    document.addEventListener('visibilitychange', changed);
    const ready = (event: MessageEvent<unknown>) => {
      if (event.source !== iframeRef.current?.contentWindow || event.origin !== expectedOrigin) return;
      if (audio) void audio.receive(event.data);
      const stage = event.data as { protocol?: string; type?: string; runId?: string; workout?: FrostSkillPageResult['workout'] } | null;
      if (stage?.protocol === 'pocket-lianlema/v1' && stage.type === 'workout-completed' && stage.runId === handoff?.runId
        && handoff?.agentSessionId && validWorkoutResult(stage.workout)) {
        const report: FrostSkillPageResult = { status: 'completed', workout: stage.workout,
          summary: `练了吗已结束本次实拍训练：${stage.workout!.exercise_name}，有效观察 ${stage.workout!.duration_sec} 秒，${stage.workout!.total_reps} 次。暂停、后台等待和上传视频不计入本次运动。` };
        setCompletedReport(report);
        void reportFrostSkillPageResult(handoff, report).catch(() => { /* Keep the actual result for explicit retry below. */ });
      }
      if (stage?.protocol === 'pocket-lianlema/v1' && stage.runId === handoff?.runId &&
          ['camera-ready', 'frame-analyzed', 'training-stopped', 'camera-blocked'].includes(stage.type || '')) {
        console.info(`[FrostVoice] fitness_stage=${stage.type} target=lianlema-coach`);
      }
      if (!isLianlemaReadyMessage(event.data)) return;
      if (audioSession && (event.data as { badgeAudioProtocol?: string }).badgeAudioProtocol !== COACH_AUDIO_PROTOCOL) {
        setAudioStatus('训练页声音通道版本不符，请重新连接');
        setServiceState('unavailable');
        return;
      }
      if (serviceTimeoutRef.current !== null) window.clearTimeout(serviceTimeoutRef.current);
      setServiceState('ready');
      console.info('[FrostVoice] skill_page_ready target=lianlema-coach handshake=pocket-lianlema/v1');
    };
    window.addEventListener('message', ready);
    serviceTimeoutRef.current = window.setTimeout(() => setServiceState('unavailable'), 15000);
    return () => {
      window.removeEventListener('message', ready);
      document.removeEventListener('visibilitychange', changed);
      unbadge(); audio?.dispose();
      if (serviceTimeoutRef.current !== null) window.clearTimeout(serviceTimeoutRef.current);
    };
  }, [iframeUrl, retryCount, audioSession]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#e9ecf1]">
      <header className="flex shrink-0 items-center gap-2 border-b-2 border-black bg-white px-2 py-2">
        <SkillAvatar skillId="pocket.lianlema" size={36} />
        <button type="button" onClick={onBack} aria-label={backLabel} className="grid h-9 w-9 shrink-0 place-items-center border-2 border-black bg-white active:translate-y-px">
          <ChevronLeft className="h-4 w-4" strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-pixel text-[8px] tracking-wider">练了吗 · FROST SKILL</div>
          <p className="mt-0.5 truncate text-[8px] text-black/45">AI 实时姿势矫正 · {hosted ? 'Pocket Buddy 服务器' : '电脑模型服务'}</p>
        </div>
        <span className="flex items-center gap-1 border border-black bg-[#e8f8ef] px-2 py-1 font-pixel text-[6px] text-[#087c49]">
          <Activity className="h-3 w-3" />{hosted ? 'SERVER VISION' : 'DESKTOP RUNTIME'}
        </span>
      </header>
      {badgeAudio && <div role="status" className="shrink-0 border-b border-black bg-[#e8f8ef] px-3 py-1.5 text-[10px]">
        声音 → 圆形吧唧 · {badge.status === 'connected' ? audioStatus : '未连接，手机保持静音；请返回 Frost 连接吧唧'}
      </div>}
      <div className="shrink-0 border-b border-black bg-[#fff0b5] px-3 py-1.5 text-[8px] leading-relaxed">
        已置入 Pocket Buddy Skill · 出现锐痛、眩晕或明显不适请立即停止
      </div>
      {handoff && (
        <div className="shrink-0 border-b border-black bg-[#e8f8ef] px-3 py-1.5 text-[8px] leading-relaxed" aria-label="Frost 训练任务">
          <span className="font-pixel text-[6px] text-[#087c49]">FROST TASK · </span>{handoff.objective}
        </div>
      )}
      {handoff?.agentSessionId && !handoff.taskmasterTaskId && serviceState === 'unavailable' && <div className="shrink-0 px-3 pb-2">
        <FrostSkillResultButton report={result => reportFrostSkillPageResult(handoff, result)}
          result={{ status: 'blocked', summary: '练了吗训练页面暂未连接；没有开启相机，也没有完成姿态检测或训练。' }} />
      </div>}
      {handoff?.agentSessionId && completedReport && <div className="shrink-0 px-3 pb-2"><FrostSkillResultButton result={completedReport} report={result => reportFrostSkillPageResult(handoff, result)} /></div>}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#e9ecf1]">
        {iframeUrl && <iframe
          ref={iframeRef}
          key={retryCount}
          src={iframeUrl}
          title="练了吗 Frost Skill"
          allow="camera"
          className="h-full w-full border-0 bg-[#e9ecf1]"
        />}
        {serviceState === 'checking' && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-[#e9ecf1] px-6 text-center">
            <div>
              <Activity className="mx-auto h-6 w-6 animate-pulse text-[#02a85d]" />
              <p className="mt-3 font-pixel text-[8px]">正在连接训练教练…</p>
              <p className="mt-2 text-[10px] leading-relaxed text-black/50">等待训练页面响应；模型服务也需要保持运行。</p>
            </div>
          </div>
        )}
        {serviceState === 'unavailable' && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-[#e9ecf1] px-5">
            <section className="w-full max-w-sm border-2 border-black bg-white p-4 text-center shadow-[4px_4px_0_#02c56e]">
              <Activity className="mx-auto h-7 w-7 text-black/35" />
              <h2 className="mt-3 font-pixel text-[9px]">{connection.issue ? '尚未配置手机训练服务' : '训练页面暂未连接'}</h2>
              <p className="mt-2 text-[10px] leading-relaxed text-black/55">{connection.detail || (hosted ? '未收到训练页面响应，请检查手机网络后重试。' : '请确认电脑上的训练页面和模型服务均在运行，并配置手机可访问的 HTTPS 地址。')}</p>
              <p className="mt-2 text-[10px] leading-relaxed text-black/55">{hosted ? '模型运行在 Pocket Buddy 服务器。开始训练前会请求同意发送压缩画面，服务器不保存画面。' : '模型运行在电脑；重新连接不会把模型安装到手机。'}</p>
              <p className="mt-2 break-all text-[9px] text-black/45">配置地址：{launchUrl}</p>
              {connection.issue
                ? <button type="button" onClick={onBack} className="mt-4 w-full border-2 border-black bg-[#02c56e] px-3 py-2.5 font-pixel text-[7px] text-white">{backLabel}</button>
                : <button type="button" onClick={() => setRetryCount((value) => value + 1)} className="mt-4 w-full border-2 border-black bg-[#02c56e] px-3 py-2.5 font-pixel text-[7px] text-white">重新连接</button>}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
