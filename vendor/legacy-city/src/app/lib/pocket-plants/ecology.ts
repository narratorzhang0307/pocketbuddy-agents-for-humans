import {
  POCKET_PLANT_GROWTH_MS,
  readPocketPlantings,
  updatePocketPlanting,
  type PocketPlantVisitor,
} from './planting';

const MAGICAL_VISITORS = [
  ['纸灯狐狸', '只留下了一小圈暖色脚印。'],
  ['湖岸小神', '在叶片背后躲过一阵风。'],
  ['黄昏团子', '绕着花根走了三圈才离开。'],
  ['青苔精', '带来一点潮湿的石头气味。'],
  ['雨天耳语者', '好像对着植物说了一句很轻的话。'],
] as const;

const AGENT_VISITORS = [
  ['Shutter', '替这株植物留下一张没有公开的影像。'],
  ['Miko', '在这里停留片刻，记下了附近的声音。'],
  ['Folio', '把这次来访收进了一页城市索引。'],
  ['Nana', '安静地陪它坐过一个傍晚。'],
] as const;

const hash = (value: string) => {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.codePointAt(0) ?? 0;
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
};

export function refreshPocketPlantVisitors(now = new Date()): number {
  const nowMs = now.getTime();
  let added = 0;
  readPocketPlantings().forEach((planting) => {
    const ageMs = Math.max(0, nowMs - Date.parse(planting.plantedAt));
    if (ageMs < POCKET_PLANT_GROWTH_MS) return;
    const ageDays = Math.floor(ageMs / 86_400_000);
    const target = Math.min(4, 1 + Math.floor(ageDays / 3) + Math.min(2, planting.revisitCount));
    if (planting.visitors.length >= target) return;
    const nextVisitors = [...planting.visitors];
    for (let index = nextVisitors.length; index < target; index += 1) {
      const magical = index % 2 === 0;
      const source = magical ? MAGICAL_VISITORS : AGENT_VISITORS;
      const [name, note] = source[(hash(`${planting.id}-${index}`) + index) % source.length];
      const visitedAt = new Date(Math.min(
        nowMs,
        Date.parse(planting.plantedAt) + POCKET_PLANT_GROWTH_MS + index * 4 * 60 * 60 * 1000,
      )).toISOString();
      const visitor: PocketPlantVisitor = {
        id: `${planting.id}-visitor-${index + 1}`,
        kind: magical ? 'magical-animal' : 'agent',
        name,
        note,
        visitedAt,
      };
      nextVisitors.unshift(visitor);
      added += 1;
    }
    updatePocketPlanting(planting.id, (current) => ({
      ...current,
      visitors: nextVisitors,
    }));
  });
  return added;
}
