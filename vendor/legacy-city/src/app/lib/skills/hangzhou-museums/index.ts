// 杭州博物馆地图 .skill · 公共出口 + 图层技能描述符（注册进 lib/skills/mapLayers.ts）
import MuseumLayer from '../../../components/MuseumLayer';
import type { MapLayerSkillDescriptor } from '../mapLayers';
import { focusFromSkillCoordinates } from '../mapSkillFocus';
import { HANGZHOU_MUSEUM_SKILL } from './catalog';
import {
  isMuseumLayerVisible, isMuseumSkillLoaded, listMuseums, setMuseumBrowserOpen,
  setMuseumLayerVisible, setMuseumSkillLoaded, subscribeMuseumSkill,
} from './store';
import { urgentShowDays } from './types';

export * from './types';
export * from './store';
export { HANGZHOU_MUSEUM_SKILL } from './catalog';
export {
  importMuseumScreenshot, buildManualMuseumDraft, matchSkillMuseum,
  normalizeMuseumDate, parseClosedDay, suggestMuseumTier,
} from './importPipeline';

export const MUSEUM_LAYER_SKILL: MapLayerSkillDescriptor = {
  id: HANGZHOU_MUSEUM_SKILL.name,
  displayName: HANGZHOU_MUSEUM_SKILL.displayName,
  legendLabel: '博物馆',
  color: '#e0502e',
  isLoaded: isMuseumSkillLoaded,
  setLoaded: setMuseumSkillLoaded,
  isVisible: isMuseumLayerVisible,
  setVisible: setMuseumLayerVisible,
  count: () => listMuseums().length,
  focus: () => focusFromSkillCoordinates(listMuseums()),
  urgentCount: () => listMuseums().filter((m) => urgentShowDays(m, HANGZHOU_MUSEUM_SKILL.rules.urgentWithinDays) !== null).length,
  subscribe: subscribeMuseumSkill,
  openBrowser: () => setMuseumBrowserOpen(true),
  Layer: MuseumLayer,
};
