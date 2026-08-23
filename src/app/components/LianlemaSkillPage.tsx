import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ChevronLeft } from 'lucide-react';
import { acceptTaskHandoff, peekTaskHandoff } from '../../../frost-agent/harness/taskHandoff';

interface Props {
  launchUrl: string;
  onBack: () => void;
  backLabel?: string;
}

function embeddedUrl(launchUrl: string, objective?: string, runId?: string): string {
  try {
    const url = new URL(launchUrl, window.location.href);
    if (url.hostname === 'localhost' && window.location.hostname === '127.0.0.1') url.hostname = '127.0.0.1';
    url.searchParams.set('embed', 'frost');
    if (objective) url.searchParams.set('frostTask', objective);
    if (runId) url.searchParams.set('frostRunId', runId);
    return url.toString();
  } catch {
    return launchUrl;
  }
}

export default function LianlemaSkillPage({ launchUrl, onBack, backLabel = '返回 Skills' }: Props) {
  const [handoff] = useState(() => peekTaskHandoff('lianlema-coach'));
  const [serviceState, setServiceState] = useState<'checking' | 'ready' | 'unavailable'>('checking');
  const [retryCount, setRetryCount] = useState(0);
  const serviceTimeoutRef = useRef<number | null>(null);
  const iframeUrl = useMemo(() => embeddedUrl(launchUrl, handoff?.objective, handoff?.runId), [handoff?.objective, handoff?.runId, launchUrl]);

  useEffect(() => {
    if (handoff) void acceptTaskHandoff('lianlema-coach');
  }, [handoff]);

  useEffect(() => {
    setServiceState('checking');
    if (serviceTimeoutRef.current !== null) window.clearTimeout(serviceTimeoutRef.current);
    serviceTimeoutRef.current = window.setTimeout(() => setServiceState('unavailable'), 8000);
    return () => {
      if (serviceTimeoutRef.current !== null) window.clearTimeout(serviceTimeoutRef.current);
    };
  }, [iframeUrl, retryCount]);

  const markServiceReady = () => {
    if (serviceTimeoutRef.current !== null) window.clearTimeout(serviceTimeoutRef.current);
    serviceTimeoutRef.current = null;
    setServiceState('ready');
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#e9ecf1]">
      <header className="flex shrink-0 items-center gap-2 border-b-2 border-black bg-white px-2 py-2">
        <button type="button" onClick={onBack} aria-label={backLabel} className="grid h-9 w-9 shrink-0 place-items-center border-2 border-black bg-white active:translate-y-px">
          <ChevronLeft className="h-4 w-4" strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-pixel text-[8px] tracking-wider">练了吗 · FROST SKILL</div>
          <p className="mt-0.5 truncate text-[8px] text-black/45">AI 实时姿势矫正 · 服务端模型</p>
        </div>
        <span className="flex items-center gap-1 border border-black bg-[#e8f8ef] px-2 py-1 font-pixel text-[6px] text-[#087c49]">
          <Activity className="h-3 w-3" />VISION API
        </span>
      </header>
      <div className="shrink-0 border-b border-black bg-[#fff0b5] px-3 py-1.5 text-[8px] leading-relaxed">
        已置入 Pocket Buddy Skill · 出现锐痛、眩晕或明显不适请立即停止
      </div>
      {handoff && (
        <div className="shrink-0 border-b border-black bg-[#e8f8ef] px-3 py-1.5 text-[8px] leading-relaxed" aria-label="Frost 训练任务">
          <span className="font-pixel text-[6px] text-[#087c49]">FROST TASK · </span>{handoff.objective}
        </div>
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#e9ecf1]">
        <iframe
          key={retryCount}
          src={iframeUrl}
          title="练了吗 Frost Skill"
          allow="camera; microphone"
          onLoad={markServiceReady}
          className="h-full w-full border-0 bg-[#e9ecf1]"
        />
        {serviceState === 'checking' && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-[#e9ecf1] px-6 text-center">
            <div>
              <Activity className="mx-auto h-6 w-6 animate-pulse text-[#02a85d]" />
              <p className="mt-3 font-pixel text-[8px]">正在连接训练教练服务…</p>
              <p className="mt-2 text-[10px] leading-relaxed text-black/50">如果长时间未打开，请双击便携包里的 start.command。</p>
            </div>
          </div>
        )}
        {serviceState === 'unavailable' && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-[#e9ecf1] px-5">
            <section className="w-full max-w-sm border-2 border-black bg-white p-4 text-center shadow-[4px_4px_0_#02c56e]">
              <Activity className="mx-auto h-7 w-7 text-black/35" />
              <h2 className="mt-3 font-pixel text-[9px]">训练服务暂未连接</h2>
              <p className="mt-2 text-[10px] leading-relaxed text-black/55">请确认训练教练服务可用，然后重新连接。</p>
              <button type="button" onClick={() => setRetryCount((value) => value + 1)} className="mt-4 w-full border-2 border-black bg-[#02c56e] px-3 py-2.5 font-pixel text-[7px] text-white">重新连接</button>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
