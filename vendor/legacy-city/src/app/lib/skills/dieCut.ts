// ════════════════════════════════════════════════════════════════════════════
// 可复用 Skill（app 层）· die-cut 贴纸合成 —— 按路径把画面剪成「透明底 + 白描边」有机贴纸 PNG
// ────────────────────────────────────────────────────────────────────────────
// 抽自 ScissorsMat.cut()。两处关键改进（对齐诊断/审查）：
//   ① 分辨率命门：从【全分辨率源位图】采样，路径用【源像素坐标系】——不再从被容器缩放过的显示
//      画布抠图。这样剪下的贴纸够清晰，进拼贴台放大 / 2× 导出都不糊。调用方负责把屏幕坐标的
//      套索点按 (源宽/显示宽) 缩放到源坐标系再传进来。
//   ② 手剪圆边：可内部先调 [lassoSmooth].smoothPolygon 把折线磨圆（默认开）；若调用方已平滑
//      （为了让蚂蚁线预览与裁剪同形），传 smooth:false 用外部路径。
//
// 关注点分离：只管「源位图 + 路径 → 一枚白描边贴纸」，不认识照片/城市/手帐领域（领域无关 canvas 原语）。
// 白描边宽做成参数（绝对 px 或按碎片对角线比例），不写死。
// ════════════════════════════════════════════════════════════════════════════
import { bbox, smoothPolygon, type Pt, type SmoothOptions } from './lassoSmooth';

export type DieCutSource = HTMLCanvasElement | ImageBitmap | OffscreenCanvas;

export interface DieCutOptions {
  stroke?: number;                    // 白描边绝对宽（源像素）；缺省由 strokeFrac 算
  strokeFrac?: number;                // 白描边 = 碎片对角线 × 此比例（默认 0.02）
  smooth?: SmoothOptions | false;     // 内部平滑（默认 {}=用默认参数平滑；false=路径已平滑）
  mime?: string;                      // 输出 MIME（默认 image/png，保留透明底）
  quality?: number;                   // toBlob 质量（jpeg/webp 时用）
}

export interface DieCutResult {
  blob: Blob;
  width: number;                      // 贴纸 PNG 像素宽（含白边）
  height: number;
}

/** 纯逻辑：给定路径与描边宽，算贴纸输出画布尺寸与路径在画布内的平移量（可 node 单测）。 */
export function cutoutBounds(pts: Pt[], strokePx: number): {
  minX: number; minY: number; pad: number; width: number; height: number;
} {
  const b = bbox(pts);
  const pad = Math.ceil(strokePx / 2) + 2;                 // 白边向路径外溢出 stroke/2，留够余量
  const width = Math.max(1, Math.ceil(b.maxX - b.minX) + pad * 2);
  const height = Math.max(1, Math.ceil(b.maxY - b.minY) + pad * 2);
  return { minX: b.minX, minY: b.minY, pad, width, height };
}

function resolveStroke(pts: Pt[], opts: DieCutOptions): number {
  if (opts.stroke != null) return Math.max(1, opts.stroke);
  const b = bbox(pts);
  const diag = Math.hypot(b.maxX - b.minX, b.maxY - b.minY);
  return Math.max(6, Math.round(diag * (opts.strokeFrac ?? 0.02)));
}

/**
 * 把源位图按路径剪成一枚 die-cut 贴纸（透明底 + 白纸描边 + 沿路径裁切的画面）。
 * pts 必须在【源位图像素坐标系】。返回 PNG blob 及尺寸。源污染（跨域）时 toBlob 抛错，调用方兜底。
 */
export async function dieCut(source: DieCutSource, pts: Pt[], opts: DieCutOptions = {}): Promise<DieCutResult> {
  const path = opts.smooth === false ? pts : smoothPolygon(pts, opts.smooth ?? {});
  if (path.length < 3) throw new Error('dieCut: 路径点不足');
  const strokePx = resolveStroke(path, opts);
  const { minX, minY, pad, width, height } = cutoutBounds(path, strokePx);

  const out = document.createElement('canvas');
  out.width = width; out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('dieCut: 无 2d 上下文');

  const p = new Path2D();
  path.forEach((pt, i) => {
    const x = pt.x - minX + pad, y = pt.y - minY + pad;
    if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
  });
  p.closePath();

  // ① 白纸基底 + 外扩白描边（stroke 一半在路径外 = 贴纸白边；圆角连接=手剪圆边）
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = strokePx;
  ctx.stroke(p);
  ctx.fill(p);
  // ② 沿路径裁剪贴入画面（源以原分辨率绘入，路径坐标即源坐标）
  ctx.save();
  ctx.clip(p);
  ctx.drawImage(source as CanvasImageSource, pad - minX, pad - minY);
  ctx.restore();

  const mime = opts.mime ?? 'image/png';
  const blob: Blob = await new Promise((res, rej) => {
    out.toBlob((b) => (b ? res(b) : rej(new Error('dieCut: toBlob 失败（可能源跨域污染）'))), mime, opts.quality);
  });
  return { blob, width, height };
}
