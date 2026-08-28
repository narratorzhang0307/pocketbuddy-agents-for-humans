import { RIGGED_WAYFARER_GUIDE } from '../../agent3d/profiles';
import type {
  Agent3DProfile,
  CityAgentManifest,
} from '../../agent3d/types';
import type {
  CityCompanionGuide,
  CityCompanionStage,
  CityCompanionValidation,
} from './types';

const STREET_SCOUT_TURNAROUND =
  '/assets/alba-city-guide/street-explorer.svg';
const STREET_SCOUT_PORTRAIT =
  '/assets/alba-city-guide/street-explorer.svg';
const STREET_SCOUT_GLB =
  '/assets/alba-guides/street-alba-rig-v1.glb?v=1';
const FEMALE_CITY_WALKER_PORTRAIT =
  '/assets/outing-ritual/female-front-comic.png';
const FEMALE_CITY_WALKER_TURNAROUND =
  '/assets/tripo/city-walker-female-v1/city-walker-female-four-view-master.png';
const FEMALE_CITY_WALKER_GLB =
  '/assets/tripo/city-walker-female-v1/city-walker-female-rigged-walk-v1.glb?v=1';
const FEMALE_CITY_WALKER_MANIFEST =
  '/assets/tripo/city-walker-female-v1/manifest/agent.json';

export const CITY_COMPANION_STAGES: readonly CityCompanionStage[] = [
  {
    id: 'identity',
    label: '身份源',
    artifact: STREET_SCOUT_PORTRAIT,
  },
  {
    id: 'turnaround',
    label: '八视图',
    artifact: STREET_SCOUT_TURNAROUND,
  },
  {
    id: 'rig',
    label: '骨骼模型',
    artifact: STREET_SCOUT_GLB,
  },
  {
    id: 'viewer',
    label: '360° 查看',
    artifact: STREET_SCOUT_GLB,
  },
  {
    id: 'map-route',
    label: '高德道路同行',
    artifact: 'amap.walking-route',
  },
] as const;

export const WAYFARER_COMPANION_STAGES: readonly CityCompanionStage[] = [
  {
    id: 'identity',
    label: '身份源',
    artifact:
      '/assets/alba-city-guide/reference/city-courier-turnaround-v2.png',
  },
  {
    id: 'turnaround',
    label: '八视图',
    artifact:
      '/assets/alba-city-guide/reference/city-courier-turnaround-v2.png',
  },
  {
    id: 'rig',
    label: '骨骼模型',
    artifact:
      '/assets/tripo/city-courier-v1/city-courier-rigged-walk-v1.glb?v=1',
  },
  {
    id: 'viewer',
    label: '360° 查看',
    artifact:
      '/assets/tripo/city-courier-v1/city-courier-rigged-walk-v1.glb?v=1',
  },
  {
    id: 'map-route',
    label: '高德道路同行',
    artifact: 'amap.walking-route',
  },
] as const;

export const FEMALE_CITY_WALKER_STAGES: readonly CityCompanionStage[] = [
  {
    id: 'identity',
    label: '身份源',
    artifact: FEMALE_CITY_WALKER_PORTRAIT,
  },
  {
    id: 'turnaround',
    label: '四视图',
    artifact: FEMALE_CITY_WALKER_TURNAROUND,
  },
  {
    id: 'rig',
    label: '骨骼模型',
    artifact: FEMALE_CITY_WALKER_GLB,
  },
  {
    id: 'viewer',
    label: '360° 查看',
    artifact: FEMALE_CITY_WALKER_GLB,
  },
  {
    id: 'map-route',
    label: '高德道路同行',
    artifact: 'amap.walking-route',
  },
] as const;

export const STREET_SCOUT_AGENT_MANIFEST: CityAgentManifest = {
  schemaVersion: 1,
  id: 'street-scout-guide-rigged-map-v1',
  name: '街角领路人',
  species: 'human',
  source: {
    path: STREET_SCOUT_TURNAROUND,
    observedViews: [
      'front',
    ],
    inferredViews: [
      'front-left',
      'left',
      'back-left',
      'back',
      'back-right',
      'right',
      'front-right',
    ],
    backgroundRemoval: 'none',
    provenance: 'manual',
  },
  visual: {
    representation: 'rigged-3d',
    turnaround: STREET_SCOUT_TURNAROUND,
    viewerGlb: STREET_SCOUT_GLB,
    mapGlb: STREET_SCOUT_GLB,
    primaryColor: '#e2574c',
    accentColor: '#3b6ea5',
    heightMeters: 1.52,
    version: 'alba-style-v1',
  },
  personality: {
    version: 1,
    role: '街角观察领路人',
    voice: '明亮、短句、先看路再提醒同伴',
    goal: '牵着伙伴沿真实道路散步，把城市里值得停一下的地方记下来',
    traits: ['友好', '敏锐', '会认路'],
  },
  navigation: {
    mode: 'walking',
    snapToRoad: true,
    speedMetersPerSecond: 1.15,
  },
};

export const RIGGED_STREET_SCOUT_GUIDE: Agent3DProfile = {
  id: STREET_SCOUT_AGENT_MANIFEST.id,
  name: STREET_SCOUT_AGENT_MANIFEST.name,
  species: 'human',
  color: STREET_SCOUT_AGENT_MANIFEST.visual.primaryColor,
  accent: STREET_SCOUT_AGENT_MANIFEST.visual.accentColor,
  portraitUrl: STREET_SCOUT_PORTRAIT,
  sourceAsset: STREET_SCOUT_TURNAROUND,
  personality: STREET_SCOUT_AGENT_MANIFEST.personality,
  rig: {
    templateId: 'city-biped-v1',
    templateVersion: 'alba-style-v1',
    bodyPlan: 'biped',
    footCount: 2,
    parameters: {
      headScale: 1,
      bodyScale: 0.98,
      shoulderWidth: 1,
      armLength: 0.96,
      avatarLegLength: 0.96,
      backpackScale: 1,
    },
  },
  visual: {
    representation: 'rigged-3d',
    version: 'alba-style-v1',
    heightMeters: STREET_SCOUT_AGENT_MANIFEST.visual.heightMeters,
    viewerGlbUrl: STREET_SCOUT_GLB,
    mapGlbUrl: STREET_SCOUT_GLB,
    downloadUrl: STREET_SCOUT_GLB,
    turnaroundUrl: STREET_SCOUT_TURNAROUND,
      clips: ['Idle', 'Walk'],
    compression: 'none',
    palette: {
      skin: '#f2c09a',
      shirt: '#e2574c',
      shorts: '#3b6ea5',
      backpack: '#d9c49a',
      cap: '#d94436',
    },
  },
  manifest: STREET_SCOUT_AGENT_MANIFEST,
};

export const FEMALE_CITY_WALKER_AGENT_MANIFEST: CityAgentManifest = {
  schemaVersion: 1,
  id: 'female-city-walker-rigged-map-v1',
  name: '女主',
  species: 'human',
  source: {
    path: FEMALE_CITY_WALKER_TURNAROUND,
    observedViews: ['front', 'left', 'back', 'right'],
    inferredViews: [
      'front-left',
      'back-left',
      'back-right',
      'front-right',
    ],
    backgroundRemoval: 'none',
    provenance: 'generated-turnaround',
  },
  visual: {
    representation: 'rigged-3d',
    turnaround: FEMALE_CITY_WALKER_TURNAROUND,
    viewerGlb: FEMALE_CITY_WALKER_GLB,
    mapGlb: FEMALE_CITY_WALKER_GLB,
    primaryColor: '#b8d9ee',
    accentColor: '#756682',
    heightMeters: 1.62,
    version: 'tripo-city-walker-female-rigged-v1',
  },
  personality: {
    version: 1,
    role: '城市时光漫步者',
    voice: '从容、敏锐，喜欢把路上的小发现讲得很有画面',
    goal: '沿真实街道寻找城市里值得停下来看的时间切片',
    traits: ['从容', '敏锐', '好奇'],
  },
  navigation: {
    mode: 'walking',
    snapToRoad: true,
    speedMetersPerSecond: 1.25,
  },
};

export const RIGGED_FEMALE_CITY_WALKER_GUIDE: Agent3DProfile = {
  id: FEMALE_CITY_WALKER_AGENT_MANIFEST.id,
  name: FEMALE_CITY_WALKER_AGENT_MANIFEST.name,
  species: 'human',
  color: FEMALE_CITY_WALKER_AGENT_MANIFEST.visual.primaryColor,
  accent: FEMALE_CITY_WALKER_AGENT_MANIFEST.visual.accentColor,
  portraitUrl: FEMALE_CITY_WALKER_PORTRAIT,
  sourceAsset: FEMALE_CITY_WALKER_TURNAROUND,
  personality: FEMALE_CITY_WALKER_AGENT_MANIFEST.personality,
  rig: {
    templateId: 'tripo-city-biped-v1',
    templateVersion: 'tripo-city-walker-female-rigged-v1',
    bodyPlan: 'biped',
    footCount: 2,
    parameters: {
      headScale: 1,
      bodyScale: 1,
      shoulderWidth: 1,
      armLength: 1,
      avatarLegLength: 1,
      backpackScale: 1,
    },
  },
  visual: {
    representation: 'rigged-3d',
    version: 'tripo-city-walker-female-rigged-v1',
    heightMeters: FEMALE_CITY_WALKER_AGENT_MANIFEST.visual.heightMeters,
    viewerGlbUrl: FEMALE_CITY_WALKER_GLB,
    mapGlbUrl: FEMALE_CITY_WALKER_GLB,
    downloadUrl: FEMALE_CITY_WALKER_GLB,
    turnaroundUrl: FEMALE_CITY_WALKER_TURNAROUND,
    clips: ['NlaTrack'],
    compression: 'none',
    palette: {
      skin: '#e1a36d',
      shirt: '#b8d9ee',
      shorts: '#34343c',
      backpack: '#756682',
      cap: '#2e3035',
    },
  },
  manifest: FEMALE_CITY_WALKER_AGENT_MANIFEST,
  manifestUrl: FEMALE_CITY_WALKER_MANIFEST,
};

export const USER_AVATAR_GUIDES: readonly CityCompanionGuide[] = [
  {
    id: RIGGED_WAYFARER_GUIDE.id,
    label: '男主',
    description: '街角邮差 · 红邮差包 · 轻快同行',
    portraitUrl: RIGGED_WAYFARER_GUIDE.portraitUrl,
    turnaroundUrl: RIGGED_WAYFARER_GUIDE.visual?.turnaroundUrl,
    profile: RIGGED_WAYFARER_GUIDE,
    stages: WAYFARER_COMPANION_STAGES,
  },
  {
    id: RIGGED_FEMALE_CITY_WALKER_GUIDE.id,
    label: '女主',
    description: '蓝色条纹裙 · 紫色挎包 · 城市漫步',
    portraitUrl: FEMALE_CITY_WALKER_PORTRAIT,
    turnaroundUrl: FEMALE_CITY_WALKER_TURNAROUND,
    manifestUrl: FEMALE_CITY_WALKER_MANIFEST,
    profile: RIGGED_FEMALE_CITY_WALKER_GUIDE,
    stages: FEMALE_CITY_WALKER_STAGES,
  },
] as const;

export const CITY_COMPANION_GUIDES: readonly CityCompanionGuide[] = [
  ...USER_AVATAR_GUIDES,
] as const;

export const DEFAULT_OUTING_GUIDE_ID = RIGGED_WAYFARER_GUIDE.id;

export function getCityCompanionGuide(
  id: string,
  guides: readonly CityCompanionGuide[] = CITY_COMPANION_GUIDES,
) {
  return (
    guides.find((guide) => guide.id === id) ??
    guides[0] ??
    CITY_COMPANION_GUIDES[0]
  );
}

export function validateCityCompanionGuide(
  guide: CityCompanionGuide,
): CityCompanionValidation {
  const issues: string[] = [];
  const stageIds = new Set(guide.stages.map((stage) => stage.id));
  CITY_COMPANION_STAGES.forEach((stage) => {
    if (!stageIds.has(stage.id)) issues.push(`缺少阶段：${stage.id}`);
  });
  if (guide.profile.species !== 'human') issues.push('向导必须使用 human 物种');
  if (guide.profile.visual?.representation !== 'rigged-3d') {
    issues.push('向导必须使用 rigged-3d 表现');
  }
  if (!guide.profile.visual?.viewerGlbUrl) issues.push('缺少 360° 查看资产');
  if (!guide.profile.visual?.mapGlbUrl) issues.push('缺少地图资产');
  if (guide.profile.manifest?.navigation.snapToRoad !== true) {
    issues.push('道路吸附契约未开启');
  }
  return { valid: issues.length === 0, issues };
}
