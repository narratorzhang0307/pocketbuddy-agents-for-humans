import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, Cloud, Download, Eraser, FileImage, LoaderCircle, ScanText, ShieldCheck, Sparkles } from 'lucide-react';
import { startAgentRun } from '../lib/observe/bus';
import {
  runHeritageCompletionCloud,
  runHeritageCompletionLocal,
  runHeritageOcr,
  runHeritageRestoration,
  type HeritageCompletionCandidate,
  type HeritageMaterial,
} from '../lib/heritage/rubbing';
import RunTrace from './RunTrace';

const ACCENT = '#7A52C7';
type RestorationSample = {
  name: string;
  material: HeritageMaterial;
  image: string;
  maskImage: string;
  referenceImage: string;
  knownSentence: string;
  note: string;
};

const SAMPLES: Record<'guji' | 'rubbing', RestorationSample> = {
  guji: {
    name: '上街去盲测 A · 古籍墨污',
    material: 'guji',
    image: '/assets/heritage-demo/restoration-blind-a/damaged.png',
    maskImage: '/assets/heritage-demo/restoration-blind-a/mask.png',
    referenceImage: '/assets/heritage-demo/restoration-blind-a/reference.png',
    knownSentence: '',
    note: '“上街去”冻结盲测样本：当前展示的是黑色墨污输入，损坏区已由同组蒙版精确圈定；该样本损伤区 MAE 从 115.26 降至 30.20。干净真值只在修复后核验，不参与推理。',
  },
  rubbing: {
    name: '上街去盲测 B · 古籍污损',
    material: 'guji',
    image: '/assets/heritage-demo/restoration-blind-b/damaged.png',
    maskImage: '/assets/heritage-demo/restoration-blind-b/mask.png',
    referenceImage: '/assets/heritage-demo/restoration-blind-b/reference.png',
    knownSentence: '',
    note: '“上街去”冻结盲测样本：当前展示的是另一种真实训练协议中的局部污损输入；干净真值只用于最终对照，系统仍须先给候选、再由用户确认。',
  },
};

const fileDataUrl = (file: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const fetchDataUrl = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`样例读取失败：${response.status}`);
  return fileDataUrl(await response.blob());
};

function downloadDataUrl(name: string, url: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
}

export default function DigitalConservationPanel({
  ready,
}: {
  ready: boolean;
}) {
  const [image, setImage] = useState('');
  const [material, setMaterial] = useState<HeritageMaterial>('guji');
  const [sampleNote, setSampleNote] = useState('');
  const [referenceImage, setReferenceImage] = useState('');
  const [sampleName, setSampleName] = useState('');
  const [knownSentence, setKnownSentence] = useState('');
  const [visibleText, setVisibleText] = useState('');
  const [localCandidate, setLocalCandidate] = useState<HeritageCompletionCandidate | null>(null);
  const [cloudCandidate, setCloudCandidate] = useState<HeritageCompletionCandidate | null>(null);
  const [confirmedCandidate, setConfirmedCandidate] = useState('');
  const [candidateApproved, setCandidateApproved] = useState(false);
  const [restored, setRestored] = useState('');
  const [restoreStats, setRestoreStats] = useState('');
  const [hasMask, setHasMask] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [error, setError] = useState('');
  const [cloudError, setCloudError] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const presetMaskImage = useRef('');

  const resetAnalysis = () => {
    setVisibleText('');
    setLocalCandidate(null);
    setCloudCandidate(null);
    setConfirmedCandidate('');
    setCandidateApproved(false);
    setRestored('');
    setRestoreStats('');
    setError('');
    setCloudError('');
  };

  const initializeMask = (width: number, height: number) => {
    const canvas = maskRef.current;
    if (!canvas) return;
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setHasMask(false);
    if (!presetMaskImage.current) return;
    const mask = new Image();
    mask.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(mask, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height);
      for (let offset = 0; offset < pixels.data.length; offset += 4) {
        const selected = pixels.data[offset] >= 128;
        pixels.data[offset] = selected ? 255 : 0;
        pixels.data[offset + 1] = selected ? 255 : 0;
        pixels.data[offset + 2] = selected ? 255 : 0;
        pixels.data[offset + 3] = selected ? 255 : 0;
      }
      context.putImageData(pixels, 0, 0);
      setHasMask(true);
    };
    mask.src = presetMaskImage.current;
  };

  const loadSample = async (key: keyof typeof SAMPLES) => {
    const sample = SAMPLES[key];
    resetAnalysis();
    setMaterial(sample.material);
    setKnownSentence(sample.knownSentence);
    setSampleNote(sample.note);
    setSampleName(sample.name);
    setReferenceImage(await fetchDataUrl(sample.referenceImage));
    presetMaskImage.current = sample.maskImage;
    setImage(await fetchDataUrl(sample.image));
  };

  const chooseFile = async (file?: File) => {
    if (!file) return;
    resetAnalysis();
    presetMaskImage.current = '';
    setReferenceImage('');
    setSampleName('');
    setSampleNote('用户本地图像 · 原图只在端侧保留；仅主动点击云端分析时上传。');
    setKnownSentence('');
    setImage(await fileDataUrl(file));
  };

  const maskPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = maskRef.current;
    if (!canvas) return null;
    const box = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - box.left) * canvas.width / box.width,
      y: (event.clientY - box.top) * canvas.height / box.height,
    };
  };

  const beginMask = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = maskRef.current;
    const point = maskPoint(event);
    if (!canvas || !point) return;
    drawing.current = true;
    canvas.setPointerCapture(event.pointerId);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.strokeStyle = 'white';
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = Math.max(12, Math.max(canvas.width, canvas.height) * 0.035);
    setHasMask(true);
    setRestored('');
  };

  const paintMask = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const point = maskPoint(event);
    const context = maskRef.current?.getContext('2d');
    if (!point || !context) return;
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const endMask = () => {
    drawing.current = false;
    maskRef.current?.getContext('2d')?.closePath();
  };

  const clearMask = () => {
    const canvas = maskRef.current;
    if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    presetMaskImage.current = '';
    setHasMask(false);
    setRestored('');
  };

  const runLocalAnalysis = async () => {
    if (!image || busy) return;
    setBusy(true);
    setError('');
    setVisibleText('');
    setLocalCandidate(null);
    setCloudCandidate(null);
    setConfirmedCandidate('');
    setCandidateApproved(false);
    setRestored('');
    const run = startAgentRun('数字化补全 · 端侧候选', {
      skillId: 'pocket.digital-conservation',
      skillVersion: '1.1.0',
      baseRevision: 'pocketearth-qwen3-vl-2b-dual-base-20260811',
      executionPath: 'local-mnn',
      inputSummary: `1 张${material === 'guji' ? '古籍' : '碑拓'}原图 + 用户圈选范围`,
      tools: ['vision'],
      userConfirmation: 'required',
    });
    setRunId(run.runId);
    try {
      run.phase('PP-OCRv6 Small 读取周围文字', '只抄写仍可见文字，不补缺字');
      const ocr = await runHeritageOcr(image, material, undefined, 'document');
      const visible = ocr.selected || ocr.base.text || ocr.lora.text;
      if (!visible.trim()) throw new Error('OCR 未读取到可用的周围文字，请换一张更清晰的图片或手工录入');
      setVisibleText(visible);
      run.phase('Qwen3-VL-2B 提供候选', knownSentence.trim() ? '完整原句作为参考证据' : '无完整原句 · 只允许推测候选');
      const candidate = await runHeritageCompletionLocal(visible, material, knownSentence);
      setLocalCandidate(candidate);
      setConfirmedCandidate(candidate.text);
      run.phase('等待人工确认', '候选不会自动进入像素修复', { qualityGate: 'manual-review', userConfirmation: 'required' });
      run.end(true);
    } catch (reason) {
      setError(String(reason));
      run.end(false);
    } finally {
      setBusy(false);
    }
  };

  const runCloudAnalysis = async () => {
    if (!image || !visibleText.trim() || cloudBusy) return;
    setCloudBusy(true);
    setCloudError('');
    const run = startAgentRun('数字化补全 · 云端候选', {
      skillId: 'pocket.digital-conservation',
      skillVersion: '1.1.0',
      baseRevision: 'qwen3.7-plus',
      executionPath: 'qwen-cloud',
      inputSummary: `用户主动授权上传的 1 张原图 + OCR 可见文字${knownSentence.trim() ? ' + 完整原句' : ''}`,
      tools: ['vision'],
      userConfirmation: 'required',
    });
    setRunId(run.runId);
    try {
      run.phase('上传原图与可见文字', '仅本次候选分析');
      run.phase('Qwen3.7-Plus 视觉复核', '输出候选、依据与置信声明');
      const candidate = await runHeritageCompletionCloud(image, visibleText, material, knownSentence);
      setCloudCandidate(candidate);
      run.phase('等待人工确认', '云端候选不覆盖端侧候选', { qualityGate: 'manual-review', userConfirmation: 'required' });
      run.end(true);
    } catch (reason) {
      setCloudError(String(reason));
      run.end(false);
    } finally {
      setCloudBusy(false);
    }
  };

  const approveCandidate = () => {
    if (!confirmedCandidate.trim()) return;
    setCandidateApproved(true);
    setRestored('');
  };

  const runRestore = async () => {
    const canvas = maskRef.current;
    if (!image || !canvas || !hasMask || !candidateApproved || busy) return;
    setBusy(true);
    setError('');
    setRestored('');
    const run = startAgentRun('数字化补全 · 像素修复', {
      skillId: 'pocket.digital-conservation',
      skillVersion: '1.1.0',
      adapterVersion: 'heritage-restorer@c571f660',
      executionPath: 'local-mnn',
      inputSummary: '原图 + 用户圈选范围 + 已人工确认的文字候选',
      tools: ['restore'],
      userConfirmation: 'confirmed',
    });
    setRunId(run.runId);
    try {
      run.phase('锁定圈选范围', '原图不覆盖 · 选区外像素不可改变');
      run.phase('MNN 专项修复器', '只根据周围纹理与笔画生成像素建议');
      const result = await runHeritageRestoration(image, canvas.toDataURL('image/png'));
      setRestored(result.image || '');
      const changed = result.stats?.changedPixels;
      const elapsed = result.stats?.inferenceMs ?? result.stats?.elapsedMs;
      setRestoreStats(`${changed === undefined ? '' : `选区内改动 ${changed} 像素 · `}选区外像素保持不变${elapsed === undefined ? '' : ` · MNN ${Math.round(elapsed)} ms`}`);
      run.phase('修复建议就绪', '原图、文字候选与修复建议并列保留', { qualityGate: 'passed', finalWrites: ['本地修复建议副本'] });
      run.end(true);
    } catch (reason) {
      setError(String(reason));
      run.end(false);
    } finally {
      setBusy(false);
    }
  };

  const selectCandidate = (candidate: HeritageCompletionCandidate) => {
    setConfirmedCandidate(candidate.text);
    setCandidateApproved(false);
    setRestored('');
  };

  return <>
    <div className="grid grid-cols-4 border-2 border-black bg-white text-center text-[7px]">
      {[
        ['01 OCR', '读取可见字'],
        ['02 CANDIDATE', '2B / 云端候选'],
        ['03 CONFIRM', '人工确认'],
        ['04 REPAIR', 'MNN 像素建议'],
      ].map(([title, body], index) => <div key={title} className={`${index < 3 ? 'border-r-2 border-black' : ''} p-1.5`}><b className="font-pixel text-[6px]" style={{ color: ACCENT }}>{title}</b><p className="mt-1">{body}</p></div>)}
    </div>

    <section className="border-2 border-black bg-white p-2.5">
      <div className="flex gap-1.5">
        <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 border-2 border-black bg-[#f5f1e5] py-2 text-[9px] font-bold"><FileImage className="h-4 w-4" />选择本地图像<input type="file" accept="image/*" className="hidden" onChange={(event) => void chooseFile(event.target.files?.[0])} /></label>
        <button type="button" onClick={() => void loadSample('guji')} className="border-2 border-black px-2 text-[8px] font-bold">残损例 A</button>
        <button type="button" onClick={() => void loadSample('rubbing')} className="border-2 border-black px-2 text-[8px] font-bold">残损例 B</button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button type="button" onClick={() => { setMaterial('guji'); resetAnalysis(); }} className={`border-2 border-black py-1.5 text-[8px] font-bold ${material === 'guji' ? 'bg-black text-white' : ''}`}>古籍书页</button>
        <button type="button" onClick={() => { setMaterial('rubbing'); resetAnalysis(); }} className={`border-2 border-black py-1.5 text-[8px] font-bold ${material === 'rubbing' ? 'bg-black text-white' : ''}`}>碑刻拓片</button>
      </div>
      {sampleNote && <p className="mt-2 border-l-2 pl-2 text-[8px] leading-relaxed text-black/55" style={{ borderColor: ACCENT }}><b className="text-black">{sampleName}</b><br />{sampleNote}</p>}

      {image && <div className="mt-2 overflow-hidden border-2 border-black bg-[#171717]">
        <div className="relative mx-auto max-h-[360px] w-fit touch-none overflow-hidden">
          <img src={image} alt="待修复的损坏输入" className="block max-h-[360px] max-w-full object-contain" onLoad={(event) => initializeMask(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} />
          <canvas ref={maskRef} aria-label="真实残损区域高亮层" className="absolute inset-0 h-full w-full cursor-crosshair opacity-60 mix-blend-difference" onPointerDown={beginMask} onPointerMove={paintMask} onPointerUp={endMask} onPointerCancel={endMask} />
        </div>
      </div>}
      {image && <div className="mt-2 flex items-center gap-2 text-[8px]"><span className="flex-1 text-black/55">高亮层是损坏输入的精确蒙版；输入图已经存在脱墨/污损，不会在现场再破坏一次。可用手指补画。</span><button type="button" onClick={clearMask} className="flex items-center gap-1 border border-black px-2 py-1"><Eraser className="h-3 w-3" />清除选区</button></div>}

      <label className="mt-3 block text-[9px] font-bold">完整原句（可选）</label>
      <textarea value={knownSentence} onChange={(event) => { setKnownSentence(event.target.value); resetAnalysis(); }} rows={2} placeholder="知道完整原句就填；不知道请留空，系统会明确标注为推测候选。" className="mt-1 w-full resize-y border-2 border-black p-2 text-[10px] leading-relaxed outline-none" />
      <button type="button" disabled={!image || !hasMask || !ready || busy} onClick={() => void runLocalAnalysis()} className="mt-2 flex w-full items-center justify-center gap-2 border-2 border-black bg-black py-2 text-[9px] font-bold text-[#7CFF6B] disabled:opacity-35">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}{busy ? '端侧读取与分析中…' : '1. PP-OCRv6 可见字 + 端侧 2B 候选'}</button>
    </section>

    <RunTrace runId={runId} collapseWhenDone flat />
    {error && <div className="border-2 border-[#b3261e] bg-[#fff0ed] p-2 text-[9px] leading-relaxed text-[#b3261e]">{error}</div>}

    {visibleText && <section className="border-2 border-black bg-white">
      <div className="border-b-2 border-black px-2.5 py-2"><b className="text-[10px]">OCR 周围尚可见文字</b><span className="ml-2 text-[8px] text-black/45">可人工修订</span></div>
      <textarea value={visibleText} onChange={(event) => { setVisibleText(event.target.value); setCandidateApproved(false); setRestored(''); }} rows={5} className="m-2.5 w-[calc(100%-1.25rem)] resize-y border-2 border-black p-2 text-[10px] leading-relaxed outline-none" />
    </section>}

    {localCandidate && <section className="border-2 border-black bg-[#f3ecff] p-2.5">
      <div className="flex items-center gap-2"><Sparkles className="h-4 w-4" style={{ color: ACCENT }} /><b className="text-[10px]">端侧 2B 缺字候选与依据</b><span className="ml-auto font-pixel text-[6px]">MNN</span></div>
      <p className="mt-2 whitespace-pre-wrap border-2 border-black bg-white p-2 text-[9px] leading-relaxed">{localCandidate.text}</p>
      <button type="button" onClick={() => selectCandidate(localCandidate)} className="mt-2 w-full border-2 border-black bg-white py-1.5 text-[8px] font-bold">采用这份端侧候选</button>
    </section>}

    {visibleText && <section className="border-2 border-black bg-[#eef9ff] p-2.5">
      <div className="flex items-center gap-2"><Cloud className="h-4 w-4 text-[#1677a6]" /><div><b className="text-[10px]">可选：云端旗舰候选</b><p className="text-[7px] text-black/45">上传原图 + OCR 文字 · 不自动覆盖端侧候选</p></div><span className="ml-auto font-pixel text-[6px]">QWEN3.7-PLUS</span></div>
      <button type="button" disabled={cloudBusy} onClick={() => void runCloudAnalysis()} className="mt-2 flex w-full items-center justify-center gap-2 border-2 border-black bg-[#1677a6] py-2 text-[8px] font-bold text-white disabled:opacity-35">{cloudBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}{cloudBusy ? '云端分析中…' : '用云端 Qwen 复核候选与依据'}</button>
      {cloudError && <p className="mt-2 border border-[#b3261e] bg-[#fff0ed] p-2 text-[8px] text-[#b3261e]">{cloudError}</p>}
      {cloudCandidate && <><p className="mt-2 whitespace-pre-wrap border-2 border-black bg-white p-2 text-[9px] leading-relaxed">{cloudCandidate.text}</p><button type="button" onClick={() => selectCandidate(cloudCandidate)} className="mt-2 w-full border-2 border-black bg-white py-1.5 text-[8px] font-bold">采用这份云端候选</button></>}
    </section>}

    {confirmedCandidate && <section className="border-2 border-black bg-white p-2.5">
      <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" style={{ color: candidateApproved ? '#238c57' : ACCENT }} /><div><b className="text-[10px]">人工确认候选</b><p className="text-[7px] text-black/45">可编辑 · 不冒充真实原文 · 未确认不能修复像素</p></div></div>
      <textarea value={confirmedCandidate} onChange={(event) => { setConfirmedCandidate(event.target.value); setCandidateApproved(false); setRestored(''); }} rows={6} className="mt-2 w-full resize-y border-2 border-black p-2 text-[9px] leading-relaxed outline-none" />
      <button type="button" onClick={approveCandidate} disabled={!confirmedCandidate.trim()} className={`mt-2 flex w-full items-center justify-center gap-2 border-2 border-black py-2 text-[9px] font-bold ${candidateApproved ? 'bg-[#dff4e7] text-[#238c57]' : 'bg-[#fff1c7]'}`}><Check className="h-4 w-4" />{candidateApproved ? '已确认 · 可生成像素修复建议' : '2. 我已核对，确认这份候选'}</button>
      <p className="mt-2 text-[8px] leading-relaxed text-black/45">确认文字是证据门。当前 MNN 修复器只根据选区周围的纹理与笔画补洞，不会把推测文字强行写进原图。</p>
      <button type="button" onClick={() => void runRestore()} disabled={!candidateApproved || !hasMask || !ready || busy} className="mt-2 flex w-full items-center justify-center gap-2 border-2 border-black py-2 text-[9px] font-bold text-white disabled:opacity-35" style={{ background: ACCENT }}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{busy ? 'MNN 修复中…' : '3. 仅修复圈选像素，生成建议副本'}</button>
    </section>}

    {restored && <section className="border-2 border-black bg-white p-2.5">
      <div className="mb-2 flex items-center"><b className="text-[10px]">损坏输入 · 修复建议 · 独立真值（全部保留）</b><button type="button" onClick={() => downloadDataUrl('pocket-earth-digital-conservation-suggestion.png', restored)} className="ml-auto flex items-center gap-1 border border-black px-2 py-1 text-[7px]"><Download className="h-3 w-3" />下载副本</button></div>
      <div className="grid grid-cols-2 gap-2"><figure><img src={image} alt="损坏输入" className="aspect-square w-full border border-black object-contain" /><figcaption className="mt-1 text-center text-[7px]">损坏输入 · 永不覆盖</figcaption></figure><figure><img src={restored} alt="像素修复建议" className="aspect-square w-full border border-black object-contain" /><figcaption className="mt-1 text-center text-[7px]">MNN 像素建议</figcaption></figure></div>
      {referenceImage && <figure className="mt-2"><img src={referenceImage} alt="独立干净真值" className="mx-auto aspect-square w-1/2 border border-black object-contain" /><figcaption className="mt-1 text-center text-[7px]">独立干净真值 · 未发送给 OCR / Qwen / MNN</figcaption></figure>}
      <div className="mt-2 border-2 border-black bg-[#f3ecff] p-2"><b className="text-[8px]">人工确认的文字候选</b><p className="mt-1 whitespace-pre-wrap text-[8px] leading-relaxed">{confirmedCandidate}</p></div>
      <p className="mt-2 text-[8px] text-black/50">{restoreStats}</p>
    </section>}
  </>;
}
