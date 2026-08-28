import journalWestLake1 from "../../assets/journal/west-lake-1.webp";
import journalWestLake2 from "../../assets/journal/west-lake-2.webp";
import journalWestLake3 from "../../assets/journal/west-lake-3.webp";
import type {
  CityAgentConversation,
  CityAgentSeed,
  CityBloomSeed,
  CityPostcardSeed,
} from "./types";
import {
  PUBLIC_GARDEN_CITY_PACKAGES,
  type GiantFlowerGardenSite,
  type PublicGardenRegion,
} from "../street-garden";

export const CURRENT_CITY_USER_ID = "local-city-user";
export const IDENTITY_PROXY_AGENT_ID = "agent-xiaochang";

const CITY_RESIDENT_PROFILES = [
  {
    name: "阿满",
    species: "兔",
    asset: "/assets/agent-forge/rabbit-v2.png",
    activity: "收集今天的树影",
  },
  {
    name: "小路",
    species: "腊肠犬",
    asset: "/assets/agent-forge/dachshund-agent-world-v2.png",
    activity: "在花下等散步同伴",
  },
  {
    name: "米粒",
    species: "鸟",
    asset: "/assets/agent-forge/bird.png",
    activity: "记录屋顶的声音",
  },
  {
    name: "慢慢",
    species: "龟",
    asset: "/assets/agent-forge/tortoise.png",
    activity: "看守一段安静街角",
  },
  {
    name: "栗子",
    species: "猫",
    asset: "/assets/agent-forge/cat-v2.png",
    activity: "交换附近最好坐的台阶",
  },
  {
    name: "团团",
    species: "仓鼠",
    asset: "/assets/agent-forge/hamster.png",
    activity: "摆出一小桌地方零食",
  },
  {
    name: "快门",
    species: "松鼠",
    asset: "/assets/agent-forge/comic-v1/squirrel-shutter.png",
    activity: "为路过的朋友拍合影",
  },
  {
    name: "娜娜",
    species: "暹罗猫",
    asset: "/assets/agent-forge/comic-v1/siamese-nana.png",
    activity: "发起一场花下闲聊",
  },
  {
    name: "露玛",
    species: "小鸡",
    asset: "/assets/agent-forge/comic-v1/yellow-chick-luma.png",
    activity: "广播这一带的风和声音",
  },
] as const;

const CITY_CONVERSATION_LINES = [
  ["桥边的鸟叫，你刚才听见了吗？", "听见了，我把方向记在花叶上。"],
  ["这条路今天比昨天慢一点。", "那就一起多看一会儿树影。"],
  ["你闻到桂花了吗？", "闻到了，风是从西边过来的。"],
  ["我找到一条没有车的小路。", "等会儿带我一起去看看。"],
  ["这张挂牌上的地点，你去过吗？", "还没有，我们沿着花影一起去。"],
  ["我带了两张坐垫。", "正好，叫路边的新朋友也坐下来。"],
  ["这里的风有自己的方向。", "我录下来，寄给下一株花。"],
  ["今天交换什么故事？", "一个旧地名，换一张刚拍的照片。"],
] as const;

const CITY_GARDEN_HUB_COUNT = 24;
const CITY_GARDEN_RESIDENTS: CityAgentSeed[] = Array.from(
  { length: CITY_GARDEN_HUB_COUNT * 2 },
  (_, index) => {
    const profile =
      CITY_RESIDENT_PROFILES[index % CITY_RESIDENT_PROFILES.length];
    const hubNumber = Math.floor(index / 2) + 1;
    const residentLetter = index % 2 === 0 ? "a" : "b";
    return {
      id: `city-resident-${hubNumber}-${residentLetter}`,
      ownerId:
        hubNumber === 12 && residentLetter === "a"
          ? CURRENT_CITY_USER_ID
          : `city-user-${hubNumber}-${residentLetter}`,
      name: `${profile.name}${hubNumber}`,
      species: profile.species,
      role: "resident",
      // 旧的规则网格只作兼容数据保留；公共街面改由真实地点花园承载。
      visibility: "unlisted",
      profileAssetUrl: profile.asset,
      homeBloomId: `city-bloom-${hubNumber}-${residentLetter}`,
      currentState: index % 3 === 0 ? "visiting" : "idle",
      activityLabel: profile.activity,
    };
  },
);

const CITY_GARDEN_BLOOMS: CityBloomSeed[] = CITY_GARDEN_RESIDENTS.map(
  (agent, index) => {
    const hubNumber = Math.floor(index / 2) + 1;
    const residentLetter = index % 2 === 0 ? "a" : "b";
    return {
      id: `city-bloom-${hubNumber}-${residentLetter}`,
      mapPlantId: `city-flower-${hubNumber}-${residentLetter}`,
      ownerId: agent.ownerId,
      name: `城市花园 ${hubNumber}${residentLetter.toUpperCase()}`,
      role: "resident",
      lifecycle: "resident",
      visibility: "unlisted",
      activityLabel: agent.activityLabel,
      residentAgentId: agent.id,
      publicPriority: 48 - hubNumber,
    };
  },
);

function buildPublicGardenWorld({
  cityId,
  regions,
  sites,
  profileOffset = 0,
  dialogueOffset = 0,
}: {
  cityId: string;
  regions: readonly PublicGardenRegion[];
  sites: readonly GiantFlowerGardenSite[];
  profileOffset?: number;
  dialogueOffset?: number;
}) {
  const residents: CityAgentSeed[] = sites.map((site, index) => {
    const profile =
      CITY_RESIDENT_PROFILES[
        (index + profileOffset) % CITY_RESIDENT_PROFILES.length
      ];
    return {
      id: `${cityId}-resident-${site.districtId}-${site.id}`,
      ownerId: `${site.districtId}-public-garden`,
      name: `${profile.name}·${site.name.slice(0, 2)}`,
      species: profile.species,
      role: "resident",
      visibility: "public",
      profileAssetUrl: profile.asset,
      homeBloomId: `public-${site.districtId}-${site.id}`,
      currentState:
        index % 4 === 0
          ? "visiting"
          : index % 3 === 0
            ? "reporting"
            : "idle",
      activityLabel: profile.activity,
    };
  });

  const regionOrder = new Map(
    regions.map((region, index) => [region.id, index]),
  );
  const siteOrderInRegion = new Map<string, number>();
  regions.forEach((region) => {
    region.sites.forEach((site, index) => {
      siteOrderInRegion.set(`${site.districtId}:${site.id}`, index);
    });
  });

  const blooms: CityBloomSeed[] = sites.map((site) => {
    const siteIndex =
      siteOrderInRegion.get(`${site.districtId}:${site.id}`) ?? 0;
    const districtIndex = regionOrder.get(site.districtId) ?? 0;
    return {
      id: `public-${site.districtId}-${site.id}`,
      mapPlantId: `${site.districtId}-flower-${site.id}`,
      ownerId: `${site.districtId}-public-garden`,
      name: `${site.name}参天大花`,
      role: "memory",
      lifecycle: "resident",
      visibility: "public",
      activityLabel: `${site.hangings.length} 张地点明信片 · 花下正在社交`,
      residentAgentId: `${cityId}-resident-${site.districtId}-${site.id}`,
      // 城市总览每个区只留一株代表花；进入街道尺度后完整花园自动展开。
      publicPriority:
        siteIndex === 0 ? 96 - districtIndex : 68 - (siteIndex % 7),
    };
  });

  const conversations: CityAgentConversation[] = regions.flatMap(
    (region, regionIndex) =>
      region.sites.map((site, siteIndex) => {
        const nextSite = region.sites[(siteIndex + 1) % region.sites.length];
        const lines =
          CITY_CONVERSATION_LINES[
            (dialogueOffset + regionIndex * 3 + siteIndex) %
              CITY_CONVERSATION_LINES.length
          ];
        return {
          id: `${cityId}-conversation-${site.districtId}-${site.id}`,
          mapPlantId: `${site.districtId}-flower-${site.id}`,
          speakerAgentId: `${cityId}-resident-${site.districtId}-${site.id}`,
          listenerAgentId: `${cityId}-resident-${nextSite.districtId}-${nextSite.id}`,
          line: lines[siteIndex % 2],
          side: siteIndex % 2 === 0 ? "left" : "right",
          visibility: "public",
        };
      }),
  );

  return { blooms, conversations, residents };
}

const PUBLIC_GARDEN_WORLDS = PUBLIC_GARDEN_CITY_PACKAGES.map((city) =>
  buildPublicGardenWorld({
    cityId: city.id,
    regions: city.regions,
    sites: city.sites,
    profileOffset: city.profileOffset,
    dialogueOffset: city.dialogueOffset,
  }),
);

export const CITY_AGENT_CONVERSATIONS: readonly CityAgentConversation[] =
  [...Array.from({ length: CITY_GARDEN_HUB_COUNT * 2 }, (_, index): CityAgentConversation => {
    const hubNumber = Math.floor(index / 2) + 1;
    const isFirst = index % 2 === 0;
    const [question, answer] =
      CITY_CONVERSATION_LINES[(hubNumber - 1) % CITY_CONVERSATION_LINES.length];
    return {
      id: `city-conversation-${hubNumber}-${isFirst ? "a" : "b"}`,
      mapPlantId: `city-flower-${hubNumber}-${isFirst ? "a" : "b"}`,
      speakerAgentId: `city-resident-${hubNumber}-${isFirst ? "a" : "b"}`,
      listenerAgentId: `city-resident-${hubNumber}-${isFirst ? "b" : "a"}`,
      line: isFirst ? question : answer,
      side: isFirst ? "left" : "right",
      visibility: "public",
    };
  }),
  ...PUBLIC_GARDEN_WORLDS.flatMap((garden) => garden.conversations),
];

export const CITY_BLOOM_SEEDS: readonly CityBloomSeed[] = [
  ...CITY_GARDEN_BLOOMS,
  ...PUBLIC_GARDEN_WORLDS.flatMap((garden) => garden.blooms),
  {
    id: "my-postcard-daisy",
    mapPlantId: "flower-33",
    ownerId: CURRENT_CITY_USER_ID,
    name: "白雏菊花邮站",
    role: "memory",
    lifecycle: "bloom",
    visibility: "private",
    activityLabel: "3 封私人花邮",
    postcardIds: [
      "postcard-beishan-sunset",
      "postcard-west-lake-breeze",
      "postcard-gushan-before-night",
    ],
  },
  {
    id: "my-duty-bloom",
    mapPlantId: "giant-orange-crown-west",
    ownerId: CURRENT_CITY_USER_ID,
    name: "小肠值日花",
    role: "resident",
    lifecycle: "resident",
    visibility: "private",
    activityLabel: "小肠今日值日",
    residentAgentId: IDENTITY_PROXY_AGENT_ID,
  },
  {
    id: "public-white-star",
    mapPlantId: "giant-white-star-center",
    ownerId: "agent-nana-owner",
    name: "运河白花",
    role: "resident",
    lifecycle: "resident",
    visibility: "unlisted",
    activityLabel: "正在征集访客",
    residentAgentId: "agent-nana",
    publicPriority: 100,
  },
  {
    id: "public-sunset-crown",
    mapPlantId: "giant-orange-crown-south",
    ownerId: "city-editorial",
    name: "落日冠报讯点",
    role: "hybrid",
    visibility: "unlisted",
    activityLabel: "日报编辑精选",
    publicPriority: 92,
  },
  {
    id: "public-golden-flower",
    mapPlantId: "route-orange-crown-16",
    ownerId: "agent-toke-owner",
    name: "慢行金风花",
    role: "resident",
    lifecycle: "resident",
    visibility: "unlisted",
    activityLabel: "托克征求慢行同伴",
    residentAgentId: "agent-toke",
    publicPriority: 86,
  },
  {
    id: "public-red-star",
    mapPlantId: "route-orange-crown-28",
    ownerId: "agent-luma-owner",
    name: "屋顶红星花",
    role: "hybrid",
    lifecycle: "resident",
    // 旧的无地点挂牌花径保留在兼容数据中，但不再混入公共展示层。
    visibility: "unlisted",
    activityLabel: "露玛发布城市声音",
    residentAgentId: "agent-luma",
    publicPriority: 82,
  },
  ...[6, 40].map((routeIndex): CityBloomSeed => ({
    id: `public-route-bloom-${routeIndex}`,
    mapPlantId: `route-orange-crown-${routeIndex}`,
    ownerId: "wulin-newsstand",
    name: `公共花径 ${routeIndex}`,
    role: "memory",
    visibility: "unlisted",
    activityLabel: "今日开放",
    publicPriority: 60 - routeIndex / 2,
  })),
];

export const CITY_AGENT_SEEDS: readonly CityAgentSeed[] = [
  ...CITY_GARDEN_RESIDENTS,
  ...PUBLIC_GARDEN_WORLDS.flatMap((garden) => garden.residents),
  {
    id: IDENTITY_PROXY_AGENT_ID,
    ownerId: CURRENT_CITY_USER_ID,
    name: "小肠",
    species: "腊肠犬",
    role: "identity-proxy",
    visibility: "private",
    profileAssetUrl: "/assets/agent-forge/dachshund-agent-world-v2.png",
    homeBloomId: "my-duty-bloom",
    currentState: "reporting",
    activityLabel: "替主人值日中",
  },
  {
    id: "agent-nana",
    ownerId: "agent-nana-owner",
    name: "娜娜",
    species: "暹罗猫",
    role: "resident",
    visibility: "public",
    profileAssetUrl: "/assets/agent-forge/comic-v1/siamese-nana.png",
    homeBloomId: "public-white-star",
    currentState: "idle",
    activityLabel: "征集两位慢行访客",
  },
  {
    id: "agent-toke",
    ownerId: "agent-toke-owner",
    name: "托克",
    species: "龟",
    role: "resident",
    visibility: "public",
    profileAssetUrl: "/assets/agent-forge/tortoise.png",
    homeBloomId: "public-golden-flower",
    currentState: "resting",
    activityLabel: "愿意代客看花",
  },
  {
    id: "agent-luma",
    ownerId: "agent-luma-owner",
    name: "露玛",
    species: "鸟",
    role: "resident",
    visibility: "public",
    profileAssetUrl: "/assets/agent-forge/comic-v1/yellow-chick-luma.png",
    homeBloomId: "public-red-star",
    currentState: "reporting",
    activityLabel: "发布屋顶风向",
  },
];

export const CITY_POSTCARD_SEEDS: readonly CityPostcardSeed[] = [
  {
    id: "postcard-beishan-sunset",
    ownerId: CURRENT_CITY_USER_ID,
    bloomId: "my-postcard-daisy",
    visibility: "private",
    title: "北山街的落日",
    place: "北山街的落日",
    city: "杭州",
    date: "2026 · 初夏",
    author: "阿禾",
    stamp: "花",
    accent: "#e87942",
    imageUrl: journalWestLake1,
    message: "湖面把今天最后一点金色，慢慢寄给了岸边的人。",
  },
  {
    id: "postcard-west-lake-breeze",
    ownerId: CURRENT_CITY_USER_ID,
    bloomId: "my-postcard-daisy",
    visibility: "private",
    title: "湖边的晚风",
    place: "湖边的晚风",
    city: "杭州",
    date: "2026 · 傍晚",
    author: "小满",
    stamp: "风",
    accent: "#397560",
    imageUrl: journalWestLake2,
    message: "沿着水慢慢走了一会儿。风比我先回家。",
  },
  {
    id: "postcard-gushan-before-night",
    ownerId: CURRENT_CITY_USER_ID,
    bloomId: "my-postcard-daisy",
    visibility: "private",
    title: "孤山入夜前",
    place: "孤山入夜前",
    city: "杭州",
    date: "2026 · 春末",
    author: "雨青",
    stamp: "湖",
    accent: "#d4a73f",
    imageUrl: journalWestLake3,
    message: "树影和远山都安静下来，这张明信片就留在白雏菊旁。",
  },
];
