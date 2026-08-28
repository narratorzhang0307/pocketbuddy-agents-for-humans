import { useRef, useState, type ChangeEvent } from 'react';
import { Camera, Check, ChevronLeft, Cpu, Keyboard, Layers3, Loader2, Play, RotateCcw, ScanLine } from 'lucide-react';
import Museum2_5DViewer from './Museum2_5DViewer';
import { exhibitInferenceAssetUrl, matteExhibitPhoto, MUSEUM_2_5D_DEMOS, MUSEUM_2_5D_PIPELINE, MUSEUM_MATTING_PROOF, type Museum2_5DDemo } from '../lib/exhibition/museum2_5d';
import { buildLocalReliefDepth } from '../lib/exhibition/local2_5dDepth';
import { ocrLabel } from '../lib/exhibition/sense';
import { downscaleForVision } from '../lib/imageDownscale';

type MuseumStoryMode = 'build' | 'inscription';

const DEFAULT_EXHIBIT_LABEL = '西周青铜鬲（“Li” Ritual Food Vessel）\n年代：西周\n材质：青铜\n馆藏：Harvard Art Museums\n馆藏记录：object 200497';

const readDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const fetchDataUrl = async (url: string) => {
  const response = await fetch(exhibitInferenceAssetUrl(url));
  if (!response.ok) throw new Error(`input_fetch_${response.status}`);
  const blob = await response.blob();
  const pathname = new URL(url, window.location.href).pathname.toLowerCase();
  const inferredType = pathname.endsWith('.png')
    ? 'image/png'
    : pathname.endsWith('.webp')
      ? 'image/webp'
      : 'image/jpeg';
  // The CORS asset gateway can legitimately return application/octet-stream.
  // Preserve an image MIME in the data URL because Android JNI deliberately
  // rejects generic data: URLs before decoding their bytes.
  const imageType = blob.type.startsWith('image/') ? blob.type : inferredType;
  return readDataUrl(new File([blob], url.split('/').pop() || 'exhibit.jpg', { type: imageType }));
};

type BuildProgress = {
  completed: number;
  total: number;
  mattingMs: number;
  depthMs: number;
  phase: 'idle' | 'matting' | 'depth';
  yawDeg?: number;
};

const EMPTY_BUILD_PROGRESS: BuildProgress = { completed: 0, total: 0, mattingMs: 0, depthMs: 0, phase: 'idle' };

export default function Museum2_5DStoryPage({ mode, onBack }: { mode: MuseumStoryMode; onBack: () => void }) {
  const demo = MUSEUM_2_5D_DEMOS[0];
  const hotspot = { ...demo.hotspots[0], title: '铭文细节 · 待单独近拍', detailPhotoUrl: undefined, ocr: undefined };
  const labelInputRef = useRef<HTMLInputElement>(null);
  const [labelText, setLabelText] = useState(DEFAULT_EXHIBIT_LABEL);
  const [labelPreview, setLabelPreview] = useState('');
  const [labelSource, setLabelSource] = useState<'reference' | 'ocr' | 'manual'>('reference');
  const [readingLabel, setReadingLabel] = useState(false);
  const [building, setBuilding] = useState(false);
  const [runtimeDemo, setRuntimeDemo] = useState<Museum2_5DDemo | null>(null);
  const [buildProgress, setBuildProgress] = useState<BuildProgress>({ ...EMPTY_BUILD_PROGRESS, total: demo.views.length });
  const [message, setMessage] = useState('');

  const onLabelPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || readingLabel) return;
    setReadingLabel(true);
    setRuntimeDemo(null);
    setMessage('');
    try {
      const source = await readDataUrl(file);
      setLabelPreview(source);
      const input = await downscaleForVision(source, 1280, 0.88);
      const result = await ocrLabel(input, false);
      if (result.text.trim()) {
        setLabelText(result.text.trim());
        setLabelSource('ocr');
      } else {
        setLabelSource('reference');
        setMessage('端侧 OCR 未读出展签，已保留馆藏参考元数据，也可在下方手动修改。');
      }
    } catch {
      setLabelSource('reference');
      setMessage('展签图片读取失败，已保留馆藏参考元数据。');
    } finally {
      setReadingLabel(false);
    }
  };

  const startBuild = async () => {
    if (!labelText.trim() || readingLabel) {
      setMessage('请先拍展签完成 OCR，或手动输入展签文字。');
      return;
    }
    if (building) return;
    setBuilding(true);
    setRuntimeDemo(null);
    setBuildProgress({ ...EMPTY_BUILD_PROGRESS, total: demo.views.length, phase: 'matting', yawDeg: demo.views[0]?.yawDeg });
    setMessage('');
    const builtViews: Museum2_5DDemo['views'] = [];
    let mattingMs = 0;
    let depthMs = 0;
    try {
      for (const [viewIndex, view] of demo.views.entries()) {
        setBuildProgress({ completed: builtViews.length, total: demo.views.length, mattingMs, depthMs, phase: 'matting', yawDeg: view.yawDeg });
        let input: string;
        try {
          input = await fetchDataUrl(view.originalUrl || view.colorUrl);
        } catch (error) {
          const detail = error instanceof Error ? error.message : 'input_fetch_failed';
          throw new Error(`input_load_failed:${viewIndex + 1}:${view.yawDeg}:${detail}`);
        }
        const result = await matteExhibitPhoto(input);
        if (!result.accepted || !result.cutout || !result.alpha) {
          const unavailable = result.runtime !== 'MNN Android JNI'
            || result.error?.includes('not_ready')
            || result.error?.includes('requires mnn');
          throw new Error(unavailable ? 'mnn_not_ready' : result.reason || result.error || 'quality_gate_failed');
        }
        mattingMs += Math.max(0, result.elapsedMs || 0);
        setBuildProgress({ completed: builtViews.length, total: demo.views.length, mattingMs, depthMs, phase: 'depth', yawDeg: view.yawDeg });
        const depth = await buildLocalReliefDepth(result.cutout, result.alpha);
        depthMs += Math.max(0, depth.elapsedMs);
        builtViews.push({ ...view, colorUrl: result.cutout, depthUrl: depth.depthUrl });
        setBuildProgress({ completed: builtViews.length, total: demo.views.length, mattingMs, depthMs, phase: 'matting', yawDeg: demo.views[builtViews.length]?.yawDeg });
      }
      setRuntimeDemo({ ...demo, id: `${demo.id}-runtime`, views: builtViews });
    } catch (error) {
      const reason = error instanceof Error ? error.message : '';
      const inputFailure = reason.match(/^input_load_failed:(\d+):(\d+):(.+)$/);
      setMessage(inputFailure
        ? `第 ${inputFailure[1]} 张（${inputFailure[2]}°）输入图读取失败，尚未进入 MNN；请检查网络后重试。错误：${inputFailure[3]}`
        : reason === 'mnn_not_ready'
          ? '展品抠图 MNN 尚未安装或不在 Android JNI 本地运行；请回 Skills 安装“看展搭子”模型后重试。不会用 smoke 或历史成品冒充本次结果。'
          : `本次生成未完成（已通过 ${builtViews.length}/${demo.views.length} 张）；未展示预制深度或历史成品。错误：${reason || 'unknown_runtime_error'}`);
    } finally {
      setBuilding(false);
    }
  };

  const resetBuild = () => {
    setRuntimeDemo(null);
    setBuilding(false);
    setBuildProgress({ ...EMPTY_BUILD_PROGRESS, total: demo.views.length });
    setLabelText(DEFAULT_EXHIBIT_LABEL);
    setLabelPreview('');
    setLabelSource('reference');
    setMessage('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#EAEAEA] font-sans">
      <header className="flex shrink-0 items-center gap-2 border-b-2 border-black bg-white px-3 py-2.5">
        <button type="button" onClick={onBack} aria-label="返回看展搭子" className="grid h-9 w-9 place-items-center border-2 border-black bg-white shadow-[2px_2px_0_#000]">
          <ChevronLeft className="h-4 w-4" strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-pixel text-[10px] tracking-[0.14em]">MUSEUM CAPTURE · {mode === 'build' ? '01' : '02'}</div>
          <div className="mt-0.5 truncate text-[10px] font-bold text-black/50">
            {mode === 'build' ? '六角度原图 → 可旋转 2.5D' : '独立铭文近拍 → 原字守恒解释'}
          </div>
        </div>
        <span className="border-2 border-black bg-[#7CFF6B] px-2 py-1 font-pixel text-[7px]">REAL ASSET</span>
      </header>

      <div className="flex shrink-0 items-center justify-between border-b-2 border-black bg-black px-3 py-2 text-[#7CFF6B]">
        <span className="font-pixel text-[7px]">{demo.label} · {demo.views.length}/{demo.views.length} OBSERVED</span>
        <span className="font-pixel text-[6px] text-white/70">NO GENERATED BACKSIDE</span>
      </div>

      {mode === 'build' ? (
        <main className="min-h-0 flex-1 overflow-y-auto p-3">
          <section className="border-2 border-black bg-[#fffaf0]">
            <div className="flex items-center justify-between border-b-2 border-black px-3 py-2">
              <div>
                <div className="font-pixel text-[7px] text-[#5A8F7B]">01 · MULTI-VIEW INPUT</div>
                <h1 className="mt-1 text-[17px] font-black">六张完整馆藏角度 · 主体不出框</h1>
              </div>
              <span className="font-pixel text-[7px]">6 / 6 已载入</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 p-2.5">
              {demo.views.map((view) => (
                <figure key={view.id} className="relative aspect-square overflow-hidden border-2 border-black bg-[#d7d0c3]">
                  <img src={view.originalUrl || view.colorUrl} alt={`${demo.label} ${view.yawDeg}度原始照片`} className="h-full w-full object-contain" />
                  <figcaption className="absolute bottom-0 right-0 border-l border-t border-black bg-white px-1 py-0.5 font-pixel text-[5px]">{view.yawDeg}°</figcaption>
                </figure>
              ))}
            </div>
            <div className="border-t-2 border-black bg-[#fff2c9] px-3 py-2 text-[9px] font-bold leading-relaxed">
              这六张只是待处理输入。先补一张展签，再由你亲自启动 2.5D 生成；本页不提前展示成品。
            </div>
          </section>

          {!runtimeDemo && <section className="mt-3 border-2 border-black bg-white p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-pixel text-[7px] text-[#5A8F7B]">02 · LABEL INPUT</div>
                <h2 className="mt-1 text-[15px] font-black">拍展签 · OCR 后可校订</h2>
              </div>
              <span className="border border-black bg-[#e7e7e7] px-1.5 py-0.5 font-pixel text-[6px]">馆藏参考值</span>
            </div>
            <div className="mt-2 border border-black bg-[#fff2c9] px-2 py-1.5 text-[9px] leading-relaxed">
              本 Harvard 案例未附馆内实拍展签；下方是馆藏记录参考元数据，不是 OCR 结果。可直接使用，也可拍现场展签 OCR 或手动修改。
            </div>
            <input ref={labelInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onLabelPhoto} />
            <button
              type="button"
              disabled={readingLabel}
              onClick={() => labelInputRef.current?.click()}
              className="mt-2 flex w-full items-center justify-center gap-2 border-2 border-black bg-[#dceff2] px-3 py-2 text-[11px] font-bold active:translate-y-px disabled:opacity-50"
            >
              {readingLabel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" strokeWidth={2.5} />}
              {readingLabel ? '端侧 OCR 读取中…' : '拍下展签 / 选择展签图片'}
            </button>
            {labelPreview && <img src={labelPreview} alt="本次拍摄的展签" className="mt-2 max-h-36 w-full border-2 border-black bg-[#eee] object-contain" />}
            <label className="mt-2 block">
              <span className="flex items-center gap-1 text-[9px] font-bold"><Keyboard className="h-3.5 w-3.5" /> 参考元数据 / OCR 结果 / 手动输入</span>
              <textarea
                value={labelText}
                onChange={(event) => { setLabelText(event.target.value); setLabelSource('manual'); setMessage(''); }}
                placeholder="如果没有展签图片，在这里输入展品名、年代、材质和馆藏信息……"
                disabled={building}
                className={`mt-1 min-h-24 w-full resize-y border-2 border-black bg-[#fffaf0] px-2 py-1.5 leading-relaxed outline-none focus:bg-white disabled:opacity-60 ${labelSource === 'reference' ? 'text-[10px] text-black/45' : 'text-[11px] text-black'}`}
              />
            </label>
            <div className="mt-1 flex items-center justify-between text-[8px] text-black/50">
              <span>{labelSource === 'ocr' ? '端侧 OCR 已写入 · 可人工校订' : labelSource === 'manual' ? '手动文字 · 不会伪装成 OCR' : '馆藏参考元数据 · 不计作 OCR'}</span>
              <span className="font-pixel text-[6px]">{labelText.trim().length} CHARS</span>
            </div>
            {message && <div className="mt-2 border border-[#b42318] bg-[#fff0ec] px-2 py-1.5 text-[9px] text-[#8b1e12]">{message}</div>}
            <button
              type="button"
              onClick={startBuild}
              disabled={readingLabel || building || !labelText.trim()}
              className="mt-3 flex w-full items-center justify-center gap-2 border-2 border-black bg-[#7CFF6B] px-3 py-2.5 text-[12px] font-black shadow-[2px_2px_0_#000] active:translate-y-px disabled:bg-[#ddd] disabled:text-black/35"
            >
              {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" fill="currentColor" />}
              {building
                ? `${buildProgress.phase === 'depth' ? '本地深度计算' : 'MNN 抠图'} ${buildProgress.completed}/${buildProgress.total}`
                : '本地运行六张并生成 2.5D'}
            </button>
            {building && <div className="mt-2 border border-black bg-[#eef4f1] px-2 py-1.5">
              <div className="flex items-center justify-between font-pixel text-[6px]"><span>REAL INFERENCE</span><span>{buildProgress.completed}/{buildProgress.total}</span></div>
              <div className="mt-1 h-2 overflow-hidden border border-black bg-white"><div className="h-full bg-[#7CFF6B] transition-[width]" style={{ width: `${(buildProgress.completed / buildProgress.total) * 100}%` }} /></div>
              <div className="mt-1 text-[8px] text-black/55">
                {buildProgress.yawDeg ?? 0}° · {buildProgress.phase === 'depth' ? '用本次 Alpha + RGB 生成深度图' : '正在 Android JNI 运行展品抠图 MNN'}。六张全部完成前不显示结果。
              </div>
            </div>}
          </section>}

          {runtimeDemo && <>
          <section className="mt-3 border-2 border-black bg-[#e8f5e9] px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[10px] font-bold"><Check className="h-4 w-4" strokeWidth={3} /> MNN + 本地深度 {buildProgress.completed}/{buildProgress.total} · 本次实算</span>
              <button type="button" onClick={resetBuild} className="flex shrink-0 items-center gap-1 border border-black bg-white px-1.5 py-1 font-pixel text-[6px]"><RotateCcw className="h-3 w-3" /> 重新体验</button>
            </div>
            <div className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-black/60">{labelText}</div>
          </section>

          <div className="my-3 flex flex-wrap items-center justify-center gap-1.5">
            {MUSEUM_2_5D_PIPELINE.map((step, index) => (
              <div key={step} className="contents">
                <span className="border border-black bg-white px-2 py-1 font-pixel text-[6px] shadow-[1px_1px_0_#000]">{step}</span>
                {index < MUSEUM_2_5D_PIPELINE.length - 1 && <span className="font-pixel text-[8px]">→</span>}
              </div>
            ))}
          </div>

          <section className="border-2 border-black bg-white">
            <div className="flex items-center justify-between border-b-2 border-black px-3 py-2">
              <div className="flex items-center gap-2"><Layers3 className="h-4 w-4" strokeWidth={2.5} /><b className="text-[14px]">03 · 本次生成的可旋转 2.5D</b></div>
            </div>
            <Museum2_5DViewer compact runtimeDemo={runtimeDemo} hideDemoSwitch />
            <div className="flex items-center justify-between border-t-2 border-black bg-[#f4eedb] px-3 py-2">
              <span className="flex items-center gap-1 font-pixel text-[6px]"><Cpu className="h-3 w-3" /> {MUSEUM_MATTING_PROOF.runtime}</span>
              <span className="font-pixel text-[6px]">MNN {Math.round(buildProgress.mattingMs)} ms · DEPTH {Math.round(buildProgress.depthMs)} ms</span>
            </div>
          </section>
          </>}
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col p-3">
          <section className="mb-2 shrink-0 border-2 border-black bg-[#fffaf0] px-3 py-2">
            <div className="flex items-start gap-2">
              <ScanLine className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
              <div>
                <div className="font-pixel text-[7px] text-[#5A8F7B]">DETAIL HOTSPOT · SEPARATE PHOTO</div>
                <div className="mt-1 text-[13px] font-black">铭文细节不从环绕照裁切，单独近拍后附着到对应角度</div>
                <div className="mt-1 text-[9px] leading-relaxed text-black/55">本页不预载历史识读结果。补拍后才运行端侧识读；馆方释文确认后，原生 Qwen 只负责断句和现代解释。</div>
              </div>
            </div>
          </section>
          <div className="min-h-0 flex-1">
            <Museum2_5DViewer
              fill
              assetUrl={demo.manifestUrl}
              hotspots={[hotspot]}
              initialHotspotId={hotspot?.id}
              hideDemoSwitch
            />
          </div>
          <div className="mt-2 flex shrink-0 items-center justify-between border-2 border-black bg-[#e8f5e9] px-3 py-2">
            <span className="flex items-center gap-1.5 text-[10px] font-bold"><ScanLine className="h-4 w-4" strokeWidth={3} /> 等待独立铭文近拍</span>
            <span className="font-pixel text-[6px]">NO PRELOADED OCR</span>
          </div>
        </main>
      )}
    </div>
  );
}
