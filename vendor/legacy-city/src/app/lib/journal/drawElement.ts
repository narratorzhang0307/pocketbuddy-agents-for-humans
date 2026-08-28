// 漫游手帐 · 元素 → 导出图层（领域绘制器，注入给 composeExport skill）。
// 把一枚 JournalElement（归一坐标 + 已加载的图）翻成一段 canvas 绘制指令，视觉对齐 JournalMaterials。
// exportScale = 导出画布宽 / 屏上画布宽：固定 px 量（字号）× 它，保证导出与屏上比例一致（清晰不糊）。
// 常量在此本地镜写（与 JournalMaterials 对齐），避免 lib 反向依赖 components。
import type { ComposeLayer } from '../skills/composeExport';
import { wrapText } from '../skills/composeExport';
import type { JournalElement } from './types';

const KAI = "'Huiwen Mincho','KingHwa_OldSong','Songti SC','STSong',serif";
// 蓝晒 / 黑白 / 淡彩（与 JournalMaterials.TONE 对齐；canvas 2d 支持同款 filter 链）
const TONE = [
  'grayscale(1) sepia(.35) hue-rotate(175deg) saturate(1.5) brightness(1.02)',
  'grayscale(1) contrast(1.05)',
  'saturate(.4) sepia(.12) contrast(.96)',
];
const KRAFT_POLY = [
  [2, 6], [12, 1], [34, 4], [55, 0], [78, 5], [97, 2], [100, 40],
  [96, 72], [99, 95], [70, 99], [42, 95], [18, 100], [1, 94], [3, 55],
];

export interface DrawOpts { exportScale?: number }

/** 把一枚元素翻成一段导出图层。img 为图类元素已加载好的图（非图类传 null）。 */
export function elementLayer(el: JournalElement, img: HTMLImageElement | null, opts: DrawOpts = {}): ComposeLayer {
  const k = opts.exportScale ?? 1;
  return {
    z: el.z,
    draw: (ctx, size) => {
      const W = size.w, H = size.h;
      const boxW = el.w * W;
      ctx.save();
      ctx.translate(el.x * W, el.y * H);
      ctx.rotate((el.rot * Math.PI) / 180);
      ctx.scale(el.scale, el.scale);
      try { drawBody(ctx, el, img, boxW, k); } catch { /* 单件失败不毁整页 */ }
      ctx.restore();
    },
  };
}

function drawBody(ctx: CanvasRenderingContext2D, el: JournalElement, img: HTMLImageElement | null, boxW: number, k: number) {
  const font = (px: number, family = KAI) => { ctx.font = `${Math.max(6, Math.round(px * k))}px ${family}`; };
  switch (el.type) {
    case 'cutout': case 'ticket': case 'postcard': {
      if (!img) return;
      const h = boxW * (img.height / img.width || 0.75);
      ctx.save();   // 屏上是硬边 die-cut 投影（drop-shadow …0 blur），导出同用 0 blur
      ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 3 * k; ctx.shadowOffsetY = 4 * k;
      ctx.drawImage(img, -boxW / 2, -h / 2, boxW, h);
      ctx.restore();
      return;
    }
    case 'photo': {
      if (el.frame === 'film') {   // 胶片条：4:3 object-cover 裁切 + 上下齿孔（对齐屏上）
        const padX = boxW * 0.05, padY = boxW * 0.08;
        const innerW = boxW - padX * 2, innerH = innerW * 3 / 4;
        const totalH = innerH + padY * 2;
        const x0 = -boxW / 2, y0 = -totalH / 2;
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 8 * k; ctx.shadowOffsetX = 3 * k; ctx.shadowOffsetY = 4 * k;
        ctx.fillStyle = '#181818'; ctx.fillRect(x0, y0, boxW, totalH); ctx.restore();
        if (img) {
          ctx.save(); applyTone(ctx, el.tone);
          ctx.beginPath(); ctx.rect(x0 + padX, y0 + padY, innerW, innerH); ctx.clip();
          drawCover(ctx, img, x0 + padX, y0 + padY, innerW, innerH);
          ctx.restore();
        }
        ctx.fillStyle = '#f2f2f2';   // 齿孔条（top 3% / bottom 91%，高 6%）
        sprocket(ctx, x0 + padX, y0 + totalH * 0.03, innerW, totalH * 0.06, k);
        sprocket(ctx, x0 + padX, y0 + totalH * 0.91, innerW, totalH * 0.06, k);
        return;
      }
      const pad = boxW * 0.04, capH = boxW * 0.11;   // 底白边 11%（对齐屏上 pb-[11%]）
      const innerW = boxW - pad * 2;
      const innerH = innerW * 3 / 4;   // 统一 4:3 相框（对齐屏上 aspectRatio 4/3 + object-cover）
      const totalH = innerH + pad + capH;
      const x0 = -boxW / 2, y0 = -totalH / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 9 * k; ctx.shadowOffsetX = 3 * k; ctx.shadowOffsetY = 4 * k;
      ctx.fillStyle = el.frame === 'black' ? '#141414' : '#ffffff';
      ctx.fillRect(x0, y0, boxW, totalH);
      ctx.restore();
      if (img) {
        ctx.save(); applyTone(ctx, el.tone);
        ctx.beginPath(); ctx.rect(x0 + pad, y0 + pad, innerW, innerH); ctx.clip();
        drawCover(ctx, img, x0 + pad, y0 + pad, innerW, innerH);
        ctx.restore();
      }
      if (el.text) { font(10); ctx.fillStyle = el.frame === 'black' ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.65)'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(el.text, boxW / 2 - pad, y0 + totalH - capH * 0.3); }
      return;
    }
    case 'tape': {
      const h = boxW / 6;
      ctx.globalAlpha = 0.8; ctx.fillStyle = solid(el.color ?? '#e9d8a6'); ctx.fillRect(-boxW / 2, -h / 2, boxW, h); ctx.globalAlpha = 1;
      return;
    }
    case 'sticker': {
      if (img) {   // journal-stickers 贴纸：宿主已 loadStickerImage 光栅化好，按图类元素画（放大不糊）
        const h = boxW * (img.height / img.width || 1);
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 5 * k; ctx.shadowOffsetX = 2 * k; ctx.shadowOffsetY = 3 * k;
        ctx.drawImage(img, -boxW / 2, -h / 2, boxW, h);
        ctx.restore();
        return;
      }
      if (el.meta?.shape === 'seal') {   // 圆朱戳（半透明圆 + 细描边）
        const r2 = boxW / 2;
        ctx.save();
        ctx.globalAlpha = 0.9; ctx.fillStyle = el.color ?? '#c0392b';
        ctx.beginPath(); ctx.arc(0, 0, r2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1; ctx.lineWidth = Math.max(1, boxW * 0.04); ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.stroke();
        ctx.restore();
        return;
      }
      const h = boxW * 3;   // 原色条标签
      ctx.fillStyle = el.color ?? '#c0392b'; ctx.fillRect(-boxW / 2, -h / 2, boxW, h);
      return;
    }
    case 'clip': {
      const s = boxW / 16;   // viewBox 16×34
      ctx.save(); ctx.translate(-boxW / 2, -(34 * s) / 2); ctx.scale(s, s);
      ctx.strokeStyle = '#8a93a0'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(12, 6); ctx.lineTo(12, 24); ctx.arc(8, 24, 4, 0, Math.PI); ctx.lineTo(4, 8); ctx.arc(6.6, 8, 2.6, Math.PI, 0); ctx.lineTo(9.2, 22); ctx.stroke();
      ctx.restore();
      return;
    }
    case 'arrow': {
      const s = boxW / 64;   // viewBox 64×40
      ctx.save(); ctx.translate(-boxW / 2, -(40 * s) / 2); ctx.scale(s, s); ctx.globalAlpha = 0.7;
      ctx.strokeStyle = el.color ?? '#2b3440'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(4, 20); ctx.quadraticCurveTo(22, 8, 34, 20); ctx.quadraticCurveTo(46, 32, 60, 20); ctx.stroke();   // 端点水平，对齐 JournalMaterials
      ctx.beginPath(); ctx.moveTo(52, 14); ctx.lineTo(61, 20); ctx.lineTo(52, 26); ctx.stroke();
      ctx.restore();
      return;
    }
    case 'kraft': {
      const ar = typeof el.meta?.ar === 'number' ? el.meta.ar : 1.3;
      const h = boxW / ar, x0 = -boxW / 2, y0 = -h / 2;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 7 * k; ctx.shadowOffsetY = 3 * k;
      if (el.color) ctx.fillStyle = el.color;
      else { const g = ctx.createLinearGradient(x0, y0, x0 + boxW, y0 + h); g.addColorStop(0, '#cbb593'); g.addColorStop(1, '#bda17c'); ctx.fillStyle = g; }
      ctx.beginPath();
      KRAFT_POLY.forEach(([px, py], i) => { const X = x0 + (px / 100) * boxW, Y = y0 + (py / 100) * h; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
      ctx.closePath(); ctx.fill(); ctx.restore();
      return;
    }
    case 'bubble': case 'note': {
      const isBubble = el.type === 'bubble';
      if (!isBubble && el.meta?.noteVariant === 'locSync') {
        drawLocSyncNote(ctx, el, boxW, k);
        return;
      }
      const ticketVariant = el.meta?.ticketVariant;
      if (!isBubble && (ticketVariant === 'city' || ticketVariant === 'route' || ticketVariant === 'quote' || ticketVariant === 'admit')) {
        drawTicketNote(ctx, el, boxW, k, ticketVariant);
        return;
      }
      // 内边距按 type 分流（对齐屏上：bubble 9%/7%、note 7%/6%）；行高 1.625（leading-relaxed）
      const padX = boxW * (isBubble ? 0.09 : 0.07), padY = boxW * (isBubble ? 0.07 : 0.06);
      const fs = 11;
      font(fs); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const maxW = boxW - padX * 2;
      const lines = wrapText(el.text || (isBubble ? '写点什么…' : '在这里写一句…'), maxW, (s) => ctx.measureText(s).width);
      const lh = Math.round(fs * 1.625 * k);
      const bodyH = lines.length * lh + padY * 2;
      const x0 = -boxW / 2, y0 = -bodyH / 2;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 6 * k; ctx.shadowOffsetX = 2 * k; ctx.shadowOffsetY = 3 * k;
      ctx.fillStyle = el.color ?? '#ffffff';
      if (isBubble) { roundRect(ctx, x0, y0, boxW, bodyH, 14 * k); ctx.fill(); }
      else ctx.fillRect(x0, y0, boxW, bodyH);
      ctx.restore();
      // 方格便签横格线（对齐屏上 repeating 横格，仅未自定义底色时）
      if (!isBubble && !el.color) {
        ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, boxW, bodyH); ctx.clip();
        ctx.strokeStyle = '#dfe8f0'; ctx.lineWidth = Math.max(1, k);
        for (let gy = y0 + 12 * k; gy < y0 + bodyH; gy += 12 * k) { ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x0 + boxW, gy); ctx.stroke(); }
        ctx.restore();
      }
      ctx.fillStyle = '#2b3440';
      lines.forEach((ln, i) => ctx.fillText(ln, x0 + padX, y0 + padY + i * lh));
      return;
    }
    default: return;
  }
}

/** Canvas 导出里的知识库 LOC_SYNC 长条便签，与屏上白卡片保持同一视觉。 */
function drawLocSyncNote(ctx: CanvasRenderingContext2D, el: JournalElement, boxW: number, k: number) {
  const parts = (el.text || '').split('\n').filter(Boolean);
  const meta = parts[0] || 'SOURCE · LOC_SYNC';
  const source = parts.length > 2 ? parts[parts.length - 1] : '';
  const quote = parts.slice(1, source ? -1 : undefined).join(' ') || '在这里写一句…';
  const padX = boxW * 0.06;
  const maxW = boxW - padX * 2;

  ctx.font = `600 ${Math.max(8, Math.round(11 * k))}px ${KAI}`;
  const quoteLines = wrapText(quote, maxW, (s) => ctx.measureText(s).width).slice(0, 2);
  const quoteLh = Math.round(13 * k);
  const h = Math.max(boxW * 0.24, 15 * k + quoteLines.length * quoteLh + (source ? 14 * k : 5 * k));
  const x0 = -boxW / 2, y0 = -h / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.48)'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 3 * k; ctx.shadowOffsetY = 4 * k;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x0, y0, boxW, h);
  ctx.restore();
  ctx.strokeStyle = '#000000'; ctx.lineWidth = Math.max(1, 2 * k); ctx.strokeRect(x0, y0, boxW, h);

  ctx.fillStyle = '#ff00ff'; ctx.beginPath(); ctx.arc(0, y0, 6 * k, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#000000'; ctx.lineWidth = Math.max(1, 2 * k); ctx.stroke();
  ctx.fillStyle = '#000000'; ctx.fillRect(x0 + boxW - 7 * k, y0 - 7 * k, 14 * k, 14 * k);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, k);
  ctx.beginPath();
  ctx.moveTo(x0 + boxW - 3 * k, y0 - 3 * k); ctx.lineTo(x0 + boxW + 3 * k, y0 + 3 * k);
  ctx.moveTo(x0 + boxW + 3 * k, y0 - 3 * k); ctx.lineTo(x0 + boxW - 3 * k, y0 + 3 * k);
  ctx.stroke();

  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.font = `600 ${Math.max(6, Math.round(7 * k))}px monospace`;
  ctx.fillText(meta, x0 + padX, y0 + 7 * k);
  ctx.fillStyle = '#171310'; ctx.font = `600 ${Math.max(8, Math.round(11 * k))}px ${KAI}`;
  quoteLines.forEach((line, i) => ctx.fillText(line, x0 + padX, y0 + 19 * k + i * quoteLh));
  if (source) {
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.font = `600 ${Math.max(6, Math.round(8 * k))}px ${KAI}`;
    ctx.fillText(source, x0 + boxW - padX, y0 + h - 12 * k);
  }
}

/** Canvas 导出里的文字票根。版式与 JournalMaterials.TicketNote 对齐，不把票根退化成普通方格便签。 */
function drawTicketNote(
  ctx: CanvasRenderingContext2D,
  el: JournalElement,
  boxW: number,
  k: number,
  variant: 'city' | 'route' | 'quote' | 'admit',
) {
  const lines = (el.text || '').split('\n').filter(Boolean);
  const title = lines[0] || '漫游票根';
  const detail = lines[1] || '城市 · 地点 · 记忆';
  const meta = lines.slice(2).join(' · ') || 'CTC · FIELD NOTE';
  const ratio = variant === 'quote' ? 0.58 : variant === 'route' ? 0.46 : variant === 'admit' ? 0.50 : 0.52;
  const h = boxW * ratio;
  const x0 = -boxW / 2, y0 = -h / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.26)'; ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 3 * k; ctx.shadowOffsetY = 4 * k;
  ctx.fillStyle = variant === 'admit' ? '#dceadf' : variant === 'route' ? '#f6eed9' : variant === 'quote' ? '#fffaf0' : '#f4ead4';
  ctx.fillRect(x0, y0, boxW, h);
  ctx.restore();
  ctx.strokeStyle = '#171512'; ctx.lineWidth = Math.max(1, 2 * k); ctx.strokeRect(x0, y0, boxW, h);

  const stubW = boxW * (variant === 'route' ? 0.22 : 0.24);
  if (variant === 'quote') {
    ctx.fillStyle = '#b64232'; ctx.fillRect(x0, y0, boxW * 0.05, h);
  } else if (variant === 'route') {
    ctx.fillStyle = '#e66a34'; ctx.fillRect(x0, y0, stubW, h);
    ctx.fillStyle = '#171512'; ctx.font = `700 ${Math.max(6, Math.round(7 * k))}px ${KAI}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('ROUTE', x0 + stubW / 2, y0 + h * 0.36);
    ctx.font = `700 ${Math.max(8, Math.round(14 * k))}px ${KAI}`; ctx.fillText('→', x0 + stubW / 2, y0 + h * 0.66);
  } else {
    const sx = x0 + boxW - stubW;
    ctx.fillStyle = variant === 'admit' ? '#171512' : '#d8e7e0'; ctx.fillRect(sx, y0, stubW, h);
    ctx.save(); ctx.setLineDash([4 * k, 3 * k]); ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = Math.max(1, k);
    ctx.beginPath(); ctx.moveTo(sx, y0); ctx.lineTo(sx, y0 + h); ctx.stroke(); ctx.restore();
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = variant === 'admit' ? '#f4ead0' : '#211b16';
    ctx.font = `600 ${Math.max(6, Math.round(7 * k))}px ${KAI}`;
    ctx.fillText(variant === 'admit' ? '现场' : 'NO.', sx + stubW / 2, y0 + h * 0.26);
    ctx.font = `500 ${Math.max(5, Math.round(6 * k))}px ${KAI}`;
    wrapText(meta, stubW * 0.82, (s) => ctx.measureText(s).width).slice(0, 3)
      .forEach((line, i) => ctx.fillText(line, sx + stubW / 2, y0 + h * 0.48 + i * 8 * k));
  }

  const contentX = x0 + boxW * (variant === 'quote' ? 0.09 : variant === 'route' ? 0.27 : 0.06);
  const contentW = boxW * (variant === 'quote' ? 0.84 : variant === 'route' ? 0.61 : 0.64);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#211b16';
  if (variant === 'quote') {
    ctx.font = `600 ${Math.max(6, Math.round(7 * k))}px ${KAI}`;
    ctx.fillStyle = '#a33b2d'; ctx.fillText('SOURCE · QUOTE', contentX, y0 + h * 0.10);
    ctx.fillStyle = '#211b16'; ctx.font = `600 ${Math.max(8, Math.round(11 * k))}px ${KAI}`;
    wrapText(detail, contentW, (s) => ctx.measureText(s).width).slice(0, 2)
      .forEach((line, i) => ctx.fillText(line, contentX, y0 + h * 0.30 + i * 14 * k));
    ctx.font = `500 ${Math.max(6, Math.round(7 * k))}px ${KAI}`;
    wrapText(meta, contentW, (s) => ctx.measureText(s).width).slice(0, 2)
      .forEach((line, i) => ctx.fillText(line, contentX, y0 + h * 0.72 + i * 10 * k));
    return;
  }

  if (variant === 'route') {
    ctx.font = `600 ${Math.max(7, Math.round(9 * k))}px ${KAI}`;
    ctx.fillText(title, contentX, y0 + h * 0.16);
    ctx.font = `600 ${Math.max(8, Math.round(10 * k))}px ${KAI}`;
    wrapText(detail, contentW, (s) => ctx.measureText(s).width).slice(0, 2)
      .forEach((line, i) => ctx.fillText(line, contentX, y0 + h * 0.40 + i * 12 * k));
    ctx.font = `500 ${Math.max(6, Math.round(7 * k))}px ${KAI}`;
    wrapText(meta, contentW, (s) => ctx.measureText(s).width).slice(0, 2)
      .forEach((line, i) => ctx.fillText(line, contentX, y0 + h * 0.73 + i * 9 * k));
    return;
  }

  ctx.font = `600 ${Math.max(6, Math.round(7 * k))}px ${KAI}`;
  ctx.fillText(variant === 'admit' ? 'ADMIT · MEMORY' : 'CITY · MEMORY', contentX, y0 + h * 0.13);
  ctx.font = `600 ${Math.max(8, Math.round(11 * k))}px ${KAI}`;
  wrapText(title, contentW, (s) => ctx.measureText(s).width).slice(0, 2)
    .forEach((line, i) => ctx.fillText(line, contentX, y0 + h * 0.36 + i * 13 * k));
  ctx.font = `500 ${Math.max(6, Math.round(7 * k))}px ${KAI}`;
  wrapText(detail, contentW, (s) => ctx.measureText(s).width).slice(0, 2)
    .forEach((line, i) => ctx.fillText(line, contentX, y0 + h * 0.68 + i * 9 * k));
}

// 去掉 8 位色的 alpha 尾巴（canvas fillStyle 用不透明色 + 我们自己控 globalAlpha）
function solid(hex: string): string { return hex.length === 9 ? hex.slice(0, 7) : hex; }
// 照片调（蓝晒/黑白/淡彩）；canvas 2d filter 支持则用，否则原色
function applyTone(ctx: CanvasRenderingContext2D, tone?: number) {
  if (tone == null || !('filter' in ctx)) return;
  try { ctx.filter = TONE[tone % TONE.length]; } catch { /* 不支持则原色 */ }
}
// object-cover：把图按目标框长宽比居中裁切绘入（对齐屏上 object-cover）
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, dx: number, dy: number, dw: number, dh: number) {
  const iw = img.width, ih = img.height;
  if (!iw || !ih) { ctx.drawImage(img, dx, dy, dw, dh); return; }
  const destAR = dw / dh, srcAR = iw / ih;
  let sx = 0, sy = 0, sw = iw, sh = ih;
  if (srcAR > destAR) { sw = ih * destAR; sx = (iw - sw) / 2; } else { sh = iw / destAR; sy = (ih - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}
// 胶片齿孔条：4px 亮块 / 9px 周期（屏上 px × k）
function sprocket(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number) {
  const period = 9 * k, dash = 4 * k;
  for (let px = 0; px < w; px += period) ctx.fillRect(x + px, y, dash, h);
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
