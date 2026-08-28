import type { InitialStickerSeed } from '../lib/journal/buildInitialPage';

// 漫游首页与 Garden 共用同一套地图手帐装饰。
// 两处引用同一份种子，保证完整拼贴的数量、位置和视觉语言保持一致。
export const ATLAS_JOURNAL_STICKERS: InitialStickerSeed[] = [
  { id: 'washi-orange', x: 0.38, y: 0.055, w: 0.18, rot: -2, layer: 'under' },
  { id: 'washi-check', x: 0.77, y: 0.085, w: 0.16, rot: 3, layer: 'under' },
  { id: 'film-strip', x: 0.965, y: 0.35, w: 0.055, rot: 8, layer: 'under' },
  { id: 'sun', x: 0.075, y: 0.21, w: 0.065, rot: -5 },
  { id: 'stamp', x: 0.085, y: 0.47, w: 0.055, rot: 7 },
  { id: 'camera-retro', x: 0.5, y: 0.43, w: 0.07, rot: 5 },
  { id: 'boarding-pass', x: 0.93, y: 0.58, w: 0.06, rot: -5 },
  { id: 'clover', x: 0.085, y: 0.7, w: 0.055, rot: 8 },
  { id: 'leaf-sprig', x: 0.93, y: 0.8, w: 0.055, rot: 6 },
  { id: 'passport-stamp', x: 0.61, y: 0.86, w: 0.06, rot: -8 },
  { id: 'banner-ribbon', x: 0.5, y: 0.73, w: 0.14, rot: -2 },
  { id: 'plush-star', x: 0.075, y: 0.87, w: 0.055, rot: -6 },
  { id: 'cloud', x: 0.92, y: 0.91, w: 0.06, rot: 2 },
  { id: 'label-archive', x: 0.79, y: 0.31, w: 0.07, rot: -3 },
];
