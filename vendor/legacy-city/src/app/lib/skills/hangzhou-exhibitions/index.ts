// 杭州展览地图 .skill · 公共出口 + 图层技能描述符（注册进 lib/skills/mapLayers.ts）
import ExhibitionLayer from '../../../components/ExhibitionLayer';
import type { MapLayerSkillDescriptor } from '../mapLayers';
import { focusFromSkillCoordinates } from '../mapSkillFocus';
import { HANGZHOU_EXHIBITION_SKILL } from './catalog';
import {
  isExLayerVisible, isExSkillLoaded, listExhibitions, setExBrowserOpen,
  setExLayerVisible, setExSkillLoaded, subscribeExhibitionSkill,
} from './store';
import { isUrgent } from './types';

export * from './types';
export * from './store';
export { HANGZHOU_EXHIBITION_SKILL } from './catalog';
export { importExhibitionScreenshot, buildManualDraft, matchSkillVenue, normalizeDate, suggestTier } from './importPipeline';

export const EXHIBITION_LAYER_SKILL: MapLayerSkillDescriptor = {
  id: HANGZHOU_EXHIBITION_SKILL.name,
  displayName: HANGZHOU_EXHIBITION_SKILL.displayName,
  legendLabel: '展览',
  color: '#ffd23d',
  isLoaded: isExSkillLoaded,
  setLoaded: setExSkillLoaded,
  isVisible: isExLayerVisible,
  setVisible: setExLayerVisible,
  count: () => listExhibitions().length,
  focus: () => focusFromSkillCoordinates(listExhibitions()),
  urgentCount: () => listExhibitions().filter((e) => isUrgent(e, HANGZHOU_EXHIBITION_SKILL.rules.urgentWithinDays)).length,
  subscribe: subscribeExhibitionSkill,
  openBrowser: () => setExBrowserOpen(true),
  Layer: ExhibitionLayer,
};
