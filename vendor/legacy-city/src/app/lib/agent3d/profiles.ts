import type {
  Agent3DProfile,
  AgentTurnaroundView,
  AgentTurnaroundViews,
} from "./types";

const TURNAROUND_VIEWS: AgentTurnaroundView[] = [
  "front",
  "front-left",
  "left",
  "back-left",
  "back",
  "back-right",
  "right",
  "front-right",
];

function productionTurnaround(
  id: string,
  version: string,
): AgentTurnaroundViews {
  const root = `/assets/agent-forge/production/${id}/v1/turnaround/${version}`;
  return Object.fromEntries(
    TURNAROUND_VIEWS.map((view) => [view, `${root}/${view}.png`]),
  ) as AgentTurnaroundViews;
}

const productionManifestUrl = (id: string) =>
  `/assets/agent-forge/production/${id}/v1/manifest/agent.json`;
const productionTurnaroundIndexUrl = (id: string, version: string) =>
  `/assets/agent-forge/production/${id}/v1/turnaround/${version}/index.json`;

const DACHSHUND_TURNAROUND = productionTurnaround("dachshund-miko", "views-v2");
const DACHSHUND_RUNTIME_GLB =
  "/assets/tripo/dachshund-miko-v3/dachshund-rigged-walk-map-lod-v3.glb?v=3";
const SQUIRREL_TURNAROUND = productionTurnaround(
  "squirrel-shutter",
  "views-v1",
);
const SQUIRREL_RUNTIME_GLB =
  "/assets/tripo/squirrel-shutter-v1/squirrel-rigged-walk-v1.glb?v=1";
const SQUIRREL_MANIFEST_URL =
  "/assets/tripo/squirrel-shutter-v1/manifest/agent.json";
const SQUIRREL_TURNAROUND_INDEX_URL = productionTurnaroundIndexUrl(
  "squirrel-shutter",
  "views-v1",
);
const SQUIRREL_COMIC_PORTRAIT =
  "/assets/agent-forge/comic-v1/squirrel-shutter.png";
const SIAMESE_NANA_COMIC_PORTRAIT =
  "/assets/agent-forge/comic-v1/siamese-nana.png";
const BIRD_LUMA_COMIC_PORTRAIT =
  "/assets/agent-forge/comic-v1/yellow-chick-luma.png";
const SIAMESE_NANA_TURNAROUND: AgentTurnaroundViews = {
  front: "/assets/tripo/siamese-nana-v1/turnaround/front.png",
  "front-left": "/assets/tripo/siamese-nana-v1/turnaround/front-left.png",
  left: "/assets/tripo/siamese-nana-v1/turnaround/left.png",
  "back-left": "/assets/tripo/siamese-nana-v1/turnaround/back-left.png",
  back: "/assets/tripo/siamese-nana-v1/turnaround/back.png",
  "back-right": "/assets/tripo/siamese-nana-v1/turnaround/back-right.png",
  right: "/assets/tripo/siamese-nana-v1/turnaround/right.png",
  "front-right": "/assets/tripo/siamese-nana-v1/turnaround/front-right.png",
};
const SIAMESE_NANA_RUNTIME_GLB =
  "/assets/tripo/siamese-nana-v1/siamese-cat-rigged-walk-v1.glb?v=1";
const SIAMESE_NANA_MANIFEST_URL =
  "/assets/tripo/siamese-nana-v1/manifest/agent.json";
const SIAMESE_NANA_TURNAROUND_INDEX_URL =
  "/assets/tripo/siamese-nana-v1/turnaround/index.json";
const BIRD_TURNAROUND: AgentTurnaroundViews = {
  front: "/assets/tripo/yellow-chick-v1/turnaround/front.png",
  "front-left": "/assets/tripo/yellow-chick-v1/turnaround/front-left.png",
  left: "/assets/tripo/yellow-chick-v1/turnaround/left.png",
  "back-left": "/assets/tripo/yellow-chick-v1/turnaround/back-left.png",
  back: "/assets/tripo/yellow-chick-v1/turnaround/back.png",
  "back-right": "/assets/tripo/yellow-chick-v1/turnaround/back-right.png",
  right: "/assets/tripo/yellow-chick-v1/turnaround/right.png",
  "front-right": "/assets/tripo/yellow-chick-v1/turnaround/front-right.png",
};
const BIRD_RUNTIME_GLB =
  "/assets/tripo/yellow-chick-v1/yellow-chick-rigged-map-lod-v7.glb?v=7";
const BIRD_MANIFEST_URL = "/assets/tripo/yellow-chick-v1/manifest/agent.json";
const BIRD_TURNAROUND_INDEX_URL =
  "/assets/tripo/yellow-chick-v1/turnaround/index.json";
const PIG_RUNTIME_GLB =
  "/assets/tripo/pig-hengdou-v1/pig-rigged-walk-v2.glb?v=4";
const PIG_PORTRAIT = "/assets/agent-forge/comic-v1/pig-hengdou.png";
const PIG_MANIFEST_URL =
  "/assets/tripo/pig-hengdou-v1/manifest/agent.json";
const PIG_TURNAROUND_INDEX_URL =
  "/assets/tripo/pig-hengdou-v1/turnaround/index.json";
const PIG_TURNAROUND = Object.fromEntries(
  TURNAROUND_VIEWS.map((view) => [
    view,
    `/assets/tripo/pig-hengdou-v1/turnaround/${view}.png`,
  ]),
) as AgentTurnaroundViews;
const TORTOISE_TURNAROUND = productionTurnaround("tortoise-tock", "views-v1");

export const BUILTIN_CITY_AGENTS: Agent3DProfile[] = [
  {
    id: "dachshund-miko",
    name: "小肠",
    species: "dachshund",
    color: "#b9824f",
    accent: "#4b3424",
    motionProfile: "quadruped",
    sourceAsset: "/assets/agent-forge/dachshund-agent-world-v2.png",
    rig: {
      templateId: "long-quadruped-v2",
      templateVersion: "tripo-dachshund-rigged-v3",
      bodyPlan: "quadruped",
      footCount: 4,
      parameters: {
        bodyLength: 0.48,
        bodyRoundness: 0.12,
        muzzleLength: 0.28,
        earLength: 0.42,
        legLength: 0.88,
        headScale: 1,
      },
    },
    personality: {
      role: "街角气味侦探",
      voice: "温暖、实际，喜欢微小的城市仪式",
      goal: "把没有人留意的小记忆带回街角",
      traits: ["亲近", "好奇", "认路"],
    },
    visual: {
      representation: "rigged-3d",
      version: "tripo-dachshund-rigged-v3-turnaround-v3",
      heightMeters: 0.34,
      viewerGlbUrl: DACHSHUND_RUNTIME_GLB,
      mapGlbUrl: DACHSHUND_RUNTIME_GLB,
      downloadUrl: DACHSHUND_RUNTIME_GLB,
      turnaroundUrl: DACHSHUND_TURNAROUND.front,
      turnaroundIndexUrl: productionTurnaroundIndexUrl(
        "dachshund-miko",
        "views-v2",
      ),
      turnaroundUrls: DACHSHUND_TURNAROUND,
      clips: ["NlaTrack"],
      compression: "none",
    },
    manifestUrl: productionManifestUrl("dachshund-miko"),
    manifest: {
      schemaVersion: 1,
      id: "dachshund-miko",
      name: "小肠",
      species: "dachshund",
      source: {
        path: "/assets/agent-forge/dachshund-agent-world-v2.png",
        cutoutPath:
          "/assets/agent-forge/production/dachshund-miko/v1/identity/source-clean-v1.png",
        observedViews: ["left"],
        inferredViews: [
          "front",
          "front-left",
          "back-left",
          "back",
          "back-right",
          "right",
          "front-right",
        ],
        backgroundRemoval: "none",
        provenance: "illustration",
      },
      visual: {
        representation: "rigged-3d",
        turnaround: DACHSHUND_TURNAROUND.front,
        turnaroundIndex: productionTurnaroundIndexUrl(
          "dachshund-miko",
          "views-v2",
        ),
        turnaroundViews: DACHSHUND_TURNAROUND,
        viewerGlb: DACHSHUND_RUNTIME_GLB,
        mapGlb: DACHSHUND_RUNTIME_GLB,
        primaryColor: "#b9824f",
        accentColor: "#4b3424",
        heightMeters: 0.34,
        version: "forge-production-v3-tripo-rigged-walk",
        shadowless: true,
      },
      personality: {
        version: 1,
        role: "街角气味侦探",
        voice: "温暖、实际，喜欢微小的城市仪式",
        goal: "把没有人留意的小记忆带回街角",
        traits: ["亲近", "好奇", "认路"],
      },
      navigation: {
        mode: "walking",
        snapToRoad: true,
        speedMetersPerSecond: 1.05,
      },
    },
  },
  {
    id: "cat-shutter",
    name: "快门",
    species: "squirrel",
    color: "#df7b36",
    accent: "#6f381c",
    motionProfile: "quadruped",
    sourceAsset: SQUIRREL_COMIC_PORTRAIT,
    portraitUrl: SQUIRREL_COMIC_PORTRAIT,
    rig: {
      templateId: "squirrel-v1",
      templateVersion: "tripo-squirrel-rigged-v1",
      bodyPlan: "quadruped",
      footCount: 4,
      parameters: {},
    },
    personality: {
      role: "城市档案员",
      voice: "观察细致、表达准确，又有一点安静的诗意",
      goal: "记录事情发生的原因，而不只保存结果",
      traits: ["敏锐", "克制", "爱记录"],
    },
    visual: {
      representation: "rigged-3d",
      version: "tripo-squirrel-rigged-v1",
      heightMeters: 0.32,
      viewerGlbUrl: SQUIRREL_RUNTIME_GLB,
      mapGlbUrl: SQUIRREL_RUNTIME_GLB,
      downloadUrl: SQUIRREL_RUNTIME_GLB,
      turnaroundUrl: SQUIRREL_TURNAROUND.front,
      turnaroundIndexUrl: SQUIRREL_TURNAROUND_INDEX_URL,
      turnaroundUrls: SQUIRREL_TURNAROUND,
      clips: ["NlaTrack"],
      compression: "none",
    },
    manifestUrl: SQUIRREL_MANIFEST_URL,
    manifest: {
      schemaVersion: 1,
      id: "cat-shutter",
      name: "快门",
      species: "squirrel",
      source: {
        path: "/assets/tripo/squirrel-shutter-v1/source/front.png",
        cutoutPath: SQUIRREL_COMIC_PORTRAIT,
        observedViews: ["front", "front-left", "back-right", "right"],
        inferredViews: ["left", "back-left", "back", "front-right"],
        backgroundRemoval: "none",
        provenance: "illustration",
      },
      visual: {
        representation: "rigged-3d",
        turnaround: SQUIRREL_TURNAROUND.front,
        turnaroundIndex: SQUIRREL_TURNAROUND_INDEX_URL,
        turnaroundViews: SQUIRREL_TURNAROUND,
        viewerGlb: SQUIRREL_RUNTIME_GLB,
        mapGlb: SQUIRREL_RUNTIME_GLB,
        primaryColor: "#df7b36",
        accentColor: "#6f381c",
        heightMeters: 0.32,
        version: "tripo-squirrel-rigged-v1",
        shadowless: true,
      },
      personality: {
        version: 1,
        role: "城市档案员",
        voice: "观察细致、表达准确，又有一点安静的诗意",
        goal: "记录事情发生的原因，而不只保存结果",
        traits: ["敏锐", "克制", "爱记录"],
      },
      navigation: {
        mode: "walking",
        snapToRoad: true,
        speedMetersPerSecond: 1.15,
      },
    },
  },
  {
    id: "rabbit-nana",
    name: "娜娜",
    species: "cat",
    color: "#f1d19b",
    accent: "#4d3428",
    motionProfile: "quadruped",
    sourceAsset: SIAMESE_NANA_COMIC_PORTRAIT,
    portraitUrl: SIAMESE_NANA_COMIC_PORTRAIT,
    rig: {
      templateId: "siamese-cat-v1",
      templateVersion: "tripo-siamese-cat-rigged-v1",
      bodyPlan: "quadruped",
      footCount: 4,
      parameters: {},
    },
    personality: {
      role: "歇脚陪伴者",
      voice: "温柔、直接，偶尔说出出人意料的话",
      goal: "让城市把休息也视作前进的一部分",
      traits: ["柔软", "坦率", "会倾听"],
    },
    visual: {
      representation: "rigged-3d",
      version: "tripo-siamese-cat-rigged-v1",
      heightMeters: 0.42,
      viewerGlbUrl: SIAMESE_NANA_RUNTIME_GLB,
      mapGlbUrl: SIAMESE_NANA_RUNTIME_GLB,
      downloadUrl: SIAMESE_NANA_RUNTIME_GLB,
      turnaroundUrl: SIAMESE_NANA_TURNAROUND.front,
      turnaroundIndexUrl: SIAMESE_NANA_TURNAROUND_INDEX_URL,
      turnaroundUrls: SIAMESE_NANA_TURNAROUND,
      clips: ["NlaTrack"],
      compression: "none",
    },
    manifestUrl: SIAMESE_NANA_MANIFEST_URL,
    manifest: {
      schemaVersion: 1,
      id: "rabbit-nana",
      name: "娜娜",
      species: "cat",
      source: {
        path: SIAMESE_NANA_TURNAROUND.front,
        observedViews: [
          "front",
          "front-left",
          "left",
          "back-left",
          "back",
          "back-right",
          "right",
          "front-right",
        ],
        inferredViews: [],
        backgroundRemoval: "none",
        provenance: "generated-turnaround",
      },
      visual: {
        representation: "rigged-3d",
        turnaround: SIAMESE_NANA_TURNAROUND.front,
        turnaroundIndex: SIAMESE_NANA_TURNAROUND_INDEX_URL,
        turnaroundViews: SIAMESE_NANA_TURNAROUND,
        viewerGlb: SIAMESE_NANA_RUNTIME_GLB,
        mapGlb: SIAMESE_NANA_RUNTIME_GLB,
        primaryColor: "#f1d19b",
        accentColor: "#4d3428",
        heightMeters: 0.42,
        version: "tripo-siamese-cat-rigged-v1",
        shadowless: true,
      },
      personality: {
        version: 1,
        role: "歇脚陪伴者",
        voice: "温柔、直接，偶尔说出出人意料的话",
        goal: "让城市把休息也视作前进的一部分",
        traits: ["柔软", "坦率", "会倾听"],
      },
      navigation: {
        mode: "walking",
        snapToRoad: true,
        speedMetersPerSecond: 1.15,
      },
    },
  },
  {
    id: "bird-luma",
    name: "露玛",
    species: "bird",
    color: "#e8b82f",
    accent: "#d47a22",
    motionProfile: "biped",
    sourceAsset: BIRD_LUMA_COMIC_PORTRAIT,
    portraitUrl: BIRD_LUMA_COMIC_PORTRAIT,
    rig: {
      templateId: "bird-v1",
      templateVersion: "tripo-yellow-chick-rigged-v7",
      bodyPlan: "winged-biped",
      footCount: 2,
      parameters: {},
    },
    personality: {
      role: "夜路向导",
      voice: "明亮、有耐心，喜欢用谜语提醒方向",
      goal: "为每一个不确定的夜晚标出安全路线",
      traits: ["乐观", "方向感", "爱唱歌"],
    },
    visual: {
      representation: "rigged-3d",
      version: "tripo-yellow-chick-rigged-v7-map-lod-v1",
      heightMeters: 0.28,
      viewerGlbUrl: BIRD_RUNTIME_GLB,
      mapGlbUrl: BIRD_RUNTIME_GLB,
      downloadUrl: BIRD_RUNTIME_GLB,
      turnaroundUrl: BIRD_TURNAROUND.front,
      turnaroundIndexUrl: BIRD_TURNAROUND_INDEX_URL,
      turnaroundUrls: BIRD_TURNAROUND,
      clips: ["BoneWalk"],
      compression: "meshopt",
    },
    manifestUrl: BIRD_MANIFEST_URL,
    manifest: {
      schemaVersion: 1,
      id: "bird-luma",
      name: "露玛",
      species: "bird",
      source: {
        path: BIRD_TURNAROUND.front,
        observedViews: [
          "front",
          "front-left",
          "left",
          "back-left",
          "back",
          "back-right",
          "right",
          "front-right",
        ],
        inferredViews: [],
        backgroundRemoval: "none",
        provenance: "generated-turnaround",
      },
      visual: {
        representation: "rigged-3d",
        turnaround: BIRD_TURNAROUND.front,
        turnaroundIndex: BIRD_TURNAROUND_INDEX_URL,
        turnaroundViews: BIRD_TURNAROUND,
        viewerGlb: BIRD_RUNTIME_GLB,
        mapGlb: BIRD_RUNTIME_GLB,
        primaryColor: "#e8b82f",
        accentColor: "#d47a22",
        heightMeters: 0.28,
        version: "tripo-yellow-chick-rigged-v7-map-lod-v1",
        shadowless: true,
      },
      personality: {
        version: 1,
        role: "夜路向导",
        voice: "明亮、有耐心，喜欢用谜语提醒方向",
        goal: "为每一个不确定的夜晚标出安全路线",
        traits: ["乐观", "方向感", "爱唱歌"],
      },
      navigation: {
        mode: "walking",
        snapToRoad: true,
        speedMetersPerSecond: 0.9,
      },
    },
  },
  {
    id: "pig-hengdou",
    name: "哼豆",
    species: "pig",
    color: "#efaa8f",
    accent: "#9a553e",
    motionProfile: "quadruped",
    sourceAsset: PIG_PORTRAIT,
    portraitUrl: PIG_PORTRAIT,
    rig: {
      templateId: "pig-v1",
      templateVersion: "tripo-pig-hengdou-rigged-v2",
      bodyPlan: "quadruped",
      footCount: 4,
      parameters: {},
    },
    personality: {
      role: "街角好事收藏家",
      voice: "憨厚、乐观，发现小惊喜时会轻轻哼一声",
      goal: "把每次散步遇见的小确幸存进今天的城市记忆",
      traits: ["乐观", "踏实", "爱收集"],
    },
    visual: {
      representation: "rigged-3d",
      version: "tripo-pig-hengdou-rigged-v2",
      heightMeters: 0.31,
      viewerGlbUrl: PIG_RUNTIME_GLB,
      mapGlbUrl: PIG_RUNTIME_GLB,
      downloadUrl: PIG_RUNTIME_GLB,
      turnaroundUrl: PIG_TURNAROUND.front,
      turnaroundIndexUrl: PIG_TURNAROUND_INDEX_URL,
      turnaroundUrls: PIG_TURNAROUND,
      clips: ["PigWalk"],
      compression: "none",
    },
    manifestUrl: PIG_MANIFEST_URL,
    manifest: {
      schemaVersion: 1,
      id: "pig-hengdou",
      name: "哼豆",
      species: "pig",
      source: {
        path: PIG_TURNAROUND.front,
        cutoutPath: PIG_PORTRAIT,
        observedViews: ["front", "front-left", "left", "back-left", "back"],
        inferredViews: ["back-right", "right", "front-right"],
        backgroundRemoval: "none",
        provenance: "generated-turnaround",
      },
      visual: {
        representation: "rigged-3d",
        turnaround: PIG_TURNAROUND.front,
        turnaroundIndex: PIG_TURNAROUND_INDEX_URL,
        turnaroundViews: PIG_TURNAROUND,
        viewerGlb: PIG_RUNTIME_GLB,
        mapGlb: PIG_RUNTIME_GLB,
        primaryColor: "#efaa8f",
        accentColor: "#9a553e",
        heightMeters: 0.31,
        version: "tripo-pig-hengdou-rigged-v2",
        shadowless: true,
      },
      personality: {
        version: 1,
        role: "街角好事收藏家",
        voice: "憨厚、乐观，发现小惊喜时会轻轻哼一声",
        goal: "把每次散步遇见的小确幸存进今天的城市记忆",
        traits: ["乐观", "踏实", "爱收集"],
      },
      navigation: {
        mode: "walking",
        snapToRoad: true,
        speedMetersPerSecond: 1.1,
      },
    },
  },
  {
    id: "tortoise-tock",
    name: "托克",
    species: "tortoise",
    color: "#98a75a",
    accent: "#456a3d",
    motionProfile: "quadruped",
    sourceAsset: "/assets/agent-forge/tortoise.png",
    rig: {
      templateId: "shelled-quadruped-v1",
      templateVersion: "shelled-quadruped-rigged-v1",
      bodyPlan: "shelled-quadruped",
      footCount: 4,
      parameters: {
        bodyLength: 0.52,
        bodyRoundness: 0.45,
        muzzleLength: 0.35,
        legLength: 0.72,
        headScale: 0.92,
      },
    },
    personality: {
      role: "时间照料员",
      voice: "从容、干燥幽默，很在意事情发生的时机",
      goal: "让城市的日程跟着共同需要灵活调整",
      traits: ["稳重", "耐心", "守时"],
    },
    visual: {
      representation: "rigged-3d",
      version: "shelled-quadruped-rigged-v1-turnaround-v1",
      heightMeters: 0.24,
      viewerGlbUrl: "/assets/rigged-tortoise/tortoise-rig-v1.glb?v=1",
      mapGlbUrl: "/assets/rigged-tortoise/tortoise-rig-v1.glb?v=1",
      downloadUrl: "/assets/rigged-tortoise/tortoise-rig-v1.glb?v=1",
      turnaroundUrl: TORTOISE_TURNAROUND.front,
      turnaroundIndexUrl: productionTurnaroundIndexUrl(
        "tortoise-tock",
        "views-v1",
      ),
      turnaroundUrls: TORTOISE_TURNAROUND,
      clips: ["Idle", "Walk"],
      compression: "none",
    },
    manifestUrl: productionManifestUrl("tortoise-tock"),
    manifest: {
      schemaVersion: 1,
      id: "tortoise-tock",
      name: "托克",
      species: "tortoise",
      source: {
        path: "/assets/agent-forge/tortoise.png",
        observedViews: ["left"],
        inferredViews: [
          "front",
          "front-left",
          "back-left",
          "back",
          "back-right",
          "right",
          "front-right",
        ],
        backgroundRemoval: "none",
        provenance: "illustration",
      },
      visual: {
        representation: "rigged-3d",
        turnaround: TORTOISE_TURNAROUND.front,
        turnaroundIndex: productionTurnaroundIndexUrl(
          "tortoise-tock",
          "views-v1",
        ),
        turnaroundViews: TORTOISE_TURNAROUND,
        viewerGlb: "/assets/rigged-tortoise/tortoise-rig-v1.glb?v=1",
        mapGlb: "/assets/rigged-tortoise/tortoise-rig-v1.glb?v=1",
        primaryColor: "#98a75a",
        accentColor: "#456a3d",
        heightMeters: 0.24,
        version: "forge-production-v1-turnaround-v1-existing-rig-v1",
        shadowless: true,
      },
      personality: {
        version: 1,
        role: "时间照料员",
        voice: "从容、干燥幽默，很在意事情发生的时机",
        goal: "让城市的日程跟着共同需要灵活调整",
        traits: ["稳重", "耐心", "守时"],
      },
      navigation: {
        mode: "walking",
        snapToRoad: true,
        speedMetersPerSecond: 0.38,
      },
    },
  },
];

export const RIGGED_DACHSHUND_MAP_AGENT: Agent3DProfile = {
  id: "dachshund-rigged-map-v2",
  name: "骨骼小肠",
  species: "dachshund",
  color: "#b87942",
  accent: "#493024",
  sourceAsset: "/assets/agent-forge/dachshund-agent-world-v2.png",
  personality: BUILTIN_CITY_AGENTS[0].personality,
  visual: {
    representation: "rigged-3d",
    version: "tripo-dachshund-rigged-v3",
    heightMeters: 0.34,
    viewerGlbUrl: DACHSHUND_RUNTIME_GLB,
    mapGlbUrl: DACHSHUND_RUNTIME_GLB,
    downloadUrl: DACHSHUND_RUNTIME_GLB,
    clips: ["NlaTrack"],
    compression: "none",
  },
};

export const RIGGED_WAYFARER_GUIDE: Agent3DProfile = {
  id: "wayfarer-guide-rigged-map-v1",
  name: "街角邮差",
  species: "human",
  color: "#f1e7cd",
  accent: "#b94d34",
  portraitUrl: "/assets/outing-ritual/male-front-comic.png",
  sourceAsset: "/assets/alba-city-guide/garden-friend.svg",
  rig: {
    templateId: "tripo-city-biped-v1",
    templateVersion: "tripo-city-courier-rigged-v1",
    bodyPlan: "biped",
    footCount: 2,
    parameters: {
      headScale: 0.96,
      bodyScale: 1.02,
      shoulderWidth: 0.96,
      armLength: 1,
      avatarLegLength: 1.04,
      backpackScale: 1,
    },
  },
  personality: {
    role: "城市散步邮差",
    voice: "轻快、利落，会把路边新鲜事装进邮差包",
    goal: "带着小肠沿真实道路走遍街巷，把见闻送给下一次出门",
    traits: ["轻快", "好奇", "方向感强"],
  },
  visual: {
    representation: "rigged-3d",
    version: "tripo-city-courier-rigged-v1",
    heightMeters: 1.65,
    viewerGlbUrl:
      "/assets/tripo/city-courier-v1/city-courier-rigged-walk-v1.glb?v=1",
    mapGlbUrl:
      "/assets/tripo/city-courier-v1/city-courier-rigged-walk-v1.glb?v=1",
    downloadUrl:
      "/assets/tripo/city-courier-v1/city-courier-rigged-walk-v1.glb?v=1",
    turnaroundUrl:
      "/assets/alba-city-guide/reference/city-courier-turnaround-v2.png",
    clips: ["NlaTrack"],
    compression: "none",
    palette: {
      skin: "#d99562",
      shirt: "#f1e7cd",
      shorts: "#34383a",
      backpack: "#b94d34",
      cap: "#69b99a",
    },
  },
  manifest: {
    schemaVersion: 1,
    id: "wayfarer-guide-rigged-map-v1",
    name: "街角邮差",
    species: "human",
    source: {
      path: "/assets/alba-city-guide/reference/city-courier-turnaround-v2.png",
      observedViews: [
        "front",
        "front-left",
        "left",
        "back-left",
        "back",
        "back-right",
        "right",
        "front-right",
      ],
      inferredViews: [],
      backgroundRemoval: "none",
      provenance: "generated-turnaround",
    },
    visual: {
      representation: "rigged-3d",
      turnaround:
        "/assets/alba-city-guide/reference/city-courier-turnaround-v2.png",
      viewerGlb:
        "/assets/tripo/city-courier-v1/city-courier-rigged-walk-v1.glb?v=1",
      mapGlb:
        "/assets/tripo/city-courier-v1/city-courier-rigged-walk-v1.glb?v=1",
      primaryColor: "#f1e7cd",
      accentColor: "#b94d34",
      heightMeters: 1.65,
      version: "tripo-city-courier-rigged-v1",
    },
    personality: {
      version: 1,
      role: "城市散步邮差",
      voice: "轻快、利落，会把路边新鲜事装进邮差包",
      goal: "带着小肠沿真实道路走遍街巷，把见闻送给下一次出门",
      traits: ["轻快", "好奇", "方向感强"],
    },
    navigation: {
      mode: "walking",
      snapToRoad: true,
      speedMetersPerSecond: 1.25,
    },
  },
};
