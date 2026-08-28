// ════════════════════════════════════════════════════════════════════════════
// 可复用 Skill（app 层）· 整页合成导出 —— 把 N 个自由摆放的图层按 z 序端侧合成一张 PNG
// ────────────────────────────────────────────────────────────────────────────
// 手帐拼贴台的「导出一张可分享的手帐图」不引 html2canvas/dom-to-image（项目纪律），改用纯 Canvas 合成：
// 每个元素怎么画由【调用方注入的 draw 绘制器】负责——本 skill 不认识手帐/照片/胶带任何领域类型，
// 只管「按 z 排序 → 等字体就绪 → 铺底 → 逐层绘制 → toBlob」。领域差异全在注入的 draw 里。
//
// 关注点分离 + 依赖倒置：调用方依赖「图层数组 + 画布尺寸」的输入契约，绘制实现随领域注入。
// 直接按目标（2×）分辨率渲染，规避 DOM 截图的模糊。
// ════════════════════════════════════════════════════════════════════════════

export interface ComposeSize { w: number; h: number }
export interface ComposeLayer {
  z: number;
  draw: (ctx: CanvasRenderingContext2D, size: ComposeSize) => void | Promise<void>;
}
export interface ComposeOptions {
  background?: string | ((ctx: CanvasRenderingContext2D, size: ComposeSize) => void);
  mime?: string;         // 默认 image/png
  quality?: number;      // jpeg/webp 时用
  awaitFonts?: boolean;  // 默认 true：等 document.fonts.ready 再画，避免落 fallback 字体
}

/** 纯逻辑：按 z 升序排出绘制顺序（稳定，可 node 单测）。 */
export function orderLayers<T extends { z: number }>(layers: T[]): T[] {
  return layers.map((l, i) => ({ l, i })).sort((a, b) => a.l.z - b.l.z || a.i - b.i).map((x) => x.l);
}

/**
 * 纯逻辑：把一段文字按最大宽度折行（中文按字断、拉丁按词断）。measure 注入以便 node 单测。
 * 返回每行文本；显式换行符 \n 强制换行。
 */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (para === '') { out.push(''); continue; }
    let line = '';
    // 以「CJK 单字」或「拉丁词（含尾随空格）」为最小折行单元
    const tokens = para.match(/[一-鿿　-〿＀-￯]|[^\s一-鿿]+\s*|\s+/g) ?? [para];
    for (const tk of tokens) {
      // 单 token 本身就超宽（长 URL / 长英文 / 连续数字）→ 按字符硬断，避免溢出盒子
      if (measure(tk.replace(/^\s+/, '')) > maxWidth) {
        if (line) { out.push(line.replace(/\s+$/, '')); line = ''; }
        for (const ch of tk.replace(/^\s+/, '')) {
          if (line && measure(line + ch) > maxWidth) { out.push(line); line = ch; }
          else line += ch;
        }
        continue;
      }
      const trial = line + tk;
      if (line && measure(trial) > maxWidth) { out.push(line.replace(/\s+$/, '')); line = tk.replace(/^\s+/, ''); }
      else line = trial;
    }
    out.push(line.replace(/\s+$/, ''));
  }
  return out;
}

/** 把 N 个图层合成一张 PNG blob（按目标分辨率直接渲染）。 */
export async function composeExport(layers: ComposeLayer[], size: ComposeSize, opts: ComposeOptions = {}): Promise<Blob> {
  const fonts = typeof document !== 'undefined' ? (document as Document & { fonts?: FontFaceSet }).fonts : undefined;
  if (opts.awaitFonts !== false && fonts) {
    try { await fonts.ready; } catch { /* 字体就绪失败不阻塞导出 */ }
  }
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(size.w));
  cv.height = Math.max(1, Math.round(size.h));
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('composeExport: 无 2d 上下文');

  if (typeof opts.background === 'function') opts.background(ctx, size);
  else { ctx.fillStyle = opts.background ?? '#f4efe2'; ctx.fillRect(0, 0, cv.width, cv.height); }

  for (const layer of orderLayers(layers)) {
    ctx.save();
    try { await layer.draw(ctx, { w: cv.width, h: cv.height }); } catch { /* 单个图层画失败不毁整页 */ }
    ctx.restore();
  }

  return await new Promise((res, rej) => {
    cv.toBlob((b) => (b ? res(b) : rej(new Error('composeExport: toBlob 失败'))), opts.mime ?? 'image/png', opts.quality);
  });
}
