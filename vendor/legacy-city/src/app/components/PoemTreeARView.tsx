// 诗歌树伪 AR + 拍照（移植自旧项目 ARCameraView，适配像素风）：
// 相机/降级背景(z0) + AR 动态视频树或 Canvas 树(z5) + 扫描 HUD(z10) + 快门(z20)。
// 拍照合成策略：相机帧(同源安全) + AR视频帧（OSS 无 CORS 会污染画布 → 自动回退 Canvas 代码树），
// 快门产出 720×960 PNG 可保存——「拍下诗树在现实中的样子」。
import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import PoemPlantCanvas from './PoemPlantCanvas';
import { type PoemAttributes } from '../lib/poemtree';
import { addZinePhotos } from '../lib/roam/zine';
import { getRoamCity } from '../lib/roam/city';
import ShellPortal from './ShellPortal';

const GREEN = '#00ff88';

// 相机不可用时的降级底景：旧项目自制「现实视频」（OSS），仍不可用再退纯色渐变。诚实标注「演示底景」。
const REALITY_BG = 'https://poem-plant-assets.oss-cn-beijing.aliyuncs.com/AR%E8%A7%86%E9%A2%91/%E7%8E%B0%E5%AE%9E%E8%A7%86%E9%A2%91.mp4';

export default function PoemTreeARView({ attributes, seed, place, arVideoUrl, onClose }: {
  attributes: PoemAttributes; seed: number; place?: string; arVideoUrl?: string; onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const arVidRef = useRef<HTMLVideoElement>(null);
  const treeWrapRef = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState(false);
  const [bgOk, setBgOk] = useState(true);
  const [arOk, setArOk] = useState(true);
  const [arBlocked, setArBlocked] = useState(false);
  const [scan, setScan] = useState(0);
  const [shot, setShot] = useState<string | null>(null);
  // 收进 ZINE：留影入当前城市的旅志刊（'' 未收 / 'busy' / 城市名=已收）
  const [zined, setZined] = useState('');

  const keepInZine = async () => {
    if (!shot || zined) return;
    setZined('busy');
    try {
      const blob = await (await fetch(shot)).blob();
      const city = getRoamCity();
      const n = await addZinePhotos([new File([blob], `诗树留影-${Date.now().toString(36)}.png`, { type: 'image/png' })], city);
      setZined(n ? city : '');
    } catch { setZined(''); }
  };

  // 相机流三坑加固（照 ARPhotoView 范式）：①await 归来已卸载停 tracks ②ref 已空也停 ③拒权/无 API 降级不抛错
  useEffect(() => {
    let stream: MediaStream | null = null;
    let disposed = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (disposed) { stream.getTracks().forEach((t) => t.stop()); return; }
        if (videoRef.current) { videoRef.current.srcObject = stream; setCam(true); }
        else { stream.getTracks().forEach((t) => t.stop()); }
      } catch { if (!disposed) setCam(false); }
    })();
    return () => { disposed = true; if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setScan((s) => (s + 2) % 100), 50);
    return () => window.clearInterval(id);
  }, []);

  // AR 视频自动播放被拦时给「TAP TO PLAY」全覆盖按钮（旧项目同款兜底）
  useEffect(() => {
    const v = arVidRef.current;
    if (!v || !arVideoUrl) return;
    v.play().then(() => setArBlocked(false)).catch(() => setArBlocked(true));
  }, [arVideoUrl, arOk]);

  const showArVideo = !!arVideoUrl && arOk;

  // —— 快门：合成拍照（宝丽来式构图，画布污染时回退透明代码树） ——
  const capture = () => {
    const W = 720, H = 960;
    const M = 22, CAP = 96;                     // 白框边距 / 底部题字带
    const pTop = M, pLeft = M, pW = W - M * 2, pH = H - M - CAP - pTop;
    const drawBase = (ctx: CanvasRenderingContext2D) => {
      // 相纸白底
      ctx.fillStyle = '#f7f6f2';
      ctx.fillRect(0, 0, W, H);
      // 照片区：相机帧（cover 裁切）或暗夜渐变
      ctx.save();
      ctx.beginPath(); ctx.rect(pLeft, pTop, pW, pH); ctx.clip();
      const v = videoRef.current;
      if (cam && v && v.videoWidth) {
        const s = Math.max(pW / v.videoWidth, pH / v.videoHeight);
        ctx.drawImage(v, pLeft + (pW - v.videoWidth * s) / 2, pTop + (pH - v.videoHeight * s) / 2, v.videoWidth * s, v.videoHeight * s);
      } else {
        const g = ctx.createRadialGradient(W / 2, pTop + pH * 0.4, 60, W / 2, pTop + pH * 0.4, pH);
        g.addColorStop(0, '#12301f'); g.addColorStop(1, '#060a07');
        ctx.fillStyle = g; ctx.fillRect(pLeft, pTop, pW, pH);
      }
      ctx.restore();
    };
    const drawTreeInto = (ctx: CanvasRenderingContext2D, src: HTMLVideoElement | HTMLCanvasElement, srcW: number, srcH: number, scaleW: number, blend?: boolean) => {
      // 树立在照片区底部（像长在地上）；AR 视频帧用 multiply 融入（与实时画面一致），代码树发光
      const s = Math.min((pW * scaleW) / srcW, (pH * 0.72) / srcH);
      const dw = srcW * s, dh = srcH * s;
      ctx.save();
      ctx.beginPath(); ctx.rect(pLeft, pTop, pW, pH); ctx.clip();
      if (blend) {
        ctx.globalCompositeOperation = 'multiply';
      } else {
        ctx.shadowColor = 'rgba(0,255,136,0.35)';
        ctx.shadowBlur = 26;
      }
      ctx.drawImage(src, pLeft + (pW - dw) / 2, pTop + pH - dh - 18, dw, dh);
      ctx.restore();
    };
    const drawFrame = (ctx: CanvasRenderingContext2D) => {
      // 照片区细黑描边 + HUD 四角（拍摄仪式感）
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 3;
      ctx.strokeRect(pLeft, pTop, pW, pH);
      ctx.strokeStyle = GREEN; ctx.lineWidth = 4;
      const L = 26, cx2 = pLeft + pW, cy2 = pTop + pH;
      ctx.beginPath();
      ctx.moveTo(pLeft + 8, pTop + 8 + L); ctx.lineTo(pLeft + 8, pTop + 8); ctx.lineTo(pLeft + 8 + L, pTop + 8);
      ctx.moveTo(cx2 - 8 - L, pTop + 8); ctx.lineTo(cx2 - 8, pTop + 8); ctx.lineTo(cx2 - 8, pTop + 8 + L);
      ctx.moveTo(pLeft + 8, cy2 - 8 - L); ctx.lineTo(pLeft + 8, cy2 - 8); ctx.lineTo(pLeft + 8 + L, cy2 - 8);
      ctx.moveTo(cx2 - 8 - L, cy2 - 8); ctx.lineTo(cx2 - 8, cy2 - 8); ctx.lineTo(cx2 - 8, cy2 - 8 - L);
      ctx.stroke();
      // 宝丽来题字带：像素绿块 + 黑字
      ctx.fillStyle = '#00c07f';
      ctx.fillRect(pLeft, H - CAP + 26, 14, 14);
      ctx.fillStyle = '#161616';
      ctx.font = '15px "Press Start 2P",monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`POEM PLANT${place ? ' · ' + place.slice(0, 10) : ''}`, pLeft + 24, H - CAP + 34);
      ctx.font = '11px "Press Start 2P",monospace';
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillText('SHANG JIE QU · CARRY THE COSMOS', pLeft, H - CAP + 64);
    };
    const finish = (url: string) => setShot(url);

    // 先试「相机 + AR 视频帧」（OSS 未开 CORS 时 toDataURL 会抛错 → 回退）
    const arVid = arVidRef.current;
    if (showArVideo && arVid && arVid.videoWidth) {
      try {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const ctx = c.getContext('2d')!;
        drawBase(ctx);
        drawTreeInto(ctx, arVid, arVid.videoWidth, arVid.videoHeight, 0.9, true);
        drawFrame(ctx);
        finish(c.toDataURL('image/png'));
        return;
      } catch { /* 画布被污染 → 用透明代码树重排 */ }
    }
    // 回退：相机 + 透明底代码树（全同源，永远可导出）
    const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
    const ctx2 = c2.getContext('2d')!;
    drawBase(ctx2);
    const treeCv = treeWrapRef.current?.querySelector('canvas');
    if (treeCv) drawTreeInto(ctx2, treeCv, treeCv.width, treeCv.height, 0.84);
    drawFrame(ctx2);
    finish(c2.toDataURL('image/png'));
  };

  return (
    <ShellPortal>
    <div className="absolute inset-0 z-[150] bg-black flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 shrink-0" style={{ borderBottom: '2px solid ' + GREEN }}>
        <span className="font-pixel text-[9px]" style={{ color: GREEN }}>{'◆ 种到现实 · 伪 AR' + (place ? ' · ' + place : '')}</span>
        <button onClick={onClose} className="w-7 h-7 border-2 flex items-center justify-center" style={{ borderColor: GREEN }}><X className="w-4 h-4" style={{ color: GREEN }} /></button>
      </div>
      <div className="flex-1 relative overflow-hidden">
        <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover" style={{ display: cam ? 'block' : 'none' }} />
        {!cam && (
          <>
            <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 40%, #0a2018, #000)' }} />
            {bgOk && (
              <video src={REALITY_BG} autoPlay muted loop playsInline onError={() => setBgOk(false)}
                className="absolute inset-0 w-full h-full object-cover opacity-80" />
            )}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 font-pixel text-[6px] px-1.5 py-0.5 border" style={{ color: GREEN, borderColor: GREEN, zIndex: 12 }}>
              相机不可用 · 演示底景（非实景）
            </div>
          </>
        )}

        {/* AR 内容层：动态视频树（用户自制 processing 树）优先，无/失败回退 Canvas 代码树 */}
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 5 }}>
          {showArVideo && (
            <video
              ref={arVidRef}
              src={arVideoUrl}
              className="w-[84%] max-h-[64%] object-contain"
              // processing 树是浅底深彩：multiply 让浅底融进相机画面，只留树的笔触叠上去
              //（OSS 无 CORS，逐帧 canvas 抠像会污染画布，混合模式是唯一可行的实时融合）
              style={{ mixBlendMode: 'multiply', filter: 'saturate(1.4) contrast(1.06)' }}
              autoPlay loop muted playsInline preload="metadata"
              onError={() => setArOk(false)}
            />
          )}
          <div ref={treeWrapRef} style={{ display: showArVideo ? 'none' : 'block', filter: 'drop-shadow(0 0 14px rgba(0,255,136,0.35))' }}>
            <PoemPlantCanvas attributes={attributes} seed={seed} size={250} transparent />
          </div>
        </div>
        {showArVideo && arBlocked && (
          <button
            onClick={() => { arVidRef.current?.play().then(() => setArBlocked(false)).catch(() => {}); }}
            className="absolute inset-0 z-[15] bg-black/45 flex items-center justify-center font-pixel text-[10px]"
            style={{ color: GREEN }}
          >
            ▶ TAP TO PLAY
          </button>
        )}

        {/* 扫描 HUD（旧项目 ARCameraView 全套：网格 + 上下扫描线 + 四角取景框 + 中心准星） */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M 40 0 L 0 0 0 40' fill='none' stroke='%23ffffff' stroke-width='0.5' opacity='0.3'/%3E%3C/svg%3E")`,
              backgroundSize: '40px 40px',
            }}
          />
          <div className="absolute left-0 right-0" style={{ top: scan + '%', height: '2px', background: GREEN, opacity: 0.7, boxShadow: '0 0 10px ' + GREEN }} />
          <div className="absolute top-3 left-3 w-5 h-5 border-l-2 border-t-2" style={{ borderColor: GREEN }} />
          <div className="absolute top-3 right-3 w-5 h-5 border-r-2 border-t-2" style={{ borderColor: GREEN }} />
          <div className="absolute bottom-3 left-3 w-5 h-5 border-l-2 border-b-2" style={{ borderColor: GREEN }} />
          <div className="absolute bottom-3 right-3 w-5 h-5 border-r-2 border-b-2" style={{ borderColor: GREEN }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 border rounded-full animate-pulse" style={{ borderColor: GREEN }} />
        </div>

        {/* 快门 */}
        <div className="absolute bottom-6 left-0 right-0 flex justify-center" style={{ zIndex: 20 }}>
          <button
            onClick={capture}
            aria-label="拍照"
            className="w-14 h-14 border-[3px] border-white bg-[#00ff88] flex items-center justify-center shadow-[3px_3px_0_rgba(0,0,0,0.6)] active:translate-y-px"
          >
            <Camera className="w-6 h-6 text-black" strokeWidth={2.5} />
          </button>
        </div>

        {/* 照片预览 */}
        {shot && (
          <div className="absolute inset-0 z-[30] bg-black/90 flex flex-col items-center justify-center gap-3 p-4" onClick={() => setShot(null)}>
            <img src={shot} alt="诗树留影" className="max-h-[70%] max-w-full border-2 border-white/70"
              style={{ boxShadow: '5px 6px 0 rgba(0,255,136,0.35)', transform: 'rotate(-1deg)' }}
              onClick={(e) => e.stopPropagation()} />
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <a href={shot} download={`诗树留影${place ? '-' + place : ''}.png`}
                className="font-pixel text-[8px] uppercase tracking-widest border-2 border-black bg-[#00ff88] text-black px-4 py-2 shadow-[2px_2px_0_#000] active:translate-y-px">
                ⤓ 保存
              </a>
              <button onClick={keepInZine} disabled={!!zined}
                className={`font-pixel text-[8px] uppercase tracking-widest border-2 px-3 py-2 active:translate-y-px ${
                  zined && zined !== 'busy' ? 'border-black bg-[#b388ff] text-black' : 'border-[#b388ff] text-[#b388ff]'
                }`}>
                {zined === 'busy' ? '收录中…' : zined ? `✓ 已进${zined}刊` : '✦ 收进 ZINE'}
              </button>
              <button onClick={() => { setShot(null); setZined(''); }}
                className="font-pixel text-[8px] uppercase tracking-widest border-2 border-white/60 text-white/80 px-3 py-2 active:translate-y-px">
                ↺ 重拍
              </button>
            </div>
            <span className="text-[9px] text-white/40">长按图片也可保存 · 收进 ZINE 即入旅志手帐</span>
          </div>
        )}
      </div>
    </div>
    </ShellPortal>
  );
}
