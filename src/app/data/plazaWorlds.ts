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

export const PLAZA_NETWORK_LABEL = 'Pocket Buddy 健康网络';

// The public Agent World intentionally contains only the current health product.
// Legacy culture, entertainment and travel demos must not re-enter this catalogue.
export const PLAZA_WORLDS: PlazaWorld[] = [
  {
    id: 'w_run_route',
    name: '跑者行动地图',
    english: 'RUNNER ROUTES',
    owner: 'Pocket Buddy',
    agentKind: 'lamp',
    climate: '从当下的 GPS 出发，把今天的跑量变成一条真实可跑的线',
    temperament: '只画高德返回的可通行道路，规划线与实际 GPS 永远分开',
    accent: '#087c49',
    paper: '#e5f6e8',
    coordinate: 'AMAP · GPS · LOCAL SESSION',
    landmarks: [
      { type: 'route', name: '距离、时长与目的地路线', source: '高德 JSAPI 2.0' },
      { type: 'track', name: '规划线与实际轨迹', source: 'RouteSession' },
      { type: 'guard', name: '55 米偏航门与 GPS 跳点过滤', source: '确定性规则' },
    ],
    residents: [{ name: '路路', personality: '会带你回到路线，但不会假装知道现场的照明和人流' }],
    skillIds: ['frost.run-route', 'frost.outdoor-window'],
    coreSkill: true,
    entryTarget: 'frost-run-route',
    publisher: {
      name: '路路',
      role: '跑步路线员',
      avatar: '/assets/animal-agent-avatars/animal-001-r03-c04.png',
    },
  },
  {
    id: 'w_hermotion',
    name: 'Her Motion 女性瑜伽',
    english: 'HER MOTION',
    owner: 'Her Motion',
    agentKind: 'lamp',
    climate: '产后恢复、普拉提与瑜伽的安静动作空间',
    temperament: '姿态服务先提取关键点，连续帧模型再确认',
    accent: '#665ec7',
    paper: '#eeecfb',
    coordinate: 'VISION API · LIVE',
    landmarks: [
      { type: 'studio', name: '40 个产后恢复、普拉提与瑜伽动作', source: '动作库' },
      { type: 'vision', name: 'MediaPipe 姿态关键点', source: '服务端视觉 API' },
      { type: 'model', name: 'Yoga-82 连续帧体式确认', source: '专用分类模型' },
    ],
    residents: [{ name: '动作陪伴员', personality: '只描述画面中看得见的姿态，不替代医疗判断' }],
    skillIds: ['pocket.her-motion', 'frost.mediapipe-motion'],
    coreSkill: true,
    launchUrl: import.meta.env.DEV ? 'http://127.0.0.1:3001/her-motion/' : '/her-motion/',
    entryTarget: 'her-motion',
    publisher: {
      name: 'Her Motion',
      role: '女性动作视觉陪伴',
      avatar: '/assets/plaza/her-motion-yoga.svg',
    },
  },
  {
    id: 'w_tongue',
    name: '舌苔观察站',
    english: 'TONGUE OBSERVER',
    owner: 'TonguExpert',
    agentKind: 'book',
    climate: '自然白光下的静音扫描台',
    temperament: '只观察舌苔与舌质颜色，不作疾病诊断',
    accent: '#167f77',
    paper: '#e5f3ef',
    coordinate: 'MODEL · 85.78 F1',
    landmarks: [
      { type: 'studio', name: '自然白光拍摄台', source: '影像输入' },
      { type: 'lab', name: '双头颜色观测仪', source: 'MobileNetV3-Small' },
      { type: 'archive', name: '无落盘推理闸门', source: '隐私边界' },
    ],
    residents: [{ name: '校色小虎', personality: '会提醒你排除食物染色、暖光和白平衡影响' }],
    skillIds: [],
    coreSkill: true,
    launchUrl: '/tongue-observer/',
    publisher: {
      name: '苔苔',
      role: '舌象观察员',
      avatar: '/assets/animal-agent-avatars/animal-001-r04-c02.png',
    },
  },
];

export const PLAZA_SKILL_IDS = [...new Set(PLAZA_WORLDS.flatMap((world) => world.skillIds))];
