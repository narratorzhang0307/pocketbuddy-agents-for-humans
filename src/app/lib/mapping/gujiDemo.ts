import { Capacitor } from '@capacitor/core';
import { activateDataPack, installDataPackFromUrl, removeDataPack, type InstalledDataPack } from '../dataPack';
import { setDataPackMapLayerEnabled } from '../dataPack/mapLayer';

export const GUJI_MAPPING_DEMO_KEY = 'art.throughtheglass.pocketearth.guji-mapping-demo@1.0.0';
export const GUJI_MAPPING_DEMO_URL = Capacitor.isNativePlatform()
  ? '/data-packs/guji-mapping-demo/1.0.0/bundle.json'
  : import.meta.env.VITE_GUJI_MAPPING_DEMO_URL
    || 'https://assets-pocketearth.throughtheglass.art/pocket-earth/releases/20260812-final-v5/data-packs/guji-mapping-demo/1.0.0/bundle.json';

export const GUJI_MAPPING_DEMO_PREVIEWS = [
  { title: '四时幽赏录', author: '高濂', era: '明代', city: '杭州', places: 26, sample: '孤山 · 苏堤 · 龙井' },
  { title: '梦粱录', author: '吴自牧', era: '南宋', city: '杭州', places: 17, sample: '南宋皇城 · 德寿宫 · 御街' },
  { title: '板桥杂记', author: '余怀', era: '清代', city: '南京', places: 15, sample: '秦淮河 · 夫子庙 · 桃叶渡' },
  { title: '浮生六记', author: '沈复', era: '清代', city: '苏州', places: 10, sample: '沧浪亭 · 虎丘 · 灵岩山' },
] as const;

export async function loadGujiMappingDemo(): Promise<InstalledDataPack> {
  const pack = await installDataPackFromUrl('mapping', GUJI_MAPPING_DEMO_URL);
  setDataPackMapLayerEnabled('mapping', true);
  return pack;
}

export async function showGujiMappingDemo(packKey = GUJI_MAPPING_DEMO_KEY): Promise<InstalledDataPack> {
  const pack = await activateDataPack(packKey);
  setDataPackMapLayerEnabled('mapping', true);
  return pack;
}

export async function unloadGujiMappingDemo(): Promise<void> {
  await removeDataPack(GUJI_MAPPING_DEMO_KEY);
}
