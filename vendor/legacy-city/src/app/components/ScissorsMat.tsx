// 手帐剪刀 · 剪切台（复刻 AnyPiece「Collect the web in pieces」的自由套索 + 连续剪）：
// 指尖圈出一块 → 蚂蚁线勾勒（已按手剪圆边平滑）→ 松手剪下一枚碎片进底部碎片条 → 可连续再剪 →「完成」交给去处。
// 三处对齐 AnyPiece/诊断：① 折线→手剪圆边（lassoSmooth）② 连续多段剪（碎片条）③ 从高清源位图采样（dieCut，不糊）。
// 纯端侧：decode 方向归一 + EXIF GPS 只在本地读取，原图不出端、不落持久层。源泛化为 CutSource（上传图/blobURL/位图）。
import { useEffect, useRef, useState } from 'react';
import { Scissors, X, Check, Undo2 } from 'lucide-react';
import { decode } from '../lib/skills/browserVision';
import { dieCut } from '../lib/skills/dieCut';
import { smoothPolygon, type Pt, type SmoothOptions } from '../lib/skills/lassoSmooth';
import { readExif } from '../lib/photo/features';
import ShellPortal from './ShellPortal';

export interface CutExif { lat?: number; lng?: number; hasGPS: boolean }
export interface CutPiece {
  blob: Blob;                       // PNG 贴纸（透明底 + 白描边）
  url: string;                      // objectURL（预览/交给去处；调用方负责在用完后 revoke）
  exif: CutExif;
}
/** 剪切来源：上传文件 / blob 或 data URL（ZINE 照片、票根产物）/ 已解码位图。 */
export type CutSource =
  | { kind: 'file'; file: File }
  | { kind: 'url'; url: string }
  | { kind: 'bitmap'; bitmap: ImageBitmap };

type Stage = 'loading' | 'draw' | 'error';

// 预览蚂蚁线与裁剪同参（源坐标系尺度更大，dieCut 内部用默认 step，两者视觉一致）
const PREVIEW_SMOOTH: SmoothOptions = { resampleStep: 6, chaikin: 1, subdivisions: 5, closed: true };
const MAX_EDGE = 1600;              // 源位图长边（够清晰，进拼贴台放大/2× 导出不糊）

export default function ScissorsMat({ source, onDone, onCancel }: {
  source: CutSource;
  onDone: (pieces: CutPiece[]) => void;
  onCancel: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);   // 显示画布（供圈画）
  const srcRef = useRef<HTMLCanvasElement | null>(null);      // 高清源画布（供采样，不上屏）
  const scaleRef = useRef({ x: 1, y: 1 });                    // 显示 CSS px → 源像素
  const drawingRef = useRef(false);
  const pointsRef = useRef<Pt[]>([]);
  const exifRef = useRef<CutExif>({ hasGPS: false });
  const piecesRef = useRef<CutPiece[]>([]);                   // 兜底：卸载时 revoke 未交出的碎片
  const [stage, setStage] = useState<Stage>('loading');
  const [pathD, setPathD] = useState('');
  const [pieces, setPieces] = useState<CutPiece[]>([]);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');

  // 载入源：解码到高清源画布（方向归一）+ 铺一张显示画布；file 源并行本地读 EXIF GPS
  useEffect(() => {
    let disposed = false;
    (async () => {
      if (source.kind === 'file') {
        readExif(source.file).then((e) => { exifRef.current = { lat: e.lat, lng: e.lng, hasGPS: e.hasGPS }; }).catch(() => {});
      }
      const src = await loadSource(source);
      if (disposed) return;
      if (!src || !wrapRef.current || !canvasRef.current) { setStage('error'); return; }
      srcRef.current = src;
      const wrap = wrapRef.current.getBoundingClientRect();
      const scale = Math.min(wrap.width / src.width, wrap.height / src.height, 1);
      const cssW = Math.max(1, Math.round(src.width * scale));
      const cssH = Math.max(1, Math.round(src.height * scale));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cv = canvasRef.current;
      cv.width = cssW * dpr; cv.height = cssH * dpr;
      cv.style.width = `${cssW}px`; cv.style.height = `${cssH}px`;
      cv.getContext('2d')!.drawImage(src, 0, 0, cv.width, cv.height);
      // 显示 CSS 坐标 → 源像素：源宽 / 显示 CSS 宽（关键：套索在源坐标系裁剪，碎片够清晰）
      scaleRef.current = { x: src.width / cssW, y: src.height / cssH };
      setStage('draw');
    })();
    return () => { disposed = true; };
  }, [source]);

  // 卸载回收：仅回收「未随 onDone 交出」的 objectURL（交出后由去处接管）
  useEffect(() => () => { piecesRef.current.forEach((p) => URL.revokeObjectURL(p.url)); }, []);

  const toLocal = (e: React.PointerEvent): Pt | null => {
    const cv = canvasRef.current;
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (x < 0 || y < 0 || x > r.width || y > r.height) return null;
    return { x, y };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (stage !== 'draw' || busy) return;
    const p = toLocal(e);
    if (!p) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    pointsRef.current = [p];
    setPathD('');
    setHint('');
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    const p = toLocal(e);
    if (!p) return;
    const pts = pointsRef.current;
    const last = pts[pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 3) return;
    pts.push(p);
    // 实时把折线平滑成手剪圆边再画蚂蚁线（所见即所剪）
    if (pts.length >= 3) setPathD(toPathD(smoothPolygon(pts, PREVIEW_SMOOTH)));
    else setPathD(`M${pts[0].x},${pts[0].y}` + pts.slice(1).map((q) => ` L${q.x},${q.y}`).join(''));
  };
  const onPointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const pts = pointsRef.current;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    if (pts.length < 8 || w < 24 || h < 24) {
      setPathD(''); pointsRef.current = [];
      setHint('圈大一点再剪 ✂');
      return;
    }
    void cut(pts);
  };

  // 剪下一枚碎片：显示坐标 → 源坐标 → dieCut 从高清源采样合成 die-cut 贴纸
  const cut = async (displayPts: Pt[]) => {
    const src = srcRef.current;
    if (!src) return;
    setBusy(true);
    try {
      const s = scaleRef.current;
      const srcPts = displayPts.map((p) => ({ x: p.x * s.x, y: p.y * s.y }));
      const { blob } = await dieCut(src, srcPts, { smooth: PREVIEW_SMOOTH, strokeFrac: 0.022 });
      const url = URL.createObjectURL(blob);
      const piece: CutPiece = { blob, url, exif: exifRef.current };
      piecesRef.current = [...piecesRef.current, piece];
      setPieces(piecesRef.current);
    } catch {
      setHint('这块剪不了（可能图片跨域受限）');
    } finally {
      setPathD(''); pointsRef.current = [];
      setBusy(false);
    }
  };

  const undoPiece = () => {
    const list = piecesRef.current;
    if (!list.length) return;
    const last = list[list.length - 1];
    URL.revokeObjectURL(last.url);
    piecesRef.current = list.slice(0, -1);
    setPieces(piecesRef.current);
  };
  const removePiece = (url: string) => {
    const list = piecesRef.current;
    const hit = list.find((p) => p.url === url);
    if (hit) URL.revokeObjectURL(hit.url);
    piecesRef.current = list.filter((p) => p.url !== url);
    setPieces(piecesRef.current);
  };
  const finish = () => {
    const out = piecesRef.current;
    piecesRef.current = [];        // 交出所有权，卸载时不再 revoke
    onDone(out);
  };

  return (
    <ShellPortal>
    <div className="absolute inset-0 z-[160] bg-[#101210] flex flex-col" style={{ touchAction: 'none' }}>
      <style>{`@keyframes cutAnts { to { stroke-dashoffset: -14; } }`}</style>

      {/* 顶栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b-2 border-[#00ff88] shrink-0">
        <span className="font-pixel text-[9px] tracking-wider text-[#00ff88] flex items-center gap-1.5">
          <Scissors className="w-3.5 h-3.5" /> 手帐剪刀 · 连续剪
        </span>
        <div className="flex items-center gap-2">
          <button onClick={undoPiece} disabled={!pieces.length} aria-label="撤销上一片"
            className="h-7 px-2 border-2 border-white/40 flex items-center gap-1 text-white/70 active:translate-y-px disabled:opacity-30">
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onCancel} aria-label="取消" className="w-7 h-7 border-2 border-[#00ff88] flex items-center justify-center active:translate-y-px">
            <X className="w-4 h-4 text-[#00ff88]" />
          </button>
        </div>
      </div>

      {/* 剪切台 */}
      <div ref={wrapRef} className="flex-1 relative flex items-center justify-center overflow-hidden p-3">
        {stage === 'loading' && <div className="w-3 h-3 bg-[#00ff88] border border-black animate-pulse" />}
        {stage === 'error' && (
          <div className="text-center space-y-2">
            <div className="text-[12px] text-white/70">这张图读不进来（格式/内存/跨域）</div>
            <button onClick={onCancel} className="font-pixel text-[8px] border-2 border-[#00ff88] text-[#00ff88] px-3 py-1.5">返回</button>
          </div>
        )}
        <div className={stage === 'draw' ? 'relative' : 'hidden'}>
          <canvas
            ref={canvasRef}
            className="border-2 border-white/25 select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          {/* 套索：白实线打底 + 黑蚂蚁线行进（路径已平滑成手剪圆边） */}
          {pathD && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              <path d={pathD} fill="rgba(0,255,136,0.08)" stroke="#fff" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
              <path d={pathD} fill="none" stroke="#000" strokeWidth="1.5" strokeDasharray="7 7" style={{ animation: 'cutAnts 0.5s linear infinite' }} />
            </svg>
          )}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <span className="font-pixel text-[9px] text-[#00ff88]">剪下中…</span>
            </div>
          )}
        </div>
      </div>

      {/* 底部碎片条 + 完成 */}
      <div className="shrink-0 border-t border-white/15">
        {pieces.length > 0 && (
          <div className="flex gap-2 px-3 py-2 overflow-x-auto">
            {pieces.map((p) => (
              <div key={p.url} className="relative shrink-0">
                <img src={p.url} alt="碎片" className="h-14 w-14 object-contain bg-[#1a1c1a] border border-white/15"
                  style={{ filter: 'drop-shadow(2px 2px 0 rgba(0,0,0,0.5))' }} />
                <button onClick={() => removePiece(p.url)} aria-label="删掉这片"
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-black border border-white/50 flex items-center justify-center text-white text-[9px] leading-none">×</button>
              </div>
            ))}
          </div>
        )}
        <div className="px-4 py-2.5 flex items-center gap-3">
          <span className="font-pixel text-[7px] tracking-wider text-white/45 flex-1">
            {hint || (pieces.length ? `已剪 ${pieces.length} 片 · 可继续圈，或点完成` : '用手指圈出想剪下的部分 · 松手即剪一片')}
          </span>
          <button onClick={finish} disabled={!pieces.length}
            className="font-pixel text-[8px] border-2 border-black bg-[#00ff88] text-black px-4 py-2 shadow-[2px_2px_0_#000] active:translate-y-px disabled:opacity-30 flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> 完成 · {pieces.length}
          </button>
        </div>
      </div>
    </div>
    </ShellPortal>
  );
}

// —— 源装载：统一解码到「长边 ≤ MAX_EDGE、方向归一」的高清画布 ——
async function loadSource(source: CutSource): Promise<HTMLCanvasElement | null> {
  if (source.kind === 'file') {
    const dec = await decode(source.file, MAX_EDGE);
    return dec?.canvas ?? null;
  }
  if (source.kind === 'bitmap') return bitmapToCanvas(source.bitmap);
  // url（blob:/data:/同源 http）：Image 解码 → 缩到长边 MAX_EDGE
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => res(im); im.onerror = rej; im.src = source.url;
    });
    const bw = img.naturalWidth, bh = img.naturalHeight;
    if (!bw || !bh) return null;
    const s = Math.min(1, MAX_EDGE / Math.max(bw, bh));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(bw * s)); cv.height = Math.max(1, Math.round(bh * s));
    cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
    return cv;
  } catch { return null; }
}
function bitmapToCanvas(bmp: ImageBitmap): HTMLCanvasElement {
  const s = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(bmp.width * s)); cv.height = Math.max(1, Math.round(bmp.height * s));
  cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
  return cv;
}
function toPathD(pts: Pt[]): string {
  if (!pts.length) return '';
  return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}` + pts.slice(1).map((p) => ` L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('') + ' Z';
}
