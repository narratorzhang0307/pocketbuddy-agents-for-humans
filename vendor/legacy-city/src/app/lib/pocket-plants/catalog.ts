import type { GeoPosition } from '../maps/runtime';
import POCKET_PLANT_ASSET_DATA from './catalog.curated.json';

export type PocketPlantAsset = {
  id: string;
  name: string;
  scientificName: string;
  description: string;
  src: string;
  thumbSrc?: string;
  family: 'meadow' | 'houseplant' | 'botanical';
  fieldReady?: boolean;
  /**
   * Inventory cards are much wider than the source artwork. Hanging plants
   * need a closer crop so the actual plant, rather than the suspension cord,
   * remains the visual subject. Map placement continues to use the untouched
   * source asset at its natural framing.
   */
  previewScale?: number;
};

const POCKET_PLANT_PREVIEW_SCALE: Partial<Record<string, number>> = {
  'hanging-vine-pot': 1.4,
  'hanging-cactus': 1.48,
};

const CURATED_PLANT_DATA = POCKET_PLANT_ASSET_DATA as Array<
  Omit<PocketPlantAsset, 'previewScale' | 'thumbSrc'>
>;

export const POCKET_PLANT_ASSETS: PocketPlantAsset[] = CURATED_PLANT_DATA.map(
  (plant) => ({
    ...plant,
    thumbSrc: plant.src.replace(/\.png$/, '_thumb.png'),
    previewScale: POCKET_PLANT_PREVIEW_SCALE[plant.id],
  }),
);

export const OUTDOOR_POCKET_PLANTS = POCKET_PLANT_ASSETS.filter(
  (plant) => plant.fieldReady,
);

const POCKET_PLANT_IDS = new Set(POCKET_PLANT_ASSETS.map((plant) => plant.id));

const stablePlantIndex = (id: string) => {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % POCKET_PLANT_ASSETS.length;
};

/** Keep old plantings and seed inventories visible after the curated-v3 migration. */
export function normalizePocketPlantAssetId(id: string): string {
  return POCKET_PLANT_IDS.has(id)
    ? id
    : POCKET_PLANT_ASSETS[stablePlantIndex(id)].id;
}

export type PocketPlantFieldSpec = {
  id: string;
  plantingPocketId: string;
  asset: PocketPlantAsset;
  position: GeoPosition;
  size: number;
  lean: number;
  swayDuration: number;
  swayDelay: number;
};

export const GONGSHU_PLANTING_POCKETS = [
  // The trial field uses known park/riverfront anchors from the Gongshu
  // street-garden catalog. Keeping each ellipse inside a public green pocket
  // prevents the decorative sprites from spilling onto major roads or viaducts.
  { id: 'canal-sports-west-lawn', center: [120.102266, 30.314001] as GeoPosition, radiusLng: 0.0008, radiusLat: 0.00062, count: 5 },
  { id: 'canal-sports-east-lawn', center: [120.104266, 30.314651] as GeoPosition, radiusLng: 0.0007, radiusLat: 0.00055, count: 5 },
  { id: 'dongxin-central-park', center: [120.179954, 30.31146] as GeoPosition, radiusLng: 0.0012, radiusLat: 0.0008, count: 7 },
  { id: 'canal-central-park', center: [120.125245, 30.316818] as GeoPosition, radiusLng: 0.0011, radiusLat: 0.00075, count: 7 },
  { id: 'xiaohe-park', center: [120.13586, 30.309398] as GeoPosition, radiusLng: 0.00085, radiusLat: 0.00065, count: 6 },
  { id: 'hemu-park', center: [120.124774, 30.310379] as GeoPosition, radiusLng: 0.00095, radiusLat: 0.00074, count: 5 },
  { id: 'north-sports-park', center: [120.162196, 30.311322] as GeoPosition, radiusLng: 0.0009, radiusLat: 0.00068, count: 5 },
  { id: 'xitang-river-park', center: [120.127209, 30.31546] as GeoPosition, radiusLng: 0.0009, radiusLat: 0.0007, count: 4 },
  { id: 'beixing-park', center: [120.13933, 30.328676] as GeoPosition, radiusLng: 0.00068, radiusLat: 0.0005, count: 3 },
  { id: 'chaohui-culture-park', center: [120.165841, 30.284732] as GeoPosition, radiusLng: 0.00068, radiusLat: 0.0005, count: 3 },
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

export function createPocketPlantField({
  center,
  count,
  seed = 586,
}: {
  center?: GeoPosition;
  count?: number;
  seed?: number;
} = {}): PocketPlantFieldSpec[] {
  const random = seededRandom(seed);
  const shuffledAssets = [...POCKET_PLANT_ASSETS];
  for (let index = shuffledAssets.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffledAssets[index], shuffledAssets[swapIndex]] = [
      shuffledAssets[swapIndex],
      shuffledAssets[index],
    ];
  }
  const pockets = center
    ? [{
        id: 'custom-pocket',
        center,
        radiusLng: 0.00125,
        radiusLat: 0.00095,
        count: count ?? 20,
      }]
    : GONGSHU_PLANTING_POCKETS;
  const field: PocketPlantFieldSpec[] = [];

  for (const pocket of pockets) {
    const accepted: PocketPlantFieldSpec[] = [];
    for (let slot = 0; slot < pocket.count; slot += 1) {
      const sizeRoll = random();
      const size = sizeRoll < 0.62
        ? 30 + Math.round(random() * 14)
        : sizeRoll < 0.92
          ? 45 + Math.round(random() * 12)
          : 58 + Math.round(random() * 10);
      let position: GeoPosition | null = null;
      for (let attempt = 0; attempt < 240; attempt += 1) {
        const angle = random() * Math.PI * 2;
        const radius = Math.sqrt(random());
        const candidate: GeoPosition = [
          pocket.center[0] + Math.cos(angle) * radius * pocket.radiusLng,
          pocket.center[1] + Math.sin(angle) * radius * pocket.radiusLat,
        ];
        const separated = accepted.every((plant) => {
          const dx = (candidate[0] - plant.position[0]) * 96000;
          const dy = (candidate[1] - plant.position[1]) * 111000;
          const requiredGap = 14 + (size + plant.size) * 0.32;
          return Math.hypot(dx, dy) >= requiredGap;
        });
        if (separated) {
          position = candidate;
          break;
        }
      }
      if (!position) continue;
      const asset = shuffledAssets[field.length % shuffledAssets.length];
      const plant: PocketPlantFieldSpec = {
        id: `gongshu-pocket-plant-${field.length + 1}`,
        plantingPocketId: pocket.id,
        asset,
        position,
        size,
        lean: -4 + random() * 8,
        swayDuration: 4.4 + random() * 3.2,
        swayDelay: -random() * 6,
      };
      accepted.push(plant);
      field.push(plant);
    }
  }
  return field;
}
