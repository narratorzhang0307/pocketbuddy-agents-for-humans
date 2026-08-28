// ════════════════════════════════════════════════════════════════════════════
// 手帐贴纸包 · 对外唯一入口（桶文件）—— 手帐侧只从这里 import，看不见内部实现
// ────────────────────────────────────────────────────────────────────────────
// 最小契约（依赖倒置）：
//   目录/取数：getStickerCatalog / getStickersByCategory / getSticker / searchStickers
//              STICKER_CATEGORIES / getManifest / MANIFEST
//   渲染：     <StickerArt id size rot/>
//   选择器：   <StickerPicker onPick/>（可选 UI）
//   导出适配器：stickerDataUrl / loadStickerImage（SVG→img，供宿主 composeExport 绘制器）
// 放置/持久化交给宿主手帐（lib/journal 页元素 type:'sticker' + meta.stickerId），本包不自造 store。
// 加载/接线见 reference/integration.md；美术规范见 reference/aesthetic.md。
// ════════════════════════════════════════════════════════════════════════════

// —— 目录 / 取数 / 搜索 ——
export {
  getStickerCatalog,
  getStickersByCategory,
  getSticker,
  searchStickers,
  getManifest,
  STICKER_CATEGORIES,
} from './catalog';
export type { Sticker } from './catalog';

// —— 声明式清单类型 & 常量 ——
export {
  MANIFEST,
  STICKER_PACK_FORMAT,
} from './manifest';
export type {
  StickerCategory,
  StickerCategoryInfo,
  StickerMeta,
  StickerPackManifest,
} from './manifest';

// —— 渲染 & 选择器 ——
export { StickerArt } from './StickerArt';
export type { StickerArtProps } from './StickerArt';
export { StickerPicker } from './StickerPicker';
export type { StickerPickerProps } from './StickerPicker';

// —— 导出适配器（对接宿主手帐 composeExport 的绘制器注入）——
export { stickerDataUrl, loadStickerImage } from './exportAdapter';
