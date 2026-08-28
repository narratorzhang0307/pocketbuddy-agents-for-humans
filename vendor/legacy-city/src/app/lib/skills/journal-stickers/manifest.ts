// ════════════════════════════════════════════════════════════════════════════
// 手帐贴纸包 · 声明式清单（sticker-pack/v1）—— 目录页 + 元数据（渐进披露第一层）
// ────────────────────────────────────────────────────────────────────────────
// 格式规范化自黄佳《Claude Code 实战：Harness 工程之道》Skills 章节，并对齐本仓已有的
// 内容包先例 roam/mapSkills.ts（map-skill/v1）：
// - 包名 kebab-case、[a-z0-9-]、≤64 字（跨平台「世界语」）；中文展示名放元数据、不进包名。
// - description 按「做什么 + 何时用 + 不适用」三段写——它是用户/上层决定要不要加载的唯一信号。
// - 声明式、自包含、品牌中立：一份清单 + 一批内联 SVG 即全部内容，复制即安装、不绑平台。
// - 渐进披露：常驻仅本清单（id/名称/标签）→ 用到才取 art/ 里的 SVG（见 catalog.ts）。
//
// 本文件只声明「有哪些贴纸、长什么比例、默认怎么歪」——不含美术、不碰持久化、不依赖 app 数据。
// 美术在 art/*.ts；运行时契约在 catalog.ts；渲染在 StickerArt.tsx；导出适配在 exportAdapter.ts。
// 放置/持久化交给宿主手帐（lib/journal 页元素 type:'sticker'+meta.stickerId），本包不自造 store。
// ════════════════════════════════════════════════════════════════════════════

export const STICKER_PACK_FORMAT = 'sticker-pack/v1';

export type StickerCategory =
  | 'camera' | 'animal' | 'washi' | 'travel' | 'frame' | 'nature' | 'weather' | 'deco';

/** 一枚贴纸的声明式元数据（不含 SVG——美术在 art/，运行时由 catalog 合并） */
export interface StickerMeta {
  id: string;            // kebab-case，全包唯一，如 'camera-instant'
  category: StickerCategory;
  name: string;          // 中文展示名
  tags: string[];        // 检索/搜索词
  w: number;             // 原生 viewBox 宽（用于比例，不写死像素）
  h: number;             // 原生 viewBox 高
  defaultRot: number;    // 建议随手贴的歪度（度）
}

export interface StickerCategoryInfo {
  key: StickerCategory;
  label: string;         // 中文分类名
  emoji: string;         // 分类小图标
}

/** .stickers 包本体（自包含、declarative、可导出/分发的清单） */
export interface StickerPackManifest {
  format: typeof STICKER_PACK_FORMAT;
  name: string;          // kebab-case 包名
  displayName: string;   // 中文展示名
  description: string;   // 做什么 + 何时用 + 不适用，≤1024 字
  version: string;
  author?: string;
  categories: StickerCategoryInfo[];
  stickers: StickerMeta[];
}

export const STICKER_CATEGORIES: StickerCategoryInfo[] = [
  { key: 'camera',  label: '相机',    emoji: '📷' },
  { key: 'animal',  label: '小动物',  emoji: '🐾' },
  { key: 'washi',   label: '胶带',    emoji: '🎀' },
  { key: 'travel',  label: '旅行',    emoji: '✈️' },
  { key: 'frame',   label: '相框',    emoji: '🖼️' },
  { key: 'nature',  label: '花草',    emoji: '🌿' },
  { key: 'weather', label: '天气',    emoji: '☀️' },
  { key: 'deco',    label: '挂件·标签', emoji: '✨' },
];

const STICKERS: StickerMeta[] = [
  // —— 相机 ——
  { id: 'camera-instant',  category: 'camera',  name: '拍立得相机',     tags: ['相机', '拍立得', '旅行', '拍照'], w: 100, h: 96,  defaultRot: -6 },
  { id: 'camera-retro',    category: 'camera',  name: '复古胶片相机',   tags: ['相机', '胶片', '复古', '拍照'],   w: 100, h: 78,  defaultRot: 5 },
  { id: 'camera-snap',     category: 'camera',  name: '方形拍立得',     tags: ['相机', '拍立得', '照片'],         w: 92,  h: 100, defaultRot: -4 },
  { id: 'film-strip',      category: 'camera',  name: '胶片条',         tags: ['胶片', '电影', '旅行'],           w: 54,  h: 100, defaultRot: 8 },

  // —— 小动物 ——
  { id: 'bird-sparrow',    category: 'animal',  name: '麻雀',           tags: ['小动物', '鸟', '麻雀', '可爱'],   w: 100, h: 82,  defaultRot: -3 },
  { id: 'cat-peek',        category: 'animal',  name: '探头猫',         tags: ['小动物', '猫', '探头', '可爱'],   w: 100, h: 84,  defaultRot: 4 },
  { id: 'dol-hareubang',   category: 'animal',  name: '石头爷爷',       tags: ['济州岛', '石像', '特产', '旅行'], w: 84,  h: 100, defaultRot: -5 },
  { id: 'corgi',           category: 'animal',  name: '柯基',           tags: ['小动物', '狗', '柯基', '可爱'],   w: 100, h: 80,  defaultRot: 3 },
  { id: 'rabbit',          category: 'animal',  name: '小兔子',         tags: ['小动物', '兔子', '可爱'],         w: 78,  h: 100, defaultRot: -4 },
  { id: 'bear',            category: 'animal',  name: '小熊',           tags: ['小动物', '熊', '可爱'],           w: 90,  h: 100, defaultRot: 5 },
  { id: 'whale',           category: 'animal',  name: '鲸鱼',           tags: ['小动物', '鲸鱼', '海洋', '旅行'], w: 100, h: 72,  defaultRot: -3 },
  { id: 'duck',            category: 'animal',  name: '小黄鸭',         tags: ['小动物', '鸭子', '可爱'],         w: 88,  h: 100, defaultRot: 4 },

  // —— 胶带 ——
  { id: 'washi-orange',    category: 'washi',   name: '橘子胶带',       tags: ['胶带', '和纸胶带', '橘子', '装饰'], w: 200, h: 56, defaultRot: -2 },
  { id: 'washi-stripe',    category: 'washi',   name: '条纹胶带',       tags: ['胶带', '和纸胶带', '条纹', '装饰'], w: 200, h: 56, defaultRot: 2 },
  { id: 'washi-check',     category: 'washi',   name: '格纹胶带',       tags: ['胶带', '和纸胶带', '格纹', '装饰'], w: 200, h: 56, defaultRot: -3 },
  { id: 'washi-dot',       category: 'washi',   name: '圆点胶带',       tags: ['胶带', '和纸胶带', '圆点', '装饰'], w: 200, h: 56, defaultRot: 2 },

  // —— 旅行 ——
  { id: 'boarding-pass',   category: 'travel',  name: '登机牌票根',     tags: ['旅行', '登机牌', '票根', '机票'], w: 72,  h: 100, defaultRot: -5 },
  { id: 'paperclip',       category: 'travel',  name: '回形针',         tags: ['回形针', '文具', '别针'],         w: 56,  h: 100, defaultRot: 10 },
  { id: 'banner-ribbon',   category: 'travel',  name: '飘带横幅',       tags: ['横幅', '飘带', '标签', '可写字'], w: 200, h: 72,  defaultRot: -2 },
  { id: 'stamp',           category: 'travel',  name: '邮票',           tags: ['邮票', '旅行', '集邮'],           w: 86,  h: 100, defaultRot: 6 },
  { id: 'passport-stamp',  category: 'travel',  name: '护照印章',       tags: ['护照', '印章', '盖章', '旅行'],   w: 100, h: 92,  defaultRot: -8 },
  { id: 'luggage-tag',     category: 'travel',  name: '行李吊牌',       tags: ['行李牌', '吊牌', '旅行'],         w: 80,  h: 100, defaultRot: 7 },

  // —— 相框 ——
  { id: 'polaroid-frame',  category: 'frame',   name: '拍立得相框',     tags: ['相框', '拍立得', '照片框'],       w: 90,  h: 100, defaultRot: -4 },
  { id: 'photo-corners',   category: 'frame',   name: '相角',           tags: ['相角', '固定角', '相册'],         w: 100, h: 100, defaultRot: 0 },
  { id: 'tape-strip',      category: 'frame',   name: '胶带贴条',       tags: ['胶带', '磨砂胶带', '装饰'],       w: 140, h: 60,  defaultRot: -8 },

  // —— 花草 ——
  { id: 'hibiscus',        category: 'nature',  name: '木槿花',         tags: ['花', '木槿', '扶桑', '济州岛'],   w: 100, h: 96,  defaultRot: -5 },
  { id: 'leaf-sprig',      category: 'nature',  name: '叶枝',           tags: ['叶子', '植物', '枝条'],           w: 72,  h: 100, defaultRot: 6 },
  { id: 'succulent',       category: 'nature',  name: '多肉',           tags: ['多肉', '植物', '盆栽'],           w: 92,  h: 100, defaultRot: -3 },
  { id: 'clover',          category: 'nature',  name: '四叶草',         tags: ['四叶草', '幸运', '植物'],         w: 90,  h: 100, defaultRot: 8 },

  // —— 天气 ——
  { id: 'sun',             category: 'weather', name: '太阳',           tags: ['天气', '太阳', '晴天'],           w: 100, h: 100, defaultRot: 0 },
  { id: 'cloud',           category: 'weather', name: '云朵',           tags: ['天气', '云', '多云'],             w: 100, h: 76,  defaultRot: 0 },
  { id: 'partly-cloudy',   category: 'weather', name: '多云',           tags: ['天气', '多云', '晴间多云'],       w: 100, h: 90,  defaultRot: 0 },
  { id: 'rainbow',         category: 'weather', name: '彩虹',           tags: ['天气', '彩虹', '治愈'],           w: 100, h: 72,  defaultRot: 0 },

  // —— 挂件·标签 ——
  { id: 'plush-star',      category: 'deco',    name: '毛绒星星挂件',   tags: ['挂件', '毛绒', '星星', '钥匙扣'], w: 90,  h: 100, defaultRot: -6 },
  { id: 'label-archive',   category: 'deco',    name: '档案标签贴',     tags: ['标签', '档案', '贴纸', '打字机'], w: 100, h: 72,  defaultRot: -3 },
  { id: 'heart',           category: 'deco',    name: '爱心',           tags: ['爱心', '红心', '喜欢'],           w: 100, h: 94,  defaultRot: -8 },
  { id: 'sparkle',         category: 'deco',    name: '闪星',           tags: ['闪星', '星光', '装饰'],           w: 100, h: 100, defaultRot: 0 },
];

export const MANIFEST: StickerPackManifest = {
  format: STICKER_PACK_FORMAT,
  name: 'journal-stickers',
  displayName: '手帐贴纸 · 济州岛的蓝',
  description:
    '一套常用手帐装饰贴纸：相机、小动物、和纸胶带、旅行票根、相框、花草、天气、挂件标签，' +
    'Korean travel-journal 手绘水粉画风，成套内联 SVG（自包含、零外部资源、可无损缩放）。' +
    '适用：给手帐 / 漫游拼贴页加贴纸、装饰、相机贴纸、小动物贴纸、胶带、票根，或加载 / 扩展贴纸包时。' +
    '不适用：地图内容包（用 map-skill/v1）、照片剪贴碎片（用手帐剪刀 dieCut）。',
  version: '1.0.0',
  author: '上街去',
  categories: STICKER_CATEGORIES,
  stickers: STICKERS,
};
