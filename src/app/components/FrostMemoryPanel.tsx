import { useCallback, useEffect, useState } from 'react';
import { Download, History, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import {
  clearFrostMemory,
  correctFrostMemory,
  exportFrostMemoryBundle,
  forgetFrostMemory,
  listFrostMemories,
  listFrostRunTraces,
  subscribeFrostMemory,
  type FrostLongTermMemory,
} from '../../../frost-agent/harness/longTermMemory';
import { listHerMotionSessions, subscribeHerMotionSessions, type HerMotionSkillSession } from '../lib/health/herMotionSession';

export default function FrostMemoryPanel() {
  const [memories, setMemories] = useState<FrostLongTermMemory[]>([]);
  const [traceCount, setTraceCount] = useState(0);
  const [healthSessions, setHealthSessions] = useState<HerMotionSkillSession[]>([]);

  const refresh = useCallback(async () => {
    const [nextMemories, traces] = await Promise.all([listFrostMemories(), listFrostRunTraces()]);
    setMemories(nextMemories);
    setTraceCount(traces.length);
    setHealthSessions(listHerMotionSessions());
  }, []);

  useEffect(() => {
    void refresh();
    const stopMemory = subscribeFrostMemory(() => { void refresh(); });
    const stopHealth = subscribeHerMotionSessions(() => { void refresh(); });
    return () => { stopMemory(); stopHealth(); };
  }, [refresh]);

  const exportBundle = async () => {
    const bundle = await exportFrostMemoryBundle();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `frost-memory-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const correct = async (memory: FrostLongTermMemory) => {
    const next = window.prompt('修正这条记忆（只保存修正后的摘要）', memory.summary);
    if (next?.trim()) await correctFrostMemory(memory.id, next);
  };

  const clearAll = async () => {
    if (!window.confirm('忘记 Frost 的全部本地长期记忆与 RunTrace？此操作不可恢复。')) return;
    await clearFrostMemory();
  };

  return (
    <details className="mx-3 mb-2 shrink-0 border-2 border-black bg-white" aria-label="Frost 长期记忆">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[10px] font-bold">
        <History className="h-4 w-4 text-[#20745a]" strokeWidth={2.5} />
        <span className="flex-1">健康记忆 {healthSessions.filter((item) => item.status === 'completed').length} 条 · 长期记忆 {memories.length} 条 · Trace {traceCount}</span>
        <span className="font-pixel text-[6px] text-black/45">LOCAL ONLY</span>
      </summary>
      <div className="border-t-2 border-black px-3 py-2">
        <p className="mb-2 text-[9px] leading-relaxed text-black/55">
          只保存已确认的任务交接与运动结果；摄像头画面、聊天原文和图片不会进入记忆。
        </p>
        {healthSessions.length > 0 && (
          <section className="mb-2" aria-label="Her Motion 健康记忆">
            <div className="mb-1 font-pixel text-[6px] tracking-wider text-[#20745a]">HER MOTION · SKILL SESSIONS</div>
            <ol className="space-y-1">
              {healthSessions.slice(0, 5).map((session) => (
                <li key={session.sessionId} className="border border-black/25 bg-[#edf8f0] px-2 py-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <b className="block text-[9px]">{session.exerciseName || 'Her Motion 动作陪伴'} · {session.status === 'completed' ? '已完成' : session.status === 'cancelled' ? '已取消' : '进行中'}</b>
                      <p className="mt-0.5 text-[8px] leading-relaxed text-black/55">
                        {session.durationSec != null ? `${Math.floor(session.durationSec / 60)}分${session.durationSec % 60}秒 · ` : ''}{session.poseConfirmed ? `姿态已确认${session.confidence != null ? ` ${Math.round(session.confidence * 100)}%` : ''}` : '姿态尚未确认'} · 本机私有
                      </p>
                    </div>
                    <span className={`shrink-0 border border-black px-1 py-0.5 font-pixel text-[5px] ${session.status === 'completed' ? 'bg-[#7CFF6B]' : 'bg-white'}`}>{session.status.toUpperCase()}</span>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
        <div className="mb-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-1 border border-black px-2 py-1 text-[8px]"><RotateCcw className="h-3 w-3" />刷新</button>
          <button type="button" onClick={() => void exportBundle()} className="inline-flex items-center gap-1 border border-black px-2 py-1 text-[8px]"><Download className="h-3 w-3" />导出</button>
          <button type="button" onClick={() => void clearAll()} className="inline-flex items-center gap-1 border border-black px-2 py-1 text-[8px] text-[#a33024]"><Trash2 className="h-3 w-3" />全部忘记</button>
        </div>
        {memories.length ? (
          <ol className="max-h-40 space-y-1 overflow-y-auto">
            {memories.slice(0, 20).map((memory) => (
              <li key={memory.id} className="border border-black/25 bg-[#f4f1e7] px-2 py-1.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <b className="block text-[9px]">{memory.topic} · {memory.kind === 'procedural' ? `已验证 ${memory.repetitions} 次` : memory.phase === 'accepted' ? '已接收' : '已交接'}</b>
                    <p className="mt-0.5 text-[8px] leading-relaxed text-black/55">{memory.summary}</p>
                  </div>
                  <button type="button" aria-label="修正这条记忆" onClick={() => void correct(memory)} className="grid h-6 w-6 place-items-center border border-black bg-white"><Pencil className="h-3 w-3" /></button>
                  <button type="button" aria-label="忘记这条记忆" onClick={() => void forgetFrostMemory(memory.id)} className="grid h-6 w-6 place-items-center border border-black bg-white text-[#a33024]"><Trash2 className="h-3 w-3" /></button>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[9px] text-black/40">完成第一次 Frost → 专家 → Skill 交接后，这里才会出现真实记忆。</p>
        )}
      </div>
    </details>
  );
}
