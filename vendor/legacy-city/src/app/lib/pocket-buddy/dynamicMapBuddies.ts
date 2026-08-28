import { POCKET_BUDDY_CHARACTER_PACKAGES } from './buddyPackages.generated';
import { isRetiredPocketBuddy } from './retiredBuddyIds';

/** Character packages that have the same complete motion set on hardware and city maps. */
export const DYNAMIC_MAP_BUDDY_PACKAGES = POCKET_BUDDY_CHARACTER_PACKAGES.filter(
  (characterPackage) => (
    !characterPackage.id.startsWith('holiday-')
    &&
    characterPackage.surfaces.includes('hardware')
    && characterPackage.surfaces.includes('city_map')
    && characterPackage.motion.frames.length > 0
    && !isRetiredPocketBuddy(characterPackage.id)
  ),
);

// 口袋伙伴第一页里同时具备完整 city_map 动作包的角色。
// 杭州默认镜头优先展示这批视觉完成度更高的居民；静态卡牌不会混进来。
const FIRST_PAGE_DYNAMIC_MAP_BUDDY_PACKAGE_IDS = [
  'alien-04-07',
  'alien-04-09',
  'alien-01-05',
  'alien-03-04',
  'alien-04-08',
  'alien-03-07',
  'alien-02-15',
  'alien-03-09',
  'alien-05-11',
  'alien-02-06',
  'alien-01-01',
  'alien-01-02',
  'alien-01-03',
  'alien-05-09',
] as const;

export const FIRST_PAGE_DYNAMIC_MAP_BUDDY_PACKAGES =
  FIRST_PAGE_DYNAMIC_MAP_BUDDY_PACKAGE_IDS.flatMap((id) => {
    const characterPackage = DYNAMIC_MAP_BUDDY_PACKAGES.find(
      (candidate) => candidate.id === id,
    );
    return characterPackage ? [characterPackage] : [];
  });

export const FIRST_PAGE_DYNAMIC_MAP_BUDDY_IDS: ReadonlySet<string> = new Set(
  FIRST_PAGE_DYNAMIC_MAP_BUDDY_PACKAGES.map((characterPackage) => characterPackage.id),
);

export function dynamicMapBuddyPackageAt(index: number) {
  if (DYNAMIC_MAP_BUDDY_PACKAGES.length === 0) return undefined;
  return DYNAMIC_MAP_BUDDY_PACKAGES[index % DYNAMIC_MAP_BUDDY_PACKAGES.length];
}

export function firstPageDynamicMapBuddyPackageAt(index: number) {
  if (FIRST_PAGE_DYNAMIC_MAP_BUDDY_PACKAGES.length === 0) return undefined;
  return FIRST_PAGE_DYNAMIC_MAP_BUDDY_PACKAGES[
    index % FIRST_PAGE_DYNAMIC_MAP_BUDDY_PACKAGES.length
  ];
}
