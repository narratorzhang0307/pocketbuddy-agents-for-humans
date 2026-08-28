// 杭州古建筑地图 .skill · 公共出口 + 图层技能描述符（注册进 lib/skills/mapLayers.ts）
// 与 hangzhou-flowers/index.ts 同构：古建筑无时效，故不设 urgentCount。
import ArchitectureLayer from '../../../components/ArchitectureLayer';
import type { MapLayerSkillDescriptor } from '../mapLayers';
import { focusFromSkillCoordinates } from '../mapSkillFocus';
import { HANGZHOU_ARCH_SKILL } from './catalog';
import {
  isArchLayerVisible, isArchSkillLoaded, listArchSites, setArchBrowserOpen,
  setArchLayerVisible, setArchSkillLoaded, subscribeArchSkill,
} from './store';

export * from './types';
export * from './store';
export { HANGZHOU_ARCH_SKILL } from './catalog';

export const ARCH_LAYER_SKILL: MapLayerSkillDescriptor = {
  id: HANGZHOU_ARCH_SKILL.name,
  displayName: HANGZHOU_ARCH_SKILL.displayName,
  legendLabel: '古建筑',
  color: '#b5402f',
  isLoaded: isArchSkillLoaded,
  setLoaded: setArchSkillLoaded,
  isVisible: isArchLayerVisible,
  setVisible: setArchLayerVisible,
  count: () => listArchSites().length,
  focus: () => focusFromSkillCoordinates(listArchSites()),
  subscribe: subscribeArchSkill,
  openBrowser: () => setArchBrowserOpen(true),
  Layer: ArchitectureLayer,
};
