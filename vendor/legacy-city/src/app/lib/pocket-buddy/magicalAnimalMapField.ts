import type { GeoPosition } from '../maps/runtime';
import { gcj02ToWgs84 } from '../location/chinaCoordinates';
import { GONGSHU_GIANT_FLOWER_SITES } from '../street-garden/districts/gongshu';
import { HANGZHOU_GIANT_FLOWER_SITES } from '../street-garden/districts/hangzhou';
import { AGENT_WORLD_POCKET_BUDDY_CATALOG } from './agentWorldCatalog';
import {
  CITY_BUDDY_GARDEN_MIN_SPACING_METERS,
  cityBuddyGardenScaleAtZoom,
  cityBuddySpotlightScaleAtZoom,
  cityBuddySpotlightScaleForHeight,
  createCityBuddyGarden,
  type CityBuddyGardenHomeSpec,
} from './cityBuddyGarden';
import { CITY_BUDDY_GARDEN_CONFIGS } from './cityBuddyGardenCities';
import { firstPageDynamicMapBuddyPackageAt } from './dynamicMapBuddies';

export type MagicalAnimalMapFieldSpec = {
  id: string;
  buddyPackageId: string;
  name: string;
  role: string;
  assetUrl: string;
  accent: string;
  position: GeoPosition;
  habitatId: string;
  habitatName: string;
  imageHeight: number;
  lean: number;
  wobbleDuration: number;
  wobbleDelay: number;
  chatterDuration: number;
  chatterDelay: number;
  habitatSlot: number;
  habitatSlotCount: number;
  habitatRotationDuration: number;
  habitatRotationDelay: number;
  line: string;
};

export type PocketBuddyGardenHomeSpec = CityBuddyGardenHomeSpec;

// 杭州默认入口同时展示十四只会动的 Pocket Buddy。落点只从项目里已
// 核验的杭州公共空间坐标中选取，并分散在默认手机镜头的左、中、右三区。
// 图片仍按当前城市与视口懒加载，不进入首屏主包。常量名为兼容现有调用方保留。
export const GONGSHU_MAGICAL_ANIMAL_HABITAT_COUNT = 14;
const DEFAULT_ENTRY_GARDEN_HABITAT_IDS = [
  'chaohui-culture-park',
  'wulin-square',
  'westlake-culture-square',
  'wuyang-park',
  'hubin',
  'qinghefang',
  'deshou-palace',
  'wushan',
  'hu-xueyan',
] as const;

// 与博物馆目录和西湖照片地图共用已核验 GCJ-02 坐标；这里只保留地图
// Buddy 所需的轻量字段，避免为了五个落点把整份资料表打进地图包。
const DEFAULT_ENTRY_CULTURE_HABITATS = [
  { id: 'zhejiang-museum-gushan', name: '浙江省博物馆孤山馆区', position: [120.1389, 30.2533] },
  { id: 'broken-bridge', name: '断桥残雪', position: [120.1470, 30.2609] },
  { id: 'zhejiang-art-museum', name: '浙江美术馆', position: [120.1523, 30.2334] },
  { id: 'caa-art-museum', name: '中国美术学院美术馆', position: [120.1551, 30.2452] },
  { id: 'china-silk-museum', name: '中国丝绸博物馆', position: [120.1465, 30.2251] },
] as const;
// 历史名称保留给现有调用方；实际层级必须高于巨型花冠（136），
// 否则重合处的点击会落到植物上，Buddy 对话入口就像“消失”了一样。
export const MAGICAL_ANIMAL_UNDER_CROWN_Z_INDEX = 144;
export const HANGZHOU_BUDDY_GARDEN_DISTRICT_COUNT = 12;
export const HANGZHOU_BUDDY_GARDEN_MIN_SPACING_METERS =
  CITY_BUDDY_GARDEN_MIN_SPACING_METERS;

const MAGICAL_ANIMAL_LINES = [
  '你也是来散步的吗？',
  '运河今天在发光。',
  '我刚捡到一阵风！',
  '要一起去前面看看吗？',
  '这条街闻起来很开心。',
  '嘘，我在听城市呼吸。',
  '今天适合慢慢走。',
  '西湖那边飘来一朵云。',
  '你认识回星球的路吗？',
  '前面有一家香香的小店。',
  '我把好心情放在这里啦。',
  '刚才有只鸟和我打招呼。',
  '拱墅的风很会讲故事。',
  '跟着亮光走就不会迷路。',
  '等一等，我的影子没跟上。',
  '今天会遇见什么呢？',
] as const;

const seededRandom = (seed: number) => {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
};

export function magicalAnimalScaleAtZoom(zoom: number) {
  return cityBuddyGardenScaleAtZoom(zoom);
}

export function magicalAnimalSpotlightScaleAtZoom(
  zoom: number,
  imageHeight?: number,
) {
  return imageHeight === undefined
    ? cityBuddySpotlightScaleAtZoom(zoom)
    : cityBuddySpotlightScaleForHeight(zoom, imageHeight);
}

export const pocketBuddyGardenScaleAtZoom = cityBuddyGardenScaleAtZoom;

export function createHangzhouPocketBuddyGarden(
  seed = 2058,
): PocketBuddyGardenHomeSpec[] {
  return createCityBuddyGarden({
    ...CITY_BUDDY_GARDEN_CONFIGS.hangzhou,
    seed,
  });
}

export function createMagicalAnimalMapField(
  seed = 586,
  useDynamicPackages = true,
): MagicalAnimalMapFieldSpec[] {
  const random = seededRandom(seed);
  const animals = AGENT_WORLD_POCKET_BUDDY_CATALOG.filter(
    (entry) => entry.id.startsWith('alien-') && entry.assetUrl,
  );
  const shuffledAnimals = [...animals];
  for (let index = shuffledAnimals.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffledAnimals[index], shuffledAnimals[swapIndex]] = [
      shuffledAnimals[swapIndex],
      shuffledAnimals[index],
    ];
  }
  const gardenSites = [...GONGSHU_GIANT_FLOWER_SITES, ...HANGZHOU_GIANT_FLOWER_SITES];
  const gardenHabitats = DEFAULT_ENTRY_GARDEN_HABITAT_IDS
    .map((id) => gardenSites.find((site) => site.id === id))
    .filter((site): site is NonNullable<typeof site> => site !== undefined);
  const habitats = [...DEFAULT_ENTRY_CULTURE_HABITATS, ...gardenHabitats];
  const habitatSlots = habitats.map(() => 0);
  const habitatIndexForAnimal = (index: number) => index;

  const selectedAnimals = shuffledAnimals.slice(
    0,
    GONGSHU_MAGICAL_ANIMAL_HABITAT_COUNT,
  );
  selectedAnimals.forEach((_, index) => {
    habitatSlots[habitatIndexForAnimal(index)] += 1;
  });
  const currentHabitatSlots = habitats.map(() => 0);

  return selectedAnimals.map((animal, index) => {
    // Only a random subset of the existing city plants become habitats.
    // Several small residents may share one giant plant without covering its root.
    const habitatIndex = habitatIndexForAnimal(index);
    const habitat = habitats[habitatIndex];
    const habitatSlot = currentHabitatSlots[habitatIndex];
    currentHabitatSlots[habitatIndex] += 1;
    const habitatSlotCount = habitatSlots[habitatIndex];
    const habitatRotationDuration = habitatSlotCount * 6;
    // Sites are curated in AMap's GCJ-02 frame. The shared runtime accepts
    // WGS84 and converts exactly once at the AMap boundary, so this coordinate
    // remains the same geographic anchor through every zoom level.
    const position = gcj02ToWgs84(habitat.position) as GeoPosition;
    // 杭州默认镜头优先使用口袋伙伴第一页里已有完整动作包的角色。
    // 这里只替换身份与动图素材，不改变任何真实地点锚点。
    const characterPackage = useDynamicPackages
      ? firstPageDynamicMapBuddyPackageAt(index)
      : undefined;

    return {
      id: animal.id,
      buddyPackageId: characterPackage?.id ?? animal.id,
      name: characterPackage?.identity.name ?? animal.name,
      role: characterPackage?.identity.role ?? animal.role,
      assetUrl: characterPackage?.visual.portraitUrl ?? animal.assetUrl!,
      accent: characterPackage?.identity.accent ?? animal.accent,
      position,
      habitatId: habitat.id,
      habitatName: habitat.name,
      imageHeight: 34 + Math.round(random() * 8),
      lean: -2.6 + random() * 5.2,
      wobbleDuration: 2.4 + random() * 1.8,
      wobbleDelay: -random() * 4.2,
      chatterDuration: 6.2 + random() * 2.8,
      chatterDelay: -random() * 9,
      habitatSlot,
      habitatSlotCount,
      habitatRotationDuration,
      habitatRotationDelay: -(habitatSlot * 6 + (habitatIndex % 6)),
      line: MAGICAL_ANIMAL_LINES[(index * 5 + Math.floor(random() * 7)) % MAGICAL_ANIMAL_LINES.length],
    };
  });
}
