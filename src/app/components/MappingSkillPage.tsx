import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, Cloud, Cpu, Download, FileText, LoaderCircle, MapPinned, Upload } from 'lucide-react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { runChineseOcr } from '../lib/ocr/chineseOcr';
import { buildMappingDataPack, type ForgeBookMeta, type ForgeGazetteerPlace, type ForgePageEvidence, type ForgePlaceCandidate, type MappingDataPackBundle } from '../lib/mapping/forge';
import { MAX_MAPPING_CLOUD_PDF_BYTES, runMappingCloudExtraction, runMappingEdgeExtraction } from '../lib/mapping/mappingAi';
import { installDataPackFromFile, setDataPackMapLayerEnabled } from '../lib/dataPack';
import { requestMapFocus } from '../data/mapFocus';
import { fetchVerifiedMappingDemoPdf, MAPPING_DEMO_PDF } from '../lib/mapping/demoAsset';
import { isPlausibleMappingGeocode } from '../lib/mapping/geocodeGuard';

GlobalWorkerOptions.workerSrc = pdfWorker;

const ACCENT = '#00ef86';
const MappingPdfPreview = lazy(() => import('./MappingPdfPreview'));
const GAZETTEER = '/assets/skills/guji/place-gazetteer.compact.json';

type Mode = 'edge' | 'cloud';
type Phase = 'idle' | 'render' | 'ocr' | 'extract' | 'geocode' | 'review' | 'json' | 'mapped';

const PHASE_LABEL: Record<Phase, string> = {
  idle: '等待 PDF', render: '渲染页面', ocr: 'PP-OCR 识字', extract: 'Qwen 提炼', geocode: '匹配坐标', review: '人工确认', json: 'JSON 已生成', mapped: '已标记到地图',
};

function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function digest(file: File): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function renderPdf(file: File, onPage: (page: number, total: number) => void): Promise<string[]> {
  const document = await getDocument({ data: await file.arrayBuffer() }).promise;
  const total = Math.min(document.numPages, 10);
  const images: string[] = [];
  for (let index = 1; index <= total; index += 1) {
    onPage(index, total);
    const page = await document.getPage(index);
    const initial = page.getViewport({ scale: 1.55 });
    const scale = Math.min(1, 1500 / Math.max(initial.width, initial.height));
    const viewport = page.getViewport({ scale: 1.55 * scale });
    const canvas = window.document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('无法创建 PDF 页面画布');
    await page.render({ canvasContext: context, viewport }).promise;
    images.push(canvas.toDataURL('image/jpeg', 0.9));
    canvas.width = 1;
    canvas.height = 1;
  }
  await document.destroy();
  return images;
}

let gazetteerPromise: Promise<ForgeGazetteerPlace[]> | null = null;
function loadGazetteer() {
  if (!gazetteerPromise) gazetteerPromise = fetch(GAZETTEER).then((response) => response.ok ? response.json() : { places: [] }).then((value) => Array.isArray(value.places) ? value.places : []).catch(() => []);
  return gazetteerPromise;
}

async function resolveCoordinates(candidates: ForgePlaceCandidate[], city: string): Promise<ForgePlaceCandidate[]> {
  const gazetteer = await loadGazetteer();
  const cityReferences = gazetteer.filter((place) => !city || place.city.includes(city) || city.includes(place.city));
  return Promise.all(candidates.map(async (candidate) => {
    if (Number.isFinite(candidate.lat) && Number.isFinite(candidate.lng)) return candidate;
    const local = gazetteer.find((place) => (!city || place.city.includes(city) || city.includes(place.city)) && place.names.includes(candidate.name));
    if (local && Number.isFinite(local.lat) && Number.isFinite(local.lng)) return {
      ...candidate,
      lat: local.lat,
      lng: local.lng,
      status: local.status === 'extant' ? 'extant' : local.status === 'rebuilt' ? 'rebuilt' : 'memory-only',
      geocodeName: local.sourceTitle ? `${candidate.name}｜${local.sourceTitle}` : candidate.name,
      resolutionSource: 'local-gazetteer' as const,
    };
    try {
      const response = await fetch(`/api/travel-mcp?tool=geocode&q=${encodeURIComponent(`${candidate.name} ${city}`)}`);
      const value = await response.json();
      const lat = Number(value?.lat);
      const lng = Number(value?.lng);
      const geocodeName = String(value?.name || candidate.name);
      return isPlausibleMappingGeocode(candidate.name, geocodeName, lat, lng, cityReferences)
        ? { ...candidate, lat, lng, geocodeName, resolutionSource: 'osm' as const }
        : candidate;
    } catch {
      return candidate;
    }
  }));
}

export default function MappingSkillPage({ onBack }: { onBack: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('edge');
  const [file, setFile] = useState<File | null>(null);
  const [sourceHash, setSourceHash] = useState('');
  const [meta, setMeta] = useState<ForgeBookMeta>({ city: '南京', title: '', author: '', era: '', purpose: '把文献中的地点落到地球', preferences: '地点与原文证据' });
  const [pages, setPages] = useState<ForgePageEvidence[]>([]);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<ForgePlaceCandidate[]>([]);
  const [bundle, setBundle] = useState<MappingDataPackBundle | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState('');
  const [error, setError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const confirmed = useMemo(() => candidates.filter((item) => item.confirmed && Number.isFinite(item.lat) && Number.isFinite(item.lng)), [candidates]);
  const located = useMemo(() => candidates.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng)), [candidates]);
  const hasFreshResults = candidates.length > 0 && (phase === 'review' || phase === 'json' || phase === 'mapped');

  const chooseFile = async (next: File) => {
    if (next.type !== 'application/pdf' && !next.name.toLowerCase().endsWith('.pdf')) { setError('请选择 PDF 文件。'); return; }
    setFile(next);
    setSourceHash(await digest(next));
    setMeta((current) => ({ ...current, title: current.title || next.name.replace(/\.pdf$/i, '') }));
    setPages([]);
    setPageImages([]);
    setCandidates([]);
    setBundle(null);
    setPhase('idle');
    setDetail('');
    setError('');
  };

  const loadExample = async () => {
    setBusy(true);
    setDetail('从 OSS 下载并校验 10 页测试 PDF');
    try {
      const pdfBytes = await fetchVerifiedMappingDemoPdf();
      const sample = new File([pdfBytes], MAPPING_DEMO_PDF.name, { type: 'application/pdf' });
      setFile(sample);
      setSourceHash(await digest(sample));
      setMeta({ city: '南京', title: '《金陵世纪》（部分）', author: '陈沂等', era: '明清', purpose: '从《金陵世纪》提炼南京地点', preferences: '山川、水系、寺观、城门与历史旧址' });
      setPages([]);
      setPageImages([]);
      setCandidates([]);
      setBundle(null);
      setPhase('idle');
      setDetail('测试 PDF 已载入；请选择端侧或云端链路并主动运行。');
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(false); }
  };

  const runPpOcr = async (): Promise<{ evidence: ForgePageEvidence[]; images: string[] }> => {
    if (!file) throw new Error('请先选择 PDF，或载入 10 页案例。');
    setPhase('render');
    const images = await renderPdf(file, (page, total) => setDetail(`正在渲染第 ${page}/${total} 页`));
    setPhase('ocr');
    setDetail(`PP-OCRv5 正在本机识别 ${images.length} 页`);
    const results = await runChineseOcr(images, { profile: 'heritage', rotations: [0], includeReviewImage: false });
    const evidence = results.map((result, index): ForgePageEvidence => ({
      page: index + 1,
      route: 'ocr',
      visualRoute: 'guji-modern',
      text: result.text,
      source: 'local-ocr',
      adapter: `${result.model} · ${result.provider}`,
      baseModel: result.model,
      qualityGate: { status: result.meanConfidence >= 0.55 ? 'pass' : 'review', reasons: result.meanConfidence >= 0.55 ? [] : ['low-confidence'], visibleChars: result.text.replace(/\s/g, '').length, nonemptyBlocks: result.detectedBoxes, tileCount: 1 },
    }));
    setPages(evidence);
    setPageImages(images);
    return { evidence, images };
  };

  const run = async (target: Mode) => {
    if (busy) return;
    if (!file) { setError('请先选择 PDF，或载入 10 页案例。'); return; }
    setBusy(true);
    setMode(target);
    // 每次运行从空结果开始。旧候选不得在新推理期间或失败后继续展示，
    // 否则会让案例看起来像“载入即有答案”。
    setCandidates([]);
    setBundle(null);
    setError('');
    try {
      let evidence = pages;
      let images = pageImages;
      if (!pages.length || (target === 'cloud' && !pageImages.length)) {
        const prepared = await runPpOcr();
        evidence = prepared.evidence;
        images = prepared.images;
      }
      setPhase('extract');
      if (target === 'cloud' && file.size > MAX_MAPPING_CLOUD_PDF_BYTES) throw new Error('云端旗舰链路要求当前 PDF 不超过 8 MB；请先截取需要处理的 10 页。');
      setDetail(target === 'edge' ? 'Qwen 2B/MNN 在端侧提炼地点与说明' : '上传原 PDF + 页面图像 + PP-OCR 原文，交给 Qwen 3.7 旗舰版');
      const extracted = target === 'edge'
        ? await runMappingEdgeExtraction(evidence, meta)
        : (await runMappingCloudExtraction(file, sourceHash, images, evidence, meta, () => setDetail(`Qwen 3.7 正在统一复核 ${evidence.length} 页与原 PDF`))).candidates;
      setPhase('geocode');
      setDetail('用本地地点索引优先匹配坐标');
      const resolved = await resolveCoordinates(extracted, meta.city);
      setCandidates(resolved);
      setPhase('review');
      setDetail(`提炼 ${resolved.length} 个地点；请勾选确认后再生成 JSON。`);
    } catch (reason) {
      // OCR 证据可以保留以便重试，但失败运行绝不能恢复或展示旧地点答案。
      setCandidates([]);
      setBundle(null);
      setPhase('idle');
      setDetail('');
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
    } finally { setBusy(false); }
  };

  const toggle = (id: string) => { setBundle(null); setCandidates((current) => current.map((item) => item.id === id && Number.isFinite(item.lat) && Number.isFinite(item.lng) ? { ...item, confirmed: !item.confirmed } : item)); };
  const toggleAllLocated = () => {
    setBundle(null);
    setCandidates((current) => {
      const confirm = current.some((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng) && !item.confirmed);
      return current.map((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng) ? { ...item, confirmed: confirm } : item);
    });
  };
  const editDescription = (id: string, description: string) => { setBundle(null); setCandidates((current) => current.map((item) => item.id === id ? { ...item, description } : item)); };

  const makeBundle = (): MappingDataPackBundle | null => {
    if (!file || !sourceHash) { setError('PDF 尚未准备好。'); return null; }
    if (!confirmed.length) { setError('请至少确认一个已有坐标的地点。'); return null; }
    const next = buildMappingDataPack(meta, candidates, { name: file.name, sha256: sourceHash });
    setBundle(next);
    setPhase('json');
    setError('');
    return next;
  };

  const exportBundle = () => {
    const next = makeBundle();
    if (next) downloadJson(`${meta.title || 'mapping'}-部分地点.json`, next);
  };

  const markMap = async () => {
    const next = makeBundle();
    if (!next) return;
    setBusy(true);
    try {
      await installDataPackFromFile('mapping', new File([JSON.stringify(next, null, 2)], `${next.identity.id}.json`, { type: 'application/json' }));
      setDataPackMapLayerEnabled('mapping', true);
      const first = confirmed[0];
      requestMapFocus(first.lng!, first.lat!, 9);
      setPhase('mapped');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(false); }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#eaeaea] pb-8 text-black">
      <header className="border-b-[3px] border-black bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} aria-label="返回" className="grid h-12 w-12 shrink-0 place-items-center border-[3px] border-black bg-white"><ChevronLeft className="h-7 w-7" strokeWidth={3} /></button>
          <div><h1 className="font-pixel text-[22px] leading-none">MAPPING</h1><p className="mt-2 text-[11px] font-bold text-black/55">文献地点 → JSON → 地球</p></div>
        </div>
      </header>

      <section className="border-b-[3px] border-black bg-black px-4 py-3 text-white">
        <div className="grid grid-cols-4 gap-1 text-center font-pixel text-[7px]">{['PP-OCR', 'QWEN 2B', 'MNN', '端侧'].map((label) => <span key={label} className="border border-white/45 px-1 py-2" style={{ color: ACCENT }}>{label}</span>)}</div>
        <p className="mt-2 text-[9px] text-white/62">原文不自动落图 · 地点与说明先由你确认</p>
      </section>

      <main className="space-y-3 p-3">
        <section className="border-[3px] border-black bg-white p-3">
          <div className="mb-2 flex items-center justify-between"><b className="font-pixel text-[10px]">01 选择资料</b><span className="text-[8px] text-black/40">测试 PDF 10 页 · 自选最多 10 页</span></div>
          <div className="border-2 border-black bg-[#fff9dc] p-2.5">
            <div className="flex items-start gap-2"><FileText className="mt-0.5 h-5 w-5 shrink-0" /><div className="min-w-0 flex-1"><b className="block text-[11px]">《金陵世纪》10 页测试 PDF <span className="text-[#008b51]">【部分】</span></b><p className="mt-1 text-[8px] leading-4 text-black/50">只提供原始输入；地点结果必须主动运行后生成</p><p className="mt-1 font-mono text-[7px] text-black/38">SHA-256 {MAPPING_DEMO_PDF.sha256.slice(0, 12)}…</p></div><span className="border border-black bg-white px-1.5 py-1 font-pixel text-[6px]">OSS</span></div>
            <div className="mt-2 grid grid-cols-2 gap-2"><button onClick={() => setPreviewOpen(true)} className="flex h-9 items-center justify-center gap-1 border-2 border-black bg-white text-[9px] font-bold"><FileText className="h-3.5 w-3.5" />App 内看测试 PDF</button><button onClick={() => void loadExample()} disabled={busy} className="h-9 border-2 border-black text-[9px] font-bold" style={{ background: ACCENT }}>载入测试 PDF</button></div>
          </div>
          <button onClick={() => fileRef.current?.click()} className="mt-2.5 flex min-h-14 w-full items-center gap-2 border-2 border-dashed border-black bg-[#f5f5f5] px-3 text-left">
            <Upload className="h-5 w-5 shrink-0" /><span className="min-w-0"><b className="block truncate text-[10px]">{file ? file.name : '或选择你自己的 PDF'}</b><small className="mt-0.5 block text-[8px] text-black/45">端侧不上传；云端会上传原 PDF、页面图像与 PP-OCR 原文</small></span>
          </button>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(event) => { const next = event.target.files?.[0]; if (next) void chooseFile(next); event.target.value = ''; }} />
          {file && <div className="mt-2 grid grid-cols-2 gap-2">
            <input value={meta.title} onChange={(event) => setMeta({ ...meta, title: event.target.value })} placeholder="书名 / 文献名" className="h-10 border-2 border-black px-2 text-[10px] outline-none" />
            <input value={meta.city} onChange={(event) => setMeta({ ...meta, city: event.target.value })} placeholder="目标城市" className="h-10 border-2 border-black px-2 text-[10px] outline-none" />
          </div>}
        </section>

        <section className="border-[3px] border-black bg-white">
          <div className="flex items-center justify-between border-b-2 border-black px-3 py-2"><b className="font-pixel text-[10px]">02 提炼地点</b><span className="text-[8px] text-black/40">二选一</span></div>
          <div className="grid grid-cols-2 border-b-[3px] border-black">
            <button onClick={() => setMode('edge')} className={`h-12 text-[10px] font-bold ${mode === 'edge' ? 'bg-black text-[#00ef86]' : 'bg-white'}`}><Cpu className="mr-1 inline h-4 w-4" />端侧运行</button>
            <button onClick={() => setMode('cloud')} className={`h-12 border-l-[3px] border-black text-[10px] font-bold ${mode === 'cloud' ? 'bg-black text-[#00ef86]' : 'bg-white'}`}><Cloud className="mr-1 inline h-4 w-4" />Qwen 3.7 云端</button>
          </div>
          <div className="p-3">
            <p className="min-h-9 text-[9px] leading-4 text-black/55">{mode === 'edge' ? 'PP-OCRv5 + Qwen 2B/MNN 全部端侧运行，不调用云 API。' : '与古籍识别一致：主动点击后上传原 PDF、页面图像和 PP-OCR 原文；后端直接调用 Qwen 3.7 旗舰版 API。'}</p>
            <button onClick={() => void run(mode)} disabled={!file || busy} className="mt-2 flex h-11 w-full items-center justify-center gap-2 border-[3px] border-black text-[11px] font-bold disabled:bg-black/15 disabled:text-black/35" style={!busy && file ? { background: ACCENT } : undefined}>
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : mode === 'edge' ? <Cpu className="h-4 w-4" /> : <Cloud className="h-4 w-4" />}{busy ? PHASE_LABEL[phase] : mode === 'edge' ? '运行端侧链路' : '上传并交给 Qwen 3.7'}
            </button>
            {(detail || phase !== 'idle') && <p className="mt-2 text-[9px] text-[#007d49]">{PHASE_LABEL[phase]} · {detail}</p>}
            {error && <p className="mt-2 border-2 border-[#c73535] bg-[#fff0f0] p-2 text-[9px] leading-4 text-[#a51e1e]">{error}</p>}
          </div>
        </section>

        {hasFreshResults && <section className="border-[3px] border-black bg-white">
          <div className="flex items-center justify-between gap-2 border-b-[3px] border-black bg-[#f4f0ff] px-3 py-2"><div><b className="font-pixel text-[11px]">03 本次运行结果</b><p className="mt-1 text-[8px] text-black/45">{`${mode === 'edge' ? 'Qwen 2B/MNN' : 'Qwen 3.7'} 已完成提炼，请逐项确认`}</p></div><div className="flex items-center gap-1"><button type="button" onClick={toggleAllLocated} className="border-2 border-black bg-white px-2 py-1 text-[8px] font-bold">{confirmed.length === located.length ? '取消全选' : '确认全部'}</button><span className="border-2 border-black bg-white px-2 py-1 font-pixel text-[8px]">{confirmed.length}/{candidates.length}</span></div></div>
          <div className="divide-y-2 divide-black">
            {candidates.map((candidate) => {
              const located = Number.isFinite(candidate.lat) && Number.isFinite(candidate.lng);
              return <article key={candidate.id} className={`p-3 ${candidate.confirmed ? 'bg-[#effff5]' : 'bg-white'}`}>
                <div className="flex items-start gap-2">
                  <button onClick={() => toggle(candidate.id)} disabled={!located} aria-label={`确认${candidate.name}`} className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center border-2 border-black disabled:opacity-25" style={candidate.confirmed ? { background: ACCENT } : undefined}>{candidate.confirmed && <Check className="h-4 w-4" strokeWidth={3} />}</button>
                  <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><b className="text-[12px]">{candidate.name}</b><span className={`text-[8px] ${located ? 'text-[#008b51]' : 'text-[#a35b00]'}`}>{located ? '已确址' : '待确址'}</span><span className="ml-auto text-[8px] text-black/40">第 {candidate.page} 页</span></div>
                    <p className="mt-1 text-[8px] text-black/38">识别第 {candidate.page} 页{candidate.sourcePage ? ` · 原 PDF 第 ${candidate.sourcePage} 页` : ''}</p>
                    <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-black/55">“{candidate.context}”</p>
                    <input value={candidate.description || ''} onChange={(event) => editDescription(candidate.id, event.target.value)} placeholder="补充该地点在原文中的说明" className="mt-2 h-9 w-full border-2 border-black/40 px-2 text-[9px] outline-none focus:border-black" />
                  </div>
                </div>
              </article>;
            })}
          </div>
        </section>}

        {hasFreshResults && <section className="border-[3px] border-black bg-black p-3 text-white">
          <div className="mb-3 flex items-center justify-between"><b className="font-pixel text-[11px]" style={{ color: ACCENT }}>04 JSON → 地球</b><span className="text-[9px] text-white/55">{confirmed.length} 个地点</span></div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={exportBundle} disabled={!confirmed.length || busy} className="flex h-11 items-center justify-center gap-1 border-2 border-white bg-white text-[10px] font-bold text-black disabled:opacity-30"><Download className="h-4 w-4" />生成 JSON</button>
            <button onClick={() => void markMap()} disabled={!confirmed.length || busy} className="flex h-11 items-center justify-center gap-1 border-2 border-white text-[10px] font-bold text-black disabled:opacity-30" style={{ background: ACCENT }}><MapPinned className="h-4 w-4" />标记到地图</button>
          </div>
          {bundle && <p className="mt-2 text-[8px] text-white/55">JSON 已生成 · {bundle.records[0]?.locations.length || 0} 个已确认地点 · 点击标记后自动打开中间地图</p>}
        </section>}
      </main>
      {previewOpen && <Suspense fallback={<div className="fixed inset-0 z-[120] grid place-items-center bg-[#eaeaea]"><LoaderCircle className="h-8 w-8 animate-spin" /></div>}><MappingPdfPreview onClose={() => setPreviewOpen(false)} onLoadExample={() => { setPreviewOpen(false); void loadExample(); }} /></Suspense>}
    </div>
  );
}
