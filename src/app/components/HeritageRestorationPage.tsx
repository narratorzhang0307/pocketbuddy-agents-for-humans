import { useEffect, useState } from 'react';
import { Check, ChevronLeft, Cloud, FileImage, LoaderCircle, ScanText, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { configureEdgeRuntime, getEdgeRuntimeStatus, installEdgeAsset } from '../../../frost-agent/edge/httpEdge';
import { prepareAndEquipSkill, removeEdgeAssetForSkills } from '../lib/skill';
import { startAgentRun } from '../lib/observe/bus';
import { runHeritageCloudDiagnostic, runHeritageCloudEnhancement, runHeritageInterpretation, runHeritageOcr, type HeritageCloudEnhancement, type HeritageMaterial, type RubbingResult } from '../lib/heritage/rubbing';
import RunTrace from './RunTrace';
import DigitalConservationPanel from './DigitalConservationPanel';
import { QWEN2B_BASE_ASSET, QWEN2B_BASE_RELEASE } from '../../../frost-agent/edge/qwen2bRelease';

const ACCENT = '#C9A84C';
type HeritageMode = 'guji' | 'rubbing' | 'restore';
type HeritageEntry = 'guji' | 'rubbing' | 'reconstruction';
const SKILL_KEYS: Record<HeritageMode, string> = {
  guji: 'pocket.guji-reading@1.0.0',
  rubbing: 'pocket.rubbing@1.1.0',
  restore: 'pocket.digital-conservation@1.1.0',
};
const MODE_BY_ENTRY: Record<HeritageEntry, HeritageMode> = { guji: 'guji', rubbing: 'rubbing', reconstruction: 'restore' };
const SAMPLE_GUJI = '/assets/heritage-demo/xihu-mengxun-leifeng-page-source.jpg';
const SAMPLE_GUJI_JINGCI = '/assets/heritage-demo/xihu-mengxun-jingci-page-source.jpg';
const SAMPLE_RUBBING = '/assets/heritage-demo/stele-rubbing-npm-33679.jpg';
const SAMPLE_RUBBING_REFERENCE = '馆藏题名表明：这是一件晋代赵府君墓道额的墨拓本，题名记载其官衔为振威将军、鬱林太守。图像 OCR 残文与馆藏题名存在多处疑字差异，需核对后再作进一步释读。';

const fileDataUrl = (file: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = reject; reader.readAsDataURL(file);
});

const fetchDataUrl = async (url: string): Promise<string> => {
  const response = await fetch(url); if (!response.ok) throw new Error(`样例读取失败：${response.status}`);
  return fileDataUrl(await response.blob());
};

export default function HeritageRestorationPage({ onBack, initialSkill = 'rubbing', backLabel = '返回 Skills' }: { onBack: () => void; initialSkill?: HeritageEntry; backLabel?: string }) {
  const [mode, setMode] = useState<HeritageMode>(MODE_BY_ENTRY[initialSkill]);
  const [image, setImage] = useState('');
  const [rubbingReference, setRubbingReference] = useState('');
  const [runtime, setRuntime] = useState({ checking: true, ready: false, mnnEnabled: true, visionSafe: false, guji: false, rubbing: false, restorer: false, message: '检查端侧运行时…', version: '' });
  const [installing, setInstalling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ocr, setOcr] = useState<RubbingResult | null>(null);
  const [confirmedText, setConfirmedText] = useState('');
  const [interpretation, setInterpretation] = useState('');
  const [interpreting, setInterpreting] = useState(false);
  const [interpretError, setInterpretError] = useState('');
  const [cloudEnhancement, setCloudEnhancement] = useState<HeritageCloudEnhancement | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudError, setCloudError] = useState('');
  const [runId, setRunId] = useState<string | null>(null);

  const refreshRuntime = async () => {
    const status = await getEdgeRuntimeStatus();
    const ready = status.backend === 'mnn' && !!status.runtime?.visionReady;
    const mnnEnabled = status.runtime?.mnnEnabled !== false;
    const version = status.runtime?.version || '';
    const visionSafe = version.includes('pocket-jni-v17-qwen3vl2b-official-image-path');
    const appVersion = status.runtime?.device?.appVersionName || '未知';
    const guji = !!status.runtime?.adapters?.['guji-vision']?.installed;
    const rubbing = !!status.runtime?.adapters?.['rubbing-vision']?.installed;
    setRuntime({ checking: false, ready, mnnEnabled, visionSafe, guji, rubbing, restorer: !!status.runtime?.restorer?.installed, message: !mnnEnabled ? 'MNN OFF · Qwen-VL 云端对照可用' : ready ? (visionSafe ? 'Qwen3-VL-2B + MNN 端侧就绪' : `旧原生引擎 · APK ${appVersion}，请覆盖安装 2B 古籍版`) : 'Qwen3-VL-2B 端侧资产尚未就绪', version });
  };
  useEffect(() => { refreshRuntime().catch(() => setRuntime({ checking: false, ready: false, mnnEnabled: true, visionSafe: false, guji: false, rubbing: false, restorer: false, message: '端侧运行时不可达', version: '' })); }, []);

  const equip = async () => {
    setInstalling(true); setError('');
    try {
      // Installing a model must not silently overwrite the user's SME2 choice.
      // A fresh install defaults to ON; an explicit OFF selection stays OFF so
      // the same heritage workload can be used as a controlled comparison.
      const requestedSme2 = (await getEdgeRuntimeStatus()).runtime?.sme2Requested ?? true;
      if (mode === 'guji' || mode === 'rubbing') {
        await installEdgeAsset(QWEN2B_BASE_ASSET, QWEN2B_BASE_RELEASE);
        await configureEdgeRuntime(true, requestedSme2);
      }
      else {
        await installEdgeAsset(QWEN2B_BASE_ASSET, QWEN2B_BASE_RELEASE);
        await prepareAndEquipSkill(SKILL_KEYS[mode]);
        await configureEdgeRuntime(true, requestedSme2);
      }
      await refreshRuntime();
    }
    catch (reason) { setError(String(reason)); }
    finally { setInstalling(false); }
  };

  const removeModeAsset = async () => {
    if (installing || busy) return;
    const asset = mode === 'guji' ? 'guji-vision-lora' : mode === 'rubbing' ? 'rubbing-vision-lora' : 'heritage-restorer';
    setInstalling(true); setError('');
    try {
      await removeEdgeAssetForSkills(asset); setOcr(null); await refreshRuntime();
    } catch (reason) { setError(String(reason)); }
    finally { setInstalling(false); }
  };

  const loadSample = async (gujiSample = SAMPLE_GUJI) => {
    setError(''); setOcr(null); setInterpretation(''); setInterpretError(''); setCloudEnhancement(null); setCloudError('');
    try {
      if (mode === 'guji') { setRubbingReference(''); setImage(await fetchDataUrl(gujiSample)); }
      else { setRubbingReference(SAMPLE_RUBBING_REFERENCE); setImage(await fetchDataUrl(SAMPLE_RUBBING)); }
    } catch (reason) { setError(String(reason)); }
  };
  const chooseFile = async (file?: File) => {
    if (!file) return; setRubbingReference(''); setImage(await fileDataUrl(file)); setOcr(null); setConfirmedText(''); setInterpretation(''); setInterpretError(''); setCloudEnhancement(null); setCloudError(''); setError('');
  };

  const runOcr = async () => {
    if (!image || busy) return; setBusy(true); setError(''); setOcr(null); setConfirmedText(''); setInterpretation(''); setInterpretError(''); setCloudEnhancement(null); setCloudError('');
    const material = mode as HeritageMaterial;
    const guji = material === 'guji';
    const cloudControl = !runtime.mnnEnabled;
    const run = startAgentRun(cloudControl ? `${guji ? '古籍' : '碑拓'} MNN OFF 对照` : `${guji ? '古籍' : '碑拓'} PP-OCRv5 + Qwen-VL-2B + 古籍 LoRA`, { skillId: guji ? 'pocket.guji-reading' : 'pocket.rubbing', skillVersion: guji ? '1.0.0' : '1.1.0', baseRevision: cloudControl ? 'qwen-vl-cloud-control' : 'pocketearth-qwen3-vl-2b-dual-base-20260811', executionPath: cloudControl ? 'qwen-cloud' : 'local-mnn', inputSummary: `用户主动选择的 1 张${guji ? '古籍书页' : '碑拓图'}`, tools: ['vision'], userConfirmation: 'required' }); setRunId(run.runId);
    try {
      if (cloudControl) {
        run.phase('MNN OFF 对照', '原生 MNN / LoRA 均不运行'); run.phase('Qwen-VL Base 转录', '云端诊断对照 · 原图需上传');
      } else {
        run.phase('端侧 OCR 忠实主稿', '仅运行 APK 内置 PP-OCRv5；失败即明确停止，不切换较弱 OCR');
      }
      const result = cloudControl
        ? await runHeritageCloudDiagnostic(image, material)
        : await runHeritageOcr(image, material, (_stage, detail) => {
          run.phase('官方 Qwen3-VL-2B Base + 古籍 LoRA', `${detail} · OCR 候选硬约束`);
        });
      setOcr(result); setConfirmedText(result.lora.valid ? result.lora.text : result.selected);
      run.phase('输出 Quality Gate', result.reason, { qualityGate: result.gate, fallbackReason: result.gate === 'passed' ? undefined : result.reason, userConfirmation: result.gate === 'passed' ? 'required' : 'required' });
      run.end(result.gate !== 'failed');
    } catch (reason) { setError(String(reason)); run.phase('失败闭合', String(reason), { qualityGate: 'failed', fallbackReason: String(reason) }); run.end(false); }
    finally { setBusy(false); }
  };
  const runInterpretation = async () => {
    if (!confirmedText.trim() || interpreting) return;
    setInterpreting(true); setInterpretError(''); setInterpretation('');
    const guji = mode === 'guji';
    const run = startAgentRun(`${guji ? '古籍' : '碑拓'}确认稿断句与释义`, { skillId: guji ? 'pocket.guji-reading' : 'pocket.rubbing', skillVersion: guji ? '1.0.0' : '1.1.0', baseRevision: 'pocketearth-qwen3-vl-2b-dual-base-20260811', executionPath: 'local-mnn', inputSummary: `用户确认的${guji ? '古籍' : '碑拓'}文字稿`, tools: [], userConfirmation: 'required' }); setRunId(run.runId);
    try {
      run.phase('Qwen3-VL-2B 断句', '只加标点，不改原字');
      run.phase('逐句白话释义', '疑字与 □ 明示待考');
      const result = await runHeritageInterpretation(confirmedText, mode as HeritageMaterial, rubbingReference); setInterpretation(result);
      run.phase('解释稿就绪', '解释稿不覆盖确认原文', { qualityGate: 'passed', userConfirmation: 'required' }); run.end(true);
    } catch (reason) { setInterpretError(String(reason)); run.end(false); }
    finally { setInterpreting(false); }
  };
  const runCloudEnhancement = async () => {
    if (!image || !confirmedText.trim() || cloudBusy) return;
    setCloudBusy(true); setCloudError(''); setCloudEnhancement(null);
    const guji = mode === 'guji';
    const run = startAgentRun(`${guji ? '古籍' : '碑拓'}云端旗舰精校`, { skillId: guji ? 'pocket.guji-reading' : 'pocket.rubbing', skillVersion: guji ? '1.0.0' : '1.1.0', baseRevision: 'qwen3.7-plus', executionPath: 'qwen-cloud', inputSummary: `用户主动授权上传的 1 张${guji ? '古籍书页' : '碑拓图'} + 端侧确认稿`, tools: ['vision'], userConfirmation: 'required' }); setRunId(run.runId);
    try {
      run.phase('上传原图 + 端侧确认稿', '仅本次联网精校 · 不覆盖本地稿');
      run.phase('Qwen3.7-Plus 视觉精校', '同图核字 · 断句 · 逐句释义 · 疑难依据');
      const result = await runHeritageCloudEnhancement(image, confirmedText, mode as HeritageMaterial, rubbingReference);
      setCloudEnhancement(result);
      run.phase('云端增强稿就绪', `${result.model} · 与端侧稿并列保留`, { qualityGate: 'passed', userConfirmation: 'required' }); run.end(true);
    } catch (reason) {
      setCloudError(String(reason)); run.phase('云端增强失败', String(reason), { qualityGate: 'failed', fallbackReason: String(reason) }); run.end(false);
    } finally { setCloudBusy(false); }
  };
  const cloudControl = !runtime.checking && !runtime.mnnEnabled && mode !== 'restore';
  const readyForMode = cloudControl || (runtime.ready && (mode === 'guji' || mode === 'rubbing' ? runtime.visionSafe : runtime.restorer));
  const cloudAccent = mode === 'rubbing' ? '#a64b2a' : '#1677a6';
  const cloudBackground = mode === 'rubbing' ? '#fff1e8' : '#eef9ff';
  const cloudMaterialName = mode === 'rubbing' ? '碑拓' : '古籍';
  const localAdapterName = '古籍 LoRA';
  const mergedOcrText = ocr ? (ocr.lora.valid ? ocr.lora.text : ocr.base.text) : '';
  return <div className="flex h-full flex-col overflow-hidden bg-[#eaeaea] font-sans">
    <header className="flex shrink-0 items-center gap-2 border-b-2 border-black bg-white px-3 py-2.5">
      <button type="button" onClick={onBack} aria-label={backLabel} className="grid h-9 w-9 place-items-center border-2 border-black bg-white"><ChevronLeft className="h-5 w-5" strokeWidth={3} /></button>
      <div className="min-w-0 flex-1"><h1 className="font-pixel text-[11px] tracking-wider">HERITAGE-SKILL</h1><p className="text-[9px] text-black/45">古籍识读 · 碑拓识读 · 证据门数字化补全</p></div><ScanText className="h-5 w-5" style={{ color: ACCENT }} />
    </header>
    <div className="shrink-0 border-b-2 border-black bg-black px-3 py-2 font-pixel text-[7px] text-[#7CFF6B]">QWEN3-VL-2B BASE · MNN ON-DEVICE · LORA ON</div>
    <main className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
      <section className="border-2 border-black bg-white p-2.5">
        <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" style={{ color: readyForMode ? '#238c57' : '#b3261e' }} /><b className="text-[11px]">{runtime.checking ? '检查端侧模型…' : runtime.message}</b><span className="ml-auto text-[8px] text-black/45">{mode === 'restore' ? runtime.restorer ? '修复器已装' : '修复器未装' : readyForMode ? `2B + ${localAdapterName}` : '待装备'}</span></div>
        {runtime.version && <p className="mt-1 break-all font-mono text-[7px] text-black/40">{runtime.version}</p>}
        {!runtime.checking && !readyForMode && runtime.mnnEnabled && <button type="button" onClick={equip} disabled={installing} className="mt-2 w-full border-2 border-black py-1.5 text-[9px] font-bold text-black" style={{ background: ACCENT }}>{installing ? '下载并逐文件校验中…' : mode === 'restore' ? '安装并装备数字化补全资产' : '安装 Qwen3-VL-2B 基座'}</button>}
        {readyForMode && !runtime.checking && runtime.mnnEnabled && mode === 'restore' && <button type="button" onClick={() => void removeModeAsset()} disabled={installing || busy} className="mt-2 flex w-full items-center justify-center gap-1 border-2 border-black bg-white py-1.5 text-[9px] font-bold text-[#b3261e] disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" />卸载专项修复器</button>}
        {cloudControl && <p className="mt-2 border-2 border-black bg-[#fff1c7] p-2 text-[8px] leading-relaxed"><b>MNN OFF 对照：</b>点击下方按钮会上传当前图片给云端 Qwen-VL Base。本地 LoRA 不运行，结果不会冒充 MNN 证据。</p>}
      </section>

      <div className="grid grid-cols-3 gap-1.5">
        <button type="button" onClick={() => { setMode('guji'); setRubbingReference(''); setImage(''); setCloudEnhancement(null); setCloudError(''); setError(''); }} className={`border-2 border-black py-2 text-[9px] font-bold ${mode === 'guji' ? 'bg-black text-[#7CFF6B]' : 'bg-white'}`}>古籍识读</button>
        <button type="button" onClick={() => { setMode('rubbing'); setRubbingReference(''); setImage(''); setCloudEnhancement(null); setCloudError(''); setError(''); }} className={`border-2 border-black py-2 text-[9px] font-bold ${mode === 'rubbing' ? 'bg-black text-[#7CFF6B]' : 'bg-white'}`}>碑拓识读</button>
        <button type="button" onClick={() => { setMode('restore'); setImage(''); setOcr(null); setCloudEnhancement(null); setCloudError(''); setError(''); }} className={`border-2 border-black py-2 text-[9px] font-bold ${mode === 'restore' ? 'bg-black text-[#7CFF6B]' : 'bg-white'}`}>数字化补全</button>
      </div>

      {mode !== 'restore' && <div className="grid grid-cols-3 border-2 border-black bg-white text-center text-[8px]">
        <div className="border-r-2 border-black p-2"><b className="font-pixel text-[7px] text-[#238c57]">01 OCR</b><p className="mt-1">PP-OCRv5 抄字</p></div>
        <div className="border-r-2 border-black p-2"><b className="font-pixel text-[7px] text-[#238c57]">02 REVIEW</b><p className="mt-1">2B + LoRA 校对</p></div>
        <div className="p-2"><b className="font-pixel text-[7px] text-[#238c57]">03 READ</b><p className="mt-1">断句 + 释义</p></div>
      </div>}

      {mode === 'restore' && <DigitalConservationPanel ready={readyForMode} />}
      {mode === 'restore' && error && <div className="border-2 border-[#b3261e] bg-[#fff0ed] p-2 text-[9px] leading-relaxed text-[#b3261e]">{error}</div>}

      {mode !== 'restore' && <section className="border-2 border-black bg-white p-2.5">
        <div className="flex gap-1.5"><label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 border-2 border-black bg-[#f5f1e5] py-2 text-[9px] font-bold"><FileImage className="h-4 w-4" />选择本地图像<input type="file" accept="image/*" className="hidden" onChange={(event) => chooseFile(event.target.files?.[0])} /></label>{mode === 'guji' ? <><button type="button" onClick={() => void loadSample(SAMPLE_GUJI)} className="border-2 border-black px-2 text-[8px] font-bold">雷峰塔</button><button type="button" onClick={() => void loadSample(SAMPLE_GUJI_JINGCI)} className="border-2 border-black px-2 text-[8px] font-bold">净慈寺</button></> : <button type="button" onClick={() => void loadSample()} className="border-2 border-black px-2 text-[8px] font-bold">趙府君碑拓</button>}</div>
        {mode === 'guji' && <p className="mt-2 border-l-2 border-black/30 pl-2 text-[8px] leading-relaxed text-black/50">两张样例均来自公共领域《西湖梦寻（三）》扫描页（Wikimedia Commons Public Domain Mark）；这里只提供可追溯原扫描，不把人工核验稿冒充本次现场推理。</p>}
        {mode === 'rubbing' && <p className="mt-2 border-l-2 border-black/30 pl-2 text-[8px] leading-relaxed text-black/50">验证样例来自故宫开放资料《晉故振威將軍鬱林太守趙府君墓道額墨拓本》（CC BY 4.0）；自动校正拍摄方向，并排除周围馆藏标签。内置案例释义会引用馆藏题名，与现场 OCR 分开标注。</p>}
        {image && <div className="mt-2 overflow-hidden border-2 border-black bg-[#171717]"><div className="relative mx-auto max-h-[340px] w-fit overflow-hidden"><img src={image} alt="原始资料" className="block max-h-[340px] max-w-full object-contain" /></div></div>}
        <button type="button" disabled={!image || !readyForMode || busy} onClick={runOcr} className="mt-2 flex w-full items-center justify-center gap-2 border-2 border-black bg-black py-2 text-[10px] font-bold text-[#7CFF6B] disabled:opacity-35">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{cloudControl ? 'MNN OFF：运行云端 Qwen-VL 对照' : `运行 PP-OCRv5 + Qwen-VL-2B + ${localAdapterName}`}</button>
        <p className="mt-1.5 text-center text-[8px] text-black/45">{cloudControl ? '诊断对照：不运行 MNN，图片会上传 Qwen 云端。' : `专业 OCR 忠实抄字；Qwen-VL-2B + ${localAdapterName} 复核低置信区域。`}</p>
      </section>}

      {mode !== 'restore' && <RunTrace runId={runId} collapseWhenDone flat />}
      {mode !== 'restore' && error && <div className="border-2 border-[#b3261e] bg-[#fff0ed] p-2 text-[9px] leading-relaxed text-[#b3261e]">{error}</div>}

      {mode !== 'restore' && ocr && <section className="border-2 border-black bg-white">
        <div className="flex items-center gap-2 border-b-2 border-black px-2.5 py-2"><b className="text-[11px]">端侧识读结果</b><span className={`ml-auto border border-black px-1.5 py-0.5 text-[8px] ${ocr.gate === 'passed' ? 'bg-[#dff4e7] text-[#238c57]' : ocr.gate === 'manual-review' ? 'bg-[#fff1c7]' : 'bg-[#fff0ed] text-[#b3261e]'}`}>{ocr.gate === 'passed' ? '通过' : ocr.gate === 'manual-review' ? '待校订' : '未通过'}</span></div>
        <p className="border-b border-black/20 bg-[#f5f1e5] px-2.5 py-2 text-[9px] leading-relaxed">{ocr.reason}</p>
        <div className="border-b-2 border-black bg-white p-2.5"><span className="font-pixel text-[7px]">PP-OCR + QWEN-VL-2B + {localAdapterName.toUpperCase()}</span><p className={`mt-1 whitespace-pre-wrap text-[10px] leading-relaxed ${mergedOcrText ? '' : 'text-[#b3261e]'}`}>{mergedOcrText || '识读稿未通过门禁'}</p></div>
        <div className="p-2.5"><label className="text-[9px] font-bold">人工确认稿（可校订）</label><textarea value={confirmedText} onChange={(event) => { setConfirmedText(event.target.value); setInterpretation(''); setInterpretError(''); setCloudEnhancement(null); setCloudError(''); }} rows={5} className="mt-1 w-full resize-y border-2 border-black p-2 text-[11px] leading-relaxed outline-none" /><p className="mt-1 flex items-center gap-1 text-[8px] text-black/45"><Check className="h-3 w-3" />只有这里确认的文字才能进入后续资料；原图和合并识读稿始终保留。</p></div>
      </section>}

      {mode !== 'restore' && ocr && <section className="border-2 border-black bg-white p-2.5">
        <div className="flex items-center gap-2"><Sparkles className="h-4 w-4" style={{ color: ACCENT }} /><div><b className="text-[11px]">Qwen 断句与释义</b><p className="text-[8px] text-black/45">读取上方确认稿 · 不修改 OCR 原文</p></div></div>
        <button type="button" onClick={() => void runInterpretation()} disabled={!confirmedText.trim() || interpreting} className="mt-2 flex w-full items-center justify-center gap-2 border-2 border-black bg-black py-2 text-[9px] font-bold text-[#7CFF6B] disabled:opacity-35">{interpreting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{interpreting ? '端侧生成中…' : '用确认稿生成断句 + 白话释义'}</button>
        {interpretError && <p className="mt-2 border border-[#b3261e] bg-[#fff0ed] p-2 text-[8px] text-[#b3261e]">{interpretError}</p>}
        {interpretation && <div className="mt-2 border-2 border-black bg-[#f5f1e5] p-2.5"><p className="whitespace-pre-wrap text-[10px] leading-relaxed">{interpretation}</p><p className="mt-2 border-t border-black/20 pt-2 text-[8px] text-black/45">整理稿由 Qwen3-VL-2B 与证据门禁在端侧生成；原始确认稿保持不变。</p></div>}
      </section>}

      {mode !== 'restore' && ocr && <section className="border-2 border-black p-2.5" style={{ background: cloudBackground }}>
        <div className="flex items-center gap-2"><Cloud className="h-4 w-4" style={{ color: cloudAccent }} /><div><b className="text-[11px]">可选：云端{cloudMaterialName}旗舰精校</b><p className="text-[8px] text-black/50">需要更准确、更全面时再用 · 端侧结果仍保留</p></div><span className="ml-auto border border-black bg-white px-1.5 py-0.5 font-pixel text-[7px]">QWEN3.7-PLUS</span></div>
        <p className="mt-2 border-l-2 pl-2 text-[8px] leading-relaxed text-black/60" style={{ borderColor: cloudAccent }}>点击后会把当前原图和上方确认稿发送到阿里云百炼，用同一张图重新核字、断句并给出逐句释义；结果与端侧稿并列，不自动覆盖。</p>
        <button type="button" onClick={() => void runCloudEnhancement()} disabled={!image || !confirmedText.trim() || cloudBusy || busy || interpreting} className="mt-2 flex w-full items-center justify-center gap-2 border-2 border-black py-2 text-[9px] font-bold text-white disabled:opacity-35" style={{ background: cloudAccent }}>{cloudBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}{cloudBusy ? `${cloudMaterialName}云端精校中，请稍候…` : `上传原图 + 确认稿，使用旗舰 Qwen 精校${cloudMaterialName}`}</button>
        {cloudError && <p className="mt-2 border border-[#b3261e] bg-[#fff0ed] p-2 text-[8px] text-[#b3261e]">{cloudError}</p>}
        {cloudEnhancement && <div className="mt-2 border-2 border-black bg-white p-2.5"><div className="mb-2 flex items-center"><b className="font-pixel text-[7px]">CLOUD ENHANCEMENT</b><span className="ml-auto text-[8px] text-black/45">{cloudEnhancement.model}</span></div><p className="whitespace-pre-wrap text-[10px] leading-relaxed">{cloudEnhancement.text}</p><p className="mt-2 border-t border-black/20 pt-2 text-[8px] text-black/45">云端增强稿仅供核对；端侧确认稿、端侧断句与原图均未被覆盖。</p></div>}
      </section>}

      <p className="pb-3 text-center text-[8px] leading-relaxed text-black/35">默认端侧处理；仅主动点击云端按钮时上传当前原图与文字证据</p>
    </main>
  </div>;
}
