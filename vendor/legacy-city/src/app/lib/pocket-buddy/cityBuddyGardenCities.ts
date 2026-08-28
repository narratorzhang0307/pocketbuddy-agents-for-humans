import {
  BEIJING_GIANT_FLOWER_SITES,
  BEIJING_OVERVIEW_ZOOM,
  isBeijingGardenPositionAllowed,
} from '../street-garden/districts/beijing';
import {
  GUANGZHOU_GIANT_FLOWER_SITES,
  GUANGZHOU_OVERVIEW_ZOOM,
} from '../street-garden/districts/guangzhou';
import {
  HANGZHOU_GIANT_FLOWER_SITES,
  HANGZHOU_OVERVIEW_ZOOM,
} from '../street-garden/districts/hangzhou';
import {
  NANJING_GIANT_FLOWER_SITES,
  NANJING_OVERVIEW_ZOOM,
} from '../street-garden/districts/nanjing';
import {
  SHANGHAI_GIANT_FLOWER_SITES,
  SHANGHAI_OVERVIEW_ZOOM,
} from '../street-garden/districts/shanghai';
import {
  createCityBuddyGarden,
  type CityBuddyGardenConfig,
  type CityBuddyGardenHomeSpec,
} from './cityBuddyGarden';

export const MAPPED_BUDDY_GARDEN_CITY_IDS = [
  'hangzhou',
  'beijing',
  'shanghai',
  'nanjing',
  'guangzhou',
] as const;

export type BuddyGardenCityId =
  (typeof MAPPED_BUDDY_GARDEN_CITY_IDS)[number];

export const CITY_BUDDY_GARDEN_CONFIGS: Readonly<
  Record<BuddyGardenCityId, CityBuddyGardenConfig>
> = {
  hangzhou: {
    cityId: 'hangzhou',
    cityName: '杭州',
    sites: HANGZHOU_GIANT_FLOWER_SITES,
    seed: 2058,
    overviewZoom: HANGZHOU_OVERVIEW_ZOOM,
    catalogScope: 'star-friends',
    dynamicPackageIdentities: true,
    // 杭州默认镜头的 14 只优先使用第一页角色；这里从原杭州段里挑出
    // 六个不重复的动作包，其余城市的既有分段与身份完全不动。
    dynamicPackageIndexes: [3, 5, 6, 7, 8, 9],
    maxHomes: 6,
    // 拱墅由花下 Buddy 栖息层负责，城市漫游层不重复铺点。
    excludedDistrictIds: ['gongshu'],
  },
  beijing: {
    cityId: 'beijing',
    cityName: '北京',
    sites: BEIJING_GIANT_FLOWER_SITES,
    seed: 1051,
    overviewZoom: BEIJING_OVERVIEW_ZOOM,
    dynamicPackageIdentities: true,
    dynamicPackageOffset: 10,
    maxHomes: 10,
    isPositionAllowed: isBeijingGardenPositionAllowed,
  },
  shanghai: {
    cityId: 'shanghai',
    cityName: '上海',
    sites: SHANGHAI_GIANT_FLOWER_SITES,
    seed: 3181,
    overviewZoom: SHANGHAI_OVERVIEW_ZOOM,
    dynamicPackageIdentities: true,
    dynamicPackageOffset: 20,
    maxHomes: 10,
  },
  nanjing: {
    cityId: 'nanjing',
    cityName: '南京',
    sites: NANJING_GIANT_FLOWER_SITES,
    seed: 2491,
    overviewZoom: NANJING_OVERVIEW_ZOOM,
    dynamicPackageIdentities: true,
    dynamicPackageOffset: 30,
    maxHomes: 10,
  },
  guangzhou: {
    cityId: 'guangzhou',
    cityName: '广州',
    sites: GUANGZHOU_GIANT_FLOWER_SITES,
    seed: 7681,
    overviewZoom: GUANGZHOU_OVERVIEW_ZOOM,
    dynamicPackageIdentities: true,
    dynamicPackageOffset: 40,
    maxHomes: 10,
  },
};

export function createCityBuddyGardenById(
  cityId: BuddyGardenCityId,
): CityBuddyGardenHomeSpec[] {
  return createCityBuddyGarden(CITY_BUDDY_GARDEN_CONFIGS[cityId]);
}

export function createMappedCityBuddyGardens(
  cityIds: readonly BuddyGardenCityId[] = MAPPED_BUDDY_GARDEN_CITY_IDS,
): CityBuddyGardenHomeSpec[] {
  return cityIds.flatMap(createCityBuddyGardenById);
}
