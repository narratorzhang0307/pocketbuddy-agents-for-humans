import type { GeoPosition } from '../maps/runtime';
import { gcj02ToWgs84 } from '../location/chinaCoordinates';
import { GARDEN_ZOOM } from '../maps/gardenCamera';
import { MAP_AGENT_REFERENCE_ZOOM } from '../agent3d/mapRendering';
import { OUTDOOR_POCKET_PLANTS } from '../pocket-plants/catalog';
import type { GiantFlowerGardenSite } from '../street-garden/grove';
import { AGENT_WORLD_POCKET_BUDDY_CATALOG } from './agentWorldCatalog';
import { dynamicMapBuddyPackageAt } from './dynamicMapBuddies';

export const CITY_BUDDY_GARDEN_MIN_SPACING_METERS = 460;

export type CityBuddyGardenConfig = {
  cityId: string;
  cityName: string;
  sites: readonly GiantFlowerGardenSite[];
  seed: number;
  overviewZoom: number;
  excludedDistrictIds?: readonly string[];
  catalogScope?: 'all' | 'star-friends';
  dynamicPackageIdentities?: boolean;
  dynamicPackageOffset?: number;
  dynamicPackageIndexes?: readonly number[];
  maxHomes?: number;
  minSpacingMeters?: number;
  isPositionAllowed?: (position: GeoPosition) => boolean;
};

export type CityBuddyGardenHomeSpec = {
  id: string;
  cityId: string;
  cityName: string;
  buddyId: string;
  buddyPackageId: string;
  buddyName: string;
  buddyRole: string;
  buddyAssetUrl: string;
  buddyAccent: string;
  plantId: string;
  plantName: string;
  plantAssetUrl: string;
  position: GeoPosition;
  districtId: string;
  districtName: string;
  siteName: string;
  plantHeight: number;
  buddyHeight: number;
  rootOffsetX: number;
  rootSide: -1 | 1;
  minZoom: number;
  plantLean: number;
  plantSwayDuration: number;
  plantSwayDelay: number;
  buddyLean: number;
  buddyWobbleDuration: number;
  buddyWobbleDelay: number;
  line: string;
};

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

function offsetInMeters(
  position: GeoPosition,
  distanceMeters: number,
  angle: number,
): GeoPosition {
  const latitude = position[1] * (Math.PI / 180);
  return [
    position[0] + (Math.cos(angle) * distanceMeters) / (111_320 * Math.cos(latitude)),
    position[1] + (Math.sin(angle) * distanceMeters) / 110_540,
  ];
}

export function cityBuddyGardenDistanceInMeters(
  first: GeoPosition,
  second: GeoPosition,
) {
  const latitude = ((first[1] + second[1]) / 2) * (Math.PI / 180);
  const dx = (first[0] - second[0]) * 111_320 * Math.cos(latitude);
  const dy = (first[1] - second[1]) * 110_540;
  return Math.hypot(dx, dy);
}

function minimumHomeZoom(overviewZoom: number, districtSlot: number) {
  if (districtSlot === 0) return overviewZoom;
  if (districtSlot < 4) return overviewZoom + 0.85;
  if (districtSlot < 12) return overviewZoom + 2.05;
  if (districtSlot < 24) return overviewZoom + 3.05;
  return overviewZoom + 4.25;
}

function greatestCommonDivisor(first: number, second: number) {
  let a = Math.abs(first);
  let b = Math.abs(second);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

function dialogueLine(
  cityName: string,
  siteName: string,
  plantName: string,
  index: number,
) {
  const lines = [
    `你也在${cityName}散步吗？`,
    `我在${siteName}旁边守花。`,
    `${plantName}今天精神很好。`,
    `等一等，我的影子没跟上。`,
    `刚才有阵风来过这里。`,
    `要一起去前面看看吗？`,
    `我把好心情种在这里啦。`,
    `嘘，我在听${cityName}呼吸。`,
  ] as const;
  return lines[index % lines.length];
}

export function createCityBuddyGarden(
  config: CityBuddyGardenConfig,
): CityBuddyGardenHomeSpec[] {
  const random = seededRandom(config.seed);
  const excludedDistrictIds = new Set(config.excludedDistrictIds ?? []);
  const minSpacingMeters =
    config.minSpacingMeters ?? CITY_BUDDY_GARDEN_MIN_SPACING_METERS;
  const placementSpacingMeters = minSpacingMeters + 2;
  const sites = config.sites.filter(
    (site) => !excludedDistrictIds.has(site.districtId),
  );
  if (sites.length === 0) {
    throw new Error(`${config.cityName} Buddy 家园至少需要一个地点锚点`);
  }

  const buddies = AGENT_WORLD_POCKET_BUDDY_CATALOG.filter(
    (entry) => (
      Boolean(entry.assetUrl)
      && (config.catalogScope !== 'star-friends' || entry.id.startsWith('alien-'))
    ),
  );
  const shuffledBuddies = [...buddies];
  for (let index = shuffledBuddies.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffledBuddies[index], shuffledBuddies[swapIndex]] = [
      shuffledBuddies[swapIndex],
      shuffledBuddies[index],
    ];
  }

  const shuffledSites = [...sites];
  for (let index = shuffledSites.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffledSites[index], shuffledSites[swapIndex]] = [
      shuffledSites[swapIndex],
      shuffledSites[index],
    ];
  }

  const acceptedPositions: GeoPosition[] = [];
  const districtSlots = new Map<string, number>();
  const districtLeadSites = sites.filter(
    (site, index) =>
      sites.findIndex(
        (candidate) => candidate.districtId === site.districtId,
      ) === index,
  );
  const siteStep =
    [17, 19, 23, 29, 31].find(
      (candidate) => greatestCommonDivisor(candidate, shuffledSites.length) === 1,
    ) ?? 1;

  const selectedBuddies = shuffledBuddies.slice(
    0,
    Math.max(0, config.maxHomes ?? shuffledBuddies.length),
  );

  return selectedBuddies.map((buddy, index) => {
    const site =
      districtLeadSites[index] ??
      shuffledSites[
        ((index - districtLeadSites.length) * siteStep) %
          shuffledSites.length
      ];
    const districtSlot = districtSlots.get(site.districtId) ?? 0;
    let position: GeoPosition | null = null;
    for (let attempt = 0; attempt < 1_200; attempt += 1) {
      const expansion = Math.floor(attempt / 150);
      const innerRadius =
        districtSlot === 0
          ? 45 + expansion * 30
          : 260 + expansion * 160;
      const outerRadius =
        districtSlot === 0
          ? 75 + expansion * 90
          : 1_240 + expansion * 850;
      const distance = innerRadius + Math.sqrt(random()) * (outerRadius - innerRadius);
      const candidate = offsetInMeters(
        site.position,
        distance,
        random() * Math.PI * 2,
      );
      if (config.isPositionAllowed && !config.isPositionAllowed(candidate)) {
        continue;
      }
      if (
        acceptedPositions.every(
          (accepted) =>
            cityBuddyGardenDistanceInMeters(candidate, accepted) >=
            placementSpacingMeters,
        )
      ) {
        position = candidate;
        break;
      }
    }
    if (!position) {
      throw new Error(
        `无法为 ${buddy.id} 找到不重叠的${config.cityName}植物家园位置`,
      );
    }
    // Street-garden sites are curated against AMap (GCJ-02). Keep all
    // placement and exclusion checks in that frame, then hand WGS84 to the
    // shared map runtime so its boundary conversion lands back on the anchor.
    acceptedPositions.push(position);
    const mapPosition = gcj02ToWgs84(position) as GeoPosition;

    districtSlots.set(site.districtId, districtSlot + 1);
    const plant = OUTDOOR_POCKET_PLANTS[index % OUTDOOR_POCKET_PLANTS.length];
    const plantHeight = 58 + Math.round(random() * 16);
    const buddyHeight = 32 + Math.round(random() * 8);
    const rootSide: -1 | 1 = random() < 0.5 ? -1 : 1;
    const plantWidth = plantHeight * 0.72;
    const buddyWidth = buddyHeight * 1.05;
    const rootOffsetX =
      rootSide * (plantWidth / 2 + buddyWidth / 2 + 6);
    const dynamicPackageIndex = config.dynamicPackageIndexes?.[index]
      ?? index + (config.dynamicPackageOffset ?? 0);
    const characterPackage = config.dynamicPackageIdentities
      ? dynamicMapBuddyPackageAt(dynamicPackageIndex)
      : undefined;

    return {
      id: `${config.cityId}-buddy-garden-${buddy.id}`,
      cityId: config.cityId,
      cityName: config.cityName,
      buddyId: buddy.id,
      buddyPackageId: characterPackage?.id ?? buddy.id,
      buddyName: characterPackage?.identity.name ?? buddy.name,
      buddyRole: characterPackage?.identity.role ?? buddy.role,
      buddyAssetUrl: characterPackage?.visual.portraitUrl ?? buddy.assetUrl!,
      buddyAccent: characterPackage?.identity.accent ?? buddy.accent,
      plantId: plant.id,
      plantName: plant.name,
      plantAssetUrl: plant.src,
      position: mapPosition,
      districtId: site.districtId,
      districtName: site.district,
      siteName: site.name,
      plantHeight,
      buddyHeight,
      rootOffsetX,
      rootSide,
      minZoom: minimumHomeZoom(config.overviewZoom, districtSlot),
      plantLean: -3 + random() * 6,
      plantSwayDuration: 4.8 + random() * 2.4,
      plantSwayDelay: -random() * 6,
      buddyLean: -2.4 + random() * 4.8,
      buddyWobbleDuration: 2.5 + random() * 1.7,
      buddyWobbleDelay: -random() * 4.2,
      line: dialogueLine(config.cityName, site.name, plant.name, index),
    };
  });
}

export function cityBuddyGardenScaleAtZoom(zoom: number) {
  if (!Number.isFinite(zoom)) return 0.5;
  return Math.min(0.9, Math.max(0.18, 0.18 + (zoom - 8.35) * 0.061));
}

export const CITY_BUDDY_OVERVIEW_SPOTLIGHT_SCALE = 2.45;
export const CITY_BUDDY_STREET_SPOTLIGHT_SCALE = 1.3;
export const CITY_BUDDY_SPOTLIGHT_HEIGHT_PX = 52;
export const CITY_BUDDY_MAX_SPOTLIGHT_HEIGHT_PX =
  CITY_BUDDY_SPOTLIGHT_HEIGHT_PX;

export function cityBuddySpotlightScaleAtZoom(zoom: number) {
  if (!Number.isFinite(zoom)) return CITY_BUDDY_OVERVIEW_SPOTLIGHT_SCALE;
  const progress = Math.min(
    1,
    Math.max(
      0,
      (zoom - GARDEN_ZOOM) / (MAP_AGENT_REFERENCE_ZOOM - GARDEN_ZOOM),
    ),
  );
  const eased = progress * progress * (3 - 2 * progress);
  return (
    CITY_BUDDY_OVERVIEW_SPOTLIGHT_SCALE +
    (CITY_BUDDY_STREET_SPOTLIGHT_SCALE -
      CITY_BUDDY_OVERVIEW_SPOTLIGHT_SCALE) *
      eased
  );
}

/**
 * Gives every enlarged map Buddy one stable screen-space height. This keeps
 * differently sized source portraits visually equal after the map zooms.
 */
export function cityBuddySpotlightScaleForHeight(
  zoom: number,
  sourceHeight: number,
) {
  const requestedScale = cityBuddySpotlightScaleAtZoom(zoom);
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) {
    return requestedScale;
  }
  const renderedSourceHeight = sourceHeight * cityBuddyGardenScaleAtZoom(zoom);
  if (renderedSourceHeight <= 0) return requestedScale;
  return CITY_BUDDY_SPOTLIGHT_HEIGHT_PX / renderedSourceHeight;
}

/**
 * Moves an enlarged Buddy away from its paired plant by exactly the extra
 * half-width created by spotlight scaling, preserving the original gap.
 */
export function cityBuddySpotlightOffsetFromPlant(
  sourceHeight: number,
  spotlightScale: number,
  rootSide: -1 | 1,
) {
  if (
    !Number.isFinite(sourceHeight)
    || sourceHeight <= 0
    || !Number.isFinite(spotlightScale)
  ) {
    return 0;
  }
  const sourceWidth = sourceHeight * 1.05;
  const extraHalfWidth =
    (sourceWidth * Math.max(0, spotlightScale - 1)) / 2;
  return rootSide * extraHalfWidth;
}
