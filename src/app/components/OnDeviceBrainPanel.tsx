import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Cpu, Loader2 } from 'lucide-react';
import { configureEdgeRuntime, getEdgeRuntimeStatus, runEdgeChatEvidence } from '../../../frost-agent/edge/httpEdge';
import { isNativeMnnPlatform } from '../../../frost-agent/edge/capacitorMnnEdge';
import type { EdgeAssetStatus, EdgeResponse } from '../../../frost-agent/edge/types';
import { buildSme2EfficiencyComparisons, readDeviceEvidence, type DeviceEvidenceRecord } from '../lib/deviceEvidence';
import HealthQwenMnnCard, { type HealthQwenMnnState } from './HealthQwenMnnCard';

const ACCENT = '#79bed0';
const SME = '#d89a3d';
function Toggle({ label, value, disabled, onChange, color }: { label: string; value: boolean; disabled?: boolean; onChange: (value: boolean) => void; color: string }) {
  return <div className="grid grid-cols-[minmax(0,1fr)_104px] items-center border-2 border-black bg-white min-[390px]:grid-cols-[minmax(0,1fr)_116px]">
    <div className="px-2.5 py-2"><b className="font-pixel text-[8px] tracking-wider">{label}</b></div>
    <div className="grid grid-cols-2 border-l-2 border-black">
      {[false, true].map((option) => <button key={String(option)} type="button" disabled={disabled} onClick={() => onChange(option)}
        className={`h-9 text-[10px] font-black disabled:cursor-not-allowed disabled:opacity-35 ${value === option ? 'text-black' : 'bg-[#ededed] text-black/40'} ${option ? 'border-l border-black/20' : ''}`}
        style={value === option ? { background: option ? color : '#d9d9d9' } : undefined}>{option ? 'ON' : 'OFF'}</button>)}
    </div>
  </div>;
}

export default function OnDeviceBrainPanel({ onOpenLedger }: { onOpenLedger?: () => void }) {
  const native = isNativeMnnPlatform();
  const [open, setOpen] = useState(false);
  const [runtime, setRuntime] = useState<EdgeResponse | null>(null);
  const [base, setBase] = useState<EdgeAssetStatus>();
  const [records, setRecords] = useState<DeviceEvidenceRecord[]>([]);
  const [acting, setActing] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [nextRuntime, nextRecords] = await Promise.all([getEdgeRuntimeStatus(), readDeviceEvidence()]);
    setRuntime(nextRuntime); setRecords(nextRecords);
  }, []);

  const handleHealthBaseState = useCallback((state: HealthQwenMnnState) => {
    setBase(state.base);
    setRuntime(state.runtime);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const state = runtime?.runtime;
  const mnnEnabled = state?.mnnEnabled ?? false;
  const sme2Effective = state?.sme2Effective ?? false;
  const hardwareSme2 = state?.hardware?.sme2 === true;
  const inferenceRecords = useMemo(() => records.filter((record) => record.kind === 'inference'), [records]);
  const comparisons = useMemo(() => buildSme2EfficiencyComparisons(records), [records]);

  const applyConfiguration = async (nextSme2: boolean) => {
    if (!native || !base?.installed) return;
    setActing(true); setError(''); setProgress(`切换 SME2 ${nextSme2 ? 'ON' : 'OFF'}…`);
    try {
      const response = await configureEdgeRuntime(true, nextSme2);
      if (response.error) throw new Error(response.error);
      const applied = response.runtime;
      if (nextSme2 && (applied?.sme2Effective !== true || applied.cpuTarget !== 3)) throw new Error('SME2 请求已发送，但 JNI 未切到 target 3');
      if (!nextSme2 && (applied?.sme2Effective === true || applied?.cpuTarget === 3)) throw new Error('SME2 OFF 未真正下沉到 JNI');
      setRuntime(response);
      setProgress(`已切换到 ${nextSme2 ? 'ON · target 3' : `OFF · target ${applied?.cpuTarget ?? '—'}`}。`);
    } catch (reason) { setError(String(reason)); }
    finally { setActing(false); await refresh(); window.setTimeout(() => setProgress(''), 1200); }
  };

  const runQuickComparison = async () => {
    if (!native || !base?.installed || !hardwareSme2 || acting) return;
    setActing(true); setError('');
    const prompt = '只回复 SME2_AB_OK';
    const options = { system: '你只能输出 SME2_AB_OK，不要解释。', maxTokens: 16 } as const;
    try {
      setProgress('准备 SME2 OFF · 释放 Session 并切换 target 2…');
      const offConfiguration = await configureEdgeRuntime(true, false);
      if (offConfiguration.error || offConfiguration.runtime?.sme2Effective === true || offConfiguration.runtime?.cpuTarget === 3) throw new Error('SME2 OFF 配置未真实生效');
      setProgress('SME2 OFF · 同一固定输入推理中…');
      const off = await runEdgeChatEvidence(prompt, options);
      if (off.backend !== 'mnn' || !(off.text || '').includes('SME2_AB_OK') || off.stats?.sme2Effective === true || off.stats?.cpuTarget === 3) throw new Error(`SME2 OFF 实测失败：${off.error || off.text || '无输出'}`);

      setProgress('准备 SME2 ON · 释放 Session 并切换 target 3…');
      const onConfiguration = await configureEdgeRuntime(true, true);
      if (onConfiguration.error || onConfiguration.runtime?.sme2Effective !== true || onConfiguration.runtime?.cpuTarget !== 3) throw new Error('SME2 ON 未切到 target 3；当前 APK 或手机硬件未真正启用 SME2');
      setProgress('SME2 ON · 同一固定输入推理中…');
      const on = await runEdgeChatEvidence(prompt, options);
      if (on.backend !== 'mnn' || !(on.text || '').includes('SME2_AB_OK') || on.stats?.sme2Effective !== true || on.stats?.cpuTarget !== 3) throw new Error(`SME2 ON 实测失败：${on.error || on.text || '无输出'}`);

      const offMs = off.stats?.elapsedMs || 0;
      const onMs = on.stats?.elapsedMs || 0;
      setRuntime(onConfiguration);
      await refresh();
      setProgress(`A/B 已记录 · OFF ${(offMs / 1000).toFixed(1)}s / ON ${(onMs / 1000).toFixed(1)}s · 当前保持 ON`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      await configureEdgeRuntime(true, true).catch(() => undefined);
    } finally {
      setActing(false);
      await refresh();
    }
  };

  return <section className="border-[3px] border-black bg-[#f6f1e5]">
    <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-2 bg-black px-3 py-2 text-left text-white">
      <Cpu className="h-4 w-4 shrink-0" style={{ color: ACCENT }} strokeWidth={2.6} />
      <span className="font-pixel text-[9px] tracking-wider">SME2 加速对比</span><span className="flex-1" />
      <span className="text-[8px] font-bold" style={{ color: ACCENT }}>{comparisons.length ? `${comparisons.length} 组对比` : `${inferenceRecords.length} 次运行`}</span>
      <span className="border border-white/55 px-1.5 py-1 text-[7px] font-bold">{open ? '收起' : '展开'}</span>
      <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>

    {open && <div className="space-y-2 p-2.5">
      <HealthQwenMnnCard onStateChange={handleHealthBaseState} />

      <div className="flex items-center justify-between border-2 border-black bg-[#dceff3] px-2.5 py-2 text-[9px]"><b>MNN 端侧运行底座</b><span className="font-pixel text-[8px]">固定 ON</span></div>
      <Toggle label="SME2 指令加速" value={sme2Effective} disabled={!native || acting || !base?.installed || !mnnEnabled || !hardwareSme2} color={SME} onChange={(value) => void applyConfiguration(value)} />

      <button type="button" disabled={!native || acting || !base?.installed || !mnnEnabled || !hardwareSme2} onClick={() => void runQuickComparison()} className="flex w-full items-center justify-center gap-2 border-2 border-black bg-[#f7e1b7] py-2.5 text-[10px] font-black shadow-[2px_2px_0_#000] active:translate-y-px disabled:opacity-35">
        {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cpu className="h-4 w-4" />} 一键实测 OFF → ON（结束保持 ON）
      </button>

      {onOpenLedger && <button type="button" onClick={onOpenLedger} className="w-full border-2 border-black bg-white py-2 text-[9px] font-black">查看 SME2 效率记录（{inferenceRecords.length} 次 / {comparisons.length} 组）→</button>}
      {(acting || progress) && <div className="flex items-center gap-2 border-2 border-black bg-[#fff4d6] p-2 text-[9px] font-bold">{acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-[#087c49]" />}{progress || '切换中…'}</div>}
      {error && <div className="flex items-start gap-1.5 border-2 border-black bg-[#fff0f0] p-2 text-[9px] text-[#b3261e]"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}</div>}
      <div className="text-[8px] leading-relaxed text-black/40">每次真实 MNN 推理都会记录 ON/OFF、target、耗时与输入哈希；同一输入的 OFF / ON 自动生成对比。</div>
    </div>}
  </section>;
}
