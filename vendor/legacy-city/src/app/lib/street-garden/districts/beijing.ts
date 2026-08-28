import type { GiantFlowerHangingKind } from "../GiantFlower";
import type { GiantFlowerGardenSite } from "../grove";
import { isAmapMapAdmitted, resolveAmapVerifiedPosition } from "../amapCoordinateOverrides";

export type BeijingGardenRegion = {
  id: string;
  label: string;
  center: [number, number];
  zoom: number;
  sites: readonly GiantFlowerGardenSite[];
};

type HangingSeed = readonly [
  kind: GiantFlowerHangingKind,
  label: string,
  note: string,
];

type SiteSeed = readonly [
  id: string,
  name: string,
  lng: number,
  lat: number,
  category: GiantFlowerGardenSite["category"],
  hangings: readonly HangingSeed[],
];

type DistrictSiteSeed = readonly [
  id: string,
  name: string,
  lng: number,
  lat: number,
  category: GiantFlowerGardenSite["category"],
  kind: GiantFlowerHangingKind,
  label: string,
  note: string,
];

type ExclusionZone = {
  id: string;
  west: number;
  east: number;
  south: number;
  north: number;
};

// 北京花园只选择自然、文化、社区与公共生活节点。
// 中央敏感区以数据护栏明确排除，所有行政区共用同一校验规则。
export const BEIJING_GARDEN_EXCLUSION_ZONES: readonly ExclusionZone[] = [
  {
    id: "beijing-central-sensitive-zone",
    west: 116.355,
    east: 116.407,
    south: 39.9,
    north: 39.932,
  },
  {
    id: "beijing-central-civic-east-zone",
    west: 116.407,
    east: 116.425,
    south: 39.895,
    north: 39.925,
  },
];

export function isBeijingGardenPositionAllowed(
  [lng, lat]: [number, number],
): boolean {
  return BEIJING_GARDEN_EXCLUSION_ZONES.every(
    (zone) =>
      lng < zone.west ||
      lng > zone.east ||
      lat < zone.south ||
      lat > zone.north,
  );
}

const ACCENTS = [
  "#8f3d35",
  "#397560",
  "#355f9b",
  "#9a7134",
  "#745ca8",
  "#d26a37",
  "#a34e6f",
  "#487d4b",
] as const;

function sites(
  districtId: string,
  district: string,
  seeds: readonly SiteSeed[],
): GiantFlowerGardenSite[] {
  return seeds.filter(([id]) => isAmapMapAdmitted("map-beijing-public-garden", id)).map(
    ([id, name, lng, lat, category, hangings], siteIndex) => {
      const position = resolveAmapVerifiedPosition(
        "map-beijing-public-garden",
        id,
        [lng, lat],
      );
      if (!isBeijingGardenPositionAllowed(position)) {
        throw new Error(`北京花园点位 ${id} 落入排除区`);
      }
      return {
        id,
        name,
        district,
        districtId,
        position,
        category,
        hangings: hangings.map(([kind, label, note], hangingIndex) => ({
          kind,
          label,
          note,
          accent: ACCENTS[(siteIndex + hangingIndex) % ACCENTS.length],
        })),
        scale: siteIndex === 0 ? 1.04 : undefined,
      };
    },
  );
}

function districtSites(
  districtId: string,
  district: string,
  seeds: readonly DistrictSiteSeed[],
): GiantFlowerGardenSite[] {
  return sites(
    districtId,
    district,
    seeds.map(
      ([id, name, lng, lat, category, kind, label, note]): SiteSeed => [
        id,
        name,
        lng,
        lat,
        category,
        [
          [kind, label, note],
          [
            "postcard",
            `${district.replace(/区$/, "")}漫游卡`,
            `从${name}寄出一张属于${district}公共生活的地点明信片。`,
          ],
        ],
      ],
    ),
  );
}

const XICHENG = sites("beijing-xicheng", "西城区", [
  [
    "shichahai",
    "什刹海环湖步道",
    116.3857,
    39.9412,
    "park",
    [
      ["postcard", "海子晚风卡", "湖岸、胡同与日常游园共同组成可以慢慢步行的北城水面。"],
      ["voice", "银锭桥水声", "把橹声、树叶和傍晚的人声收进同一段城市声景。"],
      ["photo", "荷岸倒影", "水面会把季节、屋檐与行人的影子重新拼成一张照片。"],
    ],
  ],
  [
    "prince-kung-mansion",
    "恭王府博物馆",
    116.3866,
    39.9371,
    "culture",
    [
      ["ticket", "府园游览票", "宅邸、花园与展览让清代营造和城市生活获得可步入的尺度。"],
      ["postcard", "蝠厅花窗信", "园林里的门窗、叠石和树影适合被寄给下一位慢行访客。"],
    ],
  ],
  [
    "guo-shoujing",
    "郭守敬纪念馆",
    116.3756,
    39.9475,
    "culture",
    [
      ["nameplate", "观象授时签", "水利、天文与历法知识在积水潭畔重新连接真实地形。"],
      ["photo", "水关测影", "从旧水道观察城市如何借水建立交通与时间秩序。"],
    ],
  ],
  [
    "deshengmen",
    "德胜门箭楼",
    116.379,
    39.9492,
    "culture",
    [
      ["photo", "城门侧影", "仅存的城门箭楼帮助来访者辨认北京旧城边界与道路方向。"],
      ["ribbon", "北城风带", "风穿过城门与环路，把古城尺度带回今天的步行视线。"],
    ],
  ],
  [
    "mei-lanfang",
    "梅兰芳纪念馆",
    116.3752,
    39.9355,
    "culture",
    [
      ["postcard", "梨园唱片笺", "四合院、戏服与手稿让舞台艺术回到艺术家的日常生活。"],
      ["voice", "一段水磨腔", "用声音牌保存传统表演里最细微的呼吸与节奏。"],
    ],
  ],
  [
    "huguosi",
    "护国寺街区",
    116.3723,
    39.9333,
    "neighborhood",
    [
      ["postcard", "护国寺点心卡", "小吃、菜场与胡同日常共同维持一条有烟火气的生活街道。"],
      ["ticket", "胡同散步票", "从街边店铺出发，比按景点清单更容易遇见真实的社区节奏。"],
    ],
  ],
  [
    "beijing-zoo",
    "北京动物园",
    116.3381,
    39.9385,
    "park",
    [
      ["ticket", "动物邻居票", "动物保育、自然教育与几代人的家庭记忆在这里长期相遇。"],
      ["seed", "城市栖息种", "把观察动物的耐心带回城市里的树、鸟与四季。"],
    ],
  ],
  [
    "beijing-planetarium",
    "北京天文馆",
    116.3331,
    39.9385,
    "culture",
    [
      ["ticket", "星空观测票", "球幕、展览与观测活动把遥远宇宙变成人人可进入的科学现场。"],
      ["postcard", "银河投递卡", "从西直门外寄出一张写给夜空和未来自己的明信片。"],
    ],
  ],
  [
    "capital-museum",
    "首都博物馆",
    116.3325,
    39.907,
    "culture",
    [
      ["ticket", "古都展览票", "考古、民俗与城市史把北京漫长时间压进可阅读的展厅。"],
      ["photo", "燕地器物影", "从一件器物出发，重新辨认城市里的材料、工艺与生活。"],
    ],
  ],
  [
    "baiyun-temple",
    "白云观",
    116.3445,
    39.9001,
    "culture",
    [
      ["ribbon", "白云祈愿结", "古建院落、碑刻与节令活动保存城西持续生长的民间文化。"],
      ["photo", "古柏院影", "树木和屋檐让时间在院落里留下清晰的层次。"],
    ],
  ],
  [
    "tianning-temple",
    "天宁寺塔",
    116.3308,
    39.8968,
    "culture",
    [
      ["photo", "密檐塔影", "古塔为西城西南部提供一枚从远处也能辨认的历史坐标。"],
      ["poem", "宣南风铃笺", "让穿过塔檐的风替旧城写下一句没有署名的短诗。"],
    ],
  ],
  [
    "fayuan-temple",
    "法源寺",
    116.3742,
    39.8853,
    "culture",
    [
      ["postcard", "丁香庭院信", "古寺、丁香与安静街巷共同形成宣南最柔和的春日片段。"],
      ["ribbon", "古槐风结", "把庭院里缓慢移动的树影系在花茎上。"],
    ],
  ],
  [
    "huguang-guild-hall",
    "湖广会馆",
    116.386,
    39.8918,
    "culture",
    [
      ["ticket", "戏楼听戏票", "会馆、戏楼与地方乡音记录人口流动如何塑造北京城市文化。"],
      ["voice", "乡音留声签", "一段唱腔让建筑不只被看见，也重新被听见。"],
    ],
  ],
  [
    "ancient-architecture-museum",
    "北京古代建筑博物馆",
    116.3923,
    39.8777,
    "culture",
    [
      ["nameplate", "营造图样签", "藻井、模型与传统营造知识让建筑结构变成可以阅读的城市语言。"],
      ["photo", "隆福寺藻井影", "抬头观看精细构件，也能理解工匠如何组织复杂空间。"],
    ],
  ],
  [
    "taoranting",
    "陶然亭公园",
    116.3741,
    39.8744,
    "park",
    [
      ["postcard", "亭湖春信", "湖面、亭台和社区游园组成南城居民共享的四季客厅。"],
      ["seed", "海棠花种", "花期与候鸟让公园成为可以反复返回的物候日历。"],
    ],
  ],
  [
    "grand-view-garden",
    "北京大观园",
    116.3553,
    39.8708,
    "culture",
    [
      ["ticket", "红楼游园票", "文学想象通过园林、展陈与节庆活动获得可行走的空间版本。"],
      ["postcard", "潇湘竹影卡", "从一处园景寄出关于人物、植物与阅读记忆的短笺。"],
    ],
  ],
]);

const DONGCHENG = districtSites("beijing-dongcheng", "东城区", [
  ["temple-of-heaven", "天坛公园", 116.4066, 39.8822, "park", "postcard", "圜丘回声卡", "古柏、坛墙与开阔步道共同保存旧城南部的空间秩序。"],
  ["natural-history-museum", "国家自然博物馆", 116.3992, 39.8837, "culture", "ticket", "自然标本票", "从古生物到城市生态，展厅把漫长自然史带进日常观察。"],
  ["longtan-park", "龙潭公园", 116.4374, 39.8803, "park", "voice", "龙潭晨练声", "湖岸、廊桥与居民晨练构成南城稳定而亲切的公共节奏。"],
  ["yongdingmen-park", "永定门公园", 116.399, 39.8725, "park", "photo", "城门轴线影", "城楼与连续绿地让人从南端重新辨认旧城尺度。"],
  ["guozijian", "孔庙和国子监博物馆", 116.4172, 39.9466, "culture", "ticket", "槐市读书签", "古代教育空间、碑刻与院落让知识传统获得可步入的现场。"],
  ["wudaoying", "五道营胡同", 116.4184, 39.9461, "neighborhood", "postcard", "胡同生活笺", "小店、院门与居民日常在短街上保持细密的步行尺度。"],
  ["nanluoguxiang-north", "南锣鼓巷北段", 116.4037, 39.9404, "neighborhood", "ribbon", "鼓楼漫步带", "从主街转入支巷，能看见商业街之外仍在生长的社区生活。"],
  ["dongsi-hutong-museum", "东四胡同博物馆", 116.4241, 39.9293, "culture", "nameplate", "砖塔院落签", "小型社区博物馆把胡同营造和居民记忆留在原有街区。"],
]);

const CHAOYANG = districtSites("beijing-chaoyang", "朝阳区", [
  ["olympic-forest-park", "奥林匹克森林公园", 116.3927, 40.0164, "park", "seed", "北园草木种", "大尺度林地、湿地与跑步环线为城市北部提供连续自然空间。"],
  ["park-of-sun", "朝阳公园", 116.4823, 39.9468, "park", "voice", "湖岸风声", "草坡、水面和运动场承接高密度城区里多样的日常活动。"],
  ["798-art-zone", "798艺术区", 116.4977, 39.9845, "culture", "ticket", "厂房展览票", "工业建筑、画廊与公共艺术形成可以连续步行的文化街区。"],
  ["red-brick-museum", "红砖美术馆", 116.5057, 40.0402, "culture", "photo", "红砖园景照", "砖墙、庭院与当代艺术让建筑本身也成为展览体验。"],
  ["railway-museum", "中国铁道博物馆东郊展馆", 116.5175, 40.0056, "culture", "ticket", "机车站台票", "真实机车与铁路器物把工业技术史带回可触摸的尺度。"],
  ["jiangfu-park", "将府公园", 116.5226, 39.9772, "park", "photo", "林水栈道影", "林地、湿地和旧铁路遗迹共同形成东部城市绿廊。"],
  ["langyuan-station", "郎园Station", 116.5097, 39.9618, "neighborhood", "postcard", "仓库新生活卡", "旧仓储空间通过书店、展览和市集重新进入社区日常。"],
  ["gaobeidian-village", "高碑店古家具街", 116.53, 39.9096, "neighborhood", "nameplate", "榫卯街巷签", "传统家具、运河支流与村落街道保留东部手艺生活的线索。"],
]);

const HAIDIAN = districtSites("beijing-haidian", "海淀区", [
  ["summer-palace", "颐和园", 116.2732, 39.9999, "park", "postcard", "昆明湖水色卡", "湖山、长廊与园林建筑把西北郊自然地形组织成完整游园体验。"],
  ["yuanmingyuan", "圆明园遗址公园", 116.3036, 40.0081, "park", "photo", "遗址草木影", "遗址、水系与四季植物让历史记忆在开放公园里持续被阅读。"],
  ["national-botanical-garden", "国家植物园北园", 116.2169, 40.0025, "forest", "seed", "植物迁徙种", "植物收集、科学教育与西山生态共同构成城市物种课堂。"],
  ["fragrant-hills", "香山公园", 116.1888, 39.9917, "forest", "ribbon", "西山林风带", "山径、古树与季节色彩为城区保留清晰的山地入口。"],
  ["zizhuyuan", "紫竹院公园", 116.3127, 39.9414, "park", "voice", "竹湖清音", "竹林、水面与社区活动让城西拥有可反复返回的日常园林。"],
  ["baiwangshan", "百望山森林公园", 116.2611, 40.0326, "forest", "seed", "山前林籽", "低山步道连接城区边缘与西北山林，是观察季节变化的近郊窗口。"],
  ["haidian-park", "海淀公园", 116.2934, 39.9932, "park", "postcard", "稻田城市卡", "城市公园里的田园记忆和开放草坪承接周边居民生活。"],
  ["daoxianghu", "稻香湖自然湿地公园", 116.1886, 40.1092, "park", "voice", "湿地鸟声", "湖面、芦苇与林带为海淀北部保留更舒展的生态空间。"],
]);

const FENGTAI = districtSites("beijing-fengtai", "丰台区", [
  ["garden-expo", "北京园博园", 116.1905, 39.8756, "park", "postcard", "园林集合卡", "不同地域园林与永定河生态修复在同一片公共空间中相遇。"],
  ["auto-museum", "北京汽车博物馆", 116.3027, 39.8251, "culture", "ticket", "汽车设计票", "交通工具、工业设计与互动展览让工程知识变得可亲近。"],
  ["world-flower-garden", "世界花卉大观园", 116.3516, 39.8024, "park", "seed", "温室花种", "温室、花圃和自然教育把全球植物带进南城日常。"],
  ["nanyuan-wetland", "南苑森林湿地公园", 116.3997, 39.7896, "forest", "voice", "南苑林风", "大尺度生态修复为南部城区补回连续林地与湿地。"],
  ["lianhuachi", "莲花池公园", 116.3093, 39.897, "park", "photo", "莲池城源影", "古水系、荷塘与社区游园共同保存北京城水源记忆。"],
  ["world-park", "北京世界公园", 116.2869, 39.8093, "park", "ticket", "微缩旅行票", "微缩景观把跨地域建筑观察变成一场轻松的城市游园。"],
  ["qinglong-lake-fengtai", "青龙湖公园东岸", 116.0871, 39.7848, "park", "voice", "湖岸风样", "开阔水面和郊野林地为丰台西部提供慢行与观鸟空间。"],
  ["xiaotun-park", "小屯公园", 116.2581, 39.8884, "park", "seed", "社区绿荫种", "林荫步道与社区运动设施让大型居住区拥有共享绿心。"],
]);

const SHIJINGSHAN = districtSites("beijing-shijingshan", "石景山区", [
  ["shougang-park", "首钢园", 116.1637, 39.9067, "culture", "photo", "高炉天际线", "工业遗存、公共空间与新文化活动共同构成城市更新现场。"],
  ["badachu", "八大处公园", 116.1794, 39.9587, "forest", "ribbon", "西山古道结", "山林、古建与步道把城市生活自然引向西山。"],
  ["fahai-temple", "法海寺", 116.1671, 39.9489, "culture", "photo", "壁画色谱卡", "古建与壁画展示传统绘画、矿物颜料和营造技艺的精细层次。"],
  ["international-sculpture-park", "北京国际雕塑公园", 116.2347, 39.9062, "park", "postcard", "雕塑草坪卡", "公共艺术、草坪和社区活动在长安街西延线外形成开放公园。"],
  ["yongding-river-forest", "永定河休闲森林公园", 116.1348, 39.8832, "forest", "seed", "河滩复绿种", "河道修复与林地慢行展示城市西部生态边界的变化。"],
  ["moshikou", "模式口历史文化街区", 116.1668, 39.9384, "neighborhood", "postcard", "驼铃古道信", "古道、院落与社区更新让西山脚下的生活街区重新可读。"],
  ["shijingshan-amusement-park", "石景山游乐园", 116.2123, 39.9129, "park", "ticket", "童年游园票", "大型游乐设施保存几代北京人的城市休闲记忆。"],
  ["laoshan-city-park", "老山城市休闲公园", 116.2196, 39.9192, "sports", "ribbon", "山体健行带", "社区步道与林地让居民在城区西部获得轻量山行体验。"],
]);

const MENTOUGOU = districtSites("beijing-mentougou", "门头沟区", [
  ["tanzhe-temple", "潭柘寺", 116.0335, 39.9022, "culture", "ribbon", "古槐山门结", "古寺、山谷与千年树木构成京西深厚的人文景观。"],
  ["jietai-temple", "戒台寺", 116.0874, 39.8753, "culture", "photo", "古松院影", "辽代戒坛、古松与山地院落共同保存传统建筑尺度。"],
  ["miaofengshan", "妙峰山", 116.0047, 40.0581, "forest", "ribbon", "山路香会带", "古道、庙宇和村落记录京西山地持续已久的民间往来。"],
  ["cuandixia", "爨底下村", 115.6542, 39.9966, "neighborhood", "postcard", "山村院落信", "坡地四合院、古道与山谷保存完整的传统聚落形态。"],
  ["lingshan", "灵山自然风景区", 115.4961, 40.0129, "forest", "seed", "高山草甸种", "高海拔草甸与山脊让北京西端呈现截然不同的生态层次。"],
  ["baihuashan", "百花山自然保护区", 115.5645, 39.8508, "forest", "seed", "百花草甸种", "山地花草与森林群落构成京西重要的生物多样性空间。"],
  ["yongding-river-culture-museum", "永定河文化博物馆", 116.1024, 39.9406, "culture", "ticket", "河流记忆票", "地方展览把煤业、古道、村落与永定河变迁连接起来。"],
  ["green-sea-park", "绿海运动公园", 116.1118, 39.919, "sports", "ribbon", "滨河骑行带", "面向居民的运动空间让京西山水进入日常锻炼路径。"],
]);

const FANGSHAN = districtSites("beijing-fangshan", "房山区", [
  ["zhoukoudian", "周口店国家考古遗址公园", 115.9222, 39.6897, "culture", "ticket", "考古地层票", "遗址、地层与研究史把人类演化叙事落在真实山地。"],
  ["shidu", "十渡风景区", 115.5964, 39.6415, "park", "voice", "拒马河水声", "峡谷、河流与村落共同构成北京西南最舒展的山水走廊。"],
  ["yunju-temple", "云居寺", 115.7667, 39.6086, "culture", "nameplate", "石经拓印签", "石刻经版与山寺保存跨越千年的文字、雕刻和收藏实践。"],
  ["shihua-cave", "石花洞", 115.9333, 39.7804, "forest", "photo", "洞穴晶花影", "地下岩溶景观让城市漫游进入完全不同的地质空间。"],
  ["shangfangshan", "上方山国家森林公园", 115.8056, 39.6659, "forest", "seed", "古树林籽", "山林、寺院与地质地貌组成京西南连续的自然课堂。"],
  ["pofengling", "坡峰岭", 115.9155, 39.6674, "forest", "photo", "红叶山坡照", "村落步道与季节林色让山地旅游和乡村生活相互连接。"],
  ["liulihe-site", "琉璃河西周燕都遗址博物馆", 116.0042, 39.6091, "culture", "ticket", "燕都考古票", "考古发现把北京城市史向更早的时间层展开。"],
  ["qinglong-lake-fangshan", "青龙湖森林公园西岸", 116.0433, 39.7714, "park", "voice", "湖谷风声", "水面、林带与浅山构成房山东北部的近郊休闲空间。"],
]);

const TONGZHOU = districtSites("beijing-tongzhou", "通州区", [
  ["grand-canal-forest", "大运河森林公园", 116.719, 39.8645, "canal", "ribbon", "运河骑行带", "连续滨水绿道把漕运历史、生态修复和居民运动连接起来。"],
  ["han-meilin-museum", "韩美林艺术馆", 116.6573, 39.9028, "culture", "ticket", "生肖艺术票", "绘画、雕塑和民间艺术收藏形成面向公众的综合艺术空间。"],
  ["songzhuang-art", "宋庄艺术区", 116.7247, 39.9557, "neighborhood", "postcard", "艺术村落信", "工作室、展览与村镇生活共同构成东部持续生长的创作社区。"],
  ["taihu-performing-arts", "台湖演艺小镇", 116.6517, 39.8022, "culture", "ticket", "舞台排练票", "剧场、排练与公共活动让表演艺术进入城市东南部日常。"],
  ["lucheng-park", "绿心森林公园", 116.7391, 39.8798, "forest", "seed", "城市绿心种", "大尺度森林、步道与自然教育为通州保留公共生态核心。"],
  ["xihaizi-park", "西海子公园", 116.6618, 39.9157, "park", "photo", "燃灯塔影", "湖面、古塔与居民游园保存通州老城的水岸记忆。"],
  ["universal-resort", "北京环球城市大道", 116.6758, 39.8573, "neighborhood", "ticket", "电影街区票", "电影主题、餐饮和夜间公共空间形成高强度的城市娱乐体验。"],
  ["zhangjiawan-park", "张家湾公园", 116.7034, 39.8478, "canal", "postcard", "古镇水路卡", "运河支线、古镇线索与新绿地共同呈现南部水路生活。"],
]);

const SHUNYI = districtSites("beijing-shunyi", "顺义区", [
  ["olympic-water-park", "奥林匹克水上公园", 116.6934, 40.1794, "sports", "ticket", "水上赛道票", "赛道、滨水步道与开放草地让大型场馆继续服务日常运动。"],
  ["hanshiqiao-wetland", "汉石桥湿地自然保护区", 116.8135, 40.1214, "park", "voice", "芦苇鸟声", "芦苇荡、浅水与候鸟构成北京东北平原重要的湿地课堂。"],
  ["international-flower-port", "北京国际鲜花港", 116.8139, 40.1822, "park", "seed", "花港种球", "规模化花田、温室和园艺活动把农业生产转化为季节游园。"],
  ["luoma-lake", "罗马湖公园", 116.5574, 40.1015, "park", "postcard", "湖岸落日卡", "水面、慢行步道与周边社区形成顺义西部的休闲客厅。"],
  ["chaobai-river-forest", "潮白河森林公园", 116.6921, 40.1416, "forest", "ribbon", "潮白河风带", "河滩林地与骑行路径串联顺义城区和更广阔的平原生态。"],
  ["shunyi-museum", "顺义区博物馆", 116.6545, 40.13, "culture", "ticket", "顺州旧物票", "地方文物与生活史为快速变化的新城保留区域记忆。"],
  ["niulanshan-culture", "牛栏山酒文化苑", 116.6535, 40.221, "culture", "nameplate", "酿造工艺签", "粮食、器具与酿造技艺呈现平原市镇长期形成的生产文化。"],
  ["jianhe-park", "减河公园", 116.6575, 40.1261, "park", "voice", "河岸晨声", "穿城水系、绿道与社区活动共同构成顺义城区的日常慢行线。"],
]);

const CHANGPING = districtSites("beijing-changping", "昌平区", [
  ["ming-tombs", "明十三陵景区", 116.2286, 40.2552, "culture", "ticket", "山陵营造票", "山川形势、古建与石刻共同呈现明代大型陵寝的空间组织。"],
  ["juyongguan", "居庸关长城", 116.0687, 40.2892, "culture", "ribbon", "关沟山风带", "关城、峡谷和山脊长城记录北京西北通道的地理尺度。"],
  ["yinshan-pagoda-forest", "银山塔林", 116.3228, 40.32, "culture", "photo", "山谷塔影", "古塔、寺院遗址与安静山谷组成昌平北部独特的人文景观。"],
  ["mangshan-forest", "蟒山国家森林公园", 116.2852, 40.2781, "forest", "seed", "山林复绿种", "水库南侧的山地林场为城区提供连续的登高与观景路径。"],
  ["wenyu-river-changping", "温榆河滨水绿道昌平段", 116.4317, 40.1689, "sports", "ribbon", "温榆骑行带", "河道、湿地和骑行线路把北部新城的多个社区串联起来。"],
  ["qikong-bridge", "七孔桥花海", 116.2223, 40.2947, "park", "postcard", "花海季节卡", "桥梁、水面与季节花田构成十三陵片区柔和的公共景观。"],
  ["baifuquan-park", "白浮泉公园", 116.2319, 40.2057, "park", "voice", "源泉水声", "运河源头线索与城市公园让水利历史进入居民日常。"],
  ["xiaotangshan-agriculture", "小汤山现代农业科技示范园", 116.4218, 40.184, "culture", "seed", "温室实验种", "农业科技、温室生产与自然教育展示平原种植的新方法。"],
]);

const DAXING = districtSites("beijing-daxing", "大兴区", [
  ["nanhaizi-park", "南海子公园", 116.473, 39.7825, "park", "seed", "麋鹿湿地种", "湿地、草原与历史苑囿遗存共同组成南部大型生态空间。"],
  ["milu-park", "北京麋鹿生态实验中心", 116.4618, 39.7765, "park", "nameplate", "麋鹿观察签", "物种保护、湿地恢复与公众教育在真实栖息地中展开。"],
  ["wildlife-park", "北京野生动物园", 116.3275, 39.5107, "park", "ticket", "动物邻居票", "开阔林地与保育展示帮助访客理解动物行为和栖息环境。"],
  ["printing-museum", "中国印刷博物馆", 116.3445, 39.7281, "culture", "ticket", "活字工艺票", "文字、纸张和印刷技术把知识传播史变成可操作的展览。"],
  ["yufa-forest", "榆垡万亩森林公园", 116.3038, 39.5104, "forest", "seed", "平原造林种", "连续林网为南部平原补充生态廊道与社区休闲空间。"],
  ["panggezhuang-pear", "庞各庄梨花村", 116.3133, 39.6194, "neighborhood", "postcard", "梨花乡野信", "果园、村路与春季花期保留大兴农业景观的生活尺度。"],
  ["weishanzhuang-forest", "魏善庄城市森林公园", 116.4117, 39.6449, "forest", "ribbon", "南城林荫带", "平原林地和慢行设施为周边新社区提供共享绿色边界。"],
  ["yizhuang-xincheng-park", "亦庄新城滨河公园", 116.5062, 39.7947, "park", "voice", "凉水河风声", "滨河绿道把产业新城、居住区与日常运动连接起来。"],
]);

const HUAIROU = districtSites("beijing-huairou", "怀柔区", [
  ["mutianyu", "慕田峪长城", 116.5634, 40.4319, "culture", "ribbon", "山脊长城带", "密林、敌楼与连续山脊呈现长城和北部地形的真实关系。"],
  ["hongluo-temple", "红螺寺", 116.6331, 40.3754, "culture", "photo", "古槐竹林影", "寺院、竹林和山麓古树构成怀柔城区近旁的人文山景。"],
  ["qinglong-gorge", "青龙峡", 116.6783, 40.4576, "park", "voice", "峡谷水声", "山峡、水面与林地为北部山地提供亲水游览路径。"],
  ["huanghuacheng", "黄花城水长城", 116.3197, 40.4142, "culture", "postcard", "湖畔长城卡", "长城入水的地形关系让山脊防御体系获得少见的水岸视角。"],
  ["shentangyu", "神堂峪自然风景区", 116.6268, 40.4785, "forest", "voice", "山溪村声", "溪谷步道、林地与村落形成适合慢行的山地生活路径。"],
  ["labagoumen", "喇叭沟原始森林公园", 116.6125, 40.9634, "forest", "seed", "白桦林种", "高纬山地森林和白桦林展现北京最北部鲜明的季节生态。"],
  ["baiquan-mountain", "百泉山", 116.6536, 40.5189, "forest", "voice", "百泉溪声", "密集泉瀑与林荫峡谷构成怀柔中部清凉的自然入口。"],
  ["huaisha-river", "怀沙河滨水步道", 116.6067, 40.3974, "sports", "ribbon", "河谷骑行带", "河道修复与连续绿道把山前村镇和城区慢行系统连接起来。"],
]);

const PINGGU = districtSites("beijing-pinggu", "平谷区", [
  ["jinhai-lake", "金海湖", 117.3128, 40.1838, "park", "postcard", "湖山水色卡", "开阔水面、山地与滨湖步道构成北京东端的重要休闲景观。"],
  ["shilin-gorge", "京东石林峡", 117.2544, 40.244, "forest", "photo", "峡谷岩壁影", "陡峭岩壁、峡谷与山顶视野展示平谷独特地质地貌。"],
  ["jingdong-grand-canyon", "京东大峡谷", 117.1844, 40.2433, "forest", "voice", "峡谷潭声", "山谷、潭瀑与林地形成连续的自然步行体验。"],
  ["yaji-mountain", "丫髻山", 117.1241, 40.2723, "culture", "ribbon", "山路庙会结", "山地古建、民间节俗与乡村道路共同构成区域文化路径。"],
  ["peach-sea", "平谷桃花海", 117.0992, 40.1708, "neighborhood", "seed", "大桃花种", "连片果园和春季花期把农业生产转化为全区性的物候景观。"],
  ["laoxiangfeng", "老象峰景区", 117.0648, 40.1909, "forest", "photo", "象峰山石照", "奇石、低山与乡村步道提供亲近地质景观的轻量路线。"],
  ["bolitai", "玻璃台村", 117.1249, 40.3198, "neighborhood", "postcard", "石村山居信", "石屋、山路与乡村生活展示东北部山地聚落的真实尺度。"],
  ["ruyu-lake-park", "洳河滨水公园", 117.1127, 40.142, "park", "voice", "洳河晚风", "穿城水系与绿道为平谷城区提供连续的日常公共空间。"],
]);

const MIYUN = districtSites("beijing-miyun", "密云区", [
  ["gubei-water-town", "古北水镇", 117.2672, 40.6523, "neighborhood", "postcard", "山谷水镇信", "山谷、河道与街巷夜景构成密云东北部集中的步行体验。"],
  ["simatai", "司马台长城", 117.2846, 40.6579, "culture", "ribbon", "险峻山脊带", "敌楼沿陡峭山脊展开，清楚呈现长城对地形的适应。"],
  ["heilongtan", "黑龙潭", 116.8048, 40.5589, "forest", "voice", "潭瀑回声", "峡谷潭瀑和山林为密云西部提供清晰的亲水自然路线。"],
  ["taoyuan-valley", "桃源仙谷", 116.7862, 40.5969, "forest", "photo", "谷地冰瀑影", "山谷在不同季节呈现溪水、林色与冰瀑等多重景观。"],
  ["yunmeng-mountain", "云蒙山风景区", 116.7068, 40.5609, "forest", "seed", "云雾林种", "山峰、密林与云雾构成北京东北部重要的山地生态空间。"],
  ["qinglianggu", "清凉谷", 116.7026, 40.6204, "forest", "voice", "清凉溪声", "连续水潭、瀑布和林荫步道形成夏季山谷微气候。"],
  ["nanshan-ski", "南山滑雪场", 116.8568, 40.3428, "sports", "ticket", "雪道缆车票", "山地运动让密云城区近旁的冬季公共生活获得明确目的地。"],
  ["miyun-new-town-park", "密云新城滨河公园", 116.8391, 40.3735, "park", "ribbon", "潮河慢行带", "滨水绿道和城市公园串联密云城区的日常步行与骑行。"],
]);

const YANQING = districtSites("beijing-yanqing", "延庆区", [
  ["badaling", "八达岭长城", 116.0155, 40.3559, "culture", "ticket", "关城登临票", "山口、城墙与敌楼共同呈现北部交通通道和山地防御尺度。"],
  ["longqing-gorge", "龙庆峡", 116.0056, 40.55, "park", "voice", "峡湖回声", "峡谷水面、峭壁与山地气候构成延庆代表性的自然体验。"],
  ["yudu-mountain", "玉渡山", 115.9008, 40.5604, "forest", "seed", "高山草甸种", "林地、溪流和草甸为城市北部保留安静的自然观察空间。"],
  ["gui-river-forest", "妫河森林公园", 115.972, 40.4481, "forest", "ribbon", "妫河骑行带", "穿城河流、林地与连续步道连接延庆城区和周边乡野。"],
  ["wild-duck-lake", "野鸭湖国家湿地公园", 115.8614, 40.4136, "park", "voice", "候鸟芦荡声", "湿地、芦苇和迁徙鸟类构成官厅水系重要的生态课堂。"],
  ["grape-expo", "世界葡萄博览园", 115.9043, 40.4713, "park", "seed", "葡萄园艺种", "葡萄品种、园艺展示与乡村景观形成可参与的农业公园。"],
  ["beijing-expo-park", "北京世园公园", 115.9725, 40.4451, "park", "postcard", "世园植物卡", "园艺展园、山水骨架和公共活动延续大型展会后的城市生活。"],
  ["shijinglong-ski", "石京龙滑雪场", 115.8926, 40.5038, "sports", "ticket", "雪季运动票", "冬季雪道与山谷地形拓展延庆四季户外运动的时间范围。"],
]);

const REGION_SCENE_ZOOM = 17.2;

export const BEIJING_GARDEN_REGIONS: readonly BeijingGardenRegion[] = [
  {
    id: "beijing-xicheng",
    label: "西城",
    center: XICHENG[0].position,
    zoom: REGION_SCENE_ZOOM,
    sites: XICHENG,
  },
  { id: "beijing-dongcheng", label: "东城", center: DONGCHENG[0].position, zoom: REGION_SCENE_ZOOM, sites: DONGCHENG },
  { id: "beijing-chaoyang", label: "朝阳", center: CHAOYANG[0].position, zoom: REGION_SCENE_ZOOM, sites: CHAOYANG },
  { id: "beijing-haidian", label: "海淀", center: HAIDIAN[0].position, zoom: REGION_SCENE_ZOOM, sites: HAIDIAN },
  { id: "beijing-fengtai", label: "丰台", center: FENGTAI[0].position, zoom: REGION_SCENE_ZOOM, sites: FENGTAI },
  { id: "beijing-shijingshan", label: "石景山", center: SHIJINGSHAN[0].position, zoom: REGION_SCENE_ZOOM, sites: SHIJINGSHAN },
  { id: "beijing-mentougou", label: "门头沟", center: MENTOUGOU[0].position, zoom: REGION_SCENE_ZOOM, sites: MENTOUGOU },
  { id: "beijing-fangshan", label: "房山", center: FANGSHAN[0].position, zoom: REGION_SCENE_ZOOM, sites: FANGSHAN },
  { id: "beijing-tongzhou", label: "通州", center: TONGZHOU[0].position, zoom: REGION_SCENE_ZOOM, sites: TONGZHOU },
  { id: "beijing-shunyi", label: "顺义", center: SHUNYI[0].position, zoom: REGION_SCENE_ZOOM, sites: SHUNYI },
  { id: "beijing-changping", label: "昌平", center: CHANGPING[0].position, zoom: REGION_SCENE_ZOOM, sites: CHANGPING },
  { id: "beijing-daxing", label: "大兴", center: DAXING[0].position, zoom: REGION_SCENE_ZOOM, sites: DAXING },
  { id: "beijing-huairou", label: "怀柔", center: HUAIROU[0].position, zoom: REGION_SCENE_ZOOM, sites: HUAIROU },
  { id: "beijing-pinggu", label: "平谷", center: PINGGU[0].position, zoom: REGION_SCENE_ZOOM, sites: PINGGU },
  { id: "beijing-miyun", label: "密云", center: MIYUN[0].position, zoom: REGION_SCENE_ZOOM, sites: MIYUN },
  { id: "beijing-yanqing", label: "延庆", center: YANQING[0].position, zoom: REGION_SCENE_ZOOM, sites: YANQING },
];

export const BEIJING_GIANT_FLOWER_SITES: readonly GiantFlowerGardenSite[] =
  BEIJING_GARDEN_REGIONS.flatMap((region) => region.sites);

export const BEIJING_OVERVIEW_CENTER: [number, number] = [116.35, 40.16];
export const BEIJING_OVERVIEW_ZOOM = 7.55;
