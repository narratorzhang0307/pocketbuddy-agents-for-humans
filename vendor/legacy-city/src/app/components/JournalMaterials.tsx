// 漫游手帐 · 材质件（可实例化、可摆放）：深度学习「漫游手帐」参考的拼贴语言——
// 牛皮纸 / 和纸胶带 / 回形针 / 拍立得 / 手绘箭头 / 色条标签 / 气泡文字 / 方格便签 / 票根图。
// 全部 CSS/SVG 现场造、零外部资源；每件填满父盒（宽 100%，高由内容/长宽比推得），
// 几何（位置/旋转/缩放/层级）由 CollageCanvas 的定位盒负责，材质件只管「长什么样」。
// 与 ZineBook 的私有材质同源但【受控 vs seed 自动排版】性质不同：这里吃元素 props、可编辑。
import type { JournalElement } from '../lib/journal/types';
import { StickerArt, getSticker } from '../lib/skills/journal-stickers';   // 只认桶文件契约（解耦：不碰其内部）
import { getMaterial } from '../lib/skills/journal-materials';   // 位图素材包（PNG，与矢量贴纸互补）

// 与漫游地图古籍票根同一套活字油墨字体：汇文明朝体 → 京華老宋体 → 系统宋体。
export const INK_FONT = "'Huiwen Mincho','KingHwa_OldSong','Songti SC','STSong',serif";
export const TAPE = ['#e9d8a6cc', '#cde7f0cc', '#f0cdd8cc', '#d4f0cdcc', '#f0e2c0cc'];
export const TAG = ['#c0392b', '#1a1a1a', '#3c5a78', '#4a7a53'];
// 蓝晒 / 黑白 / 淡彩（与 ZineBook TONE 对齐；photo 元素的 tone 下标指这里）
export const TONE = [
  'grayscale(1) sepia(.35) hue-rotate(175deg) saturate(1.5) brightness(1.02)',
  'grayscale(1) contrast(1.05)',
  'saturate(.4) sepia(.12) contrast(.96)',
];

/** 透明底贴纸 / 票根 / 明信片：原样贴，带硬边投影（die-cut 感）。 */
export function MaterialImage({ url }: { url: string }) {
  return (
    <img src={url} alt="" draggable={false} className="block w-full select-none"
      style={{ filter: 'drop-shadow(3px 4px 0 rgba(0,0,0,0.28))' }} />
  );
}

/** 拍立得：三种画框（白 / 黑 / 胶片条）+ 可选滤镜档 + 手写日期。 */
export function Polaroid({ url, frame = 'white', tone, caption }: {
  url: string; frame?: JournalElement['frame']; tone?: number; caption?: string;
}) {
  const filter = tone != null ? TONE[tone % TONE.length] : undefined;
  if (frame === 'film') {
    const holes = { background: 'repeating-linear-gradient(90deg,#f2f2f2 0 4px,transparent 4px 9px)' };
    return (
      <div className="bg-[#181818] relative w-full" style={{ padding: '8% 5%', boxShadow: '3px 4px 8px rgba(0,0,0,0.35)' }}>
        <div className="absolute left-[5%] right-[5%] top-[3%] h-[6%]" style={holes} />
        <img src={url} alt="" draggable={false} className="w-full block object-cover select-none" style={{ filter, aspectRatio: '4 / 3' }} />
        <div className="absolute left-[5%] right-[5%] bottom-[3%] h-[6%]" style={holes} />
      </div>
    );
  }
  const dark = frame === 'black';
  return (
    <div className={`${dark ? 'bg-[#141414]' : 'bg-white'} relative w-full`} style={{ padding: '4%', paddingBottom: '11%', boxShadow: '3px 4px 9px rgba(0,0,0,0.3)' }}>
      <img src={url} alt="" draggable={false} className="w-full block object-cover select-none" style={{ filter, aspectRatio: '4 / 3' }} />
      {caption && (
        <div className={`absolute bottom-[2%] right-[6%] text-[10px] ${dark ? 'text-white/85' : 'text-black/65'}`} style={{ fontFamily: INK_FONT }}>{caption}</div>
      )}
    </div>
  );
}

/** 和纸胶带：半透明彩色条（贴照片/便签用）。加微投影 + 内壁高光，像哑光胶带微微浮起。 */
export function Tape({ color = TAPE[0] }: { color?: string }) {
  return (
    <div className="w-full border border-black/10" style={{ aspectRatio: '6 / 1', background: color, boxShadow: '0 1px 2px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.25)' }} />
  );
}

/** 回形针（SVG）。 */
export function PaperClip() {
  return (
    <svg viewBox="0 0 16 34" className="w-full block drop-shadow-[1px_1px_1px_rgba(0,0,0,0.25)]" style={{ aspectRatio: '16 / 34' }}>
      <path d="M12 6 v18 a4 4 0 0 1 -8 0 V8 a2.6 2.6 0 0 1 5.2 0 v14" fill="none" stroke="#8a93a0" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** 色条标签 / 圆朱戳。shape='seal' 渲染成半透明圆戳（盖在点位标签角上）。 */
export function Sticker({ color = TAG[0], shape }: { color?: string; shape?: string }) {
  if (shape === 'seal') {
    return <div className="w-full rounded-full border" style={{ aspectRatio: '1 / 1', background: color, borderColor: 'rgba(0,0,0,0.28)', opacity: 0.9, boxShadow: '1px 1px 0 rgba(0,0,0,0.15)' }} />;
  }
  return <div className="w-full" style={{ aspectRatio: '1 / 3', background: color, boxShadow: '1px 1px 0 rgba(0,0,0,0.15)' }} />;
}

/** 手绘连接箭头（端点水平，rotate 后精确沿 A→B 连两点；quadratic 波浪 + 箭头头）。 */
export function Arrow({ color = '#2b3440', flip = false }: { color?: string; flip?: boolean }) {
  return (
    <svg viewBox="0 0 64 40" className="w-full block" style={{ aspectRatio: '64 / 40', transform: flip ? 'scaleX(-1)' : undefined, opacity: 0.7 }}>
      <path d="M4 20 Q 22 8 34 20 T 60 20" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M52 14 L61 20 L52 26" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 牛皮纸撕边块（衬底材质）。 */
export function Kraft({ color, ar = 1.3 }: { color?: string; ar?: number }) {
  return (
    <div className="w-full" style={{
      aspectRatio: `${ar}`,
      background: color ?? 'linear-gradient(135deg,#cbb593,#bda17c)',
      clipPath: 'polygon(2% 6%, 12% 1%, 34% 4%, 55% 0%, 78% 5%, 97% 2%, 100% 40%, 96% 72%, 99% 95%, 70% 99%, 42% 95%, 18% 100%, 1% 94%, 3% 55%)',
      boxShadow: '2px 3px 7px rgba(0,0,0,0.18)',
    }} />
  );
}

/** 气泡文字注记（AnyPiece 引言气泡）：圆角气泡 + 小尾巴，文字可由 CollageCanvas 编辑。 */
export function Bubble({ text, color = '#ffffff' }: { text?: string; color?: string }) {
  return (
    <div className="relative w-full">
      <div className="w-full px-[9%] py-[7%]" style={{ background: color, borderRadius: 14, boxShadow: '2px 3px 6px rgba(0,0,0,0.2)' }}>
        <span className="block text-[11px] font-semibold leading-relaxed text-[#2d2118] whitespace-pre-wrap break-words" style={{ fontFamily: INK_FONT }}>
          {text || '写点什么…'}
        </span>
      </div>
      <div className="absolute -bottom-1.5 left-5 w-3 h-3 rotate-45" style={{ background: color }} />
    </div>
  );
}

/** 方格便签（手写小记）。 */
export function Note({ text, color }: { text?: string; color?: string }) {
  return (
    <div className="w-full px-[7%] py-[6%] border border-black/10" style={{
      background: color ?? 'repeating-linear-gradient(0deg,#fff 0 11px,#dfe8f0 11px 12px), #fff',
      boxShadow: '2px 3px 6px rgba(0,0,0,0.18)',
    }}>
      <span className="block text-[11px] font-semibold leading-relaxed text-[#2d2118] whitespace-pre-wrap break-words" style={{ fontFamily: INK_FONT }}>
        {text || '在这里写一句…'}
      </span>
    </div>
  );
}

/** 知识库 LOC_SYNC 长条便签：白纸、黑粗边、硬阴影与粉色定位钉。 */
export function LocSyncNote({ text }: { text?: string }) {
  const lines = (text || '').split('\n').filter(Boolean);
  const meta = lines[0] || 'SOURCE · LOC_SYNC';
  const source = lines.length > 2 ? lines[lines.length - 1] : '';
  const quote = lines.slice(1, source ? -1 : undefined).join(' ') || '在这里写一句…';
  return (
    <div className="relative w-full border-2 border-black bg-white px-[5%] py-[3.5%] shadow-[3px_4px_0_rgba(0,0,0,0.48)]" style={{ fontFamily: INK_FONT, containerType: 'inline-size' }}>
      <span className="absolute -top-2 left-1/2 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-black bg-[#ff00ff]" />
      <span aria-hidden className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center border border-black bg-black text-[10px] font-bold leading-none text-white">×</span>
      <div className="font-pixel text-[clamp(6px,5.5cqw,8px)] font-semibold tracking-[0.14em] text-black/55">{meta}</div>
      <div
        className="mt-0.5 overflow-hidden text-[clamp(9px,8cqw,12px)] font-semibold leading-[1.2] text-[#171310] break-words"
        style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 }}
      >{quote}</div>
      {source && <div className="mt-1 text-right text-[clamp(7px,6cqw,9px)] font-semibold leading-none text-black/55">{source}</div>}
    </div>
  );
}

type TicketNoteVariant = 'city' | 'route' | 'quote' | 'admit';

/**
 * 可编辑的文字票根：不依赖图片，仍然是普通 note 元素，因此可以自由拖动、旋转、删改文字。
 * 四种版式分别对应城市收录、漫游路线、原文书摘与现场召回，避免只是重复贴同一张登机牌。
 */
export function TicketNote({ text, variant = 'city' }: { text?: string; variant?: TicketNoteVariant }) {
  const lines = (text || '').split('\n').filter(Boolean);
  const title = lines[0] || '漫游票根';
  const detail = lines[1] || '城市 · 地点 · 记忆';
  const meta = lines.slice(2).join(' · ') || 'CTC · FIELD NOTE';

  if (variant === 'route') {
    return (
      <div className="relative w-full overflow-hidden border-2 border-[#171512] bg-[#f6eed9] shadow-[3px_4px_0_rgba(0,0,0,0.26)]" style={{ fontFamily: INK_FONT, containerType: 'inline-size' }}>
        <div className="flex min-h-[54px]">
          <div className="flex w-[22%] shrink-0 flex-col items-center justify-center bg-[#e66a34] px-1 text-[#171512]">
            <span className="text-[clamp(6px,6cqw,8px)] font-semibold tracking-[0.14em]">ROUTE</span>
            <span className="mt-0.5 text-[clamp(12px,12cqw,16px)] font-bold leading-none">→</span>
          </div>
          <div className="min-w-0 flex-1 px-[5%] py-[4%] text-[#211b16]">
            <div className="text-[clamp(8px,8cqw,10px)] font-semibold tracking-[0.06em]">{title}</div>
            <div className="mt-0.5 text-[clamp(9px,9cqw,11px)] font-semibold leading-tight">{detail}</div>
            <div className="mt-1 border-t border-dashed border-black/45 pt-1 text-[clamp(6px,6cqw,7px)] font-medium tracking-[0.06em] opacity-65">{meta}</div>
          </div>
          <div className="w-[10%] shrink-0 border-l-2 border-dashed border-black/45 bg-[#f1d36d]" />
        </div>
      </div>
    );
  }

  if (variant === 'quote') {
    return (
      <div className="relative w-full overflow-hidden border-2 border-[#171512] bg-[#fffaf0] px-[8%] py-[7%] shadow-[3px_4px_0_rgba(0,0,0,0.24)]" style={{ fontFamily: INK_FONT, containerType: 'inline-size' }}>
        <div className="absolute inset-y-0 left-0 w-[5%] bg-[#b64232]" />
        <div className="text-[clamp(6px,6cqw,8px)] font-semibold tracking-[0.16em] text-[#a33b2d]">SOURCE · QUOTE</div>
        <div className="mt-1 max-h-[2.7em] overflow-hidden text-[clamp(9px,9cqw,12px)] font-semibold leading-snug text-[#211b16]">{detail}</div>
        <div className="mt-1 border-t border-dotted border-black/40 pt-1 text-[clamp(7px,7cqw,8px)] font-medium text-[#4c3b2f]">{meta}</div>
        <div className="absolute right-[5%] top-[7%] h-3.5 w-3.5 rounded-full border border-[#b64232] text-center text-[7px] font-semibold leading-[12px] text-[#b64232]">引</div>
      </div>
    );
  }

  if (variant === 'admit') {
    return (
      <div className="relative w-full overflow-hidden border-2 border-[#171512] bg-[#dceadf] shadow-[3px_4px_0_rgba(0,0,0,0.25)]" style={{ fontFamily: INK_FONT, containerType: 'inline-size' }}>
        <div className="flex min-h-[58px]">
          <div className="min-w-0 flex-1 px-[7%] py-[5%] text-[#172219]">
            <div className="text-[clamp(6px,6cqw,7px)] font-semibold tracking-[0.14em]">ADMIT · MEMORY</div>
            <div className="mt-1 text-[clamp(9px,9cqw,12px)] font-semibold leading-tight">{title}</div>
            <div className="mt-0.5 text-[clamp(7px,7cqw,8px)] font-medium leading-tight opacity-75">{detail}</div>
          </div>
          <div className="flex w-[23%] shrink-0 flex-col items-center justify-center border-l-2 border-dashed border-black/50 bg-[#171512] px-1 text-[#f4ead0]">
            <span className="text-[clamp(6px,6cqw,7px)] font-semibold tracking-widest">现场</span>
            <span className="mt-1 break-all text-[clamp(5px,5cqw,6px)] font-medium opacity-75">{meta}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden border-2 border-[#171512] bg-[#f4ead4] shadow-[3px_4px_0_rgba(0,0,0,0.25)]" style={{ fontFamily: INK_FONT, containerType: 'inline-size' }}>
      <div className="flex min-h-[58px]">
        <div className="min-w-0 flex-1 px-[7%] py-[5%] text-[#211b16]">
          <div className="text-[clamp(6px,6cqw,7px)] font-semibold tracking-[0.14em]">CITY · MEMORY</div>
          <div className="mt-1 text-[clamp(9px,9cqw,12px)] font-semibold leading-tight">{title}</div>
          <div className="mt-0.5 text-[clamp(7px,7cqw,8px)] font-medium leading-tight opacity-75">{detail}</div>
        </div>
        <div className="flex w-[25%] shrink-0 flex-col items-center justify-center border-l-2 border-dashed border-black/45 bg-[#d8e7e0] px-1 text-center text-[#211b16]">
          <span className="text-[clamp(5px,5cqw,6px)] font-semibold tracking-[0.12em]">NO.</span>
          <span className="mt-1 break-all text-[clamp(6px,6cqw,7px)] font-semibold leading-tight">{meta}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * 元素视图分发器：按 type 渲染对应材质件（填满 CollageCanvas 给的定位盒）。
 * url 为图类元素解析好的 objectURL；图未就绪时占位。
 */
export function JournalElementView({ el, url }: { el: JournalElement; url?: string | null }) {
  switch (el.type) {
    case 'cutout':
    case 'ticket':
    case 'postcard':
      return url ? <MaterialImage url={url} /> : <ImgPlaceholder />;
    case 'photo':
      return url ? <Polaroid url={url} frame={el.frame} tone={el.tone} caption={el.text} /> : <ImgPlaceholder />;
    case 'tape': return <Tape color={el.color} />;
    case 'clip': return <PaperClip />;
    case 'sticker': {
      // journal-materials 位图素材：静态 PNG，直接 <img>（与 cutout/ticket 同走 MaterialImage）
      const mid = el.meta?.materialId;
      if (typeof mid === 'string') {
        const m = getMaterial(mid);
        if (m) return <MaterialImage url={m.path} />;
      }
      // journal-stickers 矢量贴纸：内联 SVG，按原生比例画
      const sid = el.meta?.stickerId;
      if (sid) {
        const ratio = getSticker(String(sid))?.ratio ?? 1;
        return <StickerArt id={String(sid)} style={{ width: '100%', height: 'auto', aspectRatio: String(ratio) }} />;
      }
      return <Sticker color={el.color} shape={typeof el.meta?.shape === 'string' ? el.meta.shape : undefined} />;
    }
    case 'arrow': return <Arrow color={el.color} flip={!!el.meta?.flip} />;
    case 'kraft': return <Kraft color={el.color} ar={typeof el.meta?.ar === 'number' ? el.meta.ar : 1.3} />;
    case 'bubble': return <Bubble text={el.text} color={el.color} />;
    case 'note': {
      if (el.meta?.noteVariant === 'locSync') return <LocSyncNote text={el.text} />;
      if (el.meta?.noteVariant === 'birdCapture') return <BirdCaptureNote text={el.text} color={el.color} />;
      const variant = el.meta?.ticketVariant;
      if (variant === 'city' || variant === 'route' || variant === 'quote' || variant === 'admit') {
        return <TicketNote text={el.text} variant={variant} />;
      }
      return <Note text={el.text} color={el.color} />;
    }
    default: return null;
  }
}

function BirdCaptureNote({ text, color }: { text?: string; color?: string }) {
  return (
    <div className="bird-capture-note" style={{ '--bird-capture-color': color ?? '#fff6db' } as React.CSSProperties}>
      <div className="bird-capture-note__head"><span>FIELD CAPTURE</span><span className="bird-capture-note__dot" /></div>
      <div className="bird-capture-note__body">{text || '观察记录'}</div>
    </div>
  );
}

function ImgPlaceholder() {
  return <div className="w-full bg-black/10 border border-dashed border-black/25" style={{ aspectRatio: '4 / 3' }} />;
}
