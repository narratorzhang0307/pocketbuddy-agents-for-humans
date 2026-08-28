import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Gauge } from 'lucide-react';
import { getEdgeRuntimeStatus } from '../../../frost-agent/edge/httpEdge';
import { isNativeMnnPlatform } from '../../../frost-agent/edge/capacitorMnnEdge';
import type { EdgeResponse } from '../../../frost-agent/edge/types';
import { buildSme2EfficiencyComparisons, readDeviceEvidence, type DeviceEvidenceRecord } from '../lib/deviceEvidence';

const ACCENT = '#d89a3d';
const seconds = (value: number | null | undefined): string => typeof value === 'number' && Number.isFinite(value) ? `${(value / 1000).toFixed(1)} 秒` : '—';

export default function DeviceEvidenceLedgerPage({ onBack }: { onBack: () => void }) {
  const native = isNativeMnnPlatform();
  const [runtime, setRuntime] = useState<EdgeResponse | null>(null);
  const [records, setRecords] = useState<DeviceEvidenceRecord[]>([]);

  const refresh = useCallback(async () => {
    const [nextRuntime, nextRecords] = await Promise.all([getEdgeRuntimeStatus(), readDeviceEvidence()]);
    setRuntime(nextRuntime); setRecords(nextRecords);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const inferenceRecords = useMemo(() => records.filter((record) => record.kind === 'inference'), [records]);
  const comparisons = useMemo(() => buildSme2EfficiencyComparisons(records), [records]);
  const state = runtime?.runtime;

  return <div className="h-full overflow-y-auto bg-[#eaeaea] pb-24 text-black">
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b-2 border-black bg-white px-3 py-2">
      <button type="button" aria-label="返回" onClick={onBack} className="grid h-8 w-8 place-items-center border-2 border-black"><ArrowLeft className="h-4 w-4" /></button>
      <div className="min-w-0 flex-1"><h1 className="font-pixel text-[12px] tracking-wider">SME2 效率对比</h1><p className="truncate text-[8px] text-black/45">同一任务、同一输入，比较真实推理耗时</p></div>
      <Gauge className="h-5 w-5" style={{ color: ACCENT }} />
    </header>

    <main className="space-y-3 p-3">
      <section className="border-[3px] border-black bg-[#f7e1b7] p-3">
        <div className="flex items-center gap-2"><div className="grid h-10 w-10 place-items-center border-2 border-black bg-white font-pixel text-[12px]">{comparisons.length}</div><div><b className="block text-[11px]">已完成对比</b><span className="text-[8px] text-black/50">{runtime?.runtime?.device?.model || '当前设备'} · {native ? 'Android 原生' : '网页预览'}</span></div></div>
        <div className="mt-2 flex items-center justify-between border-2 border-black bg-white px-2.5 py-2 text-[9px]"><span>当前 SME2</span><b>{state?.sme2Effective ? 'ON' : state?.sme2Requested ? '未生效' : 'OFF'}</b></div>
      </section>

      <section className="space-y-2">
        {!comparisons.length && <div className="border-2 border-dashed border-black/35 bg-white p-6 text-center text-[9px] leading-relaxed text-black/55">先以 SME2 OFF 运行一次 Skill，再切到 ON，用完全相同的输入再运行一次。<span className="mt-2 block text-[8px] text-black/40">已记录真实推理 {inferenceRecords.length} 次；凑齐同输入的 OFF / ON 后自动生成对比。</span></div>}
        {comparisons.map((comparison, index) => {
          const faster = comparison.savedMs >= 0;
          return <article key={comparison.inputSha256} className="border-[3px] border-black bg-white">
            <div className="flex items-center gap-2 border-b-2 border-black px-2.5 py-2"><span className="font-pixel text-[8px]">#{comparisons.length - index}</span><b className="flex-1 text-[9px]">{comparison.workload}</b><span className="text-[8px] text-black/40">{new Date(comparison.createdAt).toLocaleString()}</span></div>
            <div className="grid grid-cols-2 gap-1.5 p-2 text-center text-[9px]"><div className="border-2 border-black bg-[#e5e5e5] p-2"><span className="block text-black/45">SME2 OFF</span><b>{seconds(comparison.off.inferenceElapsedMs)}</b></div><div className="border-2 border-black bg-[#f7e1b7] p-2"><span className="block text-black/45">SME2 ON</span><b>{seconds(comparison.on.inferenceElapsedMs)}</b></div></div>
            <div className={`border-t-2 border-black p-2 text-center text-[10px] font-black ${faster ? 'bg-[#dcf3df] text-[#087a43]' : 'bg-[#fff0ed] text-[#b3261e]'}`}>{faster ? `节省 ${seconds(comparison.savedMs)} · 快 ${comparison.improvementPercent}%` : `本次慢 ${seconds(Math.abs(comparison.savedMs))} · 建议保持关闭`}</div>
          </article>;
        })}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between border-2 border-black bg-black px-2.5 py-2 text-white"><b className="font-pixel text-[8px]">每次真实推理</b><span className="font-pixel text-[7px]">{inferenceRecords.length} RUNS</span></div>
        {inferenceRecords.map((record, index) => {
          const mode = record.sme2Effective ? 'ON' : record.sme2Requested ? '未生效' : 'OFF';
          return <article key={record.id} className="border-2 border-black bg-white p-2">
            <div className="flex items-center gap-2"><span className={`border border-black px-1.5 py-0.5 font-pixel text-[7px] ${record.sme2Effective ? 'bg-[#f7e1b7]' : record.sme2Requested ? 'bg-[#fff0ed]' : 'bg-[#e5e5e5]'}`}>SME2 {mode}</span><b className="min-w-0 flex-1 truncate text-[9px]">{record.workload || 'MNN 推理'}</b><span className="font-pixel text-[7px]">{seconds(record.inferenceElapsedMs)}</span></div>
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-pixel text-[6px] text-black/45"><span>#{inferenceRecords.length - index}</span><span>TARGET {record.cpuTarget ?? '—'}</span><span>INPUT {(record.inputSha256 || '').slice(0, 10)}…</span>{typeof record.stats?.decodeTokensPerSecond === 'number' && <span>{record.stats.decodeTokensPerSecond.toFixed(2)} tok/s</span>}<span>{new Date(record.createdAt).toLocaleString()}</span></div>
          </article>;
        })}
      </section>
    </main>
  </div>;
}
