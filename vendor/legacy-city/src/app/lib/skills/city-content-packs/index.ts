import CityContentPacksControls from '../../../components/CityContentPacksControls';
import CityContentPacksLayer from '../../../components/CityContentPacksLayer';
import type { MapLayerSkillDescriptor } from '../mapLayers';
import { focusFromSkillCoordinates } from '../mapSkillFocus';
import {
  getCityContentPackLegendCounts,
  isCityContentPacksVisible,
  listCityContentPackSpots,
  setCityContentPacksVisible,
  subscribeCityContentPacks,
} from './store';

export * from './store';

export const CITY_CONTENT_PACKS_LAYER_SKILL: MapLayerSkillDescriptor = {
  id: 'skills-plaza-city-content-packs',
  displayName: 'Skills Plaza 城市内容包',
  legendLabel: '城市内容包',
  color: '#b388ff',
  isLoaded: () => true,
  setLoaded: (loaded, worldLayer) => setCityContentPacksVisible(loaded, worldLayer),
  isVisible: isCityContentPacksVisible,
  setVisible: setCityContentPacksVisible,
  // 通用图例右侧显示“当前真正落在地图上的点”；已加载包数另由
  // legendItemCounts 显示，避免轻目录尚未水合时把 3 个包误写成 3 个地图点。
  count: (worldLayer) => listCityContentPackSpots(undefined, worldLayer).length,
  focus: (worldLayer) => focusFromSkillCoordinates(listCityContentPackSpots(undefined, worldLayer)),
  subscribe: subscribeCityContentPacks,
  LegendControls: CityContentPacksControls,
  legendItemCounts: getCityContentPackLegendCounts,
  canUnload: false,
  // 聚合宿主在两张地图复用；具体包先进入私人层，只有用户在 Plaza
  // 明确选择“加载到公共层”后，才会在中间 Tab 的公共街头出现。
  worldScope: 'global',
  Layer: CityContentPacksLayer,
};
