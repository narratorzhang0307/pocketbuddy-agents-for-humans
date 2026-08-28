// 手帐贴纸 · 美术汇总 —— 8 分类内联 SVG 合并成 id→svg 映射（catalog.ts 从这里取美术）
import { CAMERA_ART } from './camera';
import { ANIMAL_ART } from './animal';
import { WASHI_ART } from './washi';
import { TRAVEL_ART } from './travel';
import { FRAME_ART } from './frame';
import { NATURE_ART } from './nature';
import { WEATHER_ART } from './weather';
import { DECO_ART } from './deco';

export const STICKER_SVG: Record<string, string> = {
  ...CAMERA_ART,
  ...ANIMAL_ART,
  ...WASHI_ART,
  ...TRAVEL_ART,
  ...FRAME_ART,
  ...NATURE_ART,
  ...WEATHER_ART,
  ...DECO_ART,
};
