// 照片票根（.skill 解耦核心）：把一张照片 + 地名 + 日期，画成电影票根式的纪念票——
// 奶白票身 / 圆角照片 / 中间虚线撕齿 + 圆缺口 / 右联(英文地名·中文大字·日期) / 锯齿边 /
// 主题色从照片自动取、同色调纯底。参考「照片票根」样例（平潭/南浔/济州岛）。
//
// 「解耦」：纯逻辑（配色取样 / 日期 / 罗马音）全部独立可单测；drawTicketStub 只负责画。
// 与地图无耦合——任意照片（上传/ZINE/OSS）皆可入票根。

export interface TicketStubInput {
  imageUrl: string;        // 照片（blob:/data:/http:）
  placeCn: string;         // 中文地名（大字）
  placeEn?: string;        // 英文地名（缺省由 romanizePlace 猜；仍空则省略英文行）
  date?: string | Date;    // 票面日期 → 「2026 - 6」
  theme?: string;          // 强制主题色 hex（缺省从照片取）
}

const CREAM = '#f4efe2';
const SERIF = '"Times New Roman","Songti SC",Georgia,serif';
const HEI = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

// —— 纯逻辑：票面日期「YYYY - M」；空/非法回落今天（票面总有日期，如参考的 2026-6）——
export function toTicketDate(d?: string | Date): string {
  if (d === undefined || d === null || d === '') d = new Date();
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) {
    const m = String(d).match(/(\d{4})\D+(\d{1,2})/);
    if (m) return `${m[1]} - ${Number(m[2])}`;
    return toTicketDate(new Date());
  }
  return `${dt.getFullYear()} - ${dt.getMonth() + 1}`;
}

// —— 纯逻辑：常见地名罗马音（够 demo 用；命中则给英文行，未命中留空不硬造）——
const ROMAN: Record<string, string> = {
  西湖: 'West Lake', 断桥: 'Broken Bridge', 断桥残雪: 'Broken Bridge', 平湖秋月: 'Pinghu Moon',
  三潭印月: 'Santan', 花港观鱼: 'Huagang', 雷峰塔: 'Leifeng Pagoda', 曲院风荷: 'Quyuan',
  苏堤: 'Su Causeway', 孤山: 'Gu Hill', 灵隐: 'Lingyin', 杭州: 'Hangzhou', 南京: 'Nanjing',
  南京博物院: 'Nanjing Museum', 平潭: 'Pingtan', 南浔: 'Nanxun', 济州岛: 'Jeju Island',
  上海: 'Shanghai', 苏州: 'Suzhou', 北京: 'Beijing',
};
export function romanizePlace(cn: string): string {
  const clean = cn.replace(/^.*·\s*/, '').trim();   // 「西湖 · 断桥残雪」→「断桥残雪」
  return ROMAN[clean] || ROMAN[cn.trim()] || ROMAN[cn.replace(/\s/g, '')] || '';
}

// —— 纯逻辑：从像素采样求主题色（跳过接近纯白/纯黑，加深到可作文字色）——
export function dominantColor(data: Uint8ClampedArray | number[]): { hex: string; bg: string } {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const R = data[i], G = data[i + 1], B = data[i + 2], a = data[i + 3];
    if (a < 200) continue;
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    if (mx > 245 && mn > 235) continue;   // 近白
    if (mx < 24) continue;                // 近黑
    r += R; g += G; b += B; n++;
  }
  if (!n) return { hex: '#7a6b52', bg: CREAM };
  r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
  // 文字色：把均值压深、提饱和一点，保证在奶白票身上够清晰
  const deepen = (v: number) => Math.round(v * 0.62);
  const hex = '#' + [deepen(r), deepen(g), deepen(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
  // 底色：把均值提亮成低饱和的同色调纸感
  const light = (v: number) => Math.round(v + (238 - v) * 0.72);
  const bg = '#' + [light(r), light(g), light(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
  return { hex, bg };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Canvas 画一张照片票根 → PNG dataURL。跨域无 CORS 会取色/导出失败 → 抛错，调用方兜底。 */
export async function drawTicketStub(input: TicketStubInput): Promise<string> {
  const W = 1280, H = 544;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const img = await loadImage(input.imageUrl);

  // —— 主题色：把照片缩到 48×48 采样求均值（跨域无 CORS 时 getImageData 抛错） ——
  let theme = { hex: input.theme ?? '#7a6b52', bg: CREAM };
  if (!input.theme) {
    try {
      const s = document.createElement('canvas'); s.width = 48; s.height = 48;
      const sc = s.getContext('2d')!;
      sc.drawImage(img, 0, 0, 48, 48);
      theme = dominantColor(sc.getImageData(0, 0, 48, 48).data);
    } catch { /* 无 CORS：留默认暖褐 */ }
  } else {
    theme = { hex: input.theme, bg: CREAM };
  }

  // 背景（同色调纸）
  ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H);

  // 票身
  const M = 56, body = { x: M, y: 92, w: W - M * 2, h: H - 184 };
  const splitX = body.x + body.w * 0.665;   // 照片 / 右联 分界
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10;
  roundRectPath(ctx, body.x, body.y, body.w, body.h, 26);
  ctx.fillStyle = CREAM; ctx.fill();
  ctx.restore();

  // 照片（左联，圆角 cover 裁切）
  const pad = 22;
  const ph = { x: body.x + pad, y: body.y + pad, w: splitX - body.x - pad * 1.5, h: body.h - pad * 2 };
  ctx.save();
  roundRectPath(ctx, ph.x, ph.y, ph.w, ph.h, 16); ctx.clip();
  const s = Math.max(ph.w / img.width, ph.h / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, ph.x + (ph.w - dw) / 2, ph.y + (ph.h - dh) / 2, dw, dh);
  ctx.restore();

  // 撕齿虚线 + 上下圆缺口（票根的「沿虚线撕开」）
  ctx.save();
  ctx.strokeStyle = 'rgba(120,110,90,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([3, 7]);
  ctx.beginPath(); ctx.moveTo(splitX, body.y + 16); ctx.lineTo(splitX, body.y + body.h - 16); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = theme.bg;
  for (const cy of [body.y, body.y + body.h]) {
    ctx.beginPath(); ctx.arc(splitX, cy, 17, 0, Math.PI * 2); ctx.fill();
  }

  // 右边缘锯齿（半圆咬边）
  const teeth = 13, tr = (body.h) / (teeth * 2);
  ctx.fillStyle = theme.bg;
  for (let i = 0; i < teeth; i++) {
    const cy = body.y + tr + i * tr * 2;
    ctx.beginPath(); ctx.arc(body.x + body.w, cy, tr, 0, Math.PI * 2); ctx.fill();
  }

  // —— 右联文字 ——
  const rx = splitX + 46;
  const rw = body.x + body.w - rx - 30;
  ctx.fillStyle = theme.hex;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  let ty = body.y + 78;
  const en = input.placeEn ?? romanizePlace(input.placeCn);
  if (en) {
    ctx.font = `bold 46px ${SERIF}`;
    const words = en.split(/\s+/);
    // 双行：尽量把 2 词分两行（像 Jeju / Island）
    const lines = words.length >= 2 ? [words[0], words.slice(1).join(' ')] : [en];
    for (const ln of lines) { ctx.fillText(ln, rx, ty); ty += 52; }
    ty += 6;
  } else {
    ty += 20;
  }
  // 中文大字（字间距）
  ctx.font = `600 58px ${HEI}`;
  const cn = input.placeCn.replace(/^.*·\s*/, '').trim();
  let cx = rx;
  for (const ch of cn) { ctx.fillText(ch, cx, ty); cx += ctx.measureText(ch).width + 12; }
  ty += 56;
  // 日期（字间距）
  ctx.font = `500 30px ${SERIF}`;
  const dateStr = toTicketDate(input.date).split('').join(' ');
  ctx.fillText(dateStr, rx, ty);
  ty += 30;
  // 主题色细分隔线收尾（原条码位置）——不再画条码
  ctx.fillStyle = theme.hex;
  ctx.fillRect(rx, ty + 14, rw, 4);

  return cv.toDataURL('image/png');
}
