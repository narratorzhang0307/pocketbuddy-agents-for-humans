// ════════════════════════════════════════════════════════════════════════════
// 手帐素材包 · 对外唯一入口（桶文件）—— 手帐侧只从这里 import，看不见内部实现
// ────────────────────────────────────────────────────────────────────────────
// 最小契约（依赖倒置）：
//   目录/取数：getMaterialCatalog / getMaterialsByCategory / getMaterial
//              MATERIAL_CATEGORIES / getManifest / MANIFEST
//   渲染：     <MaterialThumb>（选择器里的缩略图）
//   选择器：   <MaterialLibrary onPick/>（分类展开 + 点击添加）
//   导出适配器：loadMaterialImage（PNG→img，供宿主 composeExport 绘制器）
// 放置/持久化交给宿主手帐（lib/journal 页元素 type:'sticker' + meta.materialId），本包不自造 store。
// ════════════════════════════════════════════════════════════════════════════

// —— 目录 / 取数 ——
export {
  getMaterialCatalog,
  getMaterialsByCategory,
  getMaterial,
  getAlienMaterial,
  loadMaterialImage,
  MATERIAL_CATEGORIES,
} from './catalog';
export type { Material } from './catalog';

// —— 声明式清单类型 & 常量 ——
export {
  MANIFEST,
  MATERIAL_PACK_FORMAT,
} from './manifest';
export type {
  MaterialCategory,
  MaterialCategoryInfo,
  MaterialMeta,
  MaterialPackManifest,
} from './manifest';

// —— 选择器 ——
export { MaterialLibrary } from './MaterialLibrary';
export type { MaterialLibraryProps } from './MaterialLibrary';

// —— 缩略图（选择器与元素视图共用） ——
export { MaterialThumb } from './MaterialLibrary';
