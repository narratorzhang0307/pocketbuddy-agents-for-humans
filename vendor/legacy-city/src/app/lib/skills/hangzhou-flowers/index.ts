// 杭州赏花地图 .skill · 公共出口 + 图层技能描述符（注册进 lib/skills/mapLayers.ts）
// 与 hangzhou-exhibitions/index.ts 同构：urgentCount 对花的语义是「盛花期点位数」——花期不等人。
import FlowerLayer from '../../../components/FlowerLayer';
import type { MapLayerSkillDescriptor } from '../mapLayers';
import { focusFromSkillCoordinates } from '../mapSkillFocus';
import { HANGZHOU_FLOWER_SKILL } from './catalog';
import {
  isFlowerLayerVisible, isFlowerSkillLoaded, listFlowerSpots, setFlowerBrowserOpen,
  setFlowerLayerVisible, setFlowerSkillLoaded, subscribeFlowerSkill,
} from './store';

export * from './types';
export * from './store';
export { HANGZHOU_FLOWER_SKILL } from './catalog';
export { extractFlowerShot, extractFlowerText, resolveFlowerGeo, draftToSpot } from './importShot';

export const FLOWER_LAYER_SKILL: MapLayerSkillDescriptor = {
  id: HANGZHOU_FLOWER_SKILL.name,
  displayName: HANGZHOU_FLOWER_SKILL.displayName,
  legendLabel: '赏花',
  color: '#ffb928',
  isLoaded: isFlowerSkillLoaded,
  setLoaded: setFlowerSkillLoaded,
  isVisible: isFlowerLayerVisible,
  setVisible: setFlowerLayerVisible,
  count: () => listFlowerSpots().length,
  focus: () => focusFromSkillCoordinates(
    listFlowerSpots().map((view) => view.spot),
  ),
  urgentCount: () => listFlowerSpots().filter((v) => v.status === 'peak').length,
  subscribe: subscribeFlowerSkill,
  openBrowser: () => setFlowerBrowserOpen(true),
  Layer: FlowerLayer,
};
