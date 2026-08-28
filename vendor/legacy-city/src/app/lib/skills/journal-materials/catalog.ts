// ════════════════════════════════════════════════════════════════════════════
// 手帐素材 · 运行时契约（catalog）—— 上层唯一依赖的最小接口（依赖倒置 / 关注点分离）
// ────────────────────────────────────────────────────────────────────────────
// 把声明式清单 manifest 展开成运行时可用的 Material[]，对外只暴露极少的纯函数。
// 手帐侧只认这几个函数，看不见 PNG 从哪来——美术怎么换、素材怎么加，都不影响上层。
//
// 与 journal-stickers/catalog 的区别：本包是位图（PNG），path 指向 public 静态资源；
// 渲染由 JournalElementView 用 <img> 直接画，导出由宿主 loadMaterialImage 光栅化。
// ════════════════════════════════════════════════════════════════════════════

import {
  MANIFEST,
  MATERIAL_CATEGORIES,
  type MaterialCategory,
  type MaterialMeta,
  type MaterialPackManifest,
} from './manifest';
import { CURATED_ALIEN_V2_SPECS } from '../../pocket-buddy/curatedStaticBuddySpecs';
import { POCKET_PLANT_ASSETS } from '../../pocket-plants/catalog';

/** 运行时素材 = 声明式元数据 + 静态路径 + 比例（w/h） */
export interface Material extends MaterialMeta {
  path: string;          // 静态资源路径（如 /journal-materials/tape/1.png）
  thumbPath: string;    // 缩略图路径（如 /journal-materials/tape/1_thumb.png），供素材库 UI 用
  ratio: number;         // w / h，供排版按比例定尺寸
}

const CATALOG: Material[] = MANIFEST.materials.map((m) => {
  const path = `${MANIFEST.baseDir}/${m.category}/${m.file}`;
  // 缩略图规则：file.png → file_thumb.png
  // 若磁盘上无对应缩略图（小图未生成），thumbPath 仍指向同路径，
  // MaterialThumb 组件通过 onError 自动回退到原图。
  const thumbPath = path.replace(/\.png$/, '_thumb.png');
  return {
    ...m,
    path,
    thumbPath,
    ratio: m.w / m.h,
  };
});
const BY_ID = new Map<string, Material>(CATALOG.map((m) => [m.id, m]));

// Pocket Buddy alien catalog (treat aliens as a special material category)
const ALIEN_BY_ID = new Map<string, { id: string; path: string; ratio: number; name: string }>();
CURATED_ALIEN_V2_SPECS.forEach((a) => {
  // Aliens are roughly square (1:1) by default; actual ratio determined by image
  ALIEN_BY_ID.set(a.id, { id: a.id, path: a.assetUrl, ratio: 1, name: a.name });
});

// 城市里的散步搭子也可以作为手帐贴纸出现。它们沿用已经在 Forge / 地图使用的
// 透明底立绘，不复制图片、不另造一套素材包；这里只补一层稳定的 journal material id。
const COMPANION_MATERIALS: Material[] = [
  {
    id: 'city-companion-pig', category: 'sticker', name: '小猪哼豆',
    file: 'pig-hengdou.png', w: 512, h: 512, ratio: 1,
    path: '/assets/agent-forge/comic-v1/pig-hengdou.png',
    thumbPath: '/assets/agent-forge/comic-v1/pig-hengdou.png',
  },
  {
    id: 'city-companion-siamese', category: 'sticker', name: '暹罗猫娜娜',
    file: 'siamese-nana.png', w: 512, h: 512, ratio: 1,
    path: '/assets/agent-forge/comic-v1/siamese-nana.png',
    thumbPath: '/assets/agent-forge/comic-v1/siamese-nana.png',
  },
  {
    id: 'city-companion-squirrel', category: 'sticker', name: '小松鼠快门',
    file: 'squirrel-shutter.png', w: 512, h: 512, ratio: 1,
    path: '/assets/agent-forge/comic-v1/squirrel-shutter.png',
    thumbPath: '/assets/agent-forge/comic-v1/squirrel-shutter.png',
  },
  {
    id: 'city-companion-chick', category: 'sticker', name: '小鸡露玛',
    file: 'yellow-chick-luma.png', w: 512, h: 512, ratio: 1,
    path: '/assets/agent-forge/comic-v1/yellow-chick-luma.png',
    thumbPath: '/assets/agent-forge/comic-v1/yellow-chick-luma.png',
  },
];
const COMPANION_BY_ID = new Map(COMPANION_MATERIALS.map((material) => [material.id, material]));

// 第四张杭州样张会把地图里已经存在的口袋植物带回手帐。这里仍然只做
// “稳定 id → 既有透明 PNG”的适配，不复制植物文件，也不把它们塞进通用素材目录。
// 四个旧手帐锚点继续保留稳定 id，但复用入选的植物源图；这样旧手帐不会失效，
// 生产素材仍严格来自同一套 50 株植物目录。
const POCKET_PLANT_MATERIALS: Material[] = [
  {
    id: 'city-plant-blue-lupine', category: 'deco', name: '蓝羽扇豆',
    file: 'blue-lupine.png', w: 245, h: 960, ratio: 245 / 960,
    path: '/assets/pocket-plants/vintage-floral-58.png',
    thumbPath: '/assets/pocket-plants/vintage-floral-58_thumb.png',
  },
  {
    id: 'city-plant-pink-cosmos', category: 'deco', name: '粉色秋英',
    file: 'pink-cosmos-cluster.png', w: 442, h: 960, ratio: 442 / 960,
    path: '/assets/pocket-plants/vintage-floral-57.png',
    thumbPath: '/assets/pocket-plants/vintage-floral-57_thumb.png',
  },
  {
    id: 'city-plant-protea', category: 'deco', name: '帝王花',
    file: 'protea-open.png', w: 433, h: 960, ratio: 433 / 960,
    path: '/assets/pocket-plants/vintage-floral-54.png',
    thumbPath: '/assets/pocket-plants/vintage-floral-54_thumb.png',
  },
  {
    id: 'city-plant-lavender', category: 'deco', name: '薰衣草丛',
    file: 'lavender-cluster.png', w: 239, h: 960, ratio: 239 / 960,
    path: '/assets/pocket-plants/vintage-floral-61.png',
    thumbPath: '/assets/pocket-plants/vintage-floral-61_thumb.png',
  },
  // 50 张复古花卉插画从植物统一目录动态接入（不复制文件、不另造 manifest）
  ...POCKET_PLANT_ASSETS
    .filter((p) => p.id.startsWith('vintage-floral'))
    .map<Material>((p) => {
      const file = p.src.split('/').pop() ?? `${p.id}.png`;
      // 缩略图：file.png → file_thumb.png（已由 _scripts 预生成，max 512px）
      const thumbPath = p.src.replace(/\.png$/, '_thumb.png');
      return {
        id: `city-plant-${p.id}`,
        category: 'deco',
        name: p.name,
        file,
        w: 4000, h: 6000, // 占位比例；实际渲染按 object-fit:contain 不变形
        ratio: 4000 / 6000,
        path: p.src,
        thumbPath,
      };
    }),
];
const POCKET_PLANT_BY_ID = new Map(POCKET_PLANT_MATERIALS.map((material) => [material.id, material]));

/** 全部素材（目录页展开成运行时对象） */
export function getMaterialCatalog(): Material[] { return CATALOG; }

/** 按分类取素材（含 catalog 声明 + 城市搭子 + 植物，保证 deco 分类能看到植物素材） */
export function getMaterialsByCategory(cat: MaterialCategory): Material[] {
  return [
    ...CATALOG.filter((m) => m.category === cat),
    ...COMPANION_MATERIALS.filter((m) => m.category === cat),
    ...POCKET_PLANT_MATERIALS.filter((m) => m.category === cat),
  ];
}

/** 按 id 取单枚素材（支持 journal-materials id 和 alien-v2 id） */
export function getMaterial(id: string): Material | undefined {
  const m = BY_ID.get(id);
  if (m) return m;
  const companion = COMPANION_BY_ID.get(id);
  if (companion) return companion;
  const plant = POCKET_PLANT_BY_ID.get(id);
  if (plant) return plant;
  const a = ALIEN_BY_ID.get(id);
  if (a) {
    return {
      id: a.id,
      category: 'sticker',
      name: a.name,
      file: a.path.split('/').pop() ?? `${a.id}.png`,
      w: 512,
      h: 512,
      path: a.path,
      thumbPath: a.path,
      ratio: a.ratio,
    };
  }
  return undefined;
}

/** 按 id 取 alien 素材专用信息 */
export function getAlienMaterial(id: string) {
  return ALIEN_BY_ID.get(id);
}

/** 分类目录（key / 中文名 / emoji / hint） */
export { MATERIAL_CATEGORIES };

/** 整包清单（导出 / 分发 / 校验用） */
export function getManifest(): MaterialPackManifest { return MANIFEST; }

export type { MaterialCategory, MaterialMeta, MaterialPackManifest };

/**
 * 素材 → 已解码的 HTMLImageElement（供 composeExport 绘制器 drawImage）。
 * 静态 PNG 走 public 路径，crossOrigin 让 canvas 不被污染（导出可 toBlob）。
 * 失败 / 非浏览器环境返回 null（优雅降级，不毁整页导出）。
 */
export function loadMaterialImage(id: string): Promise<HTMLImageElement | null> {
  const m = getMaterial(id);
  if (!m || typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = m.path;
  });
}
