// ════════════════════════════════════════════════════════════════════════════
// 手帐贴纸 · 渲染组件 <StickerArt> —— 把一枚贴纸的内联 SVG 无状态地画到 DOM
// ────────────────────────────────────────────────────────────────────────────
// 两个健壮性处理（逻辑抽在 svgNamespace.ts，可 node 单测）：
// 1) id 命名空间化：给每个实例的 SVG 内部 id / url(#..) / href 加唯一前缀，
//    同一页贴很多枚也不会因内部 filter/gradient 重名而串味。
// 2) 让根 <svg> 铺满容器且不裁剪投影（width/height=100% + overflow:visible）。
// 尺寸由 size（长边像素）+ 贴纸原生比例决定；rot 叠加旋转。纯展示、无副作用。
// ════════════════════════════════════════════════════════════════════════════

import { useId } from 'react';
import { getSticker } from './catalog';
import { fillSvgRoot, namespaceSvgIds } from './svgNamespace';

export interface StickerArtProps {
  id: string;                       // 贴纸 id
  size?: number;                    // 长边像素（默认 72）
  rot?: number;                     // 旋转角（度）
  className?: string;
  style?: React.CSSProperties;
  title?: string;                   // 悬浮/无障碍名称（默认贴纸中文名）
}

/** 无状态渲染一枚贴纸；找不到该 id 时返回 null（优雅降级） */
export function StickerArt({ id, size = 72, rot = 0, className, style, title }: StickerArtProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const sticker = getSticker(id);
  if (!sticker || !sticker.svg) return null;

  const ratio = sticker.ratio || 1;               // w/h
  const w = ratio >= 1 ? size : Math.round(size * ratio);
  const h = ratio >= 1 ? Math.round(size / ratio) : size;
  const html = fillSvgRoot(namespaceSvgIds(sticker.svg, uid));

  return (
    <span
      role="img"
      aria-label={title || sticker.name}
      title={title || sticker.name}
      className={className}
      style={{
        display: 'inline-block',
        width: w,
        height: h,
        lineHeight: 0,
        transform: rot ? `rotate(${rot}deg)` : undefined,
        ...style,
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
