import { skillAvatarFor } from '../lib/skill/avatars';

export type PlazaLandmark = {
  type: string;
  name: string;
  source: string;
};

export type PlazaResident = {
  name: string;
  personality: string;
};

export type PlazaWorld = {
  id: string;
  name: string;
  english: string;
  owner: string;
  agentKind: 'lamp' | 'book' | 'headphones' | 'mic' | 'mug' | 'plush';
  climate: string;
  temperament: string;
  accent: string;
  paper: string;
  coordinate: string;
  landmarks: PlazaLandmark[];
  residents: PlazaResident[];
  skillIds: string[];
  coreSkill?: boolean;
  launchUrl?: string;
  entryTarget?: string;
  publisher?: {
    name: string;
    role: string;
    avatar: string;
  };
};

export const PLAZA_NETWORK_LABEL = 'Pocket Buddy Health Network';

// The public Agent World contains the current health product and bird listening.
// Legacy culture, entertainment and travel demos must not re-enter this catalogue.
export const PLAZA_WORLDS: PlazaWorld[] = [
  {
    id: 'w_run_route',
    name: 'Runner Route Map',
    english: 'RUNNER ROUTES',
    owner: 'Pocket Buddy',
    agentKind: 'lamp',
    climate: 'Starts from your current GPS and turns today’s mileage into a line you can actually run',
    temperament: 'Only draws the walkable roads AMap returns; the planned line and the real GPS track always stay separate',
    accent: '#087c49',
    paper: '#e5f6e8',
    coordinate: 'AMAP · GPS · LOCAL SESSION',
    landmarks: [
      { type: 'route', name: 'Distance, duration and destination route', source: 'AMap JSAPI 2.0' },
      { type: 'track', name: 'Planned line vs actual track', source: 'RouteSession' },
      { type: 'guard', name: '55 m off-route gate and GPS jump filter', source: 'Deterministic rules' },
    ],
    residents: [{ name: 'Lulu', personality: 'Guides you back onto the route, but never pretends to know the lighting or foot traffic on the ground' }],
    skillIds: ['frost.run-route', 'frost.outdoor-window'],
    coreSkill: true,
    entryTarget: 'frost-run-route',
    publisher: {
      name: 'Lulu',
      role: 'Run route planner',
      avatar: '/assets/animal-agent-avatars/animal-001-r03-c04.png',
    },
  },
  {
    id: 'w_bird_listener',
    name: 'Bird ID',
    english: 'BIRD LISTENER',
    owner: 'Pocket Buddy',
    agentKind: 'mic',
    climate: 'The physical key wakes bird ID; long-press the touchscreen to record the call',
    temperament: 'Reuses the existing birdsong recognition service and the twelve-bird image catalogue; result images go to the round screen on demand',
    accent: '#18784b',
    paper: '#ffe3ce',
    coordinate: 'BLE · NATIVE · OSS',
    landmarks: [
      { type: 'audio', name: 'Hardware recording and phone reception', source: 'BLE native bridge' },
      { type: 'recognition', name: 'Birdsong recognition', source: 'T5 self-hosted service' },
      { type: 'display', name: 'Result and round-screen image', source: 'BirdCatalog · OSS' },
    ],
    residents: [{ name: 'Listening Bird', personality: 'Listens to birdsong with you and shows the result with the matching bird image' }],
    skillIds: ['frost.bird-listener'],
    coreSkill: true,
    entryTarget: 'frost-bird-listener',
    publisher: {
      name: 'Listening Bird',
      role: 'Nature listener',
      avatar: skillAvatarFor('frost.bird-listener').src,
    },
  },
  {
    id: 'w_hermotion',
    name: 'Her Motion Yoga',
    english: 'HER MOTION',
    owner: 'Her Motion',
    agentKind: 'lamp',
    climate: 'A quiet movement space for postnatal recovery, Pilates and yoga',
    temperament: 'Local pose keypoints see it first, then a multi-frame model confirms',
    accent: '#665ec7',
    paper: '#eeecfb',
    coordinate: 'LOCAL VISION · LIVE',
    landmarks: [
      { type: 'studio', name: '40 postnatal recovery, Pilates and yoga moves', source: 'Move library' },
      { type: 'vision', name: 'MediaPipe local pose keypoints', source: 'In-browser vision' },
      { type: 'model', name: 'Yoga-82 multi-frame pose confirmation', source: 'Dedicated classifier' },
    ],
    residents: [{ name: 'Motion Companion', personality: 'Only describes the posture visible on camera; never a substitute for medical judgement' }],
    skillIds: ['pocket.her-motion', 'frost.mediapipe-motion'],
    coreSkill: true,
    launchUrl: '/her-motion/index.html',
    entryTarget: 'her-motion',
    publisher: {
      name: 'Her Motion',
      role: 'Movement vision companion',
      avatar: '/assets/plaza/her-motion-yoga.svg',
    },
  },
  {
    id: 'w_tongue',
    name: 'Tongue Coating Station',
    english: 'TONGUE OBSERVER',
    owner: 'TonguExpert',
    agentKind: 'book',
    climate: 'A silent scanning bench under natural white light',
    temperament: 'Only observes tongue coating and tongue body colour; makes no disease diagnosis',
    accent: '#167f77',
    paper: '#e5f3ef',
    coordinate: 'MODEL · 85.78 F1',
    landmarks: [
      { type: 'studio', name: 'Natural white-light capture bench', source: 'Image input' },
      { type: 'lab', name: 'Dual-head colour observer', source: 'MobileNetV3-Small' },
      { type: 'archive', name: 'No-disk-write inference gate', source: 'Privacy boundary' },
    ],
    residents: [{ name: 'Little Tiger', personality: 'Reminds you to rule out food staining, warm lighting and white balance' }],
    skillIds: [],
    coreSkill: true,
    launchUrl: '/tongue-observer/',
    publisher: {
      name: 'Mossy',
      role: 'Tongue observer',
      avatar: '/assets/animal-agent-avatars/animal-001-r04-c02.png',
    },
  },
];

export const PLAZA_SKILL_IDS = [...new Set(PLAZA_WORLDS.flatMap((world) => world.skillIds))];
