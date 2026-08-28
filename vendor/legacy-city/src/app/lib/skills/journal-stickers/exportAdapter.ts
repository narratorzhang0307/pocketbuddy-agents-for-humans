// ════════════════════════════════════════════════════════════════════════════
// 手帐贴纸 · 导出适配器 —— 把贴纸 SVG 光栅化成 <img>，喂给宿主手帐的整页合成导出
// ────────────────────────────────────────────────────────────────────────────
// 宿主手帐（lib/journal）导出走 composeExport 的「绘制器注入」：图类元素以已加载的
// HTMLImageElement 交给 drawImage。贴纸是内联 SVG（无 width/height），canvas 光栅化前
// 必须注入显式尺寸，否则部分浏览器画不出。这里把贴纸变成宿主可直接 drawImage 的图。
//
// 解耦：本文件只依赖 catalog 的 id→svg，不认识手帐/页/元素；宿主拿 img 后自行按归一坐标绘制。
// ════════════════════════════════════════════════════════════════════════════

import { getSticker } from './catalog';

/** 给贴纸 SVG 注入显式 width/height（按长边像素 + 原生比例）——canvas 光栅化需要 */
function sizedSvg(svg: string, longEdge: number, ratio: number): string {
  const w = ratio >= 1 ? longEdge : Math.round(longEdge * ratio);
  const h = ratio >= 1 ? Math.round(longEdge / ratio) : longEdge;
  return svg.replace(/<svg\b([^>]*)>/, (_m, a) => `<svg${a} width="${w}" height="${h}">`);
}

/** 贴纸 → data:image/svg+xml（可作 <img> src 或 canvas 光栅化源）；找不到返回 null */
export function stickerDataUrl(id: string, longEdge = 256): string | null {
  const s = getSticker(id);
  if (!s || !s.svg) return null;
  const svg = sizedSvg(s.svg, longEdge, s.ratio);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/**
 * 贴纸 → 已解码的 HTMLImageElement（供 composeExport 绘制器 drawImage）。
 * longEdge 建议按导出目标分辨率给足（如 2× 页宽 × 元素占比），保证放大不糊。
 * 失败 / 非浏览器环境返回 null（优雅降级，不毁整页导出）。
 */
export function loadStickerImage(id: string, longEdge = 256): Promise<HTMLImageElement | null> {
  const url = stickerDataUrl(id, longEdge);
  if (!url || typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
