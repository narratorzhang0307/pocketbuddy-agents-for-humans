// ════════════════════════════════════════════════════════════════════════════
// 手帐贴纸 · 运行时契约（catalog）—— 上层唯一依赖的最小接口（依赖倒置 / 关注点分离）
// ────────────────────────────────────────────────────────────────────────────
// 把「声明式清单 manifest」与「内联美术 art」合并成运行时可用的 Sticker[]，对外只暴露
// 极少的纯函数。手帐侧只认这几个函数与 <StickerArt>，看不见 SVG 从哪来——
// 美术怎么换、贴纸怎么加，都不影响上层（渐进披露第二/三层在此收口）。
// ════════════════════════════════════════════════════════════════════════════

import {
  MANIFEST,
  STICKER_CATEGORIES,
  type StickerCategory,
  type StickerMeta,
  type StickerPackManifest,
} from './manifest';
import { STICKER_SVG } from './art';

/** 运行时贴纸 = 声明式元数据 + 内联 SVG + 比例（w/h） */
export interface Sticker extends StickerMeta {
  svg: string;
  ratio: number;   // w / h，供排版按比例定尺寸
}

const CATALOG: Sticker[] = MANIFEST.stickers.map((m) => ({
  ...m,
  ratio: m.w / m.h,
  svg: STICKER_SVG[m.id] ?? '',
}));
const BY_ID = new Map<string, Sticker>(CATALOG.map((s) => [s.id, s]));

/** 全部贴纸（目录页展开成运行时对象） */
export function getStickerCatalog(): Sticker[] { return CATALOG; }

/** 按分类取贴纸 */
export function getStickersByCategory(cat: StickerCategory): Sticker[] {
  return CATALOG.filter((s) => s.category === cat);
}

/** 按 id 取单枚贴纸 */
export function getSticker(id: string): Sticker | undefined { return BY_ID.get(id); }

/** 关键词搜索（名称 / 标签 / id） */
export function searchStickers(q: string): Sticker[] {
  const k = q.trim().toLowerCase();
  if (!k) return CATALOG;
  return CATALOG.filter(
    (s) => s.name.includes(k) || s.id.includes(k) || s.tags.some((t) => t.toLowerCase().includes(k)),
  );
}

/** 分类目录（key / 中文名 / emoji） */
export { STICKER_CATEGORIES };

/** 整包清单（导出 / 分发 / 校验用） */
export function getManifest(): StickerPackManifest { return MANIFEST; }

export type { StickerCategory, StickerMeta, StickerPackManifest };
