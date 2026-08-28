import {
  Fragment,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  BookOpen,
  Building2,
  Camera,
  Check,
  ChevronRight,
  Flower2,
  Footprints,
  Gamepad2,
  Layers3,
  LocateFixed,
  MapPin,
  Minus,
  Navigation2,
  PawPrint,
  Plus,
  SlidersHorizontal,
  Sprout,
  UserRound,
  X,
} from "lucide-react";
import { requestForgeFocus } from "../data/forgeFocus";
import { lazyRetry } from "../lib/runtime/lazyRetry";
import { AMAP_KEY, loadAmap } from "../lib/amap";
import { formatAmapError, setAmapBuildingsVisible } from "../lib/maps/amapBuildings";
import {
  BUILTIN_CITY_AGENTS,
  RIGGED_DACHSHUND_MAP_AGENT,
  RIGGED_WAYFARER_GUIDE,
} from "../lib/agent3d/profiles";
import {
  normalizeAngle,
  sceneYawFromScreenVector,
} from "../lib/agent3d/heading";
import {
  advanceDesktopRoam,
  geographicHeadingBetween,
  nearestDistanceAlongRoute,
} from "../lib/agent3d/desktopRoam";
import {
  liveOutingVisualScaleAtZoom,
  mapAgentScaleAtZoom,
} from "../lib/agent3d/mapRendering";
import type { Agent3DProfile } from "../lib/agent3d/types";
import { WALKING_COMPANION_ROSTER } from "../lib/agent3d/walkingCompanions";
import { POEM_TREE_SEEDS } from "../lib/poemtree";
import {
  characterSheetFrom,
  stableCharacterHash,
} from "../lib/crpg/character";
import {
  CITY_COMPANION_GUIDES,
  DEFAULT_OUTING_GUIDE_ID,
  getCityCompanionGuide,
} from "../lib/skills/city-companion";
import { conciseBookTitle } from "../lib/roam/bookTitle";
import {
  formatGujiModernText,
  formatGujiOriginalExcerpt,
  formatGujiVerticalText,
  selectCompleteGujiExcerpt,
} from "../lib/skills/gujiAtlasStore";
import {
  buildOutingPocketBuddyOptions,
  listPocketBuddies,
  subscribePocketBuddies,
  type PocketBuddy,
} from "../lib/pocket-buddy";
import { refreshMapBuddyCollisionLayout } from "../lib/pocket-buddy/mapBuddyMotion";
import { POCKET_PLANT_ASSETS } from "../lib/pocket-plants/catalog";
import { isFreshVoiceTreeFix, registerVoiceTreeMap, type VoiceTreeFix } from "../lib/pocket-plants/voicePlanting";
import { cancelVoiceMapMode, claimVoiceMapMode, failVoiceMapMode, getVoiceMapState, reportVoiceMapReady, subscribeVoiceMapMode } from "../lib/location/voiceMapMode";
import {
  createPocketPlanting,
  pocketPlantGrowth,
  POCKET_SEED_POUCH_LIMIT,
  recordNearbyPocketPlantRevisits,
  readPocketPlantings,
  readPocketSeedPouch,
  subscribePocketPlantings,
  writePocketPlantings,
  writePocketSeedPouch,
  type PocketPlanting,
} from "../lib/pocket-plants/planting";
import {
  consumePocketSeed,
  DAILY_WALK_GOAL,
  readPocketPlantProgress,
  recordCityWalkMetersWithRewards,
  subscribePocketPlantProgress,
  type WalkAchievementReward,
} from "../lib/pocket-plants/progression";
import {
  readStreetPhotos,
  getStreetPhotoMarkerImage,
  saveStreetPhoto,
  subscribeStreetPhotos,
  type StreetPhoto,
  type StreetPhotoPlant,
  type StreetPhotoScene,
} from "../lib/street-photo/store";
import { captureStreetPhotoFrame } from "../lib/street-photo/capture";
import { takePocketPoemDraft } from "../lib/poemtree/pocketPoem";
import { getRoamCity } from "../lib/roam/city";
import {
  avoidCircularRouteObstacles,
  createPatrolRoute,
  distanceInMeters,
  indexRoute,
  loopRouteDistance,
  pointAlongRoute,
  requestAmapWalkingRoute,
  requestAmapWalkingRouteNearDestination,
  trimRoute,
  type CircularRouteObstacle,
  type IndexedRoute,
  type RoutePoint,
} from "../lib/spatial/amapWalkingRoute";
import {
  GARDEN_CENTER,
  GARDEN_PITCH,
  GARDEN_ROTATION,
  GARDEN_ZOOM,
  gardenPostcardMapScale,
  gardenPostcardOffsetAtScale,
  mapMarkerScaleAtZoom,
  readGardenSceneZoom,
} from "../lib/maps/gardenCamera";
// Camera constants live outside this component module so Vite can preserve
// the mounted AMap instance while this UI is edited during local development.
import {
  amapPositionToWgs84,
  locationSampleToAmap,
  locationSampleToWgs84,
} from "../lib/location/amapLocation";
import {
  createBrowserLocationProvider,
  LiveLocationFilter,
  type LocationProviderError,
  type LocationSample,
  type StopLocationWatch,
} from "../lib/location/liveLocation";
import {
  createWalkingWakeLock,
  type WalkingWakeLock,
} from "../lib/location/walkingWakeLock";
import {
  getResidentAgentForMapPlant,
  getSocialAgentsForMapPlant,
  getStreetConversationForMapPlant,
  isGardenPlantVisible,
  isGardenPlantVisibleAtZoom,
  PUBLIC_BLOOM_CLOSE_ZOOM,
  PUBLIC_BLOOM_MEDIUM_ZOOM,
  selectPostcardsForBloom,
} from "../lib/city-world/selectors";
import {
  appendCityEvent,
  appendDutyRoutePoint,
  finishDutySession,
  listDutySessions,
  startDutySession,
  subscribeCityEvents,
} from "../lib/city-world/events";
import { findNearestBloomWithin } from "../lib/city-world/nearbyBloom";
import type { ProvenanceLevel, WorldLayer } from "../lib/city-world/types";
import { IDENTITY_PROXY_AGENT_ID } from "../lib/city-world/seed";
import {
  getStreetDialogueBeat,
  getStreetDialogueServerBeat,
  getStreetDialogueTurn,
  subscribeStreetDialogue,
} from "../lib/city-world/streetDialogue";
import {
  buildDistrictGiantFlowers,
  describeGiantFlower,
  GiantFlowerVisual,
  HANGZHOU_GIANT_FLOWER_SITES,
  isGiantFlower,
  PUBLIC_GARDEN_CITY_PACKAGES,
  type GiantFlower,
  type GiantFlowerHanging,
  type GiantFlowerTheme,
  type PublicGardenCityId,
  type PublicGardenCityPackage,
} from "../lib/street-garden";
import {
  persistLoadedGardenCityIds,
  readLoadedGardenCityIds,
} from "../lib/street-garden/cityLoadState";
import {
  createLazyRootLifecycle,
  type LazyRootLifecycle,
} from "../lib/street-garden/lazyRoot";
import { setLazyDetachableMarkerVisibility } from "../lib/street-garden/markerVisibility";
import { selectGardenMarkerViewportIds } from "../lib/street-garden/plantViewport";
import { BUILTIN_BOOKS, CURATED_PLACES } from "../lib/roam/catalog";
import { ROAM_STATUS_LABEL, type RoamPlaceStatus } from "../lib/roam/types";
import { ATLAS_JOURNAL_STICKERS } from "../data/atlasJournalSeeds";
import "./StreetGardenLab.css";
import type {
  GardenCompareMode,
  GardenRoutePose,
  GardenRoutePoses,
} from "./GardenRouteCompare3D";
import type {
  LiveOutingLocationMode,
  OutingCompanionMode,
} from "./GardenEncounter3D";
import CityCharacterCard from "./CityCharacterCard";
import PocketPlantSeedDrawer from "./PocketPlantSeedDrawer";
import OutingBagRitual from "./OutingBagRitual";
import DesktopRoamController, {
  type DesktopRoamInput,
} from "./DesktopRoamController";
import OutingPolaroidCamera, {
  StreetPolaroid,
} from "./OutingPolaroidCamera";
import ProgressiveImage from "./ProgressiveImage";

const GardenEncounter3D = lazyRetry(() => import("./GardenEncounter3D"));
const GardenRouteCompare3D = lazyRetry(() => import("./GardenRouteCompare3D"));
const GardenJournalPane = lazyRetry(() => import("./JournalPane"));
const OutingAgent3DViewer = lazyRetry(() => import("./Agent3DViewer"));

type GardenPlant = {
  id: string;
  name: string;
  asset: string;
  assetThumb?: string;
  position: [number, number];
  preview: [number, number];
  scale: number;
  rootX: number;
  poem: string;
  memory: string;
  giantTheme?: GiantFlowerTheme;
  cityId?: string;
  district?: string;
  siteId?: string;
  siteName?: string;
  hangings?: GiantFlowerHanging[];
};

const GROUND_THEMES = [
  { id: "sunlit", label: "高德原图", color: "#f7f7f8", mapStyle: null },
  {
    id: "meadow",
    label: "绿色草地",
    color: "#f1f3ef",
    mapStyle: "amap://styles/fresh",
  },
] as const;
type GroundThemeId = (typeof GROUND_THEMES)[number]["id"];
type RouteMode = "idle" | "loading" | "walking" | "arrived" | "fallback";
type LiveLocationState = "idle" | "requesting" | "active" | "preview" | "error";
type ScreenPoint = [number, number];
type AmapDomMarker = {
  hide: () => void;
  setMap?: (map: unknown | null) => void;
  setOffset?: (offset: unknown) => void;
  setPosition: (position: RoutePoint) => void;
  setzIndex?: (zIndex: number) => void;
  show: () => void;
};
type GardenPlantMarkerEntry = {
  button: HTMLButtonElement;
  createMarker: () => AmapDomMarker;
  map: unknown;
  marker: AmapDomMarker | null;
  plant: GardenPlant;
  root: LazyRootLifecycle;
  baseScale: number;
  baseZIndex: number;
  zIndex: number;
  visible: boolean;
};
type GardenProjectionMap = {
  lngLatToContainer?: (position: RoutePoint) => {
    getX?: () => unknown;
    getY?: () => unknown;
    x?: unknown;
    y?: unknown;
  } | null;
};
// 公开街面的远景花已经按密度预算抽稀；保留下来的城市代表花仍需
// 保持可辨认的屏幕尺寸，否则数据虽然存在，用户却无法一眼读出足迹。
const PUBLIC_PLANT_MIN_FINAL_SCALE = 0.16;
const PUBLIC_STANDARD_PLANT_MAX_FINAL_SCALE = 0.42;
const PUBLIC_GIANT_PLANT_MAX_FINAL_SCALE = 0.62;
const POCKET_PLANT_MIN_MAP_SCALE = 0.08;
const PUBLIC_OVERVIEW_PLANT_Z_INDEX = 236;

function plantScaleAtZoom(
  baseScale: number,
  zoom: number,
  layer: WorldLayer,
  maxPublicScale: number,
) {
  const scaled = baseScale * 2 ** (zoom - GARDEN_ZOOM);
  return layer === "public"
    ? Math.min(
        Math.max(scaled, PUBLIC_PLANT_MIN_FINAL_SCALE),
        maxPublicScale,
      )
    : scaled;
}

function syncPlantMarkerPresentation(
  entry: GardenPlantMarkerEntry,
  zoom: number,
  layer: WorldLayer,
) {
  const finalScale = plantScaleAtZoom(
    entry.baseScale,
    zoom,
    layer,
    entry.plant.giantTheme
      ? PUBLIC_GIANT_PLANT_MAX_FINAL_SCALE
      : PUBLIC_STANDARD_PLANT_MAX_FINAL_SCALE,
  );
  const plantScaleValue = String(finalScale);
  if (
    entry.button.style.getPropertyValue("--plant-scale") !== plantScaleValue
  ) {
    entry.button.style.setProperty("--plant-scale", plantScaleValue);
  }
  entry.button.style.setProperty(
    "--giant-story-scale",
    String(1 / Math.max(finalScale, PUBLIC_PLANT_MIN_FINAL_SCALE)),
  );

  const zIndex =
    layer === "public" && zoom < PUBLIC_BLOOM_MEDIUM_ZOOM
      ? PUBLIC_OVERVIEW_PLANT_Z_INDEX
      : entry.baseZIndex;
  if (entry.zIndex !== zIndex) {
    entry.zIndex = zIndex;
    entry.marker?.setzIndex?.(zIndex);
  }
}

function setPlantMarkerVisibility(
  entry: GardenPlantMarkerEntry,
  visible: boolean,
) {
  if (visible) entry.root.mount();
  setLazyDetachableMarkerVisibility(
    entry,
    visible,
    entry.plant.position,
    entry.createMarker,
  );
}

function isGardenCityLoaded(
  plant: GardenPlant,
  loadedCityIds: readonly PublicGardenCityId[],
) {
  return (
    !plant.cityId ||
    loadedCityIds.includes(plant.cityId as PublicGardenCityId)
  );
}

function projectGardenPlant(
  map: GardenProjectionMap | null,
  position: RoutePoint,
) {
  try {
    return map?.lngLatToContainer?.(position) ?? null;
  } catch {
    return null;
  }
}

function selectVisibleGardenPlantIds({
  entries,
  map,
  container,
  layer,
  zoom,
  selectedId,
  loadedCityIds,
  showLegacyGardenPlants,
}: {
  entries: readonly GardenPlantMarkerEntry[];
  map: GardenProjectionMap | null;
  container: HTMLElement | null;
  layer: WorldLayer;
  zoom: number;
  selectedId?: string | null;
  loadedCityIds: readonly PublicGardenCityId[];
  showLegacyGardenPlants: boolean;
}) {
  const width = container?.clientWidth ?? 0;
  const compact = width <= 700;
  const overview = zoom < PUBLIC_BLOOM_MEDIUM_ZOOM;
  const midrange = zoom < PUBLIC_BLOOM_CLOSE_ZOOM;
  const maxVisible = compact
    ? overview
      ? 6
      : midrange
        ? 10
        : 14
    : overview
      ? 12
      : midrange
        ? 20
        : 32;
  const minSpacing = compact
    ? overview
      ? 86
      : midrange
        ? 70
        : 56
    : overview
      ? 96
      : midrange
        ? 78
        : 62;
  const candidates = entries
    .filter(
      (entry) =>
        isGardenPlantVisibleAtZoom(
          entry.plant.id,
          layer,
          zoom,
          undefined,
          showLegacyGardenPlants,
        ) && isGardenCityLoaded(entry.plant, loadedCityIds),
    )
    .map((entry) => ({
      id: entry.plant.id,
      pixel: projectGardenPlant(map, entry.plant.position),
      priority:
        (entry.plant.id === selectedId ? 1_000 : 0) +
        (entry.plant.siteId ? 80 : entry.plant.giantTheme ? 40 : 0),
    }));

  return selectGardenMarkerViewportIds({
    layer,
    candidates,
    viewport: {
      width,
      height: container?.clientHeight ?? 0,
    },
    maxVisible,
    minSpacing,
  });
}

type GardenMemoryFragment = {
  id: string;
  name: string;
  modernName?: string;
  status: RoamPlaceStatus;
  quote?: string;
  chapter?: string;
  note: string;
  lat: number;
  lng: number;
  bookTitle: string;
  bookAuthor: string;
};
type GardenPostcard = {
  id: string;
  image: string;
  place: string;
  city: string;
  date: string;
  author: string;
  message: string;
  stamp: string;
  accent: string;
};
type GardenJournalSign = {
  id: string;
  kind: "title" | "quote" | "photo" | "ticket";
  position: [number, number];
  kicker: string;
  title: string;
  body: string;
  image?: string;
  memoryId?: string;
  postcardIndex?: number;
  accent?: string;
  width: number;
};

const GARDEN_STYLE =
  (import.meta.env.VITE_AMAP_GARDEN_STYLE as string) || "amap://styles/light";
const ENCOUNTER_ZOOM = 18.9;
const DEFAULT_WALK_ZOOM = 17.2;
const TEST_WALK_START: [number, number] = [120.1538, 30.27185];
const TEST_WALK_DESTINATION: [number, number] = [
  TEST_WALK_START[0] + 0.0042,
  TEST_WALK_START[1] + 0.0036,
];
const ZHANG_ZAO_POEM_TREE =
  POEM_TREE_SEEDS.find(
    (tree) => tree.poem.poet === "张枣" && tree.poem.title === "镜中",
  ) ?? POEM_TREE_SEEDS[2];
// 《镜中》沿用种诗档案里不可改写的“西湖 · 苏堤”落点；人物从苏堤
// 北侧约 50 米处走来，路线、树根和高德地图共用同一组经纬度。
const POEM_PLANT_WALK_DEMO_POSITION: [number, number] = [
  ZHANG_ZAO_POEM_TREE.spot?.lng ?? 120.139,
  ZHANG_ZAO_POEM_TREE.spot?.lat ?? 30.241,
];
const HANGZHOU_POLAROID_FLOWER_SEEDS = [
  ["sudi-yingbo", "苏堤映波桥", 120.1433647, 30.2307722, "vintage-floral-01"],
  ["sudi-suolan", "苏堤锁澜桥", 120.1421027, 30.2328817, "vintage-floral-02"],
  ["sudi-wangshan", "苏堤望山桥", 120.1409307, 30.2350208, "vintage-floral-03"],
  ["sudi-yadi", "苏堤压堤桥", 120.1396394, 30.2388102, "vintage-floral-04"],
  ["sudi-dongpu", "苏堤东浦桥", 120.1381395, 30.2439761, "vintage-floral-05"],
  [
    "sudi-spring-dawn",
    "苏堤春晓",
    120.1360626,
    30.2503714,
    "vintage-floral-06",
  ],
  ["botanical-garden", "杭州植物园", 120.11692, 30.25996, "vintage-floral-07"],
  ["hangzhou-nursery", "杭州花圃", 120.12031, 30.25421, "vintage-floral-08"],
  ["prince-bay", "太子湾公园", 120.14677, 30.22665, "vintage-floral-09"],
  ["lingyin-grove", "灵隐林地", 120.10118, 30.24014, "vintage-floral-39"],
  ["hubin-promenade", "湖滨步行街", 120.1648, 30.2558, "vintage-floral-51"],
  ["wushan-overlook", "吴山城隍阁", 120.1627, 30.2377, "vintage-floral-62"],
] as const;

const HANGZHOU_UNIQUE_POLAROID_IMAGES = Array.from(
  { length: 6 },
  (_, index) =>
    `https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/showcase/thumb/wl-${index + 1}.jpg`,
);

const HANGZHOU_POLAROID_FLOWERS = HANGZHOU_POLAROID_FLOWER_SEEDS.flatMap(
  ([id, place, lng, lat, assetId], index) => {
    const asset = POCKET_PLANT_ASSETS.find((candidate) => candidate.id === assetId);
    if (!asset) return [];
    return [{
      id,
      place,
      position: [lng, lat] as [number, number],
      asset,
      visualIndex: index,
      polaroidImage: HANGZHOU_UNIQUE_POLAROID_IMAGES[index],
    }];
  },
);
const POEM_PLANT_WALK_DEMO_ROUTE_START: [number, number] = [
  POEM_PLANT_WALK_DEMO_POSITION[0] - 0.000015,
  POEM_PLANT_WALK_DEMO_POSITION[1] + 0.00048,
];
// 路线继续走到诗植南侧；取得高德道路后再按植物占地生成绕行弧线。
const POEM_PLANT_WALK_DEMO_ROUTE_END: [number, number] = [
  POEM_PLANT_WALK_DEMO_POSITION[0] + 0.000015,
  POEM_PLANT_WALK_DEMO_POSITION[1] - 0.00048,
];
const POEM_PLANT_CLEARANCE_METERS = 13;
const ENCOUNTER_SPEED_METERS_PER_SECOND = 7.2;
const TEST_WALK_SPEED_METERS_PER_SECOND =
  RIGGED_WAYFARER_GUIDE.manifest?.navigation.speedMetersPerSecond ?? 1.25;
const TEST_ROUTE_CAMERA_CHECK_MS = 280;
const TEST_ROUTE_RIGGED_START_METERS = 21;
const ENCOUNTER_CAMERA_LOOKAHEAD_METERS = 22;
const ENCOUNTER_ROAD_ENTRY_TRIM_METERS = 18;
const ENCOUNTER_MAP_FRAME_MS = 48;
const ROUTE_HEADING_LOOKAHEAD_METERS = 2.8;
const DESKTOP_ROAM_SPEED_METERS_PER_SECOND = 2.15;
const BLOOM_VISIT_RADIUS_METERS = 18;
const MAX_BLOOM_VISIT_ACCURACY_METERS = 35;
const PLANT_VISUAL_SCALE = 0.5;
const DEFAULT_OUTING_PET_ID = BUILTIN_CITY_AGENTS[0].id;
const HIDDEN_OUTING_PET_IDS = new Set(["cat-shutter", "pig-hengdou"]);
type OutingSetupFocus = "identity" | "companion" | "pocket" | "summary";
const DEFAULT_OUTING_PET: Agent3DProfile = {
  ...RIGGED_DACHSHUND_MAP_AGENT,
  name: BUILTIN_CITY_AGENTS[0].name,
};
const POSTCARD_HOST_PLANT_ID = "flower-33";

function plantVisualScale(plant: GardenPlant): number {
  return plant.scale * PLANT_VISUAL_SCALE * (plant.giantTheme ? 1.55 : 1);
}

function routeAroundGardenPlants(
  route: IndexedRoute,
  obstacles: readonly CircularRouteObstacle[],
  start: RoutePoint,
  destination: RoutePoint,
) {
  return avoidCircularRouteObstacles(
    route,
    obstacles.filter(
      (obstacle) =>
        distanceInMeters(start, obstacle.center) >=
          obstacle.clearanceMeters &&
        distanceInMeters(destination, obstacle.center) >=
          obstacle.clearanceMeters,
    ),
  );
}
const GARDEN_POSTCARDS: GardenPostcard[] = selectPostcardsForBloom(
  "my-postcard-daisy",
  "personal",
).map((postcard) => ({
  id: postcard.id,
  image: postcard.imageUrl,
  place: postcard.place,
  city: postcard.city,
  date: postcard.date,
  author: postcard.author,
  message: postcard.message,
  stamp: postcard.stamp,
  accent: postcard.accent,
}));

const GARDEN_MEMORY_SELECTION = [
  ["taoan-mengyi", "tam-duanqiao"],
  ["taoan-mengyi", "tam-huxinting"],
  ["taoan-mengyi", "tam-shilihehua"],
  ["xihu-youlan-zhiyu", "xyz-lingyin"],
] as const;

const GARDEN_MEMORY_FRAGMENTS: GardenMemoryFragment[] =
  GARDEN_MEMORY_SELECTION.flatMap(([bookId, placeId]) => {
    const book = BUILTIN_BOOKS.find((candidate) => candidate.id === bookId);
    const place = CURATED_PLACES[bookId]?.find(
      (candidate) => candidate.id === placeId,
    );
    if (!book || !place) return [];
    return [
      {
        ...place,
        bookTitle: book.title,
        bookAuthor: book.author,
      },
    ];
  });

const GARDEN_JOURNAL_PHOTOS = GARDEN_POSTCARDS.map((postcard) => ({
  id: `garden-${postcard.id}`,
  url: postcard.image,
  place: postcard.place,
  date: postcard.date,
}));

const GARDEN_JOURNAL_PLACES = GARDEN_MEMORY_FRAGMENTS.map(
  (fragment, order) => ({
    name: fragment.name,
    quote: fragment.quote,
    status: fragment.status,
    order,
  }),
);

function outingRuntimePet(pet: Agent3DProfile): Agent3DProfile {
  return pet.id === DEFAULT_OUTING_PET_ID ? DEFAULT_OUTING_PET : pet;
}

function agentPhotoImage(profile: Agent3DProfile): string | undefined {
  if (profile.portraitUrl) return profile.portraitUrl;
  return profile.sourceAsset && /\.(?:png|jpe?g|webp|svg)(?:\?|$)/i.test(profile.sourceAsset)
    ? profile.sourceAsset
    : undefined;
}

function isLikelyMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return (
    /Android|iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}

function isFiniteRoutePoint(
  position: RoutePoint | null | undefined,
): position is RoutePoint {
  return Boolean(
    position &&
      Number.isFinite(position[0]) &&
      Number.isFinite(position[1]) &&
      Math.abs(position[0]) <= 180 &&
      Math.abs(position[1]) <= 90,
  );
}

// Demo 阶段只在逐点校对过、明确避开道路与水面的土地锚点种植。
// 后续接入道路 / 水域矢量面数据时，只需替换 isPlantablePosition 的数据源。
const PLANTABLE_LAND_SITES: [number, number][] = [
  [120.153722, 30.273409],
  [120.154018, 30.273152],
  [120.154951, 30.273262],
  [120.155417, 30.273115],
  [120.153637, 30.272306],
  [120.154103, 30.272196],
  [120.154993, 30.272343],
  [120.155501, 30.272233],
  [120.153722, 30.271718],
  [120.154145, 30.271644],
  [120.154951, 30.271791],
  [120.155501, 30.271644],
  [120.153467, 30.272858],
];

// 西湖区范围内的公园、校园与林地锚点。它们不参与当前近景构图，
// 但在用户缩放/移动到相应片区时会形成连续花园，而不是只在一个街角出现。
const WEST_LAKE_GROVE_SITES: [number, number][] = [
  [120.11692, 30.25996], // 杭州植物园
  [120.12031, 30.25421], // 杭州花圃
  [120.14677, 30.22665], // 太子湾公园
  [120.12942, 30.26394], // 浙大玉泉校区绿地
  [120.10556, 30.21833], // 龙井村茶园
  [120.10118, 30.24014], // 灵隐林地
  [120.11923, 30.20318], // 九溪林地
  [120.08771, 30.17721], // 云栖竹径
  [120.06982, 30.26936], // 西溪东部公园绿地
];

function isPlantablePosition(position: [number, number]) {
  return [...PLANTABLE_LAND_SITES, ...WEST_LAKE_GROVE_SITES].some(
    (site) => distanceInMeters(position, site) <= 9,
  );
}

const GARDEN_PLANT_ANCHORS = [
  ...PLANTABLE_LAND_SITES,
  ...WEST_LAKE_GROVE_SITES,
] as const;

// 50 株高质量植物共用“种植物”图鉴；保留 flower-33 作为旧花邮/居民关系的
// 地图锚点 ID，但它的图像与名字已经迁移为图鉴里的洋甘菊。
const PLANTS: GardenPlant[] = POCKET_PLANT_ASSETS.map((asset, index) => {
  const anchor = GARDEN_PLANT_ANCHORS[index % GARDEN_PLANT_ANCHORS.length];
  const ring = Math.floor(index / GARDEN_PLANT_ANCHORS.length);
  const position = ring === 0
    ? anchor
    : offsetPosition(anchor, 2.8 + ring * 1.7, index * 2.399);
  return {
    id: asset.id === "vintage-floral-57" ? POSTCARD_HOST_PLANT_ID : asset.id,
    name: asset.name,
    asset: asset.src,
    assetThumb: asset.thumbSrc,
    position,
    preview: [12 + (index % 5) * 19, 18 + Math.floor(index / 5) * 7] as [number, number],
    scale: 0.5 + (index % 5) * 0.018,
    rootX: 256,
    poem: asset.description,
    memory: `杭州植物图鉴 · ${asset.scientificName}`,
  };
});

const VISIBLE_GARDEN_PLANTS = PLANTS;

const BOTANICAL_CARD_ACCENTS = [
  "#3fbf77",
  "#f06443",
  "#e0a72d",
  "#6f78d8",
  "#d85f91",
] as const;

const BOTANICAL_CARD_SCENES = [
  "greenhouse",
  "pond",
  "canal",
  "rooftop",
  "teahouse",
] as const;

const BOTANICAL_FAMILY_LABELS = {
  meadow: "草地花本",
  houseplant: "室内绿植",
  botanical: "植物图鉴",
} as const;

function catalogAssetForPlant(plant: GardenPlant) {
  return POCKET_PLANT_ASSETS.find((asset) => asset.src === plant.asset) ?? null;
}

function offsetPosition(
  position: [number, number],
  distanceMeters: number,
  angle: number,
): [number, number] {
  const latitude = position[1] * (Math.PI / 180);
  return [
    position[0] +
      (Math.cos(angle) * distanceMeters) / (111_320 * Math.cos(latitude)),
    position[1] + (Math.sin(angle) * distanceMeters) / 110_540,
  ];
}

// 近景每个校对过的土地锚点只放一株，避免同一素材在几米内重复出现。
const LOCAL_DISPLAY_PLANTS: GardenPlant[] = VISIBLE_GARDEN_PLANTS;

const DISTRICT_DISPLAY_PLANTS: GardenPlant[] = WEST_LAKE_GROVE_SITES.flatMap(
  (site, siteIndex) =>
    Array.from({ length: 9 }, (_, cloneIndex) => {
      const source =
        VISIBLE_GARDEN_PLANTS[
          (siteIndex * 5 + cloneIndex * 3) % VISIBLE_GARDEN_PLANTS.length
        ];
      const angle = siteIndex * 1.71 + cloneIndex * 2.399;
      const distance = cloneIndex === 0 ? 0 : 2.2 + (cloneIndex % 4) * 1.45;
      return {
        ...source,
        id: `${source.id}-west-lake-${siteIndex}-${cloneIndex}`,
        position: offsetPosition(site, distance, angle),
        scale: source.scale * (0.62 + (cloneIndex % 3) * 0.07),
      };
    }),
);

const GIANT_FLOWERS: GiantFlower[] = [
  {
    id: "giant-orange-crown-west",
    name: "太阳冠",
    asset: "/assets/street-garden/giants/orange-crown-no-stones.webp",
    position: PLANTABLE_LAND_SITES[4],
    preview: [28, 43],
    scale: 1.18,
    rootX: 256,
    poem: "花冠比路灯更高，风从层层花瓣间经过。",
    memory: "天目山路 · 巨花观察点",
    giantTheme: "orange-crown",
  },
  {
    id: "giant-white-star-center",
    name: "白星塔",
    asset: "/assets/street-garden/giants/white-star-no-stones.webp",
    position: PLANTABLE_LAND_SITES[6],
    preview: [61, 46],
    scale: 1.12,
    rootX: 256,
    poem: "白色花瓣朝七个方向展开，背面藏着尚未开放的花苞。",
    memory: "保俶北路 · 巨花观察点",
    giantTheme: "white-star",
  },
  {
    id: "giant-orange-crown-south",
    name: "落日冠",
    asset: "/assets/street-garden/giants/orange-crown-no-stones.webp",
    position: PLANTABLE_LAND_SITES[9],
    preview: [42, 72],
    scale: 1,
    rootX: 256,
    poem: "另一朵橙色花冠守在行走路线的南侧。",
    memory: "西溪路 · 巨花观察点",
    giantTheme: "orange-crown",
  },
];

// 兼容旧的 24 组 resident-agent 花园 ID，但不再对主城区矩形随机撒点。
// 这些锚点都来自已校对的公园、广场、校园或历史街区，明确避开西湖水面。
const CITY_GARDEN_SITE_IDS = [
  "qinghefang",
  "deshou-palace",
  "wushan",
  "hu-xueyan",
  "baguatian",
  "southern-song-kiln",
  "city-balcony",
  "lingyin",
  "feilai-peak",
  "longjing",
  "meijiawu",
  "jiuxi",
  "liuhe-pagoda",
  "wuyang-park",
  "wulin-square",
  "westlake-culture-square",
  "chaohui-culture-park",
  "xinyifang",
  "fuyi-granary",
  "xiangji-temple",
  "dadou-road",
  "dongxin-central-park",
  "xiaohe-park",
  "hemu-park",
] as const;

const CITY_GARDEN_HUBS = CITY_GARDEN_SITE_IDS.map((siteId) =>
  HANGZHOU_GIANT_FLOWER_SITES.find((site) => site.id === siteId),
).filter((site): site is NonNullable<typeof site> => Boolean(site));

const CITY_GARDEN_PLANTS: GardenPlant[] = CITY_GARDEN_HUBS.flatMap(
  (hub, hubIndex) => {
    const pairAngle = 0.45 + (hubIndex % 6) * 0.73;
    return (["a", "b"] as const).map((letter, pairIndex) => {
      const source = GIANT_FLOWERS[(hubIndex + pairIndex) % 2];
      return {
        ...source,
        id: `city-flower-${hubIndex + 1}-${letter}`,
        name: pairIndex === 0 ? "城市花冠" : "城市白星",
        position: offsetPosition(
          hub.position,
          7,
          pairAngle + (pairIndex === 0 ? Math.PI : 0),
        ),
        preview: [
          10 + ((hubIndex % 6) / 6) * 80,
          12 + (Math.floor(hubIndex / 6) / 4) * 76,
        ],
        scale: 0.84 + ((hubIndex + pairIndex) % 4) * 0.045,
        poem: "高花下住着一位城市智能体，等候附近的相遇。",
        memory: `${hub.district} · ${hub.name}`,
        district: hub.district,
        siteId: hub.id,
        siteName: hub.name,
      };
    });
  },
);

const PUBLIC_CITY_GIANT_FLOWERS: GardenPlant[] =
  PUBLIC_GARDEN_CITY_PACKAGES.flatMap((city) =>
    buildDistrictGiantFlowers({
      sites: city.sites,
      templates: GIANT_FLOWERS.slice(0, 2),
      cityId: city.id,
    }),
  );

const PUBLIC_GIANT_FLOWER_COUNT = PUBLIC_GARDEN_CITY_PACKAGES.reduce(
  (total, city) => total + city.sites.length,
  0,
);

const DISPLAY_PLANTS: GardenPlant[] = [
  ...LOCAL_DISPLAY_PLANTS,
  ...DISTRICT_DISPLAY_PLANTS,
  ...CITY_GARDEN_PLANTS,
  ...GIANT_FLOWERS,
  ...PUBLIC_CITY_GIANT_FLOWERS,
];

function journalSignPosition(eastMeters: number, northMeters: number) {
  const eastPoint = offsetPosition(
    GARDEN_CENTER,
    Math.abs(eastMeters),
    eastMeters >= 0 ? 0 : Math.PI,
  );
  return offsetPosition(
    eastPoint,
    Math.abs(northMeters),
    northMeters >= 0 ? Math.PI / 2 : -Math.PI / 2,
  );
}

const JOURNAL_SIGN_TARGETS: [number, number][] = [
  journalSignPosition(-75, 180),
  journalSignPosition(0, 180),
  journalSignPosition(75, 180),
  journalSignPosition(-75, 58),
  journalSignPosition(0, 58),
  journalSignPosition(75, 58),
  journalSignPosition(-75, -62),
  journalSignPosition(0, -62),
  journalSignPosition(75, -62),
  journalSignPosition(-100, -182),
  journalSignPosition(-20, -182),
  journalSignPosition(50, -182),
];

const journalHostCandidates = DISPLAY_PLANTS.filter(
  (plant) => !plant.giantTheme,
);
const JOURNAL_SIGN_POSITIONS = JOURNAL_SIGN_TARGETS.map((target) => {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  journalHostCandidates.forEach((plant, index) => {
    const distance = distanceInMeters(target, plant.position);
    if (distance < nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  });
  const [hostPlant] = journalHostCandidates.splice(nearestIndex, 1);
  return hostPlant.position;
});

const GARDEN_JOURNAL_SIGNS: GardenJournalSign[] = [
  {
    id: "journal-title",
    kind: "title",
    position: JOURNAL_SIGN_POSITIONS[0],
    kicker: "GARDEN JOURNAL",
    title: "杭州 · 漫游手帐",
    body: "把书读成地图，把诗种进街道",
    accent: "#397560",
    width: 126,
  },
  ...GARDEN_MEMORY_FRAGMENTS.map((fragment, index) => ({
    id: `journal-quote-${fragment.id}`,
    kind: "quote" as const,
    position: JOURNAL_SIGN_POSITIONS[index + 1],
    kicker: `${fragment.name} · LOC_SYNC`,
    title: fragment.bookTitle,
    body: `「${fragment.quote || fragment.note}」`,
    memoryId: fragment.id,
    accent: "#ff00ff",
    width: 142,
  })),
  ...GARDEN_POSTCARDS.map((postcard, index) => ({
    id: `journal-photo-${postcard.id}`,
    kind: "photo" as const,
    position: JOURNAL_SIGN_POSITIONS[index + 5],
    kicker: `${postcard.city} · ${postcard.date}`,
    title: postcard.place,
    body: postcard.message,
    image: postcard.image,
    postcardIndex: index,
    accent: postcard.accent,
    width: 104,
  })),
  {
    id: "journal-ticket-city",
    kind: "ticket",
    position: JOURNAL_SIGN_POSITIONS[8],
    kicker: "CITY · MEMORY",
    title: "漫游收录票",
    body: "杭州 · 3 帧 · 2026-07",
    accent: "#397560",
    width: 112,
  },
  {
    id: "journal-ticket-route",
    kind: "ticket",
    position: JOURNAL_SIGN_POSITIONS[9],
    kicker: "ROUTE →",
    title: "漫游路线票",
    body: "断桥 → 灵隐寺",
    accent: "#e66a34",
    width: 118,
  },
  {
    id: "journal-ticket-source",
    kind: "ticket",
    position: JOURNAL_SIGN_POSITIONS[10],
    kicker: "SOURCE · QUOTE",
    title: "原文凭条",
    body: "湖心亭 · SOURCE-QRPEWJ",
    accent: "#b64232",
    width: 116,
  },
  {
    id: "journal-ticket-admit",
    kind: "ticket",
    position: JOURNAL_SIGN_POSITIONS[11],
    kicker: "ADMIT · MEMORY",
    title: "现场召回券",
    body: "ADMIT ONE · 断桥",
    accent: "#34433f",
    width: 112,
  },
];

const TEST_WALK_PLANT: GardenPlant = {
  ...PLANTS[0],
  id: "test-walk",
  name: "测试路线",
  position: TEST_WALK_START,
};

function nearestDefaultWalkPosition(target: RoutePoint): RoutePoint {
  let nearest = TEST_WALK_PLANT.position;
  let nearestDistance = distanceInMeters(target, nearest);

  PUBLIC_CITY_GIANT_FLOWERS.forEach((plant) => {
    const distance = distanceInMeters(target, plant.position);
    if (distance < nearestDistance) {
      nearest = plant.position;
      nearestDistance = distance;
    }
  });

  return nearest;
}

function LowPolyPlantVisual({
  plant,
  showResidentAgents,
}: {
  plant: GardenPlant;
  showResidentAgents: boolean;
}) {
  const residentAgent = showResidentAgents
    ? getResidentAgentForMapPlant(plant.id, "personal") ??
      getResidentAgentForMapPlant(plant.id, "public")
    : null;
  const conversation = showResidentAgents
    ? getStreetConversationForMapPlant(plant.id)
    : null;
  const dialogueBeat = useSyncExternalStore(
    subscribeStreetDialogue,
    getStreetDialogueBeat,
    getStreetDialogueServerBeat,
  );
  const dialogueTurn = conversation
    ? getStreetDialogueTurn(plant.id, dialogueBeat)
    : null;
  const socialAgents = showResidentAgents ? getSocialAgentsForMapPlant(plant.id) : [];
  const visibleAgents =
    socialAgents.length > 1
      ? socialAgents
      : residentAgent
        ? [residentAgent]
        : [];
  const dialogueSpeaker = dialogueTurn && visibleAgents.length > 0
    ? visibleAgents[dialogueTurn.speakerSlot % visibleAgents.length]
    : undefined;
  const dialogueSide = dialogueTurn?.speakerSlot === 1 ? "right" : "left";
  const residentVisual = (
    <>
      {!!visibleAgents.length && (
        <span className="sg-social-agents" aria-label="花下正在社交的智能体">
          {visibleAgents.slice(0, 2).map((agent, index) => (
            <span
              key={agent.id}
              className={`sg-resident-agent sg-resident-agent--${index + 1}`}
              title={`${agent.name} · ${agent.activityLabel}`}
            >
              <img src={agent.profileAssetUrl} alt="" draggable={false} />
              <span>
                <b>{agent.name}</b>
                <small>{agent.activityLabel}</small>
              </span>
            </span>
          ))}
          {visibleAgents.length > 1 && (
            <i className="sg-social-spark" aria-hidden="true">
              ✦
            </i>
          )}
        </span>
      )}
      {dialogueSpeaker && conversation && dialogueTurn && (
        <span
          key={`${plant.id}:${dialogueTurn.id}`}
          className={`sg-agent-talk sg-agent-talk--${dialogueSide}`}
          aria-label={`${dialogueSpeaker.name}说：${dialogueTurn.text}`}
        >
          <small>{dialogueTurn.theme}</small>
          <b>{dialogueSpeaker.name}</b>
          <q>{dialogueTurn.text}</q>
        </span>
      )}
    </>
  );

  if (isGiantFlower(plant)) {
    return (
      <GiantFlowerVisual flower={plant}>
        {residentVisual}
      </GiantFlowerVisual>
    );
  }

  return (
    <>
      <span className="sg-plant-aura" />
      <span className="sg-game-sprite" aria-hidden="true">
        <ProgressiveImage
          src={plant.asset}
          previewSrc={plant.assetThumb ?? plant.asset}
          alt=""
          draggable={false}
          eager
        />
      </span>
      {residentVisual}
    </>
  );
}

function PostcardClusterVisual() {
  return (
    <span className="sg-postcard-hanger" aria-hidden>
      <span className="sg-postcard-tie" />
      {GARDEN_POSTCARDS.map((postcard, index) => (
        <span
          key={postcard.id}
          className={`sg-postcard-mini-card sg-postcard-mini-card--${index + 1}`}
        >
          <img src={postcard.image} alt="" draggable={false} />
          {index === 0 && (
            <i style={{ background: postcard.accent }}>{postcard.stamp}</i>
          )}
        </span>
      ))}
      <span className="sg-postcard-mail-count">
        {GARDEN_POSTCARDS.length} 封花邮
      </span>
    </span>
  );
}

type HangzhouPolaroidFlower = (typeof HANGZHOU_POLAROID_FLOWERS)[number];

function HangzhouPolaroidFlowerVisual({
  flower,
  onOpen,
}: {
  flower: HangzhouPolaroidFlower;
  onOpen: () => void;
}) {
  const polaroidRotation = flower.visualIndex % 2 === 1 ? 5 : -5;

  return (
    <span
      aria-label={`${flower.place}的植物明信片`}
      style={{
        position: "relative",
        display: "block",
        width: 112,
        height: 154,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <img
        src={flower.asset.src}
        alt=""
        loading="lazy"
        draggable={false}
        style={{
          position: "absolute",
          left: 6,
          bottom: 0,
          display: "block",
          width: 100,
          height: 146,
          objectFit: "contain",
          objectPosition: "50% 100%",
          transformOrigin: "50% 96%",
          animation: `sg-pocket-plant-sway ${4.3 + (flower.visualIndex % 3) * 0.35}s ease-in-out ${-1.2 - (flower.visualIndex % 3) * 0.4}s infinite alternate`,
        }}
      />
      {flower.polaroidImage && (
        <>
          <span
            data-flower-postcard-tie="true"
            style={{
              position: "absolute",
              left: "50%",
              bottom: 58,
              width: 24,
              height: 22,
              background: "#40514c",
              clipPath:
                "polygon(47% 0, 53% 0, 100% 100%, 93% 100%, 51% 11%, 49% 11%, 7% 100%, 0 100%)",
              transform: "translateX(-50%)",
            }}
          />
          <button
            type="button"
            aria-label={`放大查看${flower.place}的明信片`}
            data-flower-polaroid="true"
            data-flower-postcard="true"
            data-polaroid-image={flower.polaroidImage}
            data-postcard-image={flower.polaroidImage}
            data-ignore-map-destination
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
            style={{
              position: "absolute",
              left: "50%",
              bottom: 30,
              display: "block",
              width: 44,
              height: 30,
              overflow: "hidden",
              boxSizing: "border-box",
              border: "1.5px solid #40514c",
              borderRadius: 1,
              padding: 0,
              background: "#f7f4dc",
              cursor: "zoom-in",
              pointerEvents: "auto",
              transform: `translateX(-50%) rotate(${polaroidRotation}deg)`,
              transformOrigin: "50% 0",
            }}
          >
            <img
              src={flower.polaroidImage}
              alt=""
              loading="lazy"
              draggable={false}
              style={{
                position: "absolute",
                left: 2,
                top: 2,
                display: "block",
                width: 28,
                height: 24,
                objectFit: "cover",
                borderRight: "1px solid rgba(64, 81, 76, 0.48)",
              }}
            />
            <i
              style={{
                position: "absolute",
                right: 3,
                top: 3,
                display: "grid",
                width: 8,
                height: 10,
                placeItems: "center",
                color: "#9b3228",
                border: "1px dotted #40514c",
                font: "900 5px/1 ui-monospace, SFMono-Regular, Menlo, monospace",
                fontStyle: "normal",
              }}
            >
              杭
            </i>
          </button>
        </>
      )}
    </span>
  );
}

function createPlantButton(
  plant: GardenPlant,
  index: number,
  showResidentAgents: boolean,
  onSelect: () => void,
) {
  const residentAgent = showResidentAgents ? (
    getResidentAgentForMapPlant(plant.id, "personal") ??
    getResidentAgentForMapPlant(plant.id, "public")
  ) : null;
  const button = document.createElement("button");
  button.type = "button";
  button.className = `sg-map-plant sg-live-plant is-city-overview${
    plant.giantTheme ? " sg-giant-plant" : ""
  }${plant.id.startsWith("city-flower-") ? " sg-city-flower" : ""}${
    plant.siteId ? " sg-regional-flower" : ""
  }`;
  button.dataset.plantId = plant.id;
  button.setAttribute(
    "aria-label",
    isGiantFlower(plant)
      ? describeGiantFlower(plant)
      : plant.id === POSTCARD_HOST_PLANT_ID
      ? `查看${plant.name}（挂有${GARDEN_POSTCARDS.length}张明信片）`
      : residentAgent
        ? `拜访${plant.name}下的${residentAgent.name}`
        : `查看${plant.name}`,
  );
  if (isGiantFlower(plant)) {
    button.title = [
      plant.siteName,
      plant.name,
      ...(plant.hangings ?? []).map(
        (hanging) => `${hanging.label}：${hanging.note}`,
      ),
    ]
      .filter(Boolean)
      .join(" · ");
  } else {
    button.title = `${plant.name} · ${plant.poem}`;
  }
  // Markers start detached and at a safe overview size. AMap projection is
  // not trustworthy until its camera has completed at least one sync pass,
  // especially in Android standalone PWAs.
  button.style.setProperty(
    "--plant-scale",
    String(PUBLIC_PLANT_MIN_FINAL_SCALE),
  );
  button.style.setProperty(
    "--giant-story-scale",
    String(1 / PUBLIC_PLANT_MIN_FINAL_SCALE),
  );
  button.style.setProperty("--plant-duration", `${3.1 + (index % 5) * 0.34}s`);
  button.style.setProperty("--plant-delay", `${-index * 0.29}s`);
  button.style.setProperty(
    "--plant-sway-left",
    `${-(1.6 + (index % 3) * 0.45)}deg`,
  );
  button.style.setProperty(
    "--plant-sway-right",
    `${1.3 + (index % 4) * 0.36}deg`,
  );
  button.style.setProperty("--plant-root-x", `${(plant.rootX / 512) * 164}px`);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onSelect();
  });

  const root = createLazyRootLifecycle(() => {
    const mountedRoot = createRoot(button);
    mountedRoot.render(<LowPolyPlantVisual plant={plant} showResidentAgents={showResidentAgents} />);
    return mountedRoot;
  });
  return { button, root };
}

function createPostcardButton(onOpen: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sg-postcard-cluster sg-live-postcard-cluster";
  button.setAttribute(
    "aria-label",
    `查看植物上的 ${GARDEN_POSTCARDS.length} 张明信片`,
  );
  button.setAttribute("data-ignore-map-destination", "");
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onOpen();
  });
  const root = createRoot(button);
  root.render(<PostcardClusterVisual />);
  return { button, root };
}

type StreetGardenLabProps = {
  basemapOnly?: boolean;
  worldLayer?: WorldLayer;
  showLegacyGardenPlants?: boolean;
  showResidentAgents?: boolean;
  wildlifePresentation?: boolean;
  onMapReady?: (map: unknown | null) => void;
  onLiveOutingChange?: (active: boolean) => void;
  voiceTreePlanting?: boolean;
  initialCenter?: [number, number];
  initialZoom?: number;
  initialPitch?: number;
  initialRotation?: number;
  staticPresentation?: boolean;
  focusPocketPlantingId?: string | null;
};

export default function StreetGardenLab({
  basemapOnly = false,
  worldLayer = "personal",
  showLegacyGardenPlants = true,
  showResidentAgents = true,
  wildlifePresentation = false,
  onMapReady,
  onLiveOutingChange,
  voiceTreePlanting = false,
  initialCenter = GARDEN_CENTER,
  initialZoom = GARDEN_ZOOM,
  initialPitch = GARDEN_PITCH,
  initialRotation = GARDEN_ROTATION,
  staticPresentation = false,
  focusPocketPlantingId = null,
}: StreetGardenLabProps = {}) {
  const poemPlantWalkDemo =
    typeof location !== "undefined" &&
    new URLSearchParams(location.search).has("poemPlantWalk");
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const plantOverlayRef = useRef<HTMLDivElement | null>(null);
  const memoryOverlayRef = useRef<HTMLDivElement | null>(null);
  const outingSetupDialogRef = useRef<HTMLElement | null>(null);
  const plantMarkerButtonsRef = useRef<GardenPlantMarkerEntry[]>([]);
  const postcardMarkerRef = useRef<{
    button: HTMLButtonElement;
    marker: AmapDomMarker;
  } | null>(null);
  const journalMapMarkersRef = useRef<AmapDomMarker[]>([]);
  const encounterMapMarkerRef = useRef<AmapDomMarker | null>(null);
  const testRouteMapMarkerRef = useRef<AmapDomMarker | null>(null);
  const pocketPlantMarkersRef = useRef<AmapDomMarker[]>([]);
  const streetPhotoMarkersRef = useRef<AmapDomMarker[]>([]);
  const worldLayerRef = useRef(worldLayer);
  worldLayerRef.current = worldLayer;
  const initialViewRef = useRef({
    center: initialCenter,
    zoom: initialZoom,
    pitch: initialPitch,
    rotation: initialRotation,
  });
  initialViewRef.current = {
    center: initialCenter,
    zoom: initialZoom,
    pitch: initialPitch,
    rotation: initialRotation,
  };
  const stagePointerRef = useRef<{
    id: number;
    x: number;
    y: number;
    startedAt: number;
  } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const amapApiRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildingLayerRef = useRef<any>(null);
  const encounterActiveRef = useRef(false);
  const encounterPositionRef = useRef<RoutePoint | null>(null);
  const encounterSessionRef = useRef<string | null>(null);
  const encounterHeadingRef = useRef(0);
  const liveLocationActiveRef = useRef(false);
  const voiceTreeFixRef = useRef<VoiceTreeFix | null>(null);
  const liveLocationModeRef = useRef<LiveOutingLocationMode>("preview");
  const voiceMapRequestIdRef = useRef<string | null>(null);
  const voiceMapState = useSyncExternalStore(subscribeVoiceMapMode, getVoiceMapState, getVoiceMapState);
  const liveLocationStopRef = useRef<StopLocationWatch | null>(null);
  const walkingWakeLockRef = useRef<WalkingWakeLock | null>(null);
  const liveLocationFilterRef = useRef(new LiveLocationFilter());
  const lastLiveAmapPositionRef = useRef<RoutePoint | null>(null);
  const liveHeadingSegmentRef = useRef<{
    from: RoutePoint;
    to: RoutePoint;
  } | null>(null);
  const desktopRoamInputRef = useRef<DesktopRoamInput>({
    screenHeadingRadians: null,
    throttle: 0,
  });
  const desktopRoamHeadingRef = useRef(Math.PI / 2);
  const desktopRoamCruiseRef = useRef(false);
  const desktopRoamEngagedRef = useRef(false);
  const desktopRoamResumeAutoRef = useRef(false);
  const desktopRoamControllerOpenRef = useRef(false);
  const desktopViewOrbitActiveRef = useRef(false);
  const desktopViewOrbitRafRef = useRef(0);
  const outingCameraOpenRef = useRef(false);
  const liveLocationSequenceRef = useRef(0);
  const liveLocationAppliedSequenceRef = useRef(0);
  const testDutySessionIdRef = useRef<string | null>(null);
  const liveDutySessionIdRef = useRef<string | null>(null);
  const liveDutyAgentIdRef = useRef(DEFAULT_OUTING_PET_ID);
  const testAgentModeRef = useRef<GardenCompareMode>("rigged");
  const [mapState, setMapState] = useState<
    "loading" | "amap" | "preview" | "error"
  >(AMAP_KEY ? "loading" : "preview");
  const [tilted, setTilted] = useState(initialPitch > 0);
  const [buildingsVisible, setBuildingsVisible] = useState(false);
  const [groundThemeId, setGroundThemeId] = useState<GroundThemeId>("meadow");
  const [viewControlsOpen, setViewControlsOpen] = useState(false);
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);
  const [loadedGardenCityIds, setLoadedGardenCityIds] = useState<
    PublicGardenCityId[]
  >(readLoadedGardenCityIds);
  const loadedGardenCityIdsRef = useRef(loadedGardenCityIds);
  loadedGardenCityIdsRef.current = loadedGardenCityIds;
  const [selectedId, setSelectedId] = useState(PLANTS[0].id);
  const [selectedPlantCardId, setSelectedPlantCardId] = useState<string | null>(
    null,
  );
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const [encounterDestination, setEncounterDestination] =
    useState<RoutePoint | null>(null);
  const [encounterAnchor, setEncounterAnchor] = useState<ScreenPoint | null>(
    null,
  );
  const [encounterMarkerHost, setEncounterMarkerHost] =
    useState<HTMLElement | null>(null);
  const [encounterHeading, setEncounterHeading] = useState(0);
  const [routeMode, setRouteMode] = useState<RouteMode>("idle");
  const [testWalkActive, setTestWalkActive] = useState(false);
  const [testAgentMode] = useState<GardenCompareMode>("rigged");
  const [testRoutePoses, setTestRoutePoses] = useState<{
    legacy: GardenRoutePose;
    rigged: GardenRoutePose;
  } | null>(null);
  const testRoutePosesLiveRef = useRef<GardenRoutePoses | null>(null);
  const [mapZoom, setMapZoom] = useState(GARDEN_ZOOM);
  const [memoryLayerVisible, setMemoryLayerVisible] = useState(false);
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [memoryPage, setMemoryPage] = useState(0);
  const [gardenJournalOpen, setGardenJournalOpen] = useState(false);
  const [selectedPostcardIndex, setSelectedPostcardIndex] = useState<
    number | null
  >(null);
  const [selectedFlowerPostcard, setSelectedFlowerPostcard] = useState<{
    image: string;
    place: string;
  } | null>(null);
  const [liveLocationState, setLiveLocationState] =
    useState<LiveLocationState>("idle");
  const [liveLocationAccuracy, setLiveLocationAccuracy] = useState<
    number | null
  >(null);
  const [liveLocationNotice, setLiveLocationNotice] = useState("");
  const [voiceTreeNotice, setVoiceTreeNotice] = useState("");
  const [liveTripMeters, setLiveTripMeters] = useState(0);
  const [desktopRoamEngaged, setDesktopRoamEngaged] = useState(false);
  const [desktopRoamCruise, setDesktopRoamCruise] = useState(false);
  const [desktopRoamControllerOpen, setDesktopRoamControllerOpen] =
    useState(false);
  desktopRoamControllerOpenRef.current = desktopRoamControllerOpen;
  const [eventLedgerVersion, setEventLedgerVersion] = useState(0);
  const [pocketBuddies, setPocketBuddies] = useState(listPocketBuddies);
  const [outingSetupOpen, setOutingSetupOpen] = useState(false);
  const [coreHintCollapsed, setCoreHintCollapsed] = useState(false);
  const [seedDrawerOpen, setSeedDrawerOpen] = useState(false);
  const [seedPouchIds, setSeedPouchIds] = useState(readPocketSeedPouch);
  const [activeSeedId, setActiveSeedId] = useState<string | null>(
    () => readPocketSeedPouch()[0] ?? null,
  );
  const [plantingAssetId, setPlantingAssetId] = useState<string | null>(null);
  const [pendingPlantPosition, setPendingPlantPosition] =
    useState<RoutePoint | null>(null);
  const [plantedPocketPlants, setPlantedPocketPlants] = useState<
    PocketPlanting[]
  >(readPocketPlantings);
  const [plantingSuccess, setPlantingSuccess] =
    useState<PocketPlanting | null>(null);
  const [streetPhotos, setStreetPhotos] = useState<StreetPhoto[]>(
    readStreetPhotos,
  );
  const [outingCameraScene, setOutingCameraScene] =
    useState<StreetPhotoScene | null>(null);
  const [selectedStreetPhoto, setSelectedStreetPhoto] =
    useState<StreetPhoto | null>(null);

  useEffect(() => {
    outingCameraOpenRef.current = Boolean(outingCameraScene);
  }, [outingCameraScene]);
  const [seedProgress, setSeedProgress] = useState(readPocketPlantProgress);
  const [walkAchievement, setWalkAchievement] =
    useState<WalkAchievementReward | null>(null);
  const walkAchievementTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeObstaclesRef = useRef<CircularRouteObstacle[]>([]);
  const [outingSetupFocus, setOutingSetupFocus] =
    useState<OutingSetupFocus>("summary");
  const [outingGuideId, setOutingGuideId] = useState(DEFAULT_OUTING_GUIDE_ID);
  const [outingPetIds, setOutingPetIds] = useState<string[]>([
    DEFAULT_OUTING_PET_ID,
  ]);
  const [outingPreviewPetId, setOutingPreviewPetId] = useState(
    DEFAULT_OUTING_PET_ID,
  );
  const [outingPocketBuddyIds, setOutingPocketBuddyIds] = useState<string[]>(
    () => {
      const first = listPocketBuddies().find(
        (buddy) => buddy.status === "in-pocket",
      );
      return first ? [first.id] : [];
    },
  );
  const [activeOutingPets, setActiveOutingPets] = useState<Agent3DProfile[]>([
    DEFAULT_OUTING_PET,
  ]);
  const [activeOutingGuide, setActiveOutingGuide] = useState<Agent3DProfile>(
    getCityCompanionGuide(DEFAULT_OUTING_GUIDE_ID).profile,
  );
  const [activeOutingPocketBuddies, setActiveOutingPocketBuddies] = useState<
    PocketBuddy[]
  >([]);
  const [activeOutingCompanionMode, setActiveOutingCompanionMode] =
    useState<OutingCompanionMode>("leash");
  const activeSeedAsset =
    POCKET_PLANT_ASSETS.find((asset) => asset.id === activeSeedId) ?? null;
  const plantingAsset =
    POCKET_PLANT_ASSETS.find((asset) => asset.id === plantingAssetId) ?? null;
  const plantingSuccessAsset = plantingSuccess
    ? POCKET_PLANT_ASSETS.find((asset) => asset.id === plantingSuccess.assetId) ?? null
    : null;
  useEffect(() => {
    const unsubscribe = subscribePocketPlantings(() => setPlantedPocketPlants(readPocketPlantings()));
    return () => { unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!voiceTreePlanting) return;
    return registerVoiceTreeMap({
      context: () => mapRef.current ? {
        walking: liveLocationActiveRef.current,
        mode: liveLocationModeRef.current,
        fix: voiceTreeFixRef.current,
      } : null,
      onResult: (result) => {
        setVoiceTreeNotice(result.message);
        if (result.planting) setPlantingSuccess(result.planting);
      },
    });
  }, [voiceTreePlanting]);
  useEffect(() => {
    const unsubscribe = subscribePocketPlantProgress(() => setSeedProgress(readPocketPlantProgress()));
    return () => { unsubscribe(); };
  }, []);
  useEffect(() => {
    if (seedPouchIds.length > 0) return;
    const firstUnlockedSeed = POCKET_PLANT_ASSETS.find(
      (asset) => (seedProgress.inventory[asset.id] ?? 0) > 0,
    );
    if (!firstUnlockedSeed) return;
    const next = [firstUnlockedSeed.id];
    setSeedPouchIds(next);
    setActiveSeedId(firstUnlockedSeed.id);
    writePocketSeedPouch(next);
  }, [seedPouchIds.length, seedProgress.inventory]);
  useEffect(() => {
    const unsubscribe = subscribeStreetPhotos(() =>
      setStreetPhotos(readStreetPhotos()),
    );
    return () => unsubscribe();
  }, []);
  useEffect(
    () => () => {
      if (walkAchievementTimerRef.current) {
        clearTimeout(walkAchievementTimerRef.current);
      }
    },
    [],
  );
  routeObstaclesRef.current = [
    {
      center: POEM_PLANT_WALK_DEMO_POSITION,
      clearanceMeters: POEM_PLANT_CLEARANCE_METERS,
      side: 1,
    },
    ...DISPLAY_PLANTS.filter(
      (plant) =>
        isGardenCityLoaded(plant, loadedGardenCityIds) &&
        isGardenPlantVisible(
          plant.id,
          worldLayer,
          undefined,
          showLegacyGardenPlants,
        ),
    ).map(
      (plant): CircularRouteObstacle => ({
        center: plant.position,
        clearanceMeters: plant.giantTheme ? 15 : 6,
        side: 1,
      }),
    ),
    ...plantedPocketPlants.map(
      (planting): CircularRouteObstacle => ({
        center: planting.position,
        clearanceMeters: 5,
        side: 1,
      }),
    ),
  ];
  const groundTheme =
    GROUND_THEMES.find((theme) => theme.id === groundThemeId) ||
    GROUND_THEMES[0];
  const groundThemeRef = useRef(groundTheme);
  groundThemeRef.current = groundTheme;
  const latestDuty = listDutySessions().at(-1);
  const isPlantVisible = (mapPlantId: string, layer = worldLayer) => {
    const plant = DISPLAY_PLANTS.find(
      (candidate) => candidate.id === mapPlantId,
    );
    return (
      (!plant || isGardenCityLoaded(plant, loadedGardenCityIds)) &&
      isGardenPlantVisibleAtZoom(
      mapPlantId,
      layer,
      mapZoom,
      undefined,
      showLegacyGardenPlants,
      )
    );
  };
  const loadedPublicGardenCount = PUBLIC_GARDEN_CITY_PACKAGES.filter((city) =>
    loadedGardenCityIds.includes(city.id),
  ).reduce((total, city) => total + city.sites.length, 0);
  const recordNearbyBloomVisit = ({
    position,
    dutySessionId,
    actorAgentId,
    provenance,
    evidence,
    accuracyMeters,
  }: {
    position: RoutePoint;
    dutySessionId: string;
    actorAgentId: string;
    provenance: ProvenanceLevel;
    evidence: "gps-proximity" | "simulated-route";
    accuracyMeters?: number;
  }) => {
    if (
      accuracyMeters !== undefined &&
      accuracyMeters > MAX_BLOOM_VISIT_ACCURACY_METERS
    ) {
      return;
    }
    const layer = worldLayerRef.current;
    const match = findNearestBloomWithin(
      position,
      DISPLAY_PLANTS.filter((plant) =>
        isGardenCityLoaded(plant, loadedGardenCityIdsRef.current) &&
        isGardenPlantVisible(
          plant.id,
          layer,
          undefined,
          showLegacyGardenPlants,
        ),
      ),
      BLOOM_VISIT_RADIUS_METERS,
    );
    if (!match) return;

    const { bloom, distanceMeters } = match;
    const [eventLng, eventLat] = amapPositionToWgs84(bloom.position);
    appendCityEvent({
      id: `${dutySessionId}:passed-bloom:${bloom.id}`,
      kind: "passed-bloom",
      actorAgentIds: [actorAgentId],
      dutySessionId,
      bloomId: bloom.id,
      geo: {
        lng: eventLng,
        lat: eventLat,
        accuracy: accuracyMeters,
      },
      provenance,
      payload: {
        bloomName: bloom.name,
        evidence,
        distanceMeters: Math.round(distanceMeters * 10) / 10,
      },
    });

    const residentAgent = getResidentAgentForMapPlant(bloom.id, layer);
    if (!residentAgent) return;
    appendCityEvent({
      id: `${dutySessionId}:agent-encounter:${bloom.id}:${residentAgent.id}`,
      kind: "agent-encounter",
      actorAgentIds: [actorAgentId, residentAgent.id],
      dutySessionId,
      bloomId: bloom.id,
      geo: {
        lng: eventLng,
        lat: eventLat,
        accuracy: accuracyMeters,
      },
      provenance,
      visibility: "private",
      payload: {
        residentAgentName: residentAgent.name,
        activityLabel: residentAgent.activityLabel,
        evidence,
        distanceMeters: Math.round(distanceMeters * 10) / 10,
      },
    });
  };
  const encounterPlant = DISPLAY_PLANTS.find(
    (plant) => plant.id === encounterId,
  );
  const selectedPlantCard = DISPLAY_PLANTS.find(
    (plant) => plant.id === selectedPlantCardId,
  );
  const selectedPlantCardAsset = selectedPlantCard
    ? catalogAssetForPlant(selectedPlantCard)
    : null;
  const selectedPlantCardHash = selectedPlantCard
    ? stableCharacterHash(selectedPlantCard.id)
    : 0;
  const selectedMemory = GARDEN_MEMORY_FRAGMENTS.find(
    (fragment) => fragment.id === selectedMemoryId,
  );
  const selectedMemoryOriginal = selectedMemory
    ? selectCompleteGujiExcerpt(selectedMemory.quote, selectedMemory.name)
    : "";
  const postcardHostPlant = DISPLAY_PLANTS.find(
    (plant) => plant.id === POSTCARD_HOST_PLANT_ID,
  );
  const selectedPostcard =
    selectedPostcardIndex === null
      ? null
      : GARDEN_POSTCARDS[selectedPostcardIndex];
  const outingGuides = CITY_COMPANION_GUIDES;
  const outingPets = WALKING_COMPANION_ROSTER.filter(
    (pet) => !HIDDEN_OUTING_PET_IDS.has(pet.id),
  );
  const selectedOutingPets = outingPets.filter((pet) =>
    outingPetIds.includes(pet.id),
  );
  const selectedOutingPet = selectedOutingPets[0] ?? null;
  const previewOutingPet =
    outingPets.find((pet) => pet.id === outingPreviewPetId) ??
    selectedOutingPet ??
    outingPets[0];
  const selectedOutingGuide = getCityCompanionGuide(
    outingGuideId,
    outingGuides,
  );
  const localPortablePocketBuddies = pocketBuddies.filter(
    (buddy) => buddy.status === "in-pocket",
  );
  const portablePocketBuddies = buildOutingPocketBuddyOptions(
    localPortablePocketBuddies,
  );
  const selectedOutingPocketBuddies = portablePocketBuddies.filter((buddy) =>
    outingPocketBuddyIds.includes(buddy.id),
  );
  const availableOutingSeeds = [
    ...POCKET_PLANT_ASSETS.filter((asset) => seedPouchIds.includes(asset.id)),
    ...POCKET_PLANT_ASSETS.filter(
      (asset) =>
        !seedPouchIds.includes(asset.id) &&
        (seedProgress.inventory[asset.id] ?? 0) > 0,
    ),
    ...POCKET_PLANT_ASSETS.filter(
      (asset) =>
        !seedPouchIds.includes(asset.id) &&
        (seedProgress.inventory[asset.id] ?? 0) <= 0,
    ),
  ].slice(0, 8);
  const legacyMapScale = mapAgentScaleAtZoom(mapZoom);
  const liveOutingMapScale = liveOutingVisualScaleAtZoom(mapZoom);
  const liveOutingVisible =
    liveLocationState === "requesting" ||
    liveLocationState === "active" ||
    liveLocationState === "preview";
  const liveOutingLocationMode: LiveOutingLocationMode =
    liveLocationState === "preview" ? "preview" : "gps";

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setZoomAndCenter(initialZoom, initialCenter, true);
    map.setPitch(initialPitch);
    map.setRotation(initialRotation);
    setTilted(initialPitch > 0);
  }, [initialCenter, initialPitch, initialRotation, initialZoom]);
  const encounterFollower = liveOutingVisible
    ? activeOutingPets[0] ?? activeOutingGuide
    : BUILTIN_CITY_AGENTS[0];
  const testFollower = RIGGED_DACHSHUND_MAP_AGENT;

  useEffect(() => {
    onLiveOutingChange?.(liveOutingVisible);
  }, [liveOutingVisible, onLiveOutingChange]);

  useEffect(() => {
    if (!selectedPlantCardId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedPlantCardId(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [selectedPlantCardId]);

  useEffect(
    () => () => {
      onLiveOutingChange?.(false);
    },
    [onLiveOutingChange],
  );

  useEffect(() => {
    const visiblePlantIds = selectVisibleGardenPlantIds({
      entries: plantMarkerButtonsRef.current,
      map: mapRef.current,
      container: mapContainerRef.current,
      layer: worldLayer,
      zoom: mapZoom,
      selectedId,
      loadedCityIds: loadedGardenCityIds,
      showLegacyGardenPlants,
    });
    plantMarkerButtonsRef.current.forEach((entry) => {
      syncPlantMarkerPresentation(entry, mapZoom, worldLayer);
      entry.button.classList.toggle(
        "is-selected",
        entry.plant.id === selectedId,
      );
      setPlantMarkerVisibility(entry, visiblePlantIds.has(entry.plant.id));
    });

    if (worldLayer === "public") {
      setSelectedMemoryId(null);
      setSelectedPostcardIndex(null);
      setGardenJournalOpen(false);
    }

    setEncounterId((currentId) => {
      if (!currentId || isPlantVisible(currentId, worldLayer)) {
        return currentId;
      }
      encounterActiveRef.current = false;
      setEncounterAnchor(null);
      setEncounterDestination(null);
      setRouteMode("idle");
      return null;
    });
  }, [
    loadedGardenCityIds,
    mapZoom,
    selectedId,
    showLegacyGardenPlants,
    worldLayer,
  ]);

  useEffect(() => {
    const postcardMarker = postcardMarkerRef.current;
    if (!postcardMarker) return;
    const visible =
      worldLayer === "personal" &&
      !liveOutingVisible &&
      !selectedMemoryId &&
      !gardenJournalOpen;
    if (visible) {
      postcardMarker.marker.show();
    } else {
      postcardMarker.marker.hide();
    }
  }, [gardenJournalOpen, liveOutingVisible, selectedMemoryId, worldLayer]);

  useEffect(() => {
    const visible =
      worldLayer === "personal" && memoryLayerVisible && !gardenJournalOpen;
    journalMapMarkersRef.current.forEach((marker) => {
      if (visible) {
        marker.show();
      } else {
        marker.hide();
      }
    });
  }, [gardenJournalOpen, memoryLayerVisible, worldLayer]);

  useEffect(() => {
    const marker = encounterMapMarkerRef.current;
    if (!marker) return;
    const position =
      lastLiveAmapPositionRef.current ??
      encounterPositionRef.current ??
      encounterPlant?.position;
    if ((encounterPlant || liveOutingVisible) && position) {
      marker.setPosition(position);
      marker.show();
    } else {
      marker.hide();
    }
  }, [encounterId, liveOutingVisible]);

  useEffect(
    () =>
      subscribePocketBuddies(() => {
        setPocketBuddies(listPocketBuddies());
      }),
    [],
  );

  useEffect(() => {
    const portableIds = new Set(
      pocketBuddies
        .filter((buddy) => buddy.status === "in-pocket")
        .map((buddy) => buddy.id),
    );
    setOutingPocketBuddyIds((current) => {
      const next = current.filter((id) => portableIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [pocketBuddies]);

  useEffect(
    () =>
      subscribeCityEvents(() => {
        setEventLedgerVersion((version) => version + 1);
      }),
    [],
  );

  useEffect(() => {
    if (selectedPostcardIndex === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedPostcardIndex(null);
      } else if (event.key === "ArrowLeft") {
        setSelectedPostcardIndex((current) =>
          current === null
            ? null
            : (current - 1 + GARDEN_POSTCARDS.length) % GARDEN_POSTCARDS.length,
        );
      } else if (event.key === "ArrowRight") {
        setSelectedPostcardIndex((current) =>
          current === null ? null : (current + 1) % GARDEN_POSTCARDS.length,
        );
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPostcardIndex]);

  useEffect(() => {
    if (!outingSetupOpen) return;
    const dialog = outingSetupDialogRef.current;
    if (!dialog) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusInitial = requestAnimationFrame(() => {
      dialog.querySelector<HTMLElement>("[data-outing-autofocus]")?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOutingSetupOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(focusableSelector),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(focusInitial);
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [outingSetupOpen]);

  useEffect(() => {
    if (!outingSetupOpen || outingSetupFocus === "summary") return;
    const scrollFrame = requestAnimationFrame(() => {
      outingSetupDialogRef.current
        ?.querySelector<HTMLElement>(
          `[data-outing-section="${outingSetupFocus}"]`,
        )
        ?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(scrollFrame);
  }, [outingSetupFocus, outingSetupOpen]);

  useEffect(() => {
    if (!mapRef.current) return;
    const nextMapStyle = groundTheme.mapStyle || GARDEN_STYLE;
    if (mapRef.current.getMapStyle?.() !== nextMapStyle) {
      mapRef.current.setMapStyle(nextMapStyle);
    }
    mapRef.current.setFeatures(["bg", "road"]);
    baseLayerRef.current?.setOpacity(1);
  }, [groundTheme]);

  const selectPlant = (plant: GardenPlant) => {
    if (!isGiantFlower(plant)) {
      setSelectedId(plant.id);
      setSelectedPlantCardId(plant.id);
      setEncounterId(null);
      setEncounterDestination(null);
      return;
    }

    setSelectedPlantCardId(null);
    // 普通查看只打开花下场景，不接管相机，也不把下一次地图点击
    // 解释成步行目的地。自动跟随只属于“测试”和“出门”。
    encounterActiveRef.current = false;
    encounterPositionRef.current = plant.position;
    // A map tap opens an observation scene; it does not prove that the user or
    // the duty agent physically reached this bloom. Visit/encounter events must
    // only be emitted by a trusted GPS or route-arrival path.
    if (testDutySessionIdRef.current) {
      finishDutySession(testDutySessionIdRef.current, "completed");
      testDutySessionIdRef.current = null;
    }
    setTestWalkActive(false);
    setEncounterDestination(null);
    setSelectedId(plant.id);
    setEncounterId(plant.id);
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!encounterPlant || !map) {
      if (liveLocationActiveRef.current) return;
      encounterMapMarkerRef.current?.hide();
      encounterActiveRef.current = false;
      encounterSessionRef.current = null;
      encounterPositionRef.current = null;
      setEncounterAnchor(null);
      encounterHeadingRef.current = 0;
      setEncounterHeading(0);
      setRouteMode("idle");
      return;
    }

    const isNewEncounter = encounterSessionRef.current !== encounterPlant.id;
    if (isNewEncounter) {
      encounterSessionRef.current = encounterPlant.id;
      encounterPositionRef.current = encounterPlant.position;
    }
    const routeStart = encounterPositionRef.current || encounterPlant.position;
    const isPointToPointRoute = encounterDestination !== null;
    const destination = encounterDestination;
    encounterActiveRef.current = isPointToPointRoute;
    let disposed = false;
    let raf = 0;
    let anchorRaf = 0;
    let previousMapUpdate = 0;
    let runnerPosition: RoutePoint = routeStart;
    let runnerHeadingPosition: RoutePoint = routeStart;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const metersPerSecond = reduceMotion
      ? 1.6
      : ENCOUNTER_SPEED_METERS_PER_SECOND;

    const syncRunnerAnchor = () => {
      if (
        disposed ||
        !isFiniteRoutePoint(runnerPosition) ||
        !isFiniteRoutePoint(runnerHeadingPosition)
      ) {
        return;
      }
      encounterMapMarkerRef.current?.setPosition(runnerPosition);
      const roadPixel = map.lngLatToContainer(runnerPosition);
      if (Number.isFinite(roadPixel?.x) && Number.isFinite(roadPixel?.y)) {
        const headingPixel = map.lngLatToContainer(runnerHeadingPosition);
        const heading = sceneYawFromScreenVector(
          Number(headingPixel?.x) - roadPixel.x,
          Number(headingPixel?.y) - roadPixel.y,
        );
        if (
          heading !== null &&
          Math.abs(heading - encounterHeadingRef.current) > 0.002
        ) {
          encounterHeadingRef.current = heading;
          setEncounterHeading(heading);
        }
      }
    };
    const syncRunnerAfterMapFrame = () => {
      cancelAnimationFrame(anchorRaf);
      anchorRaf = requestAnimationFrame(syncRunnerAnchor);
    };
    ["mapmove", "zoomchange", "rotatechange", "pitchchange"].forEach(
      (eventName) => map.on(eventName, syncRunnerAfterMapFrame),
    );

    syncRunnerAfterMapFrame();
    if (!destination) {
      setRouteMode("idle");
      return () => {
        disposed = true;
        cancelAnimationFrame(anchorRaf);
        ["mapmove", "zoomchange", "rotatechange", "pitchchange"].forEach(
          (eventName) => map.off(eventName, syncRunnerAfterMapFrame),
        );
      };
    }
    if (distanceInMeters(routeStart, destination) < 2) {
      setRouteMode("arrived");
      return () => {
        disposed = true;
        cancelAnimationFrame(anchorRaf);
        ["mapmove", "zoomchange", "rotatechange", "pitchchange"].forEach(
          (eventName) => map.off(eventName, syncRunnerAfterMapFrame),
        );
      };
    }

    setRouteMode("loading");
    loadAmap()
      .then((AMap) => {
        const options = {
          minRouteMeters: isPointToPointRoute ? 1 : 20,
        };
        return isPointToPointRoute
          ? requestAmapWalkingRouteNearDestination(
              AMap as any,
              routeStart,
              destination,
              options,
            )
          : requestAmapWalkingRoute(
              AMap as any,
              routeStart,
              destination,
              options,
            );
      })
      .catch(() => null)
      .then((walkingRoute) => {
        if (disposed) return;
        if (!walkingRoute) {
          // 路线服务失败时宁可停在原位，也不生成一条可能穿过水面或建筑的假路线。
          setRouteMode("fallback");
          return;
        }

        // 舍弃起点附近的接入段，再沿高德 steps.path 生成可无缝往返的道路巡航线。
        const roadRoute = trimRoute(
          walkingRoute,
          isNewEncounter ? ENCOUNTER_ROAD_ENTRY_TRIM_METERS : 0,
          isPointToPointRoute ? 1.5 : 6,
        );
        const safeRoadRoute = routeAroundGardenPlants(
          roadRoute,
          routeObstaclesRef.current,
          routeStart,
          destination,
        );
        const motionRoute = isPointToPointRoute
          ? safeRoadRoute
          : createPatrolRoute(safeRoadRoute);
        const startedAt = performance.now();
        setRouteMode("walking");

        const followRun = (now: number) => {
          if (disposed) return;
          if (now - previousMapUpdate >= ENCOUNTER_MAP_FRAME_MS) {
            const traveledMeters = ((now - startedAt) / 1000) * metersPerSecond;
            const runnerDistance = isPointToPointRoute
              ? Math.min(traveledMeters, motionRoute.totalMeters)
              : loopRouteDistance(traveledMeters, motionRoute.totalMeters);
            const cameraDistance = isPointToPointRoute
              ? Math.min(
                  runnerDistance + ENCOUNTER_CAMERA_LOOKAHEAD_METERS,
                  motionRoute.totalMeters,
                )
              : loopRouteDistance(
                  runnerDistance + ENCOUNTER_CAMERA_LOOKAHEAD_METERS,
                  motionRoute.totalMeters,
                );
            runnerPosition = pointAlongRoute(motionRoute, runnerDistance);
            encounterPositionRef.current = runnerPosition;
            const headingDistance = isPointToPointRoute
              ? Math.min(
                  runnerDistance + ROUTE_HEADING_LOOKAHEAD_METERS,
                  motionRoute.totalMeters,
                )
              : loopRouteDistance(
                  runnerDistance + ROUTE_HEADING_LOOKAHEAD_METERS,
                  motionRoute.totalMeters,
                );
            runnerHeadingPosition = pointAlongRoute(
              motionRoute,
              headingDistance,
            );
            const cameraPosition = pointAlongRoute(motionRoute, cameraDistance);

            map.setCenter(cameraPosition, true);
            syncRunnerAfterMapFrame();
            previousMapUpdate = now;

            if (
              isPointToPointRoute &&
              runnerDistance >= motionRoute.totalMeters
            ) {
              setRouteMode("arrived");
              return;
            }
          }
          raf = requestAnimationFrame(followRun);
        };
        raf = requestAnimationFrame(followRun);
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(anchorRaf);
      ["mapmove", "zoomchange", "rotatechange", "pitchchange"].forEach(
        (eventName) => map.off(eventName, syncRunnerAfterMapFrame),
      );
    };
  }, [encounterDestination, encounterPlant]);

  useEffect(() => {
    const map = mapRef.current;
    const AMap = amapApiRef.current;
    if (!testWalkActive || !map || !AMap) {
      testRoutePosesLiveRef.current = null;
      testRouteMapMarkerRef.current?.hide();
      setTestRoutePoses(null);
      return;
    }

    let disposed = false;
    let raf = 0;
    let anchorRaf = 0;
    let previousFrame = performance.now();
    let previousMotionUpdate = 0;
    let previousCameraCheck = 0;
    let previousDutySampleAt = Number.NEGATIVE_INFINITY;
    let legacyDistance = 5;
    let riggedDistance = TEST_ROUTE_RIGGED_START_METERS;
    const routeStartPosition = poemPlantWalkDemo
      ? POEM_PLANT_WALK_DEMO_ROUTE_START
      : TEST_WALK_PLANT.position;
    let legacyPosition: RoutePoint = routeStartPosition;
    let riggedPosition: RoutePoint = routeStartPosition;
    let legacyHeadingPosition: RoutePoint = routeStartPosition;
    let riggedHeadingPosition: RoutePoint = routeStartPosition;
    let lastLegacyHeading = 0;
    let lastRiggedHeading = 0;
    let posesMounted = false;
    const metersPerSecond = TEST_WALK_SPEED_METERS_PER_SECOND;
    const motionFrameMs = isLikelyMobileDevice() ? 1000 / 30 : 0;

    const projectPose = (
      position: RoutePoint,
      headingPosition: RoutePoint,
      previousHeading: number,
    ): GardenRoutePose | null => {
      const pixel = map.lngLatToContainer(position);
      const headingPixel = map.lngLatToContainer(headingPosition);
      if (
        !Number.isFinite(pixel?.x) ||
        !Number.isFinite(pixel?.y) ||
        !Number.isFinite(headingPixel?.x) ||
        !Number.isFinite(headingPixel?.y)
      ) {
        return null;
      }
      const nextHeading = sceneYawFromScreenVector(
        headingPixel.x - pixel.x,
        headingPixel.y - pixel.y,
      );
      return {
        anchor: [pixel.x, pixel.y],
        heading: nextHeading ?? previousHeading,
      };
    };

    const syncRoutePoses = () => {
      if (disposed) return;
      const legacy = projectPose(
        legacyPosition,
        legacyHeadingPosition,
        lastLegacyHeading,
      );
      const rigged = projectPose(
        riggedPosition,
        riggedHeadingPosition,
        lastRiggedHeading,
      );
      if (!legacy || !rigged) return;
      lastLegacyHeading = legacy.heading;
      lastRiggedHeading = rigged.heading;
      const poses = { legacy, rigged };
      testRoutePosesLiveRef.current = poses;
      const activePosition =
        testAgentModeRef.current === "legacy" ? legacyPosition : riggedPosition;
      testRouteMapMarkerRef.current?.setPosition(activePosition);
      testRouteMapMarkerRef.current?.show();
      if (!posesMounted) {
        posesMounted = true;
        setTestRoutePoses(poses);
      }
    };

    const syncAfterMapFrame = () => {
      if (anchorRaf) return;
      anchorRaf = requestAnimationFrame(() => {
        anchorRaf = 0;
        syncRoutePoses();
      });
    };

    const keepActiveAgentInView = (now: number) => {
      if (now - previousCameraCheck < TEST_ROUTE_CAMERA_CHECK_MS) return;
      previousCameraCheck = now;
      const container = mapContainerRef.current;
      if (!container) return;
      const activePosition =
        testAgentModeRef.current === "legacy" ? legacyPosition : riggedPosition;
      const pixel = map.lngLatToContainer(activePosition);
      if (!Number.isFinite(pixel?.x) || !Number.isFinite(pixel?.y)) return;
      const horizontalPadding = Math.min(
        110,
        Math.max(64, container.clientWidth * 0.2),
      );
      const topPadding = Math.min(
        140,
        Math.max(96, container.clientHeight * 0.24),
      );
      const bottomPadding = Math.min(
        120,
        Math.max(76, container.clientHeight * 0.18),
      );
      if (
        pixel.x >= horizontalPadding &&
        pixel.x <= container.clientWidth - horizontalPadding &&
        pixel.y >= topPadding &&
        pixel.y <= container.clientHeight - bottomPadding
      ) {
        return;
      }
      map.setCenter(activePosition, true);
      syncAfterMapFrame();
    };

    ["mapmove", "zoomchange", "rotatechange", "pitchchange"].forEach(
      (eventName) => map.on(eventName, syncAfterMapFrame),
    );
    // 用户仍可拖拽和缩放；角色接近手机视窗边缘时才重新回中，避免测试路线走丢。
    map.setZoomAndCenter(ENCOUNTER_ZOOM, routeStartPosition);
    setRouteMode("loading");

    requestAmapWalkingRoute(
      AMap,
      routeStartPosition,
      poemPlantWalkDemo
        ? POEM_PLANT_WALK_DEMO_ROUTE_END
        : TEST_WALK_DESTINATION,
      { minRouteMeters: 20 },
    )
      .catch(() => null)
      .then((walkingRoute) => {
        if (disposed) return;
        if (!walkingRoute) {
          setRouteMode("fallback");
          return;
        }
        const roadRoute = trimRoute(
          walkingRoute,
          ENCOUNTER_ROAD_ENTRY_TRIM_METERS,
          6,
        );
        const routeDestination = poemPlantWalkDemo
          ? POEM_PLANT_WALK_DEMO_ROUTE_END
          : TEST_WALK_DESTINATION;
        const safeRoadRoute = routeAroundGardenPlants(
          roadRoute,
          routeObstaclesRef.current,
          routeStartPosition,
          routeDestination,
        );
        const motionRoute = createPatrolRoute(safeRoadRoute);
        legacyDistance = loopRouteDistance(
          legacyDistance,
          motionRoute.totalMeters,
        );
        riggedDistance = loopRouteDistance(
          riggedDistance,
          motionRoute.totalMeters,
        );
        setRouteMode("walking");

        const updateRoutePoints = () => {
          legacyPosition = pointAlongRoute(motionRoute, legacyDistance);
          riggedPosition = pointAlongRoute(motionRoute, riggedDistance);
          legacyHeadingPosition = pointAlongRoute(
            motionRoute,
            loopRouteDistance(
              legacyDistance + ROUTE_HEADING_LOOKAHEAD_METERS,
              motionRoute.totalMeters,
            ),
          );
          riggedHeadingPosition = pointAlongRoute(
            motionRoute,
            loopRouteDistance(
              riggedDistance + ROUTE_HEADING_LOOKAHEAD_METERS,
              motionRoute.totalMeters,
            ),
          );
        };

        updateRoutePoints();
        syncAfterMapFrame();

        const followSharedRoute = (now: number) => {
          if (disposed) return;
          if (
            motionFrameMs &&
            previousMotionUpdate &&
            now - previousMotionUpdate < motionFrameMs
          ) {
            raf = requestAnimationFrame(followSharedRoute);
            return;
          }
          previousMotionUpdate = now;
          const deltaSeconds = Math.min((now - previousFrame) / 1000, 0.08);
          previousFrame = now;
          const stepMeters = deltaSeconds * metersPerSecond;
          if (testAgentModeRef.current === "legacy") {
            legacyDistance = loopRouteDistance(
              legacyDistance + stepMeters,
              motionRoute.totalMeters,
            );
          } else {
            riggedDistance = loopRouteDistance(
              riggedDistance + stepMeters,
              motionRoute.totalMeters,
            );
          }
          updateRoutePoints();
          // 路线坐标直接写入 Three.js 读取的实时引用，不再等待 React
          // state 提交；旋转和路线前进不会额外落后一到两帧。
          syncRoutePoses();
          keepActiveAgentInView(now);
          if (
            testDutySessionIdRef.current &&
            now - previousDutySampleAt >= 1200
          ) {
            const activePosition =
              testAgentModeRef.current === "legacy"
                ? legacyPosition
                : riggedPosition;
            const [lng, lat] = amapPositionToWgs84(activePosition);
            appendDutyRoutePoint(testDutySessionIdRef.current, {
              lng,
              lat,
            });
            recordNearbyBloomVisit({
              position: activePosition,
              dutySessionId: testDutySessionIdRef.current,
              actorAgentId: IDENTITY_PROXY_AGENT_ID,
              provenance: "agent-report",
              evidence: "simulated-route",
            });
            previousDutySampleAt = now;
          }

          raf = requestAnimationFrame(followSharedRoute);
        };
        raf = requestAnimationFrame(followSharedRoute);
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(anchorRaf);
      testRoutePosesLiveRef.current = null;
      testRouteMapMarkerRef.current?.hide();
      ["mapmove", "zoomchange", "rotatechange", "pitchchange"].forEach(
        (eventName) => map.off(eventName, syncAfterMapFrame),
      );
    };
  }, [poemPlantWalkDemo, testWalkActive]);

  useEffect(
    () => () => {
      liveLocationActiveRef.current = false;
      voiceTreeFixRef.current = null;
      if (voiceMapRequestIdRef.current) cancelVoiceMapMode(voiceMapRequestIdRef.current, "已离开地图，这次真实 GPS 定位已取消。");
      liveLocationStopRef.current?.();
      liveLocationStopRef.current = null;
      if (testDutySessionIdRef.current) {
        finishDutySession(testDutySessionIdRef.current, "cancelled");
        testDutySessionIdRef.current = null;
      }
      if (liveDutySessionIdRef.current) {
        finishDutySession(liveDutySessionIdRef.current, "cancelled");
        liveDutySessionIdRef.current = null;
      }
      void walkingWakeLockRef.current?.stop();
      walkingWakeLockRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (
      !AMAP_KEY ||
      !mapContainerRef.current ||
      !plantOverlayRef.current ||
      !memoryOverlayRef.current
    ) {
      return;
    }

    let disposed = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let createdMap: any = null;
    let mapResizeObserver: ResizeObserver | null = null;
    let plantVisibilityObserver: IntersectionObserver | null = null;
    let startupSceneSyncFrame = 0;
    const startupSceneSyncTimers: number[] = [];
    const markerRoots: Array<Pick<Root, "unmount">> = [];
    const nativeMarkers: AmapDomMarker[] = [];
    const markerButtons: GardenPlantMarkerEntry[] = [];
    const journalSignButtons: {
      button: HTMLButtonElement;
      marker: AmapDomMarker;
      sign: GardenJournalSign;
    }[] = [];
    plantMarkerButtonsRef.current = [];

    loadAmap()
      .then((loaded) => {
        if (
          disposed ||
          !mapContainerRef.current ||
          !plantOverlayRef.current ||
          !memoryOverlayRef.current
        ) {
          return;
        }
        // 高德没有随包提供完整 TypeScript 类型；所有调用都集中在这个适配边界内。
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const AMap = loaded as any;
        amapApiRef.current = AMap;
        const initialView = initialViewRef.current;
        const initialGroundTheme = groundThemeRef.current;
        const baseLayer = new AMap.createDefaultLayer({
          zooms: [3, 20],
          visible: true,
          opacity: 1,
          zIndex: 0,
        });
        baseLayerRef.current = baseLayer;
        createdMap = new AMap.Map(mapContainerRef.current, {
          viewMode: "3D",
          center: initialView.center,
          zoom: initialView.zoom,
          pitch: initialView.pitch,
          rotation: initialView.rotation,
          mapStyle: initialGroundTheme.mapStyle || GARDEN_STYLE,
          layers: [baseLayer],
          features: ["bg", "road"],
          showLabel: true,
          showBuildingBlock: false,
          pitchEnable: false,
          rotateEnable: true,
          dragEnable: true,
          zoomEnable: true,
          animateEnable: !staticPresentation,
          WebGLParams: { preserveDrawingBuffer: true },
        });
        mapRef.current = createdMap;
        if (import.meta.env.MODE === "ios") {
          createdMap.on("complete", () => {
            if (disposed) return;
            console.info("[amap] rendered", JSON.stringify({
              style: createdMap.getMapStyle?.(),
              canvas: mapContainerRef.current?.querySelectorAll("canvas.amap-layer").length,
              rasterTiles: mapContainerRef.current?.querySelectorAll("img.amap-tile").length,
            }));
          });
        }
        onMapReadyRef.current?.(createdMap);
        // 楼块默认关闭，点击开关后才加载；可选 3D 图层不能阻断基础地图。

        plantVisibilityObserver = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              entry.target.classList.toggle(
                "is-in-viewport",
                entry.isIntersecting,
              );
            });
          },
          {
            root: mapContainerRef.current,
            rootMargin: "96px",
          },
        );

        const plantablePlants = DISPLAY_PLANTS.filter(
          (plant) =>
            (plant.id.startsWith("route-") ||
              plant.id.startsWith("city-flower-") ||
              Boolean(plant.siteId) ||
              isPlantablePosition(plant.position)) &&
            (isGardenPlantVisible(
              plant.id,
              "personal",
              undefined,
              showLegacyGardenPlants,
            ) ||
              isGardenPlantVisible(
                plant.id,
                "public",
                undefined,
                showLegacyGardenPlants,
              )),
        );
        plantablePlants.forEach((plant, index) => {
          const { button, root } = createPlantButton(plant, index, showResidentAgents, () => {
            selectPlant(plant);
          });
          markerRoots.push(root);
          let markerEntry: GardenPlantMarkerEntry;
          markerEntry = {
            button,
            createMarker: () => {
              const marker = new AMap.Marker({
                position: plant.position,
                content: button,
                anchor: "bottom-center",
                zIndex: markerEntry.zIndex,
              }) as AmapDomMarker;
              nativeMarkers.push(marker);
              plantVisibilityObserver?.observe(button);
              return marker;
            },
            map: createdMap,
            marker: null,
            plant,
            root,
            baseScale: plantVisualScale(plant),
            baseZIndex: plant.giantTheme ? 136 : 128,
            zIndex: plant.giantTheme ? 136 : 128,
            visible: false,
          };
          markerButtons.push(markerEntry);
          plantMarkerButtonsRef.current.push(markerEntry);
          setPlantMarkerVisibility(markerEntry, false);
        });

        GARDEN_JOURNAL_SIGNS.forEach((sign, signIndex) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `sg-journal-sign sg-live-journal-sign sg-journal-sign--${sign.kind}`;
          button.dataset.journalSignId = sign.id;
          button.setAttribute("aria-label", `查看花园手帐标牌：${sign.kicker}`);
          button.setAttribute("data-ignore-map-destination", "");
          button.style.setProperty("--journal-sign-width", `${sign.width}px`);
          button.style.setProperty(
            "--journal-sign-accent",
            sign.accent || "#397560",
          );
          button.style.setProperty(
            "--journal-sign-rotation",
            `${((signIndex * 7) % 11) - 5}deg`,
          );

          if (sign.image) {
            const image = document.createElement("img");
            image.src = sign.image;
            image.alt = "";
            image.draggable = false;
            button.append(image);
          }
          const copy = document.createElement("span");
          copy.className = "sg-journal-sign-copy";
          const kicker = document.createElement("small");
          kicker.textContent = sign.kicker;
          const title = document.createElement("strong");
          title.textContent = sign.title;
          const body = document.createElement("span");
          body.className = "sg-journal-sign-body";
          body.textContent = sign.body;
          copy.append(kicker, title, body);
          button.append(copy);
          button.addEventListener("click", (event) => {
            event.stopPropagation();
            if (sign.memoryId) {
              setSelectedPostcardIndex(null);
              setSelectedMemoryId(sign.memoryId);
              setMemoryPage(0);
            } else if (sign.postcardIndex !== undefined) {
              setSelectedMemoryId(null);
              setSelectedPostcardIndex(sign.postcardIndex);
            } else {
              const firstMemory = GARDEN_MEMORY_FRAGMENTS[0];
              if (firstMemory) {
                setSelectedMemoryId(firstMemory.id);
                setMemoryPage(0);
              }
            }
          });
          const marker = new AMap.Marker({
            map: createdMap,
            position: sign.position,
            content: button,
            anchor: "bottom-center",
            zIndex: 152,
          }) as AmapDomMarker;
          marker.hide();
          nativeMarkers.push(marker);
          journalSignButtons.push({ button, marker, sign });
        });
        journalMapMarkersRef.current = journalSignButtons.map(
          ({ marker }) => marker,
        );

        if (postcardHostPlant) {
          const { button, root } = createPostcardButton(() => {
            setSelectedMemoryId(null);
            setMemoryLayerVisible(false);
            setSelectedPostcardIndex(0);
          });
          const marker = new AMap.Marker({
            map: createdMap,
            position: postcardHostPlant.position,
            content: button,
            anchor: "bottom-center",
            offset: new AMap.Pixel(30, -48),
            zIndex: 164,
          }) as AmapDomMarker;
          markerRoots.push(root);
          nativeMarkers.push(marker);
          postcardMarkerRef.current = { button, marker };
          if (worldLayerRef.current !== "personal") marker.hide();
        }

        const encounterMarkerHostElement = document.createElement("div");
        encounterMarkerHostElement.className = "sg-encounter-marker-host";
        const encounterMarker = new AMap.Marker({
          map: createdMap,
          position: GARDEN_CENTER,
          content: encounterMarkerHostElement,
          anchor: "top-left",
          zIndex: 190,
        }) as AmapDomMarker;
        encounterMarker.hide();
        nativeMarkers.push(encounterMarker);
        encounterMapMarkerRef.current = encounterMarker;
        setEncounterMarkerHost(encounterMarkerHostElement);

        const testRouteMarkerHostElement = document.createElement("div");
        testRouteMarkerHostElement.className = "sg-route-marker-host";
        const testRouteMarker = new AMap.Marker({
          map: createdMap,
          position: poemPlantWalkDemo
            ? POEM_PLANT_WALK_DEMO_ROUTE_START
            : TEST_WALK_PLANT.position,
          content: testRouteMarkerHostElement,
          anchor: "top-left",
          zIndex: 192,
        }) as AmapDomMarker;
        testRouteMarker.hide();
        nativeMarkers.push(testRouteMarker);
        testRouteMapMarkerRef.current = testRouteMarker;

        const fixedPolaroidFlowerHosts: HTMLDivElement[] = [];
        if (worldLayerRef.current === "public") {
          HANGZHOU_POLAROID_FLOWERS.forEach((flower, index) => {
            const flowerHost = document.createElement("div");
            flowerHost.setAttribute("data-hangzhou-polaroid-flower", flower.id);
            flowerHost.setAttribute(
              "data-pocket-plant-asset-id",
              flower.asset.id,
            );
            flowerHost.setAttribute("data-ignore-map-destination", "");
            flowerHost.setAttribute(
              "aria-label",
              `${flower.place}的${flower.asset.name}${flower.polaroidImage ? "，茎上挂有明信片" : ""}`,
            );
            flowerHost.style.width = "112px";
            flowerHost.style.height = "154px";
            flowerHost.style.padding = "0";
            flowerHost.style.border = "0";
            flowerHost.style.background = "transparent";
            flowerHost.style.pointerEvents = flower.polaroidImage ? "auto" : "none";
            flowerHost.style.transformOrigin = "50% 100%";
            const openFlowerPostcard = (event: Event) => {
              const card = event.target instanceof Element
                ? event.target.closest("[data-flower-postcard]")
                : null;
              if (!card || !flower.polaroidImage) return;
              event.preventDefault();
              event.stopPropagation();
              setSelectedFlowerPostcard({
                image: flower.polaroidImage,
                place: flower.place,
              });
            };
            flowerHost.addEventListener("pointerdown", (event) => {
              if (
                event.target instanceof Element &&
                event.target.closest("[data-flower-postcard]")
              ) {
                event.stopPropagation();
              }
            });
            flowerHost.addEventListener("click", openFlowerPostcard, true);
            flowerHost.addEventListener("keydown", (event) => {
              if (event.key === "Enter" || event.key === " ") {
                openFlowerPostcard(event);
              }
            });

            const flowerRoot = createRoot(flowerHost);
            flowerRoot.render(
              <HangzhouPolaroidFlowerVisual
                flower={flower}
                onOpen={() => {
                  if (!flower.polaroidImage) return;
                  setSelectedFlowerPostcard({
                    image: flower.polaroidImage,
                    place: flower.place,
                  });
                }}
              />,
            );
            markerRoots.push(flowerRoot);
            const flowerMarker = new AMap.Marker({
              map: createdMap,
              position: flower.position,
              content: flowerHost,
              anchor: "bottom-center",
              zIndex: flower.polaroidImage ? 260 : 188 + (index % 3),
            }) as AmapDomMarker;
            nativeMarkers.push(flowerMarker);
            fixedPolaroidFlowerHosts.push(flowerHost);
          });
        }

        const syncScene = () => {
          const currentZoom = readGardenSceneZoom(createdMap.getZoom());
          if (currentZoom === null) return;
          const mapScale = 2 ** (currentZoom - GARDEN_ZOOM);
          if (fixedPolaroidFlowerHosts.length > 0) {
            const poemPlantScale = Math.min(
              1,
              Math.max(1 / 3, 2 ** ((currentZoom - GARDEN_ZOOM) / 2)),
            );
            fixedPolaroidFlowerHosts.forEach((host) => {
              host.style.transform = `scale(${poemPlantScale})`;
            });
          }
          setMapZoom(currentZoom);
          const visiblePlantIds = selectVisibleGardenPlantIds({
            entries: markerButtons,
            map: createdMap,
            container: mapContainerRef.current,
            layer: worldLayerRef.current,
            zoom: currentZoom,
            loadedCityIds: loadedGardenCityIdsRef.current,
            showLegacyGardenPlants,
          });
          markerButtons.forEach((entry) => {
            syncPlantMarkerPresentation(
              entry,
              currentZoom,
              worldLayerRef.current,
            );
            entry.button.classList.toggle(
              "is-city-overview",
              currentZoom < PUBLIC_BLOOM_MEDIUM_ZOOM,
            );
            entry.button.classList.toggle(
              "is-agent-midrange",
              currentZoom >= (entry.plant.siteId ? 16.6 : 14.2),
            );
            entry.button.classList.toggle(
              "is-agent-closeup",
              currentZoom >= (entry.plant.siteId ? 17.05 : 16.15),
            );
            setPlantMarkerVisibility(
              entry,
              visiblePlantIds.has(entry.plant.id),
            );
          });
          const postcardMapScale = gardenPostcardMapScale(
            mapScale,
            postcardHostPlant
              ? plantVisualScale(postcardHostPlant)
              : PUBLIC_PLANT_MIN_FINAL_SCALE,
            worldLayerRef.current === "public"
              ? PUBLIC_PLANT_MIN_FINAL_SCALE
              : 0,
          );
          postcardMarkerRef.current?.button.style.setProperty(
            "--postcard-scale",
            String(postcardMapScale * 0.56),
          );
          const postcardOffset =
            gardenPostcardOffsetAtScale(postcardMapScale);
          postcardMarkerRef.current?.marker.setOffset?.(
            new AMap.Pixel(postcardOffset[0], postcardOffset[1]),
          );
          journalSignButtons.forEach(({ button, marker, sign }) => {
            const hostPlant = DISPLAY_PLANTS.find(
              (plant) => plant.position === sign.position,
            );
            const hostScale =
              (hostPlant ? plantVisualScale(hostPlant) : 0.26) * mapScale;
            marker.setOffset?.(new AMap.Pixel(22, -154 * hostScale * 0.42));
            button.style.setProperty(
              "--journal-sign-scale",
              String(Math.min(1.04, Math.max(0.28, mapScale * 0.62))),
            );
          });
          testRouteMarkerHostElement.style.setProperty(
            "--sg-route-map-scale",
            String(Math.min(1.85, mapScale)),
          );
        };
        ["complete", "zoomchange", "moveend"].forEach((eventName) =>
          createdMap.on(eventName, syncScene),
        );
        mapResizeObserver = new ResizeObserver(() => {
          createdMap.resize?.();
          syncScene();
        });
        mapResizeObserver.observe(mapContainerRef.current);
        const scheduleStartupSceneSync = () => {
          // Chrome Android can finish AMap setup before the `complete`
          // listener above is attached. Recalculate through the first layout
          // settles so marker projection, size and density cannot remain in
          // their pre-camera state.
          syncScene();
          startupSceneSyncFrame = requestAnimationFrame(() => {
            if (disposed) return;
            createdMap.resize?.();
            syncScene();
            startupSceneSyncFrame = requestAnimationFrame(() => {
              if (!disposed) syncScene();
            });
          });
          [120, 480, 1_200].forEach((delay) => {
            startupSceneSyncTimers.push(
              window.setTimeout(() => {
                if (disposed) return;
                createdMap.resize?.();
                syncScene();
              }, delay),
            );
          });
        };
        scheduleStartupSceneSync();
        setMapState("amap");
      })
      .catch((error: unknown) => {
        if (disposed) return;
        console.error("高德地图加载失败", formatAmapError(error));
        setLiveLocationNotice("高德地图加载失败，当前显示的是示意图，请检查网络后重新进入地图。");
        setMapState("error");
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(startupSceneSyncFrame);
      startupSceneSyncTimers.forEach((timer) => window.clearTimeout(timer));
      // Parent tab teardown happens inside React's commit. Unmounting the
      // marker roots synchronously from that cleanup makes React warn about
      // nested root teardown, so let the current commit finish first.
      const rootsToUnmount = [...markerRoots];
      const mapToDestroy = createdMap;
      window.setTimeout(() => {
        rootsToUnmount.forEach((root) => root.unmount());
        mapToDestroy?.destroy();
      }, 0);
      mapResizeObserver?.disconnect();
      plantVisibilityObserver?.disconnect();
      plantMarkerButtonsRef.current = [];
      journalMapMarkersRef.current = [];
      postcardMarkerRef.current = null;
      encounterMapMarkerRef.current = null;
      testRouteMapMarkerRef.current = null;
      plantOverlayRef.current?.replaceChildren();
      memoryOverlayRef.current?.replaceChildren();
      if (createdMap && nativeMarkers.length > 0) {
        createdMap.remove(nativeMarkers);
      }
      onMapReadyRef.current?.(null);
      mapRef.current = null;
      baseLayerRef.current = null;
      buildingLayerRef.current = null;
      amapApiRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const AMap = amapApiRef.current;
    if (mapState !== "amap" || !map || !AMap) return;

    const markers: AmapDomMarker[] = [];
    const markerHosts: Array<{
      host: HTMLElement;
      growthStart?: number;
    }> = [];
    plantedPocketPlants.forEach((planting) => {
      const asset = POCKET_PLANT_ASSETS.find(
        (candidate) => candidate.id === planting.assetId,
      );
      if (!asset) return;

      const growth = pocketPlantGrowth(planting.plantedAt);
      const host = document.createElement("button");
      host.type = "button";
      const unseenVisitors = planting.visitors.some((visitor) => !visitor.seenAt);
      host.className = [
        "sg-user-pocket-plant",
        growth.remainingMs > 0 ? "is-growing" : "",
        planting.visibility === "public" ? "is-public" : "",
        unseenVisitors ? "has-unseen-visitors" : "",
        focusPocketPlantingId === planting.id ? "is-focused" : "",
      ].filter(Boolean).join(" ");
      host.dataset.pocketPlantingId = planting.id;
      host.dataset.pocketPlantAssetId = asset.id;
      host.dataset.ignoreMapDestination = "true";
      host.title = `${asset.name} · ${asset.description}`;
      host.setAttribute("aria-label", `查看${asset.name}的出生牌`);
      host.style.setProperty(
        "--pocket-growth-duration",
        `${Math.max(1, growth.remainingMs)}ms`,
      );
      markerHosts.push({ host, growthStart: growth.scale });

      const image = document.createElement("img");
      image.src = asset.src;
      image.alt = "";
      image.decoding = "async";
      image.draggable = false;
      host.append(image);
      host.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setPlantingSuccess(planting);
      });

      const marker = new AMap.Marker({
        map,
        position: planting.position,
        content: host,
        anchor: "bottom-center",
        zIndex: 214,
      }) as AmapDomMarker;
      markers.push(marker);
    });

    if (pendingPlantPosition && plantingAsset) {
      const host = document.createElement("div");
      host.className = "sg-pocket-plant-target";
      host.setAttribute("aria-label", `${plantingAsset.name}准备种在这里`);
      const image = document.createElement("img");
      image.src = plantingAsset.src;
      image.alt = "";
      image.draggable = false;
      const label = document.createElement("span");
      label.textContent = "种这里";
      host.append(image, label);
      const marker = new AMap.Marker({
        map,
        position: pendingPlantPosition,
        content: host,
        anchor: "bottom-center",
        zIndex: 220,
      }) as AmapDomMarker;
      markers.push(marker);
      markerHosts.push({ host });
    }

    const syncPocketPlantScale = () => {
      const zoom = readGardenSceneZoom(map.getZoom());
      if (zoom === null) return;
      const mapScale = mapMarkerScaleAtZoom(
        zoom,
        GARDEN_ZOOM,
        POCKET_PLANT_MIN_MAP_SCALE,
      );
      markerHosts.forEach(({ host, growthStart }) => {
        host.style.setProperty("--pocket-map-scale", mapScale.toFixed(3));
        if (growthStart === undefined) return;
        host.style.setProperty(
          "--pocket-growth-map-start",
          (growthStart * mapScale).toFixed(3),
        );
        host.style.setProperty(
          "--pocket-growth-map-peak",
          ((growthStart + 0.12) * mapScale).toFixed(3),
        );
      });
    };
    map.on("zoomchange", syncPocketPlantScale);
    map.on("moveend", syncPocketPlantScale);
    syncPocketPlantScale();

    pocketPlantMarkersRef.current = markers;
    return () => {
      map.off("zoomchange", syncPocketPlantScale);
      map.off("moveend", syncPocketPlantScale);
      try {
        map.remove(markers);
      } catch {
        markers.forEach((marker) => marker.setMap?.(null));
      }
      pocketPlantMarkersRef.current = [];
    };
  }, [focusPocketPlantingId, mapState, pendingPlantPosition, plantedPocketPlants, plantingAsset]);

  useEffect(() => {
    const map = mapRef.current;
    const AMap = amapApiRef.current;
    if (mapState !== "amap" || !map || !AMap) return;

    const markers: AmapDomMarker[] = [];
    streetPhotos.forEach((photo) => {
      if (!photo.hostPlant) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sg-street-photo-marker";
      button.dataset.ignoreMapDestination = "true";
      button.title = `${photo.place} · ${new Date(photo.capturedAt).toLocaleString("zh-CN")}拍摄`;
      button.setAttribute("aria-label", `打开挂在${photo.hostPlant.name}上的拍立得`);

      const image = document.createElement("img");
      image.src = getStreetPhotoMarkerImage(photo);
      image.alt = "";
      image.draggable = false;
      const caption = document.createElement("span");
      caption.textContent = photo.place;
      button.append(image, caption);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        setSelectedStreetPhoto(photo);
      });

      const marker = new AMap.Marker({
        map,
        position: photo.hostPlant.position,
        content: button,
        anchor: "bottom-center",
        offset: new AMap.Pixel(32, -58),
        zIndex: 226,
      }) as AmapDomMarker;
      markers.push(marker);
    });

    streetPhotoMarkersRef.current = markers;
    return () => {
      try {
        map.remove(markers);
      } catch {
        markers.forEach((marker) => marker.setMap?.(null));
      }
      streetPhotoMarkersRef.current = [];
    };
  }, [mapState, streetPhotos]);

  const syncLiveOutingPose = () => {
    const map = mapRef.current;
    if (!liveLocationActiveRef.current || !map) return;

    const position =
      lastLiveAmapPositionRef.current ||
      encounterPositionRef.current;
    if (!position) return;
    encounterMapMarkerRef.current?.setPosition(position);
    encounterMapMarkerRef.current?.show();

    if (!encounterMapMarkerRef.current) {
      const anchorPixel = map.lngLatToContainer(position);
      const anchorX = Number(anchorPixel?.x ?? anchorPixel?.getX?.());
      const anchorY = Number(anchorPixel?.y ?? anchorPixel?.getY?.());
      if (Number.isFinite(anchorX) && Number.isFinite(anchorY)) {
        setEncounterAnchor((current) =>
          current &&
          Math.abs(current[0] - anchorX) < 0.25 &&
          Math.abs(current[1] - anchorY) < 0.25
            ? current
            : [anchorX, anchorY],
        );
      }
    }

    const headingSegment = liveHeadingSegmentRef.current;
    const headingFrom = headingSegment?.from || position;
    const headingTo =
      headingSegment?.to || offsetPosition(position, 5, Math.PI / 2);
    const headingPixelFrom = map.lngLatToContainer(headingFrom);
    const headingPixelTo = map.lngLatToContainer(headingTo);
    const heading = sceneYawFromScreenVector(
      Number(headingPixelTo?.x ?? headingPixelTo?.getX?.()) -
        Number(headingPixelFrom?.x ?? headingPixelFrom?.getX?.()),
      Number(headingPixelTo?.y ?? headingPixelTo?.getY?.()) -
        Number(headingPixelFrom?.y ?? headingPixelFrom?.getY?.()),
    );
    if (
      heading !== null &&
      Math.abs(heading - encounterHeadingRef.current) > 0.002
    ) {
      encounterHeadingRef.current = heading;
      setEncounterHeading(heading);
    }
    refreshMapBuddyCollisionLayout();
  };

  const liveOutingSafeBottom = (container: HTMLElement) => {
    const normalBottom = container.clientHeight - 104;
    if (!desktopRoamControllerOpenRef.current) return normalBottom;
    const consoleElement = container
      .closest(".sg-map-stage")
      ?.querySelector<HTMLElement>(".sg-desktop-roam-console");
    if (!consoleElement) return normalBottom;
    const containerRect = container.getBoundingClientRect();
    const consoleRect = consoleElement.getBoundingClientRect();
    return Math.max(
      170,
      Math.min(normalBottom, consoleRect.top - containerRect.top - 42),
    );
  };

  const geographicHeadingForScreenYaw = (
    position: RoutePoint,
    screenYaw: number,
  ) => {
    const map = mapRef.current;
    if (!map) return desktopRoamHeadingRef.current;
    const eastPosition = offsetPosition(position, 5, 0);
    const fromPixel = map.lngLatToContainer(position);
    const eastPixel = map.lngLatToContainer(eastPosition);
    const eastScreenYaw = sceneYawFromScreenVector(
      Number(eastPixel?.x ?? eastPixel?.getX?.()) -
        Number(fromPixel?.x ?? fromPixel?.getX?.()),
      Number(eastPixel?.y ?? eastPixel?.getY?.()) -
        Number(fromPixel?.y ?? fromPixel?.getY?.()),
    );
    return eastScreenYaw === null
      ? desktopRoamHeadingRef.current
      : normalizeAngle(screenYaw - eastScreenYaw);
  };

  useEffect(() => {
    if (
      !desktopRoamEngaged ||
      liveLocationState !== "preview" ||
      !liveLocationActiveRef.current
    ) {
      return;
    }

    let disposed = false;
    let raf = 0;
    let previousFrame = performance.now();
    let previousMotionUpdate = 0;
    let previousCameraCheck = 0;

    const followDesktopInput = (now: number) => {
      if (
        disposed ||
        !liveLocationActiveRef.current ||
        !desktopRoamEngagedRef.current
      ) {
        return;
      }
      if (
        previousMotionUpdate &&
        now - previousMotionUpdate < ENCOUNTER_MAP_FRAME_MS
      ) {
        raf = requestAnimationFrame(followDesktopInput);
        return;
      }

      const deltaSeconds = Math.min((now - previousFrame) / 1000, 0.08);
      previousFrame = now;
      previousMotionUpdate = now;
      const input = desktopRoamInputRef.current;

      const current =
        lastLiveAmapPositionRef.current || encounterPositionRef.current;
      if (!current) {
        raf = requestAnimationFrame(followDesktopInput);
        return;
      }

      if (input.screenHeadingRadians !== null) {
        desktopRoamHeadingRef.current = geographicHeadingForScreenYaw(
          current,
          input.screenHeadingRadians,
        );
      }
      const moving =
        input.throttle > 0.02 || desktopRoamCruiseRef.current;
      const throttle =
        input.throttle > 0.02
          ? input.throttle
          : desktopRoamCruiseRef.current
            ? 1
            : 0;
      const next = moving
        ? advanceDesktopRoam(
            current,
            desktopRoamHeadingRef.current,
            throttle * DESKTOP_ROAM_SPEED_METERS_PER_SECOND * deltaSeconds,
            routeObstaclesRef.current,
          )
        : current;
      encounterPositionRef.current = next;
      lastLiveAmapPositionRef.current = next;
      liveHeadingSegmentRef.current = {
        from: next,
        to: offsetPosition(next, 5, desktopRoamHeadingRef.current),
      };
      setRouteMode(moving ? "walking" : "arrived");
      syncLiveOutingPose();

      const map = mapRef.current;
      const container = mapContainerRef.current;
      if (map && container && now - previousCameraCheck >= 300) {
        previousCameraCheck = now;
        const pixel = map.lngLatToContainer(next);
        const x = Number(pixel?.x ?? pixel?.getX?.());
        const y = Number(pixel?.y ?? pixel?.getY?.());
        if (
          Number.isFinite(x) &&
          Number.isFinite(y) &&
          (x < 72 ||
            x > container.clientWidth - 72 ||
            y < 104 ||
            y > liveOutingSafeBottom(container))
        ) {
          map.setCenter(next, true);
        }
      }

      raf = requestAnimationFrame(followDesktopInput);
    };

    raf = requestAnimationFrame(followDesktopInput);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
    };
  }, [desktopRoamEngaged, liveLocationState]);

  useEffect(() => {
    if (
      !desktopRoamControllerOpen ||
      liveLocationState !== "preview" ||
      !liveLocationActiveRef.current
    ) {
      return;
    }
    const map = mapRef.current;
    const position =
      lastLiveAmapPositionRef.current || encounterPositionRef.current;
    if (!map || !position) return;
    // Opening the controller immediately creates a protected play area above
    // it. Centering once avoids a character already near the bottom becoming
    // hidden before the next movement frame runs.
    map.setCenter(position, true);
    const raf = requestAnimationFrame(syncLiveOutingPose);
    return () => cancelAnimationFrame(raf);
  }, [desktopRoamControllerOpen, liveLocationState]);

  const stopDesktopViewOrbit = () => {
    desktopViewOrbitActiveRef.current = false;
    if (desktopViewOrbitRafRef.current) {
      cancelAnimationFrame(desktopViewOrbitRafRef.current);
      desktopViewOrbitRafRef.current = 0;
    }
  };

  const startDesktopViewOrbit = () => {
    const map = mapRef.current;
    if (
      desktopViewOrbitActiveRef.current ||
      !desktopRoamControllerOpenRef.current ||
      !map?.getRotation ||
      !map?.setRotation
    ) {
      return;
    }
    desktopViewOrbitActiveRef.current = true;
    let previousFrame = performance.now();
    const orbit = (now: number) => {
      if (!desktopViewOrbitActiveRef.current) return;
      const deltaSeconds = Math.min((now - previousFrame) / 1000, 0.08);
      previousFrame = now;
      const currentRotation = Number(map.getRotation()) || 0;
      const nextRotation = ((currentRotation + deltaSeconds * 18 + 180) % 360) - 180;
      map.setRotation(nextRotation, true);
      syncLiveOutingPose();
      desktopViewOrbitRafRef.current = requestAnimationFrame(orbit);
    };
    desktopViewOrbitRafRef.current = requestAnimationFrame(orbit);
    setLiveLocationNotice(
      "视角摇杆正在环绕人物与搭子；松手即停，不改变位置与步数。",
    );
  };

  useEffect(
    () => () => {
      desktopViewOrbitActiveRef.current = false;
      if (desktopViewOrbitRafRef.current) {
        cancelAnimationFrame(desktopViewOrbitRafRef.current);
      }
    },
    [],
  );

  const stopLiveOuting = () => {
    if (voiceMapRequestIdRef.current) cancelVoiceMapMode(voiceMapRequestIdRef.current, "散步已结束，这次真实 GPS 定位已取消。");
    voiceMapRequestIdRef.current = null;
    stopDesktopViewOrbit();
    setOutingSetupOpen(false);
    outingCameraOpenRef.current = false;
    setOutingCameraScene(null);
    liveLocationActiveRef.current = false;
    voiceTreeFixRef.current = null;
    setVoiceTreeNotice("");
    liveLocationStopRef.current?.();
    liveLocationStopRef.current = null;
    void walkingWakeLockRef.current?.stop();
    walkingWakeLockRef.current = null;
    liveLocationFilterRef.current.reset();
    lastLiveAmapPositionRef.current = null;
    liveHeadingSegmentRef.current = null;
    liveLocationSequenceRef.current += 1;
    encounterActiveRef.current = false;
    encounterPositionRef.current = null;
    encounterMapMarkerRef.current?.hide();
    setEncounterAnchor(null);
    encounterHeadingRef.current = 0;
    setEncounterHeading(0);
    setEncounterDestination(null);
    setEncounterId(null);
    setTestWalkActive(false);
    setRouteMode("idle");
    setLiveLocationState("idle");
    setLiveLocationAccuracy(null);
    setLiveLocationNotice("");
    setLiveTripMeters(0);
    desktopRoamInputRef.current = {
      screenHeadingRadians: null,
      throttle: 0,
    };
    desktopRoamCruiseRef.current = false;
    desktopRoamEngagedRef.current = false;
    desktopRoamResumeAutoRef.current = false;
    setDesktopRoamEngaged(false);
    setDesktopRoamCruise(false);
    setDesktopRoamControllerOpen(false);
    if (liveDutySessionIdRef.current) {
      finishDutySession(liveDutySessionIdRef.current, "completed");
      liveDutySessionIdRef.current = null;
    }
  };

  const applyLiveLocation = async (sample: LocationSample) => {
    const map = mapRef.current;
    const AMap = amapApiRef.current;
    if (
      outingCameraOpenRef.current ||
      !liveLocationActiveRef.current ||
      liveLocationModeRef.current !== "gps" ||
      !map ||
      !AMap
    ) return;

    const filtered = liveLocationFilterRef.current.push(sample);
    if (!filtered) {
      voiceTreeFixRef.current = null;
      liveLocationAppliedSequenceRef.current = ++liveLocationSequenceRef.current;
      if (sample.accuracyMeters > 65) {
        setLiveLocationNotice(
          `GPS 信号较弱（±${Math.round(sample.accuracyMeters)}m），正在等待更准确的位置`,
        );
      }
      return;
    }

    const sequence = ++liveLocationSequenceRef.current;
    try {
      const amapPosition = await locationSampleToAmap(AMap, filtered);
      if (
        !liveLocationActiveRef.current ||
        liveLocationModeRef.current !== "gps" ||
        sequence < liveLocationAppliedSequenceRef.current
      ) {
        return;
      }
      liveLocationAppliedSequenceRef.current = sequence;

      const previousPosition = lastLiveAmapPositionRef.current;
      if (previousPosition && filtered.moving) {
        liveHeadingSegmentRef.current = {
          from: previousPosition,
          to: amapPosition,
        };
      }

      encounterPositionRef.current = amapPosition;
      lastLiveAmapPositionRef.current = amapPosition;
      const [lng, lat] = locationSampleToWgs84(filtered);
      voiceTreeFixRef.current = {
        position: [...amapPosition], wgs84Position: [lng, lat],
        timestamp: filtered.timestamp, accuracyM: filtered.accuracyMeters,
      };
      if (!liveDutySessionIdRef.current) {
        liveDutySessionIdRef.current = startDutySession({
          agentId: liveDutyAgentIdRef.current,
          mode: "gps-companion",
          center: {
            lng,
            lat,
            accuracy: filtered.accuracyMeters,
          },
          radiusMeters: 1200,
        }).id;
      }
      if (liveDutySessionIdRef.current) {
        appendDutyRoutePoint(liveDutySessionIdRef.current, {
          lng,
          lat,
          accuracy: filtered.accuracyMeters,
        });
        recordNearbyBloomVisit({
          position: amapPosition,
          dutySessionId: liveDutySessionIdRef.current,
          actorAgentId: liveDutyAgentIdRef.current,
          provenance: "firsthand",
          evidence: "gps-proximity",
          accuracyMeters: filtered.accuracyMeters,
        });
      }
      setLiveLocationState("active");
      setLiveLocationAccuracy(filtered.accuracyMeters);
      setLiveLocationNotice("");
      setRouteMode(filtered.moving ? "walking" : "arrived");
      if (filtered.movedMeters > 0) {
        setLiveTripMeters((meters) => meters + filtered.movedMeters);
        const walkRecord = recordCityWalkMetersWithRewards(
          filtered.movedMeters,
        );
        const reward = walkRecord.rewards[0];
        if (reward) {
          setWalkAchievement(reward);
          if (walkAchievementTimerRef.current) {
            clearTimeout(walkAchievementTimerRef.current);
          }
          walkAchievementTimerRef.current = setTimeout(() => {
            setWalkAchievement(null);
            walkAchievementTimerRef.current = null;
          }, 5_500);
        }
      }
      recordNearbyPocketPlantRevisits(amapPosition);

      if (!previousPosition) {
        map.setZoomAndCenter(ENCOUNTER_ZOOM, amapPosition);
      }
      requestAnimationFrame(syncLiveOutingPose);
      if (voiceMapRequestIdRef.current) reportVoiceMapReady(voiceMapRequestIdRef.current, voiceTreeFixRef.current);
    } catch (error) {
      if (!liveLocationActiveRef.current || sequence < liveLocationAppliedSequenceRef.current) return;
      voiceTreeFixRef.current = null;
      console.error("GPS 坐标转换失败", error);
      setLiveLocationNotice("GPS 已取得，但暂时无法与高德地图对齐");
      if (voiceMapRequestIdRef.current) failVoiceMapMode(voiceMapRequestIdRef.current, "GPS 尚未与地图对齐，暂时不能种树，请稍后重新进入地图模式。");
    }
  };

  const startLiveOuting = (
    guide: Agent3DProfile,
    pets: readonly Agent3DProfile[],
    companionMode: OutingCompanionMode,
    pocketBuddiesForOuting: readonly PocketBuddy[],
    locationMode: LiveOutingLocationMode = "preview",
    voiceRequestId: string | null = null,
  ) => {
    if (voiceMapRequestIdRef.current && voiceMapRequestIdRef.current !== voiceRequestId) {
      cancelVoiceMapMode(voiceMapRequestIdRef.current, "散步模式已切换，这次语音定位已取消。");
    }
    voiceMapRequestIdRef.current = voiceRequestId;
    voiceTreeFixRef.current = null;
    liveLocationModeRef.current = locationMode;
    setVoiceTreeNotice("");
    if (mapState !== "amap" || !mapRef.current || !amapApiRef.current) {
      setOutingSetupOpen(false);
      setLiveLocationState("error");
      setLiveLocationNotice("高德地图尚未就绪，请稍后再开始出门");
      if (voiceRequestId) failVoiceMapMode(voiceRequestId, "地图尚未就绪，请稍后再说“进入地图模式”。");
      return;
    }
    const map = mapRef.current;
    const AMap = amapApiRef.current;
    const mapCenter = map.getCenter?.();
    const mapCenterLng = Number(mapCenter?.getLng?.() ?? mapCenter?.lng);
    const mapCenterLat = Number(mapCenter?.getLat?.() ?? mapCenter?.lat);
    const sessionAnchor: RoutePoint =
      Number.isFinite(mapCenterLng) && Number.isFinite(mapCenterLat)
        ? [mapCenterLng, mapCenterLat]
        : initialCenter;

    setOutingSetupOpen(false);
    setActiveOutingGuide(guide);
    const runtimePets = pets.map(outingRuntimePet);
    const primaryRuntimePet = runtimePets[0] ?? guide;
    liveDutyAgentIdRef.current = primaryRuntimePet.id;
    setActiveOutingPets(runtimePets);
    setActiveOutingPocketBuddies([...pocketBuddiesForOuting]);
    setActiveOutingCompanionMode(companionMode);
    setSelectedMemoryId(null);
    setMemoryLayerVisible(false);
    setSelectedPostcardIndex(null);
    desktopRoamInputRef.current = {
      screenHeadingRadians: null,
      throttle: 0,
    };
    desktopRoamHeadingRef.current = Math.PI / 2;
    desktopRoamCruiseRef.current = false;
    desktopRoamEngagedRef.current = false;
    desktopRoamResumeAutoRef.current = false;
    setDesktopRoamEngaged(false);
    setDesktopRoamCruise(false);
    setDesktopRoamControllerOpen(false);
    liveLocationStopRef.current?.();
    void walkingWakeLockRef.current?.stop();
    walkingWakeLockRef.current = null;
    if (locationMode === "gps") {
      const walkingWakeLock = createWalkingWakeLock();
      walkingWakeLockRef.current = walkingWakeLock;
      void walkingWakeLock.start();
    }
    liveLocationFilterRef.current.reset();
    lastLiveAmapPositionRef.current = null;
    liveHeadingSegmentRef.current = null;
    liveLocationSequenceRef.current += 1;
    liveLocationAppliedSequenceRef.current = liveLocationSequenceRef.current;
    liveLocationActiveRef.current = true;
    encounterActiveRef.current = true;
    // 出门瞬间只捕获一次真实地图中心；之后拖拽地图只能重投影这个
    // 经纬度，不能再把新的视窗中心误写成人物位置。
    encounterPositionRef.current = sessionAnchor;
    setTestWalkActive(false);
    setEncounterDestination(null);
    setEncounterId(null);
    setEncounterAnchor(null);
    setRouteMode("loading");
    setLiveTripMeters(0);
    setWalkAchievement(null);
    if (walkAchievementTimerRef.current) {
      clearTimeout(walkAchievementTimerRef.current);
      walkAchievementTimerRef.current = null;
    }
    setLiveLocationAccuracy(null);
    setLiveLocationNotice(
      locationMode === "gps"
        ? "正在请求手机的精确定位…"
        : "正在准备杭州拱墅演示路线…",
    );
    setLiveLocationState(locationMode === "gps" ? "requesting" : "preview");
    if (liveDutySessionIdRef.current) {
      finishDutySession(liveDutySessionIdRef.current, "cancelled");
      liveDutySessionIdRef.current = null;
    }

    let anchorRaf = 0;
    let previewWalkRaf = 0;
    let previewWalkDisposed = false;
    let previewWalkStarted = false;
    const syncAnchorAfterMapFrame = () => {
      cancelAnimationFrame(anchorRaf);
      anchorRaf = requestAnimationFrame(syncLiveOutingPose);
    };
    const mapViewEvents = [
      "mapmove",
      "moveend",
      "zoomchange",
      "zoomend",
      "rotatechange",
      "pitchchange",
    ];
    mapViewEvents.forEach((eventName) =>
      map.on(eventName, syncAnchorAfterMapFrame),
    );
    syncAnchorAfterMapFrame();

    let providerStop: StopLocationWatch = () => {};
    const stopProviderAndMapListeners = () => {
      previewWalkDisposed = true;
      cancelAnimationFrame(previewWalkRaf);
      providerStop();
      cancelAnimationFrame(anchorRaf);
      mapViewEvents.forEach((eventName) =>
        map.off(eventName, syncAnchorAfterMapFrame),
      );
    };
    const startDefaultWalk = (previewPosition: RoutePoint) => {
      if (previewWalkStarted || previewWalkDisposed) return;
      previewWalkStarted = true;

      // 与“测试”共用同一段高德步行路线和往返巡游算法，只把起点
      // 换成离当前地图最近的城市花径；默认行走不读取 GPS。
      const previewDestination: RoutePoint = [
        previewPosition[0] + TEST_WALK_DESTINATION[0] - TEST_WALK_START[0],
        previewPosition[1] + TEST_WALK_DESTINATION[1] - TEST_WALK_START[1],
      ];
      let previousFrame = performance.now();
      let previousMotionUpdate = 0;
      let previousCameraCheck = 0;
      let previewDistance = TEST_ROUTE_RIGGED_START_METERS;
      let automaticRejoinRoute: IndexedRoute | null = null;
      let automaticRejoinDistance = 0;

      requestAmapWalkingRoute(
        AMap,
        previewPosition,
        previewDestination,
        { minRouteMeters: 20 },
      )
        .catch(() => null)
        .then((walkingRoute) => {
          if (previewWalkDisposed || !liveLocationActiveRef.current) return;
          if (!walkingRoute) {
            setRouteMode("fallback");
            setLiveLocationNotice(
              "暂时无法取得杭州演示路线；可以根据真实位置校正。",
            );
            return;
          }

          const roadRoute = trimRoute(
            walkingRoute,
            ENCOUNTER_ROAD_ENTRY_TRIM_METERS,
            6,
          );
          const safeRoadRoute = routeAroundGardenPlants(
            roadRoute,
            routeObstaclesRef.current,
            previewPosition,
            previewDestination,
          );
          const motionRoute = createPatrolRoute(safeRoadRoute);
          previewDistance = loopRouteDistance(
            previewDistance,
            motionRoute.totalMeters,
          );
          if (desktopRoamEngagedRef.current) {
            setRouteMode("arrived");
          } else {
            setRouteMode("walking");
            setLiveLocationNotice(
              "正在杭州拱墅演示路线巡游，尚未读取真实位置。",
            );
          }

          const keepPreviewFormationInView = (
            now: number,
            position: RoutePoint,
          ) => {
            if (now - previousCameraCheck < TEST_ROUTE_CAMERA_CHECK_MS) return;
            previousCameraCheck = now;
            const container = mapContainerRef.current;
            if (!container) return;
            const pixel = map.lngLatToContainer(position);
            if (!Number.isFinite(pixel?.x) || !Number.isFinite(pixel?.y)) {
              return;
            }
            const horizontalPadding = Math.min(
              110,
              Math.max(64, container.clientWidth * 0.2),
            );
            const topPadding = Math.min(
              140,
              Math.max(96, container.clientHeight * 0.24),
            );
            const bottomPadding = Math.min(
              120,
              Math.max(76, container.clientHeight * 0.18),
            );
            const safeBottom = Math.min(
              container.clientHeight - bottomPadding,
              liveOutingSafeBottom(container),
            );
            if (
              pixel.x >= horizontalPadding &&
              pixel.x <= container.clientWidth - horizontalPadding &&
              pixel.y >= topPadding &&
              pixel.y <= safeBottom
            ) {
              return;
            }
            map.setCenter(position, true);
            syncAnchorAfterMapFrame();
          };

          const followPreviewRoute = (now: number) => {
            if (previewWalkDisposed || !liveLocationActiveRef.current) return;
            if (outingCameraOpenRef.current) {
              previousFrame = now;
              previewWalkRaf = requestAnimationFrame(followPreviewRoute);
              return;
            }
            if (desktopRoamEngagedRef.current) {
              previousFrame = now;
              previewWalkRaf = requestAnimationFrame(followPreviewRoute);
              return;
            }
            if (desktopRoamResumeAutoRef.current) {
              const current =
                lastLiveAmapPositionRef.current || encounterPositionRef.current;
              if (current) {
                previewDistance = nearestDistanceAlongRoute(
                  current,
                  motionRoute,
                );
                const rejoinTarget = pointAlongRoute(
                  motionRoute,
                  previewDistance,
                );
                automaticRejoinRoute = routeAroundGardenPlants(
                  indexRoute([current, rejoinTarget], 1.4),
                  routeObstaclesRef.current,
                  current,
                  rejoinTarget,
                );
                automaticRejoinDistance = 0;
              }
              desktopRoamResumeAutoRef.current = false;
              setLiveLocationNotice(
                "正在从人物当前位置平滑接回高德步行路线。无 GPS，不计步。",
              );
            }
            // 地理坐标不需要跟 Three.js 骨骼动画一样跑满刷新率；限制高德
            // Marker 的重投影频率，多个伙伴同行时仍保持页面响应流畅。
            if (
              previousMotionUpdate &&
              now - previousMotionUpdate < ENCOUNTER_MAP_FRAME_MS
            ) {
              previewWalkRaf = requestAnimationFrame(followPreviewRoute);
              return;
            }
            previousMotionUpdate = now;
            const deltaSeconds = Math.min((now - previousFrame) / 1000, 0.08);
            previousFrame = now;
            if (
              automaticRejoinRoute &&
              automaticRejoinRoute.totalMeters > 0.25
            ) {
              automaticRejoinDistance = Math.min(
                automaticRejoinDistance +
                  deltaSeconds * TEST_WALK_SPEED_METERS_PER_SECOND,
                automaticRejoinRoute.totalMeters,
              );
              const position = pointAlongRoute(
                automaticRejoinRoute,
                automaticRejoinDistance,
              );
              const headingPosition = pointAlongRoute(
                automaticRejoinRoute,
                Math.min(
                  automaticRejoinDistance + ROUTE_HEADING_LOOKAHEAD_METERS,
                  automaticRejoinRoute.totalMeters,
                ),
              );
              encounterPositionRef.current = position;
              lastLiveAmapPositionRef.current = position;
              liveHeadingSegmentRef.current = {
                from: position,
                to: headingPosition,
              };
              syncLiveOutingPose();
              keepPreviewFormationInView(now, position);
              if (
                automaticRejoinDistance >= automaticRejoinRoute.totalMeters
              ) {
                automaticRejoinRoute = null;
                setLiveLocationNotice(
                  "已接回高德步行路线，继续自动巡游。无 GPS，不计步。",
                );
              }
              previewWalkRaf = requestAnimationFrame(followPreviewRoute);
              return;
            }
            automaticRejoinRoute = null;
            previewDistance = loopRouteDistance(
              previewDistance +
                deltaSeconds * TEST_WALK_SPEED_METERS_PER_SECOND,
              motionRoute.totalMeters,
            );
            const position = pointAlongRoute(motionRoute, previewDistance);
            const headingPosition = pointAlongRoute(
              motionRoute,
              loopRouteDistance(
                previewDistance + ROUTE_HEADING_LOOKAHEAD_METERS,
                motionRoute.totalMeters,
              ),
            );
            encounterPositionRef.current = position;
            lastLiveAmapPositionRef.current = position;
            liveHeadingSegmentRef.current = {
              from: position,
              to: headingPosition,
            };
            syncLiveOutingPose();
            keepPreviewFormationInView(now, position);
            previewWalkRaf = requestAnimationFrame(followPreviewRoute);
          };

          previewWalkRaf = requestAnimationFrame(followPreviewRoute);
        });
    };
    const enterDefaultWalk = (notice = "正在准备杭州拱墅演示路线…") => {
      voiceTreeFixRef.current = null;
      liveLocationModeRef.current = "preview";
      liveLocationAppliedSequenceRef.current = ++liveLocationSequenceRef.current;
      const center = map.getCenter?.();
      const lng = Number(center?.getLng?.() ?? center?.lng);
      const lat = Number(center?.getLat?.() ?? center?.lat);
      const previewTarget: RoutePoint =
        Number.isFinite(lng) && Number.isFinite(lat)
          ? [lng, lat]
          : initialCenter;
      const previewPosition = nearestDefaultWalkPosition(previewTarget);
      encounterPositionRef.current = previewPosition;
      lastLiveAmapPositionRef.current = previewPosition;
      liveHeadingSegmentRef.current = null;
      map.setZoomAndCenter(DEFAULT_WALK_ZOOM, previewPosition);
      syncAnchorAfterMapFrame();
      providerStop();
      void walkingWakeLockRef.current?.stop();
      walkingWakeLockRef.current = null;
      setLiveLocationState("preview");
      setLiveLocationAccuracy(null);
      setRouteMode("loading");
      setLiveLocationNotice(notice);
      startDefaultWalk(previewPosition);
    };
    const handleError = (error: LocationProviderError) => {
      if (!liveLocationActiveRef.current) return;
      voiceTreeFixRef.current = null;
      liveLocationAppliedSequenceRef.current = ++liveLocationSequenceRef.current;
      const terminal =
        error.code === "permission-denied" ||
        error.code === "unsupported" ||
        error.code === "insecure-context";
      if (terminal) {
        if (voiceRequestId) {
          const message = `真实 GPS 未就绪：${error.message}。请检查手机定位权限后重新进入地图模式。`;
          failVoiceMapMode(voiceRequestId, message);
          stopLiveOuting();
          setLiveLocationState("error");
          setLiveLocationNotice(message);
          return;
        }
        enterDefaultWalk(`无法根据真实位置校正：${error.message}。已回到杭州默认场景。`);
        return;
      }
      setLiveLocationNotice(error.message);
    };
    if (locationMode === "gps") {
      providerStop = createBrowserLocationProvider().start((sample) => {
        void applyLiveLocation(sample);
      }, handleError);
    } else {
      enterDefaultWalk();
    }

    if (liveLocationActiveRef.current) {
      liveLocationStopRef.current = stopProviderAndMapListeners;
    } else {
      stopProviderAndMapListeners();
      liveLocationStopRef.current = null;
    }
  };

  useEffect(() => {
    if (!voiceTreePlanting || voiceMapState?.status !== "opening" || mapState === "loading") return;
    const inputId = voiceMapState.inputId;
    if (mapState !== "amap" || !mapRef.current || !amapApiRef.current) {
      failVoiceMapMode(inputId, "地图加载失败，真实 GPS 散步尚未开始，请稍后重新进入地图模式。");
      return;
    }
    if (!claimVoiceMapMode(inputId)) return;
    // This voice shortcut always chooses the existing male lead + one default dog.
    // It must not inherit a previous female/multi-pet selection or require seeds.
    setOutingGuideId(DEFAULT_OUTING_GUIDE_ID);
    setOutingPetIds([DEFAULT_OUTING_PET_ID]);
    setOutingPreviewPetId(DEFAULT_OUTING_PET_ID);
    setOutingPocketBuddyIds([]);
    setOutingSetupOpen(false);
    setSeedDrawerOpen(false);
    setPlantingSuccess(null);
    setPlantingAssetId(null);
    setPendingPlantPosition(null);
    outingCameraOpenRef.current = false;
    setOutingCameraScene(null);
    if (liveLocationActiveRef.current && liveLocationModeRef.current === "gps"
      && isFreshVoiceTreeFix(voiceTreeFixRef.current)
      && activeOutingGuide.id === DEFAULT_OUTING_GUIDE_ID
      && activeOutingPets.length === 1 && activeOutingPets[0].id === DEFAULT_OUTING_PET.id
      && activeOutingCompanionMode === "leash" && activeOutingPocketBuddies.length === 0) {
      voiceMapRequestIdRef.current = inputId;
      mapRef.current.setZoomAndCenter(ENCOUNTER_ZOOM, voiceTreeFixRef.current.position);
      reportVoiceMapReady(inputId, voiceTreeFixRef.current);
      return;
    }
    startLiveOuting(getCityCompanionGuide(DEFAULT_OUTING_GUIDE_ID).profile, [DEFAULT_OUTING_PET], "leash", [], "gps", inputId);
  }, [voiceTreePlanting, voiceMapState, mapState]);

  useEffect(() => {
    if (!voiceMapState || voiceMapState.inputId !== voiceMapRequestIdRef.current) return;
    if (voiceMapState.status === "failed" || voiceMapState.status === "cancelled") {
      stopLiveOuting();
      setLiveLocationNotice(voiceMapState.message);
    }
    if (["ready", "failed", "cancelled"].includes(voiceMapState.status)) setVoiceTreeNotice(voiceMapState.message);
  }, [voiceMapState]);

  const handleOutingButton = () => {
    if (liveOutingVisible) {
      stopLiveOuting();
      return;
    }
    setLiveLocationNotice("");
    setOutingSetupFocus("summary");
    setOutingSetupOpen(true);
  };

  const toggleDesktopRoamController = () => {
    if (!liveOutingVisible || liveOutingLocationMode === "gps") return;

    if (desktopRoamControllerOpen) {
      stopDesktopViewOrbit();
      desktopRoamInputRef.current = {
        screenHeadingRadians: null,
        throttle: 0,
      };
      desktopRoamCruiseRef.current = false;
      setDesktopRoamCruise(false);
      setDesktopRoamControllerOpen(false);
      setRouteMode("arrived");
      setLiveLocationNotice("桌面操控已暂停；重新展开即可继续。无 GPS，不计步。");
      return;
    }
    desktopRoamInputRef.current = {
      screenHeadingRadians: null,
      throttle: 0,
    };
    setDesktopRoamControllerOpen(true);
    setLiveLocationNotice(
      desktopRoamEngagedRef.current
        ? "手动操控待命；圆盘方向与人物朝向一一对应。无 GPS，不计步。"
        : "模拟器已展开；当前仍在自动巡游。可切换为手动操控。",
    );
  };

  const setDesktopRoamMode = (mode: "auto" | "manual") => {
    if (liveOutingLocationMode === "gps") return;
    desktopRoamInputRef.current = {
      screenHeadingRadians: null,
      throttle: 0,
    };
    desktopRoamCruiseRef.current = false;
    setDesktopRoamCruise(false);

    if (mode === "manual") {
      if (!desktopRoamEngagedRef.current) {
        const segment = liveHeadingSegmentRef.current;
        desktopRoamHeadingRef.current = segment
          ? geographicHeadingBetween(segment.from, segment.to)
          : Math.PI / 2;
      }
      desktopRoamResumeAutoRef.current = false;
      desktopRoamEngagedRef.current = true;
      setDesktopRoamEngaged(true);
      setRouteMode("arrived");
      setLiveLocationNotice(
        "手动操控已接管人物与搭子；拖动圆盘推行，中键可持续走动。无 GPS，不计步。",
      );
      return;
    }

    desktopRoamResumeAutoRef.current = desktopRoamEngagedRef.current;
    desktopRoamEngagedRef.current = false;
    setDesktopRoamEngaged(false);
    setRouteMode("walking");
    setLiveLocationNotice("正在从人物当前位置接回自动巡游路线…");
  };

  const toggleDesktopRoamCruise = () => {
    if (!desktopRoamEngagedRef.current) return;
    const next = !desktopRoamCruiseRef.current;
    desktopRoamCruiseRef.current = next;
    setDesktopRoamCruise(next);
    setRouteMode(next ? "walking" : "arrived");
    setLiveLocationNotice(
      next
        ? "持续行走已开启；转动圆盘会立即改变前进方向。无 GPS，不计步。"
        : "持续行走已停止；人物与搭子在原地待命。无 GPS，不计步。",
    );
  };

  const recenterDesktopRoam = () => {
    const position =
      lastLiveAmapPositionRef.current || encounterPositionRef.current;
    const map = mapRef.current;
    if (!position || !map) return;
    map.setCenter(position, true);
    requestAnimationFrame(syncLiveOutingPose);
    setLiveLocationNotice("人物与搭子已回到安全操控区中央。无 GPS，不计步。");
  };

  const openOutingSetup = (focus: OutingSetupFocus) => {
    if (liveOutingVisible) return;
    setLiveLocationNotice("");
    setOutingSetupFocus(focus);
    setOutingSetupOpen(true);
  };

  const openSeedDrawer = () => {
    const firstSeedId = activeSeedId ?? seedPouchIds[0] ?? null;
    setActiveSeedId(firstSeedId);
    setPendingPlantPosition(null);
    setPlantingAssetId(null);
    setLiveLocationNotice("");
    setSeedDrawerOpen(true);
  };

  const togglePocketSeed = (assetId: string) => {
    if ((seedProgress.inventory[assetId] ?? 0) <= 0) {
      setLiveLocationNotice("这枚种子还没有解锁，继续散步会获得新的种子包");
      return;
    }
    const selected = seedPouchIds.includes(assetId);
    if (selected && activeSeedId !== assetId) {
      setActiveSeedId(assetId);
      return;
    }
    if (!selected && seedPouchIds.length >= POCKET_SEED_POUCH_LIMIT) {
      setLiveLocationNotice(`种子口袋最多装 ${POCKET_SEED_POUCH_LIMIT} 枚`);
      return;
    }
    const next = selected
      ? seedPouchIds.filter((id) => id !== assetId)
      : [...seedPouchIds, assetId];
    setSeedPouchIds(next);
    writePocketSeedPouch(next);
    if (selected && activeSeedId === assetId) {
      setActiveSeedId(next[0] ?? null);
    } else if (!selected) {
      setActiveSeedId(assetId);
    }
  };

  const toggleOutingSeed = (assetId: string) => {
    if ((seedProgress.inventory[assetId] ?? 0) <= 0) return;
    const selected = seedPouchIds.includes(assetId);
    if (selected && seedPouchIds.length === 1) {
      setActiveSeedId(assetId);
      return;
    }
    if (!selected && seedPouchIds.length >= POCKET_SEED_POUCH_LIMIT) return;
    const next = selected
      ? seedPouchIds.filter((id) => id !== assetId)
      : [...seedPouchIds, assetId];
    setSeedPouchIds(next);
    setActiveSeedId(selected ? next[0] ?? null : assetId);
    writePocketSeedPouch(next);
  };

  const choosePocketPlantLocation = () => {
    if (!activeSeedAsset || !seedPouchIds.includes(activeSeedAsset.id)) return;
    if (liveOutingVisible) {
      const current =
        lastLiveAmapPositionRef.current || encounterPositionRef.current;
      if (!current) {
        setLiveLocationNotice("正在等待真实位置，GPS 定位后即可种下植物");
        return;
      }
      setSeedDrawerOpen(false);
      plantPocketAssetAtPosition(activeSeedAsset, current);
      return;
    }
    setSeedDrawerOpen(false);
    setPendingPlantPosition(null);
    setPlantingAssetId(activeSeedAsset.id);
    setLiveLocationNotice(`带着${activeSeedAsset.name}在地图空地轻点一下`);
  };

  const cancelPocketPlanting = () => {
    setPendingPlantPosition(null);
    setPlantingAssetId(null);
    setLiveLocationNotice("");
  };

  const plantPocketAssetAtPosition = (
    asset: (typeof POCKET_PLANT_ASSETS)[number],
    position: RoutePoint,
  ) => {
    if (!consumePocketSeed(asset.id)) {
      setLiveLocationNotice("这枚种子已经用完，继续散步可以获得新的种子包");
      return false;
    }
    // A prepared sentence belongs to one physical planting. Consuming the
    // draft here prevents a later seed of the same species from inheriting an
    // older sentence by accident.
    const poemDraft = takePocketPoemDraft(asset.id);
    const planted = createPocketPlanting(
      asset.id,
      position,
      new Date(),
      {
        place: `${poemDraft?.city || getRoamCity()} · 城市落点`,
        poemDraftId: poemDraft?.id,
        sentence: poemDraft?.text,
        magic: poemDraft?.magic,
        sentenceVisibility: poemDraft?.visibility,
      },
    );
    const nextPlantings = [...plantedPocketPlants, planted];
    const nextPouch = seedPouchIds.filter((id) => id !== asset.id);
    setPlantedPocketPlants(nextPlantings);
    setSeedPouchIds(nextPouch);
    setActiveSeedId(nextPouch[0] ?? null);
    writePocketPlantings(nextPlantings);
    writePocketSeedPouch(nextPouch);
    setPendingPlantPosition(null);
    setPlantingAssetId(null);
    setPlantingSuccess(planted);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([35, 45, 75]);
    }
    setLiveLocationNotice(`${asset.name}已经在杭州生根`);
    return true;
  };

  const confirmPocketPlanting = () => {
    if (!plantingAsset || !pendingPlantPosition) return;
    plantPocketAssetAtPosition(plantingAsset, pendingPlantPosition);
  };

  const plantFromDesktopController = () => {
    if (
      !activeSeedAsset ||
      !seedPouchIds.includes(activeSeedAsset.id) ||
      (seedProgress.inventory[activeSeedAsset.id] ?? 0) <= 0
    ) {
      setLiveLocationNotice("种子口袋里还没有可用种子，先在出门前装入一枚");
      return;
    }
    const current =
      lastLiveAmapPositionRef.current || encounterPositionRef.current;
    if (!current) return;
    const nearestSite = [...PLANTABLE_LAND_SITES, ...WEST_LAKE_GROVE_SITES]
      .map((site) => ({ site, distance: distanceInMeters(current, site) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (!nearestSite || nearestSite.distance > 55) {
      setLiveLocationNotice("这里还不是可种植绿地；再靠近地图上的植物空地后按 A 键");
      return;
    }
    const angle = (plantedPocketPlants.length * 2.399963) % (Math.PI * 2);
    const position = offsetPosition(nearestSite.site, 8.2, angle);
    plantPocketAssetAtPosition(activeSeedAsset, position);
  };

  const plantFromLiveOuting = () => {
    if (seedProgress.todaySteps < 3_000) {
      setLiveLocationNotice(
        `再走 ${Math.max(0, 3_000 - seedProgress.todaySteps).toLocaleString("zh-CN")} 步，就能在城市里种下植物`,
      );
      return;
    }
    if (liveOutingLocationMode !== "gps") {
      setLiveLocationNotice("切换到真实 GPS 后，才能把植物种在当前位置");
      return;
    }
    if (
      !activeSeedAsset ||
      !seedPouchIds.includes(activeSeedAsset.id) ||
      (seedProgress.inventory[activeSeedAsset.id] ?? 0) <= 0
    ) {
      openSeedDrawer();
      setLiveLocationNotice("选一枚心爱的种子，它会在当前 GPS 位置生根");
      return;
    }
    const current =
      lastLiveAmapPositionRef.current || encounterPositionRef.current;
    if (!current) {
      setLiveLocationNotice("正在等待真实位置，GPS 定位后即可种下植物");
      return;
    }
    plantPocketAssetAtPosition(activeSeedAsset, current);
  };

  const interactFromDesktopController = () => {
    const current =
      lastLiveAmapPositionRef.current || encounterPositionRef.current;
    if (!current) return;
    const nearest = DISPLAY_PLANTS.filter((plant) =>
      isGardenCityLoaded(plant, loadedGardenCityIds),
    )
      .map((plant) => ({
        plant,
        distance: distanceInMeters(current, plant.position),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (!nearest || nearest.distance > 90) {
      setLiveLocationNotice("附近暂时没有可互动的花与城市伙伴，继续往前走走看");
      return;
    }
    const resident = getResidentAgentForMapPlant(
      nearest.plant.id,
      worldLayerRef.current,
    );
    setLiveLocationNotice(
      resident
        ? `${resident.name}正在${nearest.plant.name}附近${resident.activityLabel}，它注意到你了`
        : `${nearest.plant.name}离你约 ${Math.round(nearest.distance)} 米，正在轻轻摇动`,
    );
  };

  const openOutingCamera = () => {
    if (!liveOutingVisible) return;
    stopDesktopViewOrbit();
    outingCameraOpenRef.current = true;
    const position =
      lastLiveAmapPositionRef.current ||
      encounterPositionRef.current ||
      initialCenter;
    const cityPlants = DISPLAY_PLANTS.filter((plant) =>
      isGardenCityLoaded(plant, loadedGardenCityIds),
    ).map((plant) => ({
      plant: {
        id: plant.id,
        name: plant.name,
        imageUrl: plant.asset,
        position: plant.position,
        source: "city" as const,
      },
      place: plant.memory.split(" · ")[0] || plant.name,
      distance: distanceInMeters(position, plant.position),
    }));
    const pocketPlants = plantedPocketPlants.flatMap((planting) => {
      const asset = POCKET_PLANT_ASSETS.find(
        (candidate) => candidate.id === planting.assetId,
      );
      if (!asset) return [];
      return [{
        plant: {
          id: planting.id,
          name: asset.name,
          imageUrl: asset.src,
          position: planting.position,
          source: "pocket" as const,
        },
        place: planting.place || asset.name,
        distance: distanceInMeters(position, planting.position),
      }];
    });
    const nearest = [...cityPlants, ...pocketPlants].sort(
      (a, b) => a.distance - b.distance,
    )[0];
    const nearbyPlant = nearest && nearest.distance <= 180 ? nearest.plant : null;

    setDesktopRoamControllerOpen(false);
    setOutingCameraScene({
      city: getRoamCity(),
      place: nearest?.place || `${getRoamCity()}街角`,
      position,
      guide: {
        id: activeOutingGuide.id,
        name: activeOutingGuide.name,
        kind: "guide",
        imageUrl: agentPhotoImage(activeOutingGuide),
        color: activeOutingGuide.color,
      },
      companions: activeOutingPets.map((pet) => ({
        id: pet.id,
        name: pet.name,
        kind: "walking-companion" as const,
        imageUrl: agentPhotoImage(pet),
        color: pet.color,
      })),
      pocketBuddies: activeOutingPocketBuddies.map((buddy) => ({
        id: buddy.id,
        name: buddy.name,
        kind: "pocket-buddy" as const,
        imageUrl: buddy.visual.thumbnailUrl,
        color: "#d9b9e5",
      })),
      nearbyPlant,
    });
  };

  const closeOutingCamera = () => {
    outingCameraOpenRef.current = false;
    setOutingCameraScene(null);
    requestAnimationFrame(syncLiveOutingPose);
  };

  const saveOutingPhoto = (
    frozenScene: StreetPhotoScene,
    hostPlant: StreetPhotoPlant | null,
  ) => {
    const photo = saveStreetPhoto(frozenScene, hostPlant);
    setLiveLocationNotice(
      hostPlant
        ? `拍立得已经挂到${hostPlant.name}上；以后路过仍能看见`
        : "拍立得已收进口袋，可以稍后放进手帐",
    );
    return photo;
  };

  const captureOutingPhotoFrame = async () => {
    const mapStage = mapContainerRef.current?.closest<HTMLElement>(
      ".sg-map-stage",
    );
    if (!mapStage) return null;
    return captureStreetPhotoFrame(mapStage, mapRef.current);
  };

  const toggleOutingPet = (petId: string) => {
    setOutingPreviewPetId(petId);
    setOutingSetupFocus("companion");
    setOutingPetIds((current) => {
      if (current.includes(petId)) {
        return current.filter((id) => id !== petId);
      }
      return [...current, petId];
    });
  };

  const confirmOutingSetup = () => {
    if (seedPouchIds.length === 0) return;
    startLiveOuting(
      selectedOutingGuide.profile,
      selectedOutingPets,
      "leash",
      selectedOutingPocketBuddies,
      "preview",
    );
  };

  const switchLiveOutingLocationMode = (mode: LiveOutingLocationMode) => {
    if (
      !liveOutingVisible ||
      (mode === "preview" && mode === liveOutingLocationMode)
    ) return;
    // GPS 按钮同时承担“强制重试”：即使已经处于 GPS 模式，也要
    // 销毁旧 watchPosition 并按原有方式重新申请一次真实位置。
    startLiveOuting(
      activeOutingGuide,
      activeOutingPets,
      activeOutingCompanionMode,
      activeOutingPocketBuddies,
      mode,
    );
  };

  const beginEncounterDestination = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (
      (!plantingAssetId && !encounterActiveRef.current) ||
      (!plantingAssetId && liveLocationActiveRef.current) ||
      !event.isPrimary
    ) {
      return;
    }
    const target = event.target as HTMLElement;
    if (
      target.closest(
        ".sg-controls, .sg-map-plant, .sg-encounter-close, [data-ignore-map-destination]",
      )
    ) {
      stagePointerRef.current = null;
      return;
    }
    stagePointerRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startedAt: performance.now(),
    };
  };

  const finishEncounterDestination = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const pointer = stagePointerRef.current;
    stagePointerRef.current = null;
    if (
      !pointer ||
      pointer.id !== event.pointerId ||
      !mapRef.current ||
      !amapApiRef.current
    ) {
      return;
    }
    const distance = Math.hypot(
      event.clientX - pointer.x,
      event.clientY - pointer.y,
    );
    if (distance > 8 || performance.now() - pointer.startedAt > 700) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const pixel = new amapApiRef.current.Pixel(
      event.clientX - bounds.left,
      event.clientY - bounds.top,
    );
    const lngLat = mapRef.current.containerToLngLat(pixel);
    const lng = Number(lngLat?.getLng?.());
    const lat = Number(lngLat?.getLat?.());
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      if (plantingAssetId) {
        setPendingPlantPosition([lng, lat]);
        setLiveLocationNotice("落点已选好；确认后种植时间将不可更改");
        return;
      }
      if (!encounterActiveRef.current) return;
      // 每次点击都写入一个新的坐标数组；包括到达后的再次点击，都会重新请求步行路线。
      setEncounterDestination([lng, lat]);
    }
  };

  const toggleTilt = () => {
    const next = !tilted;
    setTilted(next);
    if (mapRef.current) {
      mapRef.current.setPitch(next ? GARDEN_PITCH : 0);
      mapRef.current.setRotation(next ? -13 : 0);
    }
  };

  const resetView = () => {
    setTilted(true);
    if (mapRef.current) {
      mapRef.current.setZoomAndCenter(GARDEN_ZOOM, GARDEN_CENTER);
      mapRef.current.setPitch(GARDEN_PITCH);
      mapRef.current.setRotation(-13);
    }
  };

  const focusGardenRegion = (
    center: [number, number],
    zoom: number,
  ) => {
    setTilted(false);
    if (mapRef.current) {
      mapRef.current.setZoomAndCenter(zoom, center);
      mapRef.current.setPitch(0);
      mapRef.current.setRotation(0);
    }
  };

  const showGardenCityOverview = (city: PublicGardenCityPackage) => {
    focusGardenRegion(city.overviewCenter, city.overviewZoom);
    setRegionPickerOpen(false);
  };

  const toggleGardenCity = (cityId: PublicGardenCityId) => {
    setLoadedGardenCityIds((current) => {
      const next = current.includes(cityId)
        ? current.filter((candidate) => candidate !== cityId)
        : [...current, cityId];
      persistLoadedGardenCityIds(next);
      return next;
    });
  };

  const changeZoom = (delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    const currentZoom = Number(map.getZoom());
    if (!Number.isFinite(currentZoom)) return;
    map.setZoom(Math.min(20, Math.max(3, currentZoom + delta)));
  };

  const toggleBuildings = () => {
    if (mapState !== "amap" || !mapRef.current || !amapApiRef.current) return;
    const next = !buildingsVisible;
    try {
      buildingLayerRef.current = setAmapBuildingsVisible(
        mapRef.current, amapApiRef.current, buildingLayerRef.current, next,
      );
      setBuildingsVisible(next);
    } catch (error) {
      console.warn("高德楼块图层暂不可用", formatAmapError(error));
      setLiveLocationNotice("当前地图环境暂不支持 3D 楼块；基础地图仍可使用。");
    }
  };

  const toggleGroundTheme = () => {
    const nextId: GroundThemeId =
      groundThemeId === "meadow" ? "sunlit" : "meadow";
    setGroundThemeId(nextId);
  };

  const focusMemoryFragment = (fragment: GardenMemoryFragment) => {
    setSelectedPostcardIndex(null);
    setSelectedMemoryId(fragment.id);
    setMemoryPage(0);
    setMemoryLayerVisible(true);
    setTilted(true);
    if (mapRef.current) {
      // 阅读时把现场牌留在上方 3D 视窗，而不是被下方档案本遮住。
      mapRef.current.setZoomAndCenter(17.4, [
        fragment.lng,
        fragment.lat - 0.00155,
      ]);
      mapRef.current.setPitch(GARDEN_PITCH);
      mapRef.current.setRotation(-13);
    }
  };

  const toggleMemoryLayer = () => {
    if (memoryLayerVisible) {
      setMemoryLayerVisible(false);
      setSelectedMemoryId(null);
      return;
    }
    const firstMemory = GARDEN_MEMORY_FRAGMENTS[0];
    if (firstMemory) focusMemoryFragment(firstMemory);
  };

  const focusNextMemory = () => {
    if (GARDEN_MEMORY_FRAGMENTS.length === 0) return;
    const currentIndex = GARDEN_MEMORY_FRAGMENTS.findIndex(
      (fragment) => fragment.id === selectedMemoryId,
    );
    const nextIndex = (currentIndex + 1) % GARDEN_MEMORY_FRAGMENTS.length;
    focusMemoryFragment(GARDEN_MEMORY_FRAGMENTS[nextIndex]);
  };

  return (
    <section
      className={`sg-lab${basemapOnly ? " is-basemap-only" : ""}${
        staticPresentation ? " is-static-presentation" : ""
      }${wildlifePresentation ? " is-wildlife-presentation" : ""}`}
      data-ground-theme={groundThemeId}
      data-world-layer={worldLayer}
      data-event-ledger-version={eventLedgerVersion}
      style={{ "--sg-ground": groundTheme.color } as React.CSSProperties}
    >
      <div
        className={`sg-map-stage ${
          liveOutingVisible ? "is-encountering" : ""
        } ${outingSetupOpen ? "is-outing-setup" : ""} ${
          gardenJournalOpen ? "is-journal-open" : ""
        } ${selectedMemory ? "is-memory-reader-open" : ""} ${
          outingCameraScene ? "is-camera-open" : ""
        }`}
        data-route-mode={routeMode}
        data-live-location={liveLocationState}
        data-outing-guide={activeOutingGuide.id}
        data-outing-pet={activeOutingPets.map((pet) => pet.id).join(",")}
        data-outing-pocket-buddy={activeOutingPocketBuddies
          .map((buddy) => buddy.id)
          .join(",")}
        data-outing-companion-mode={activeOutingCompanionMode}
        data-encounter-id={encounterId || ""}
        data-destination={
          encounterDestination
            ? `${encounterDestination[0].toFixed(6)},${encounterDestination[1].toFixed(6)}`
            : ""
        }
        onPointerDownCapture={beginEncounterDestination}
        onPointerUpCapture={finishEncounterDestination}
        onPointerCancelCapture={() => {
          stagePointerRef.current = null;
        }}
      >
        <div
          ref={mapContainerRef}
          className="sg-amap"
          aria-label="高德地图花园实验"
        />
        <div ref={plantOverlayRef} className="sg-plant-overlay" />
        <div
          ref={memoryOverlayRef}
          className={`sg-memory-overlay ${
            worldLayer === "personal" &&
            memoryLayerVisible &&
            !gardenJournalOpen
              ? "is-visible"
              : ""
          } ${mapZoom < 15.5 ? "is-clustered" : ""}`}
          aria-hidden={
            worldLayer !== "personal" ||
            !memoryLayerVisible ||
            gardenJournalOpen
          }
        />
        {(mapState === "preview" || mapState === "error") && (
          <div className={`sg-preview ${tilted ? "is-tilted" : ""}`}>
            <div className="sg-preview-ground">
              <span className="sg-water sg-water--one" />
              <span className="sg-water sg-water--two" />
              <span className="sg-park sg-park--one" />
              <span className="sg-park sg-park--two" />
              <span className="sg-road sg-road--one" />
              <span className="sg-road sg-road--two" />
              <span className="sg-road sg-road--three" />
              <span className="sg-road sg-road--four" />
            </div>

            <div className="sg-preview-plants">
              {DISPLAY_PLANTS.filter((plant) =>
                isPlantVisible(plant.id, worldLayer),
              ).map((plant) => (
                <button
                  key={plant.id}
                  type="button"
                  className={`sg-map-plant sg-preview-plant ${
                    selectedId === plant.id ? "is-selected" : ""
                  } ${plant.giantTheme ? "sg-giant-plant" : ""}`}
                  style={
                    {
                      left: `${plant.preview[0]}%`,
                      top: `${plant.preview[1]}%`,
                      "--plant-scale": String(plantVisualScale(plant)),
                      "--giant-story-scale": String(
                        1 /
                          Math.max(
                            plantVisualScale(plant),
                            PUBLIC_PLANT_MIN_FINAL_SCALE,
                          ),
                      ),
                      "--plant-root-x": `${(plant.rootX / 512) * 164}px`,
                    } as React.CSSProperties
                  }
                  onClick={() => {
                    selectPlant(plant);
                  }}
                  aria-label={`查看${plant.name}`}
                >
                  <LowPolyPlantVisual plant={plant} showResidentAgents={showResidentAgents} />
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedPlantCard && selectedPlantCardAsset && (
          <div
            className="sg-plant-card-viewer"
            role="presentation"
            data-ignore-map-destination
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) {
                setSelectedPlantCardId(null);
              }
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-label={`${selectedPlantCard.name}的城市植物卡`}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="sg-plant-card-viewer__close"
                onClick={() => setSelectedPlantCardId(null)}
                aria-label="收起植物卡"
              >
                <X size={17} strokeWidth={2.7} />
              </button>
              <CityCharacterCard
                id={selectedPlantCard.id}
                name={selectedPlantCard.name}
                role={selectedPlantCardAsset.scientificName}
                kind="CITY BOTANICAL"
                accent={
                  BOTANICAL_CARD_ACCENTS[
                    selectedPlantCardHash % BOTANICAL_CARD_ACCENTS.length
                  ]
                }
                portrait={(
                  <img
                    src={selectedPlantCardAsset.src}
                    alt={selectedPlantCardAsset.name}
                    draggable={false}
                  />
                )}
                sheet={characterSheetFrom({
                  seed: selectedPlantCard.id,
                  role: "杭州城市植物图鉴",
                  traits: [selectedPlantCardAsset.family, "植物"],
                })}
                scene={
                  BOTANICAL_CARD_SCENES[
                    selectedPlantCardHash % BOTANICAL_CARD_SCENES.length
                  ]
                }
                sceneVariant={selectedPlantCardHash % 16}
                botanical={{
                  scientificName: selectedPlantCardAsset.scientificName,
                  familyLabel:
                    BOTANICAL_FAMILY_LABELS[selectedPlantCardAsset.family],
                  description: selectedPlantCardAsset.description,
                  locationLabel:
                    selectedPlantCard.siteName ??
                    (selectedPlantCard.district
                      ? `${selectedPlantCard.district}·城市绿地`
                      : "杭州·城市绿地"),
                  coordinates: selectedPlantCard.position,
                  fieldNote: selectedPlantCard.poem,
                }}
                action={(
                  <button
                    type="button"
                    onClick={() => setSelectedPlantCardId(null)}
                  >
                    收好卡牌
                  </button>
                )}
              />
            </section>
          </div>
        )}

        {mapState === "loading" && (
          <div className="sg-loading">
            <span />
            <p>正在唤醒高德花园…</p>
          </div>
        )}

        {selectedFlowerPostcard && (
          <div
            className="sg-postcard-viewer sg-flower-postcard-viewer"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setSelectedFlowerPostcard(null)}
            data-ignore-map-destination
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-label={`${selectedFlowerPostcard.place}的明信片大图`}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="sg-postcard-viewer-close"
                onClick={() => setSelectedFlowerPostcard(null)}
                aria-label="收起明信片大图"
              >
                <X size={17} strokeWidth={2.5} />
              </button>
              <figure className="sg-flower-postcard-open">
                <img
                  src={selectedFlowerPostcard.image}
                  alt={`${selectedFlowerPostcard.place}的明信片`}
                  draggable={false}
                />
                <figcaption>{selectedFlowerPostcard.place}</figcaption>
              </figure>
            </section>
          </div>
        )}

        {selectedPostcard && selectedPostcardIndex !== null && (
          <div
            className="sg-postcard-viewer"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setSelectedPostcardIndex(null)}
            data-ignore-map-destination
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-label={`${selectedPostcard.place}的明信片`}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="sg-postcard-viewer-close"
                onClick={() => setSelectedPostcardIndex(null)}
                aria-label="收起明信片"
              >
                <X size={17} strokeWidth={2.5} />
              </button>

              <article
                className="sg-postcard-open"
                style={
                  {
                    "--postcard-accent": selectedPostcard.accent,
                  } as React.CSSProperties
                }
              >
                <div className="sg-postcard-photo">
                  <img
                    src={selectedPostcard.image}
                    alt={`${selectedPostcard.place}的现场照片`}
                    draggable={false}
                  />
                  <span>
                    <strong>{selectedPostcard.place}</strong>
                    <small>{selectedPostcard.date}</small>
                  </span>
                </div>
                <div className="sg-postcard-message">
                  <header>
                    <b>植物邮局</b>
                    <i>{selectedPostcard.stamp}</i>
                  </header>
                  <span className="sg-postcard-postmark">
                    {selectedPostcard.city} · 已投递
                  </span>
                  <p>{selectedPostcard.message}</p>
                  <small>寄信人 · {selectedPostcard.author}</small>
                </div>
              </article>

              <nav aria-label="切换植物上的明信片">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedPostcardIndex(
                      (selectedPostcardIndex - 1 + GARDEN_POSTCARDS.length) %
                        GARDEN_POSTCARDS.length,
                    )
                  }
                  aria-label="上一张明信片"
                >
                  ←
                </button>
                <span>
                  {selectedPostcardIndex + 1} / {GARDEN_POSTCARDS.length}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedPostcardIndex(
                      (selectedPostcardIndex + 1) % GARDEN_POSTCARDS.length,
                    )
                  }
                  aria-label="下一张明信片"
                >
                  →
                </button>
              </nav>
            </section>
          </div>
        )}

        {!liveOutingVisible && !basemapOnly && (
          <button
            type="button"
            className="sg-outing-avatar-pass"
            onClick={() => openOutingSetup("identity")}
            title="切换男主 / 女主并预览行走"
            data-ignore-map-destination
          >
            <span
              className="sg-outing-avatar-pass-portrait"
              style={{
                backgroundColor: `${selectedOutingGuide.profile.color}2b`,
              }}
              aria-hidden="true"
            >
              {selectedOutingGuide.portraitUrl && (
                <img
                  key={selectedOutingGuide.portraitUrl}
                  src={selectedOutingGuide.portraitUrl}
                  alt=""
                  onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
                />
              )}
            </span>
            <span>
              <small>MY AVATAR · 出门证件</small>
              <strong>{selectedOutingGuide.label}</strong>
            </span>
            <ChevronRight size={14} strokeWidth={2.6} aria-hidden="true" />
          </button>
        )}

        {!liveOutingVisible && !basemapOnly && (
          <aside
            className="sg-outing-kit-rail"
            aria-label="今日出门随行栏"
            data-ignore-map-destination
          >
            <button
              type="button"
              onClick={() => openOutingSetup("companion")}
              title={`选择散步搭子；当前 ${
                selectedOutingPets.length
                  ? selectedOutingPets.map((pet) => pet.name).join("、")
                  : "无"
              }`}
            >
              <span className="sg-outing-kit-portrait">
                {selectedOutingPet &&
                (selectedOutingPet.portraitUrl || selectedOutingPet.sourceAsset) ? (
                  <img
                    key={selectedOutingPet.portraitUrl || selectedOutingPet.sourceAsset}
                    src={
                      selectedOutingPet.portraitUrl ||
                      selectedOutingPet.sourceAsset
                    }
                    alt=""
                    onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
                  />
                ) : !selectedOutingPet ? (
                  <PawPrint size={20} strokeWidth={2.3} />
                ) : null}
                {selectedOutingPets.length > 1 && (
                  <b>{selectedOutingPets.length}</b>
                )}
              </span>
              <small>搭子</small>
            </button>
            <button
              type="button"
              className="sg-outing-kit-seed"
              onClick={openSeedDrawer}
              title={
                seedPouchIds.length > 0
                  ? `种子口袋已装 ${seedPouchIds.length} 枚`
                  : "选择植物种子装进口袋"
              }
            >
              <span className="sg-outing-kit-portrait">
                <span className="sg-outing-kit-seed-clip">
                  {activeSeedAsset ? (
                    <img src={activeSeedAsset.src} alt="" />
                  ) : (
                    <Sprout size={20} strokeWidth={2.3} />
                  )}
                </span>
                {seedPouchIds.length > 0 && <b>{seedPouchIds.length}</b>}
              </span>
              <small>种子</small>
            </button>
            <button
              type="button"
              className="sg-outing-kit-start"
              onClick={handleOutingButton}
              disabled={mapState !== "amap"}
              title="检查今日同行并开始出门"
            >
              <Navigation2 size={20} strokeWidth={2.7} />
              <small>出门</small>
            </button>
            <button
              type="button"
              className="sg-outing-kit-controller"
              disabled
              aria-disabled="true"
              title="开始出门后可使用自动巡游 / 手动操控模拟器"
            >
              <span className="sg-outing-kit-portrait">
                <Gamepad2 size={20} strokeWidth={2.3} />
              </span>
              <small>驾驶</small>
            </button>
          </aside>
        )}

        {!liveOutingVisible && !basemapOnly && (
          <aside
            className={`sg-outing-core-hint${coreHintCollapsed ? " is-collapsed" : ""}`}
            aria-label="核心体验提示"
            data-ignore-map-destination
          >
            <button
              type="button"
              aria-expanded={!coreHintCollapsed}
              onClick={() => setCoreHintCollapsed((collapsed) => !collapsed)}
            >
              <b>CORE WALK · 核心体验</b>
              <small>{coreHintCollapsed ? "展开" : "收起"}</small>
            </button>
            {!coreHintCollapsed && (
              <span className="sg-outing-core-hint-copy">
                点击右下角「出门」，再选择「根据真实位置校正」
              </span>
            )}
          </aside>
        )}

        {liveOutingVisible && !basemapOnly && (
          <aside
            className="sg-outing-controller-live-rail"
            aria-label="出门随身道具"
            data-ignore-map-destination
          >
            <button
              type="button"
              className={outingCameraScene ? "is-active is-camera" : "is-camera"}
              onClick={() => {
                if (outingCameraScene) closeOutingCamera();
                else openOutingCamera();
              }}
              aria-pressed={Boolean(outingCameraScene)}
              title="拿出拍立得，给同行搭子、口袋伙伴和附近植物留影"
            >
              <span className="sg-outing-kit-portrait">
                <Camera size={20} strokeWidth={2.3} />
              </span>
              <small>拍立得</small>
            </button>
            <button
              type="button"
              className={
                desktopRoamControllerOpen || desktopRoamEngaged
                  ? "is-active"
                  : ""
              }
              onClick={toggleDesktopRoamController}
              disabled={liveOutingLocationMode === "gps"}
              aria-pressed={desktopRoamControllerOpen}
              title={
                liveOutingLocationMode === "gps"
                  ? "真实 GPS 正在接管人物，桌面模拟器不可用"
                  : "展开自动巡游 / 手动操控模拟器"
              }
            >
              <span className="sg-outing-kit-portrait">
                <Gamepad2 size={20} strokeWidth={2.3} />
              </span>
              <small>驾驶</small>
            </button>
          </aside>
        )}

        {desktopRoamControllerOpen &&
          liveOutingVisible &&
          liveOutingLocationMode === "preview" && (
            <DesktopRoamController
              theme="retro"
              mode={desktopRoamEngaged ? "manual" : "auto"}
              cruiseActive={desktopRoamCruise}
              canPlant={Boolean(
                activeSeedAsset &&
                  seedPouchIds.includes(activeSeedAsset.id) &&
                  (seedProgress.inventory[activeSeedAsset.id] ?? 0) > 0,
              )}
              onModeChange={setDesktopRoamMode}
              onInput={(input) => {
                desktopRoamInputRef.current = input;
              }}
              onCruiseToggle={toggleDesktopRoamCruise}
              onPlant={plantFromDesktopController}
              onInteract={interactFromDesktopController}
              onView={toggleTilt}
              onViewOrbitStart={startDesktopViewOrbit}
              onViewOrbitEnd={stopDesktopViewOrbit}
              onRecenter={recenterDesktopRoam}
              onClose={toggleDesktopRoamController}
            />
          )}

        {outingCameraScene && liveOutingVisible && (
          <OutingPolaroidCamera
            scene={outingCameraScene}
            onClose={closeOutingCamera}
            onSave={saveOutingPhoto}
            captureFrame={captureOutingPhotoFrame}
          />
        )}

        {selectedStreetPhoto && (
          <div
            className="sg-street-photo-viewer"
            data-ignore-map-destination
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedStreetPhoto.place}的城市拍立得`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setSelectedStreetPhoto(null)}
          >
            <section onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                onClick={() => setSelectedStreetPhoto(null)}
                aria-label="收起拍立得"
              >
                <X size={16} strokeWidth={2.6} />
              </button>
              <StreetPolaroid scene={selectedStreetPhoto} />
              <p>
                <MapPin size={13} strokeWidth={2.5} />
                挂在{selectedStreetPhoto.hostPlant?.name || "城市口袋"} · {new Date(selectedStreetPhoto.capturedAt).toLocaleString("zh-CN")}
              </p>
            </section>
          </div>
        )}

        {seedDrawerOpen &&
          (!liveOutingVisible || liveOutingLocationMode === "gps") && (
          <div
            className="sg-seed-drawer-backdrop"
            data-ignore-map-destination
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setSeedDrawerOpen(false);
            }}
          >
            <PocketPlantSeedDrawer
              assets={POCKET_PLANT_ASSETS}
              pouchIds={seedPouchIds}
              seedCounts={seedProgress.inventory}
              activeId={activeSeedId}
              onToggle={togglePocketSeed}
              onClose={() => setSeedDrawerOpen(false)}
              onChooseLocation={choosePocketPlantLocation}
              actionLabel={liveOutingVisible ? "在这里种下" : undefined}
            />
          </div>
        )}

        {plantingAsset && !seedDrawerOpen && !liveOutingVisible && (
          <section
            className={`sg-planting-toolbar${
              pendingPlantPosition ? " has-position" : ""
            }`}
            data-ignore-map-destination
            aria-live="polite"
          >
            <span><img src={plantingAsset.src} alt="" /></span>
            <div>
              <small>种植仪式 · {plantingAsset.name}</small>
              <strong>
                {pendingPlantPosition
                  ? "这个时间与地点将成为它的出生牌"
                  : "在地图空地轻点一下选择落点"}
              </strong>
              <p>{plantingAsset.description}</p>
            </div>
            <button
              type="button"
              className="sg-planting-cancel"
              onClick={cancelPocketPlanting}
              aria-label="取消种植"
            >
              <X size={14} strokeWidth={2.8} />
            </button>
            {pendingPlantPosition && (
              <button
                type="button"
                className="sg-planting-confirm"
                onClick={confirmPocketPlanting}
              >
                <Sprout size={14} strokeWidth={2.7} />
                确认种下
              </button>
            )}
            <ol className="sg-planting-steps" aria-label="种植进度">
              <li className="is-done"><b>1</b>选种</li>
              <li className={pendingPlantPosition ? "is-done" : "is-current"}><b>2</b>落点</li>
              <li className={pendingPlantPosition ? "is-current" : ""}><b>3</b>生根</li>
            </ol>
          </section>
        )}

        {plantingSuccess && plantingSuccessAsset && !liveOutingVisible && (
          <section
            className="sg-planting-success"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sg-planting-success-title"
            data-ignore-map-destination
          >
            <div className="sg-planting-success__halo" aria-hidden="true">
              {Array.from({ length: 8 }, (_, index) => <i key={index} />)}
            </div>
            <span className="sg-planting-success__plant">
              <img src={plantingSuccessAsset.src} alt={plantingSuccessAsset.name} />
            </span>
            <small>ROOTED IN HANGZHOU</small>
            <h2 id="sg-planting-success-title">{plantingSuccessAsset.name}，已在城市里生根</h2>
            <em>{plantingSuccessAsset.scientificName}</em>
            <p>{plantingSuccessAsset.description}</p>
            {plantingSuccess.sentence && <blockquote>“{plantingSuccess.sentence}”</blockquote>}
            <dl className="sg-planting-success__birth-card">
              <div><dt>地点</dt><dd>{plantingSuccess.place}</dd></div>
              <div><dt>坐标</dt><dd>E {plantingSuccess.position[0].toFixed(5)} · N {plantingSuccess.position[1].toFixed(5)}</dd></div>
              <div><dt>时间</dt><dd>{new Date(plantingSuccess.plantedAt).toLocaleString("zh-CN", { hour12: false })}</dd></div>
            </dl>
            <div className="sg-planting-success__saved"><Check size={13} strokeWidth={3} />出生牌已保存，可再次轻点植物查看</div>
            <button type="button" autoFocus onClick={() => setPlantingSuccess(null)}>收进植物库 · 继续散步</button>
          </section>
        )}

        {!wildlifePresentation && (
          <div
            className={`sg-controls ${viewControlsOpen ? "is-view-open" : ""}`}
          >
          <div className="sg-control-rail" role="toolbar" aria-label="地图行动">
            {worldLayer === "personal" ? (
              <button
                type="button"
                className={`sg-memory-layer-toggle ${
                  memoryLayerVisible ? "is-active" : ""
                }`}
                onClick={toggleMemoryLayer}
                aria-pressed={memoryLayerVisible}
                disabled={
                  mapState !== "amap" || liveOutingVisible || outingSetupOpen
                }
                title="打开个人花园手帐"
                data-ignore-map-destination
              >
                <MapPin size={14} strokeWidth={2.5} />
                手帐
                <b>{GARDEN_MEMORY_FRAGMENTS.length}</b>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setRegionPickerOpen((open) => !open)}
                className={regionPickerOpen ? "is-active" : ""}
                aria-expanded={regionPickerOpen}
                title={`已加载 ${loadedPublicGardenCount} / ${PUBLIC_GIANT_FLOWER_COUNT} 株城市参天大花`}
              >
                <Flower2 size={15} strokeWidth={2.4} />
                城市
                <b>{loadedPublicGardenCount}</b>
              </button>
            )}
            <button
              type="button"
              className={viewControlsOpen ? "is-active" : ""}
              onClick={() => setViewControlsOpen((open) => !open)}
              aria-expanded={viewControlsOpen}
              aria-controls="sg-view-controls"
              title="展开地图视图工具"
            >
              <SlidersHorizontal size={15} strokeWidth={2.4} />
              视图
            </button>
          </div>

          {worldLayer === "public" && regionPickerOpen && (
            <div className="sg-region-picker" aria-label="城市花园分区">
              {PUBLIC_GARDEN_CITY_PACKAGES.map((city) => {
                const cityLoaded = loadedGardenCityIds.includes(city.id);
                return (
                  <Fragment key={city.id}>
                    <span
                      className={`sg-region-picker-city ${
                        cityLoaded ? "" : "is-unloaded"
                      }`}
                    >
                      {city.label} · {city.scopeLabel} ·{" "}
                      {cityLoaded ? "已加载" : "已卸载"}
                    </span>
                    <button
                      type="button"
                      className={`sg-region-picker-city-toggle ${
                        cityLoaded ? "is-loaded" : ""
                      }`}
                      aria-label={`${
                        cityLoaded ? "卸载" : "加载"
                      }${city.label}花园数据`}
                      aria-pressed={cityLoaded}
                      onClick={() => toggleGardenCity(city.id)}
                    >
                      <span>{cityLoaded ? "卸载数据" : "加载数据"}</span>
                      <b>{city.sites.length}</b>
                    </button>
                    <button
                      type="button"
                      className="sg-region-picker-overview"
                      disabled={!cityLoaded}
                      onClick={() => showGardenCityOverview(city)}
                    >
                      <span>{city.overviewLabel}</span>
                      <b>{city.sites.length}</b>
                    </button>
                    {city.regions.map((region) => (
                      <button
                        key={region.id}
                        type="button"
                        disabled={!cityLoaded}
                        onClick={() => {
                          focusGardenRegion(region.center, region.zoom);
                          setRegionPickerOpen(false);
                        }}
                      >
                        <span>{region.label}</span>
                        <b>{region.sites.length}</b>
                      </button>
                    ))}
                  </Fragment>
                );
              })}
            </div>
          )}

          {viewControlsOpen && (
            <div
              id="sg-view-controls"
              className="sg-view-controls"
              role="toolbar"
              aria-label="地图视图"
            >
              <div
                className="sg-view-control-group sg-view-control-group--camera"
                role="group"
                aria-label="视角"
              >
                <span>视角</span>
                <button
                  type="button"
                  onClick={toggleTilt}
                  className={tilted ? "is-active" : ""}
                  aria-pressed={tilted}
                >
                  <Layers3 size={15} strokeWidth={2.4} />
                  {tilted ? `${GARDEN_PITCH}°` : "俯视"}
                </button>
              </div>
              <div
                className="sg-view-control-group sg-view-control-group--layers"
                role="group"
                aria-label="图层"
              >
                <span>图层</span>
                <button
                  type="button"
                  onClick={toggleBuildings}
                  className={
                    buildingsVisible ? "is-active is-building-active" : ""
                  }
                  aria-pressed={buildingsVisible}
                  title={buildingsVisible ? "隐藏建筑体块" : "显示建筑体块"}
                >
                  <Building2 size={15} strokeWidth={2.3} />
                  楼块
                </button>
                <button
                  type="button"
                  aria-pressed={groundThemeId === "meadow"}
                  aria-label="切换绿色草地底图"
                  onClick={toggleGroundTheme}
                  className={
                    groundThemeId === "meadow"
                      ? "is-active is-grass-active"
                      : ""
                  }
                  title={
                    groundThemeId === "meadow"
                      ? "切回高德原图"
                      : "切换为绿色草地，保留道路和水系"
                  }
                >
                  <Sprout size={15} strokeWidth={2.3} />
                  草地
                </button>
              </div>
              <div
                className="sg-view-control-group sg-view-control-group--zoom"
                role="group"
                aria-label="缩放"
              >
                <span>缩放</span>
                <button
                  type="button"
                  onClick={() => changeZoom(-1)}
                  aria-label="缩小地图"
                  title="缩小地图"
                >
                  <Minus size={15} strokeWidth={2.7} />
                </button>
                <button
                  type="button"
                  onClick={() => changeZoom(1)}
                  aria-label="放大地图"
                  title="放大地图"
                >
                  <Plus size={15} strokeWidth={2.7} />
                </button>
              </div>
              <div
                className="sg-view-control-group sg-view-control-group--reset"
                role="group"
                aria-label="定位"
              >
                <span>定位</span>
                <button type="button" onClick={resetView} title="重置视角">
                  <LocateFixed size={16} strokeWidth={2.4} />
                  复位
                </button>
              </div>
            </div>
          )}
          </div>
        )}

        {worldLayer === "personal" && latestDuty && (
          <div className="sg-duty-ledger" aria-live="polite">
            <PawPrint size={13} strokeWidth={2.5} />
            <span>
              <strong>
                {latestDuty.status === "running"
                  ? "小肠正在值日"
                  : "最近值日已入账"}
              </strong>
              <small>
                {latestDuty.mode === "gps-companion" ? "GPS 同行" : "道路测试"}
                {" · "}
                {latestDuty.eventIds.length} 条事件
              </small>
            </span>
          </div>
        )}

        {worldLayer === "personal" &&
          memoryLayerVisible &&
          selectedMemory &&
          !gardenJournalOpen && (
            <section
              className="sg-memory-reader"
              data-memory-id={selectedMemory.id}
              data-memory-page={memoryPage + 1}
              data-ignore-map-destination
            >
              <button
                type="button"
                className="sg-memory-reader-close"
                onClick={() => setSelectedMemoryId(null)}
                aria-label="合上现场档案并返回地图"
              >
                <X size={15} strokeWidth={2.8} />
              </button>
              <span
                className="sg-memory-hand sg-memory-hand--left"
                aria-hidden
              />
              <article className="sg-memory-book sg-memory-book--guji">
                <div className="sg-memory-book-rings" aria-hidden>
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <header>
                  <small>城市古笺 · CITY LEAF</small>
                  <span>
                    书叶 {String(memoryPage + 1).padStart(2, "0")} / 03
                  </span>
                </header>

                <div className="sg-memory-book-page">
                  {memoryPage === 0 && (
                    <div className="sg-memory-page-guji">
                      <div className="sg-memory-guji-frame">
                        <div className="sg-memory-guji-columns font-guji">
                          <div className="sg-memory-guji-title">
                            <strong>{conciseBookTitle(selectedMemory.bookTitle)}</strong>
                            <small>{formatGujiVerticalText(selectedMemory.bookAuthor)}</small>
                          </div>
                          <div className="sg-memory-guji-entry">
                            <b>{selectedMemory.name}</b>
                            {selectedMemoryOriginal && (
                              <q>{formatGujiOriginalExcerpt(selectedMemoryOriginal, selectedMemory.name)}</q>
                            )}
                            {selectedMemory.chapter && (
                              <small>{formatGujiVerticalText(`出${selectedMemory.chapter}`)}</small>
                            )}
                          </div>
                          <div className="sg-memory-guji-seal" aria-hidden>
                            <span>▼</span>
                            <i>上街去</i>
                          </div>
                        </div>
                      </div>
                      <div className="sg-memory-guji-caption">
                        <span>GUJI LEAF · 书叶</span>
                        <b>
                          {ROAM_STATUS_LABEL[selectedMemory.status]} · 右起竖读
                        </b>
                      </div>
                    </div>
                  )}

                  {memoryPage === 1 && (
                    <div className="sg-memory-page-quote">
                      <small>SOURCE · QUOTE</small>
                      <blockquote>
                        “
                        {selectedMemoryOriginal ||
                          "这一处尚没有可靠的原文摘录，只保留地点与考据。"}
                        ”
                      </blockquote>
                      <p>
                        {selectedMemory.chapter || selectedMemory.bookTitle}
                      </p>
                    </div>
                  )}

                  {memoryPage === 2 && (
                    <div className="sg-memory-page-note">
                      <small>PLACE · RESEARCH NOTE</small>
                      <h3>这处地方后来怎样了？</h3>
                      <p>{formatGujiModernText(selectedMemory.note)}</p>
                      <div>
                        <b>{ROAM_STATUS_LABEL[selectedMemory.status]}</b>
                        <span>
                          {selectedMemory.bookTitle} ·{" "}
                          {selectedMemory.bookAuthor}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <footer>
                  <button
                    type="button"
                    onClick={() =>
                      setMemoryPage((page) => Math.max(0, page - 1))
                    }
                    disabled={memoryPage === 0}
                  >
                    ← 上一页
                  </button>
                  <div aria-label={`第 ${memoryPage + 1} 页`}>
                    {[0, 1, 2].map((page) => (
                      <i
                        key={page}
                        className={page === memoryPage ? "is-active" : ""}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setMemoryPage((page) => Math.min(2, page + 1))
                    }
                    disabled={memoryPage === 2}
                  >
                    下一页 →
                  </button>
                </footer>
              </article>
              <span
                className="sg-memory-hand sg-memory-hand--right"
                aria-hidden
              />
              <button
                type="button"
                className="sg-memory-open-journal"
                onClick={() => setGardenJournalOpen(true)}
              >
                <BookOpen size={12} strokeWidth={2.5} />
                完整手帐
              </button>
              <button
                type="button"
                className="sg-memory-next-place"
                onClick={focusNextMemory}
              >
                下一处 ·{" "}
                {
                  GARDEN_MEMORY_FRAGMENTS[
                    (GARDEN_MEMORY_FRAGMENTS.findIndex(
                      (fragment) => fragment.id === selectedMemory.id,
                    ) +
                      1) %
                      GARDEN_MEMORY_FRAGMENTS.length
                  ]?.name
                }
              </button>
            </section>
          )}

        {gardenJournalOpen && (
          <div className="sg-garden-journal" data-ignore-map-destination>
            <Suspense
              fallback={<div className="sg-loading">正在铺开花园手帐…</div>}
            >
              <GardenJournalPane
                city="杭州"
                photos={GARDEN_JOURNAL_PHOTOS}
                places={GARDEN_JOURNAL_PLACES}
                date="2026-07"
                storagePageId="pg-garden-map-journal-v2-杭州"
                initialStickers={ATLAS_JOURNAL_STICKERS}
                mapBackdrop
                onBack={() => setGardenJournalOpen(false)}
              />
            </Suspense>
          </div>
        )}

        {outingSetupOpen && !liveOutingVisible && (
          <div
            className="sg-outing-setup-backdrop"
            data-ignore-map-destination
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) {
                setOutingSetupOpen(false);
              }
            }}
          >
            <section
              ref={outingSetupDialogRef}
              className="sg-outing-setup"
              role="dialog"
              aria-modal="true"
              aria-labelledby="sg-outing-setup-title"
            >
              <header className="sg-outing-setup-header">
                <div className="sg-outing-setup-mark" aria-hidden="true">
                  <Navigation2 size={18} strokeWidth={2.6} />
                </div>
                <div>
                  <small>LIVE WALK · 今日出门袋</small>
                  <h2 id="sg-outing-setup-title">今日同行</h2>
                </div>
                <button
                  type="button"
                  className="sg-outing-setup-close"
                  onClick={() => setOutingSetupOpen(false)}
                  aria-label="关闭出门设置"
                  data-outing-autofocus
                >
                  <X size={15} strokeWidth={2.8} />
                </button>
              </header>

              <div
                className="sg-outing-step-title"
                data-outing-section="identity"
              >
                <b>01</b>
                <span>用户形象</span>
                <small>{outingGuides.length} 选 1</small>
              </div>
              <div
                className="sg-outing-guide-grid"
                role="radiogroup"
                aria-label="选择一起上街的男主或女主"
              >
                {outingGuides.map((candidate) => {
                  const selected = selectedOutingGuide.id === candidate.id;
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={selected ? "is-selected" : ""}
                      onClick={() => {
                        setOutingSetupFocus("identity");
                        setOutingGuideId(candidate.id);
                      }}
                    >
                      <span
                        className="sg-outing-guide-portrait"
                        style={{
                          backgroundColor: `${candidate.profile.color}2b`,
                        }}
                      >
                        {candidate.portraitUrl && (
                          <img
                            key={candidate.portraitUrl}
                            src={candidate.portraitUrl}
                            alt=""
                            onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
                          />
                        )}
                      </span>
                      <span className="sg-outing-guide-copy">
                        <strong>{candidate.label}</strong>
                        <small>{candidate.description}</small>
                      </span>
                      <span
                        className="sg-outing-guide-check"
                        aria-hidden="true"
                      >
                        <Check size={11} strokeWidth={3} />
                      </span>
                    </button>
                  );
                })}
              </div>
              {outingSetupFocus === "identity" && (
                <section
                  className="sg-outing-motion-preview"
                  aria-label={`${selectedOutingGuide.label}行走预览`}
                >
                  <Suspense
                    fallback={
                      <span className="sg-outing-motion-loading">
                        载入人物…
                      </span>
                    }
                  >
                    <OutingAgent3DViewer
                      profile={selectedOutingGuide.profile}
                      moving
                      autoRotate={false}
                      showPedestal={false}
                      className="sg-outing-motion-canvas"
                    />
                  </Suspense>
                  <span>
                    <Footprints size={12} strokeWidth={2.6} />
                    {selectedOutingGuide.label} · 行走
                  </span>
                </section>
              )}
              <button
                type="button"
                className="sg-outing-edit-link"
                onClick={() => requestForgeFocus({ section: "avatar" })}
              >
                <UserRound size={13} strokeWidth={2.5} />
                编辑我的形象
                <ChevronRight size={13} strokeWidth={2.5} />
              </button>

              <div
                className="sg-outing-step-title"
                data-outing-section="companion"
              >
                <b>02</b>
                <span>散步搭子</span>
                <small>{selectedOutingPets.length}/{outingPets.length}</small>
              </div>
              <div
                className="sg-outing-pet-grid"
                role="group"
                aria-label="选择一起出门的多个散步搭子"
              >
                {outingPets.map((pet) => {
                  const selected = outingPetIds.includes(pet.id);
                  const portrait = pet.portraitUrl || pet.sourceAsset;
                  return (
                    <button
                      key={pet.id}
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      className={selected ? "is-selected" : ""}
                      onClick={() => toggleOutingPet(pet.id)}
                    >
                      <span
                        className="sg-outing-pet-portrait"
                        style={{ backgroundColor: `${pet.color}33` }}
                      >
                        {portrait && (
                          <img
                            key={portrait}
                            src={portrait}
                            alt=""
                            onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
                          />
                        )}
                      </span>
                      <span className="sg-outing-pet-copy">
                        <strong>{pet.name}</strong>
                        <small>{pet.personality.role}</small>
                      </span>
                      <span className="sg-outing-pet-check" aria-hidden="true">
                        <Check size={11} strokeWidth={3} />
                      </span>
                    </button>
                  );
                })}
              </div>
              {outingSetupFocus === "companion" && previewOutingPet && (
                <section
                  className="sg-outing-motion-preview"
                  aria-label={`${previewOutingPet.name}行走预览`}
                >
                  <Suspense
                    fallback={
                      <span className="sg-outing-motion-loading">
                        载入搭子…
                      </span>
                    }
                  >
                    <OutingAgent3DViewer
                      profile={previewOutingPet}
                      moving
                      autoRotate={false}
                      showPedestal={false}
                      className="sg-outing-motion-canvas"
                    />
                  </Suspense>
                  <span>
                    <Footprints size={12} strokeWidth={2.6} />
                    {previewOutingPet.name} · 行走
                  </span>
                </section>
              )}
              <button
                type="button"
                className="sg-outing-edit-link"
                onClick={() => requestForgeFocus({ section: "shape" })}
              >
                <PawPrint size={13} strokeWidth={2.5} />
                查看搭子档案
                <ChevronRight size={13} strokeWidth={2.5} />
              </button>

              <div
                className="sg-outing-step-title"
                data-outing-section="pocket"
              >
                <b>03</b>
                <span>植物种子</span>
                <small>{seedPouchIds.length}/{POCKET_SEED_POUCH_LIMIT}</small>
              </div>
              <OutingBagRitual
                guideLabel={selectedOutingGuide.label}
                seeds={availableOutingSeeds}
                selectedSeedIds={seedPouchIds}
                seedCounts={seedProgress.inventory}
                onToggleSeed={toggleOutingSeed}
                onManageSeeds={() => {
                  setOutingSetupOpen(false);
                  openSeedDrawer();
                }}
              />

              <footer className="sg-outing-setup-footer">
                <div>
                  <PawPrint size={14} strokeWidth={2.4} aria-hidden="true" />
                  <span>
                    <strong>
                      {selectedOutingGuide.label} ·{" "}
                      {selectedOutingPets.length} 搭子 ·{" "}
                      {seedPouchIds.length} 种子
                      {" · 牵绳"}
                    </strong>
                    <small>
                      默认从杭州拱墅出发，进入地图后可根据真实位置校正
                    </small>
                  </span>
                </div>
                <button
                  type="button"
                  className="sg-outing-confirm"
                  onClick={confirmOutingSetup}
                  disabled={seedPouchIds.length === 0}
                >
                  <Navigation2 size={15} strokeWidth={2.7} />
                  开始出门
                </button>
              </footer>
            </section>
          </div>
        )}

        {(voiceTreeNotice || liveLocationNotice) && !liveOutingVisible && (
          <div className="sg-location-notice" role="status" aria-live="polite">
            {voiceTreeNotice || liveLocationNotice}
          </div>
        )}

        {testWalkActive && testRoutePoses && (
          <Suspense fallback={null}>
            <GardenRouteCompare3D
              activeMode={testAgentMode}
              legacyPose={testRoutePoses.legacy}
              riggedPose={testRoutePoses.rigged}
              livePosesRef={testRoutePosesLiveRef}
              legacyMapScale={legacyMapScale}
              riggedFollower={testFollower}
            />
          </Suspense>
        )}

        {(encounterPlant || liveOutingVisible) && (
          <Suspense
            fallback={
              liveOutingVisible ? (
                <div className="sg-loading">正在进入花径…</div>
              ) : null
            }
          >
            <GardenEncounter3D
              mode={liveOutingVisible ? "gps" : "flower"}
              companionMode={
                liveOutingVisible ? activeOutingCompanionMode : "follow"
              }
              plantName={encounterPlant?.name || ""}
              plantSiteName={
                encounterPlant && isGiantFlower(encounterPlant)
                  ? encounterPlant.siteName
                  : undefined
              }
              plantHangings={
                encounterPlant && isGiantFlower(encounterPlant)
                  ? encounterPlant.hangings
                  : undefined
              }
              anchor={encounterAnchor}
              markerHost={encounterMarkerHost}
              heading={encounterHeading}
              moving={routeMode === "walking"}
              mapScale={
                liveOutingVisible ? liveOutingMapScale : legacyMapScale
              }
              accuracyMeters={liveLocationAccuracy}
              tripMeters={liveTripMeters}
              todaySteps={seedProgress.todaySteps}
              stepGoal={DAILY_WALK_GOAL.threshold}
              totalExperience={seedProgress.experience}
              stepAchievement={walkAchievement}
              locationMode={liveLocationState === "preview" ? "preview" : "gps"}
              previewControlMode={desktopRoamEngaged ? "manual" : "auto"}
              statusMessage={
                liveLocationState === "requesting" ||
                liveLocationState === "preview"
                  ? liveLocationNotice
                  : ""
              }
              actionMessage={(voiceTreePlanting && voiceMapState?.status === "locating" ? voiceMapState.message : '') || voiceTreeNotice || (voiceTreePlanting && liveLocationState === "active"
                ? '按住吧唧实体键说“帮我种下一颗树”，松手后种在当前 GPS 位置' : '')}
              follower={encounterFollower}
              followers={liveOutingVisible ? activeOutingPets : undefined}
              guide={activeOutingGuide}
              onLocationModeChange={switchLiveOutingLocationMode}
              onPlant={plantFromLiveOuting}
              onClose={stopLiveOuting}
            />
          </Suspense>
        )}
      </div>
    </section>
  );
}
