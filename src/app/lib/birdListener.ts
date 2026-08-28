import catalog from './skill/birdCatalog.json';
export const BIRD_ASSETS = catalog;
export interface BirdStatus {
  enabled: boolean; active: boolean; busy: boolean; state: string; message: string;
  speciesId?: string; name?: string; confidence?: number; imageUrl?: string;
}
export function birdIntent(text: string): 'start' | 'stop' | null {
  const t = text.replace(/\s/g, '');
  if (/(退出|停止|关闭|取消).*(识鸟|鸟叫|鸟声)/.test(t)) return 'stop';
  if (/(不要|(?<!识)别|不想|不用).*(识鸟|鸟叫|鸟声)/.test(t)) return null;
  return /识鸟|识别.*(鸟叫|鸟声)|听.*(什么鸟|哪种鸟)|鸟叫.*识别/.test(t) ? 'start' : null;
}
