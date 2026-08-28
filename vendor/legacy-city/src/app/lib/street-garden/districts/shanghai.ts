import type { GiantFlowerHangingKind } from "../GiantFlower";
import type { GiantFlowerGardenSite } from "../grove";
import { isAmapMapAdmitted, resolveAmapVerifiedPosition } from "../amapCoordinateOverrides";

export type ShanghaiGardenRegion = {
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

const ACCENTS = [
  "#8d3c35",
  "#397560",
  "#355f9b",
  "#9a7134",
  "#745ca8",
  "#d26a37",
] as const;

function sites(
  districtId: string,
  district: string,
  seeds: readonly SiteSeed[],
): GiantFlowerGardenSite[] {
  return seeds.filter(([id]) => isAmapMapAdmitted("map-shanghai-public-garden", id)).map(([id, name, lng, lat, category, hangings], siteIndex) => ({
    id,
    name,
    district,
    districtId,
    position: resolveAmapVerifiedPosition(
      "map-shanghai-public-garden",
      id,
      [lng, lat],
    ),
    category,
    hangings: hangings.map(([kind, label, note], hangingIndex) => ({
      kind,
      label,
      note,
      accent: ACCENTS[(siteIndex + hangingIndex) % ACCENTS.length],
    })),
    scale: siteIndex === 0 ? 1.04 : undefined,
  }));
}

const XUHUI = sites("shanghai-xuhui", "徐汇区", [
  [
    "xujiahui-academy",
    "徐家汇书院",
    121.43714,
    31.190622,
    "culture",
    [
      ["postcard", "书院借阅卡", "阅读、展览、讲座与城市旅游导览在这里共享同一座公共客厅。"],
      ["ticket", "海派寻源章", "从书院出发，可以把徐光启、土山湾与百代小楼串成一条城市走读线。"],
      ["photo", "光塔窗影", "书院的新建筑让徐家汇源的历史天际线继续进入当代日常。"],
    ],
  ],
  [
    "guangqi-park",
    "光启公园·徐光启纪念馆",
    121.434605,
    31.189673,
    "culture",
    [["poem", "光启星历笺", "数学、天文、农业与中西会通的科学精神从这里重新进入城市生活。"]],
  ],
  [
    "tushanwan",
    "土山湾博物馆",
    121.434927,
    31.186827,
    "culture",
    [["photo", "土山湾牌楼", "画馆、工艺院与世博牌楼共同记录海派艺术和近代职业教育的源头。"]],
  ],
  [
    "film-museum",
    "上海电影博物馆",
    121.438277,
    31.186213,
    "culture",
    [["ticket", "百年电影票", "电影文物、摄影棚体验与上海影人故事在这里组成一部可步入的银幕史。"]],
  ],
  [
    "sjtu-xuhui",
    "上海交通大学徐汇校区",
    121.433025,
    31.199027,
    "culture",
    [["postcard", "百年校园信", "历史建筑、工程教育与青年生活让徐家汇的科学传统持续生长。"]],
  ],
  [
    "qian-xuesen-library",
    "钱学森图书馆",
    121.435368,
    31.201161,
    "culture",
    [["nameplate", "科学家手稿", "档案、手稿与实物让宏大的航天叙事回到一个人的学习和选择。"]],
  ],
  [
    "xujiahui-park",
    "徐家汇公园·百代小楼",
    121.442965,
    31.198537,
    "park",
    [
      ["voice", "百代唱片声", "唱片工业旧址、城市绿地与星期音乐会把历史声音带回公共空间。"],
      ["postcard", "公园长椅信", "繁忙商圈旁的一片开放绿地，为停留和偶遇留出日常尺度。"],
    ],
  ],
  [
    "wukang-building",
    "武康大楼",
    121.438352,
    31.204388,
    "culture",
    [
      ["photo", "转角立面照", "楔形建筑把道路交汇处变成阅读上海近代城市肌理的清晰封面。"],
      ["postcard", "梧桐来信", "大楼仍处在真实社区中，观看建筑也应当尊重居民的日常生活。"],
    ],
  ],
  [
    "wukang-anfu",
    "武康路—安福路街区",
    121.443015,
    31.214129,
    "neighborhood",
    [
      ["ribbon", "林荫慢行带", "历史风貌道路、街边小店与梧桐树荫构成适合步行的连续街区。"],
      ["postcard", "安福路短笺", "电影、戏剧、设计与社区生活在街巷尺度里彼此靠近。"],
    ],
  ],
  [
    "shanghai-library",
    "上海图书馆淮海路馆",
    121.444267,
    31.208136,
    "culture",
    [["ticket", "城市读者证", "大型公共图书馆让知识收藏成为每个人都能进入的城市基础设施。"]],
  ],
  [
    "longhua-temple",
    "龙华古寺·龙华广场",
    121.451843,
    31.174886,
    "culture",
    [["ribbon", "千年塔影结", "古寺、古塔、庙会与新广场共同保存徐汇最深的一层江南文化时间。"]],
  ],
  [
    "longhua-martyrs",
    "龙华烈士陵园",
    121.448866,
    31.175759,
    "culture",
    [["nameplate", "龙华纪念签", "纪念空间把革命历史、人物姓名与今天的公共教育郑重连接起来。"]],
  ],
  [
    "west-bund-museum",
    "西岸美术馆",
    121.463892,
    31.167654,
    "culture",
    [
      ["ticket", "西岸展览票", "视觉艺术、表演、新媒体与设计在滨江形成面向公众的跨学科场馆。"],
      ["postcard", "蓬皮杜来信", "长期国际合作让上海观众能够持续接触不同文化语境中的当代艺术。"],
    ],
  ],
  [
    "tank-shanghai",
    "油罐艺术中心",
    121.464515,
    31.164521,
    "culture",
    [["photo", "航油罐底片", "龙华机场旧航油罐被改造成展览空间，工业遗存因此获得新的公共生命。"]],
  ],
  [
    "runway-park",
    "云锦路跑道公园",
    121.462067,
    31.166368,
    "sports",
    [["ribbon", "机场跑道带", "旧机场跑道被转译成开放绿地，让工业记忆、运动和滨江慢行重叠。"]],
  ],
  [
    "west-bund-dream",
    "西岸梦中心",
    121.466147,
    31.160398,
    "neighborhood",
    [["postcard", "水岸夜生活卡", "滨江更新在这里加入演出、餐饮与夜间活动，让文化场馆之间出现生活连接。"]],
  ],
  [
    "shanghai-botanical",
    "上海植物园",
    121.44503,
    31.147905,
    "forest",
    [
      ["seed", "城市植物种", "植物引种、科学研究、科普与园艺展示共同构成中心城区的大型植物课堂。"],
      ["photo", "四季物候照", "持续记录花期与树木变化，让城市居民能够读到更细的季节刻度。"],
    ],
  ],
  [
    "guilin-park",
    "桂林公园",
    121.417923,
    31.165225,
    "park",
    [["poem", "桂林秋香笺", "古典园林、桂花与社区游园生活，为徐汇中部留下一处安静的日常花园。"]],
  ],
  [
    "huangdaopo",
    "黄道婆纪念馆",
    121.449173,
    31.124244,
    "culture",
    [
      ["seed", "乌泥泾棉种", "纺织技艺与劳动史让华泾不只是城市边缘，也是一段江南生产文明的现场。"],
      ["photo", "纺车纹样照", "非遗记忆通过器物、纹样和社区活动继续被年轻人看见。"],
    ],
  ],
  [
    "natural-art-park",
    "西岸自然艺术公园",
    121.451588,
    31.106058,
    "park",
    [
      ["seed", "城市荒野籽", "森林、昆虫观察与儿童友好空间让徐汇南部拥有可参与的自然课堂。"],
      ["postcard", "华泾会客卡", "公园把亲子活动、非遗手作与社区休闲放进同一片开放绿地。"],
    ],
  ],
]);

const HUANGPU = sites("shanghai-huangpu", "黄浦区", [
  [
    "bund-chenyi",
    "外滩·陈毅广场",
    121.4972,
    31.2403,
    "culture",
    [
      ["postcard", "万国建筑来信", "滨江天际线与历史建筑群把上海开埠以来的城市尺度集中在一段步行线上。"],
      ["voice", "黄浦江汽笛", "江风、轮渡和船鸣让外滩不只是一张照片，也是一处持续运转的城市岸线。"],
    ],
  ],
  ["nanjing-road", "南京路步行街", 121.4804, 31.2381, "neighborhood", [["ticket", "霓虹漫步票", "百货、老字号与夜间街景共同保存上海商业街不断更新的公共记忆。"]]],
  ["peoples-square", "人民广场·上海博物馆", 121.4814, 31.2347, "culture", [["nameplate", "城市中央展签", "博物馆、剧院与市民广场在城市中心组成人人都能进入的文化客厅。"]]],
  ["yuyuan", "豫园·城隍庙", 121.4989, 31.2274, "culture", [["ribbon", "九曲桥灯结", "园林、庙市与街巷商业让上海老城厢的江南生活仍然可走、可看、可尝。"]]],
  ["xintiandi", "新天地·石库门街区", 121.4753, 31.2222, "neighborhood", [["photo", "石库门门牌", "里弄住宅的空间语言被重新使用，也提醒人们继续阅读周围真实社区。"]]],
  ["sinan-mansions", "思南公馆", 121.4694, 31.2185, "culture", [["postcard", "思南梧桐信", "花园住宅、文学活动与街区漫步共同构成尺度安静的历史风貌片区。"]]],
  ["power-station-art", "上海当代艺术博物馆", 121.4972, 31.1993, "culture", [["ticket", "烟囱展览票", "旧电厂被转化为公共美术馆，让工业遗存继续生产新的城市想象。"]]],
  ["world-expo-museum", "世博会博物馆", 121.4861, 31.1972, "culture", [["photo", "世博时间舱", "历届世博的城市实验与全球交流被保存为理解现代生活的一条长线索。"]]],
]);

const CHANGNING = sites("shanghai-changning", "长宁区", [
  [
    "zhongshan-park",
    "中山公园",
    121.4243,
    31.2244,
    "park",
    [
      ["postcard", "梧桐草坪卡", "大型城市公园连接商业、地铁与社区，为高密度城区留下可以放慢脚步的绿心。"],
      ["seed", "百年悬铃木种", "老树与日常游园活动共同记录长宁不断变化的生活半径。"],
    ],
  ],
  ["yuyuan-road", "愚园路历史风貌区", 121.429, 31.2216, "neighborhood", [["postcard", "愚园路门牌", "弄堂、花园住宅与小店把历史建筑重新接回今天的社区日常。"]]],
  ["columbia-circle", "上生·新所", 121.4316, 31.2115, "culture", [["photo", "泳池蓝晒", "近代公共建筑与当代文化活动在开放街区里形成可停留的城市更新样本。"]]],
  ["shanghai-zoo", "上海动物园", 121.368, 31.1988, "park", [["ticket", "动物邻居票", "城市动物园同时承担物种保护、自然教育与几代上海人的家庭记忆。"]]],
  ["liu-haisu-museum", "刘海粟美术馆", 121.415, 31.2162, "culture", [["nameplate", "海粟画室签", "现代美术收藏、研究与公共展览为虹桥路沿线增加稳定的艺术坐标。"]]],
  ["hongqiao-art-center", "虹桥艺术中心", 121.3812, 31.207, "culture", [["ticket", "虹桥演出票", "剧场与影院让西部社区在日常通勤之外拥有共享的夜间文化生活。"]]],
  ["ecupl-suzhou-creek", "华东政法大学长宁校区", 121.4168, 31.2265, "culture", [["ribbon", "苏河校园带", "历史校园面向苏州河开放，让教育建筑与滨水公共空间彼此连通。"]]],
  ["xinhua-road", "新华路历史风貌区", 121.4263, 31.2076, "neighborhood", [["photo", "外国弄堂窗影", "多样住宅建筑、支路与树荫保存长宁细密而宜步行的街区肌理。"]]],
]);

const JINGAN = sites("shanghai-jingan", "静安区", [
  [
    "natural-history-museum",
    "上海自然博物馆",
    121.4692,
    31.2389,
    "culture",
    [
      ["ticket", "自然史入场券", "从生命演化到上海本地生态，博物馆把宏大的自然时间带进城市中心。"],
      ["seed", "城市自然种", "场馆与静安雕塑公园相连，让知识可以继续生长到户外。"],
    ],
  ],
  ["jingan-temple", "静安寺", 121.4522, 31.2297, "culture", [["ribbon", "金顶钟声结", "古寺与现代商业天际线紧邻，显出上海时间层叠最鲜明的城市切面。"]]],
  ["exhibition-center", "上海展览中心", 121.4584, 31.2288, "culture", [["photo", "中央大厅影", "大型展览建筑和持续发生的公共活动保存上海会展文化的重要一页。"]]],
  ["zhangyuan", "张园", 121.4617, 31.2347, "neighborhood", [["postcard", "石库门会客卡", "保护修缮后的里弄重新开放，让商业更新与建筑细节接受城市共同检验。"]]],
  ["sihang-warehouse", "四行仓库抗战纪念馆", 121.4758, 31.2441, "culture", [["nameplate", "仓库纪念签", "战争遗址、人物与苏州河岸线共同承担面向今天的城市记忆教育。"]]],
  ["suhewan-green", "苏河湾万象天地·慎余里", 121.478, 31.247, "neighborhood", [["postcard", "苏河湾更新卡", "历史里弄、公共绿地与新城市功能在苏州河转弯处重新组织。"]]],
  ["daning-park", "大宁公园", 121.447, 31.2777, "park", [["seed", "北城湿地籽", "开阔水面、林地与运动空间为北部高密度社区提供连续绿地。"]]],
  ["circus-world", "上海马戏城", 121.4493, 31.2793, "culture", [["ticket", "杂技夜场票", "长期演出把身体技巧、舞台技术与城市夜生活组合成鲜明的文化地标。"]]],
]);

const PUTUO = sites("shanghai-putuo", "普陀区", [
  [
    "m50",
    "M50创意园",
    121.4493,
    31.2485,
    "culture",
    [
      ["photo", "纺织厂工作照", "旧工业空间容纳画廊、工作室与设计机构，让苏州河工业记忆继续被使用。"],
      ["postcard", "莫干山路展讯", "密集的小型艺术空间适合让不同创作者和来访者不断交换线索。"],
    ],
  ],
  ["changfeng-park", "长风公园", 121.3958, 31.2246, "park", [["postcard", "银锄湖游船卡", "湖面、草地与家庭活动构成普陀西部重要的全天候公共绿地。"]]],
  ["zhenru-temple", "真如寺·真如古镇", 121.4075, 31.2562, "culture", [["ribbon", "古银杏祈愿结", "元代寺院、古树与仍在生活的街区保留普陀更早的市镇时间。"]]],
  ["taopu-green", "桃浦中央绿地", 121.3539, 31.2825, "park", [["seed", "工业更新草籽", "大尺度生态修复把旧工业片区转换为新社区共享的绿色基础设施。"]]],
  ["mengqing-garden", "苏州河梦清园", 121.4366, 31.2515, "park", [["voice", "河湾水声", "工业遗迹、水环境展示与滨河步道共同讲述苏州河的治理过程。"]]],
  ["gu-zhenghong", "顾正红纪念馆", 121.4227, 31.2473, "culture", [["nameplate", "工人运动纪念签", "个人生命与上海工人运动历史在旧工业社区中获得具体坐标。"]]],
  ["ecnu-putuo", "华东师范大学普陀校区", 121.4073, 31.2292, "culture", [["postcard", "丽娃河校园信", "校园、河流与苏州河共同形成兼具教育记忆和社区开放性的空间。"]]],
  ["huxi-palace", "沪西工人文化宫", 121.411, 31.251, "culture", [["ticket", "工人剧场票", "公共文化服务让劳动者的学习、娱乐与社交在城市更新中继续有位置。"]]],
]);

const HONGKOU = sites("shanghai-hongkou", "虹口区", [
  [
    "north-bund",
    "北外滩滨江",
    121.501,
    31.2532,
    "park",
    [
      ["postcard", "航运天际线卡", "滨江公共空间把邮轮、航运历史与陆家嘴对岸的城市景观连接起来。"],
      ["voice", "提篮桥江风", "江风穿过老码头和新街区，为北外滩保留开放而真实的岸线声音。"],
    ],
  ],
  ["jewish-refugees", "上海犹太难民纪念馆", 121.512, 31.2596, "culture", [["nameplate", "方舟纪念签", "历史建筑与档案记录上海接纳犹太难民的城市记忆和普通人的互助。"]]],
  ["old-millfun-1933", "1933老场坊", 121.4917, 31.2609, "culture", [["photo", "混凝土廊桥照", "独特工业建筑被转化为文化空间，保留虹口曾经密集的生产网络。"]]],
  ["luxun-park", "鲁迅公园", 121.4854, 31.2734, "park", [["postcard", "甜爱路公园信", "纪念、体育、音乐与周边社区生活在一座百年公园里自然交汇。"]]],
  ["luxun-memorial", "上海鲁迅纪念馆", 121.485, 31.2717, "culture", [["nameplate", "文学手稿签", "作品、手稿与上海生活轨迹让现代文学史成为可以步入的城市地图。"]]],
  ["duolun-road", "多伦路文化名人街", 121.4824, 31.267, "neighborhood", [["postcard", "左联街巷笺", "短街连接文学旧址、海派建筑与社区日常，适合以步行方式阅读。"]]],
  ["postal-museum", "上海邮政博物馆", 121.488, 31.2504, "culture", [["ticket", "邮政大楼寄件单", "通信技术、城市网络与苏州河地标建筑共同讲述信息如何抵达每个人。"]]],
  ["music-valley", "上海音乐谷", 121.4926, 31.2683, "culture", [["voice", "虹口音乐样带", "音乐产业、演出空间与老厂房在街区尺度里形成持续发生的声音网络。"]]],
]);

const YANGPU = sites("shanghai-yangpu", "杨浦区", [
  [
    "yangpu-riverside",
    "杨浦滨江人民城市建设规划展示馆",
    121.5408,
    31.2703,
    "culture",
    [
      ["postcard", "人民城市岸线卡", "工业遗产、社区生活与连续滨水空间共同展示从生产岸线到生活岸线的转变。"],
      ["photo", "滨江锈色底片", "保留下来的吊车、栈桥和厂房让更新后的公共空间仍能看见劳动历史。"],
    ],
  ],
  ["yangshupu-waterworks", "杨树浦水厂栈桥", 121.5453, 31.266, "culture", [["photo", "水厂塔影", "百年市政设施与滨江步道相邻，提醒城市日常依赖看不见的公共系统。"]]],
  ["power-plant-ruins", "杨树浦电厂遗迹公园", 121.558, 31.275, "park", [["ribbon", "煤运廊道带", "电厂遗存被转译为开放绿地，让能源工业的尺度进入市民漫步。"]]],
  ["fudan-handan", "复旦大学邯郸校区", 121.5094, 31.302, "culture", [["postcard", "相辉堂校园信", "大学校园、学术传统与五角场社区共同形成杨浦最稳定的知识节点。"]]],
  ["tongji-siping", "同济大学四平路校区", 121.509, 31.2837, "culture", [["nameplate", "建筑课堂签", "建筑、城市规划与工程教育在校园中持续参与上海的空间实践。"]]],
  ["wujiaochang", "五角场", 121.521, 31.3035, "neighborhood", [["ticket", "环岛会面票", "商业、大学与交通在大型城市环岛交汇，是观察杨浦青年生活的窗口。"]]],
  ["university-road", "大学路", 121.5138, 31.3024, "neighborhood", [["postcard", "大学路交换卡", "小店、创意工作与校园人群让短街成为知识与日常相遇的公共客厅。"]]],
  ["fashion-center", "上海国际时尚中心", 121.572, 31.2803, "culture", [["photo", "国棉十七厂影", "老纺织厂房被改造为时尚与展览空间，延续杨浦工业建筑的集体记忆。"]]],
]);

const PUDONG = sites("shanghai-pudong", "浦东新区", [
  [
    "lujiazui",
    "陆家嘴中心绿地",
    121.5056,
    31.2396,
    "park",
    [
      ["postcard", "金融天际线卡", "中心绿地让超高层建筑之间保留可停留、可观察城市尺度的公共地面。"],
      ["photo", "浦东三件套合影", "快速生长的天际线已经成为理解浦东开发开放最直观的一组城市符号。"],
    ],
  ],
  ["museum-of-art-pudong", "浦东美术馆", 121.5029, 31.2363, "culture", [["ticket", "江景展览票", "国际展览、镜厅与滨江视线把艺术观看和上海城市景观叠在一起。"]]],
  ["shanghai-museum-east", "上海博物馆东馆", 121.556, 31.2288, "culture", [["nameplate", "东馆文物签", "大型新馆扩展公共文化容量，也让浦东形成面向全城的博物馆集群。"]]],
  ["expo-culture-park", "上海世博文化公园", 121.4909, 31.1857, "park", [["seed", "温室花园种", "世博遗存、城市森林与大型温室在黄浦江东岸组成新的生态文化空间。"]]],
  ["new-bund-park", "前滩休闲公园", 121.4748, 31.1558, "sports", [["ribbon", "前滩慢行带", "连续江岸、运动设施与社区生活让浦东南部拥有全天候公共活动界面。"]]],
  ["science-museum", "上海科技馆", 121.5476, 31.224, "culture", [["ticket", "科学实验票", "大型科普场馆把自然、工程与互动体验带入家庭和学校的城市日常。"]]],
  ["century-park", "世纪公园", 121.5551, 31.2172, "park", [["voice", "城市绿肺声景", "大尺度草坪、水面与林地为浦东中心城区提供季节和候鸟的稳定坐标。"]]],
  ["library-east", "上海图书馆东馆", 121.5574, 31.2225, "culture", [["postcard", "东馆阅读卡", "开放阅读空间、展览与公共学习让大型图书馆成为城市知识客厅。"]]],
  ["zhangjiang-science-city", "张江科学会堂", 121.5996, 31.2019, "culture", [["nameplate", "科学城工作签", "实验室、产业与公共交流空间在张江组成面向未来的知识生产网络。"]]],
  ["new-international-expo", "上海新国际博览中心", 121.5581, 31.2118, "culture", [["ticket", "国际展会证", "持续到来的行业展会让浦东与全球技术、贸易和设计保持高频连接。"]]],
  ["chuansha-old-town", "川沙古镇", 121.7064, 31.1872, "neighborhood", [["postcard", "川沙营造馆家书", "古城墙、名人故居与老街补足浦东并非只有新城的一层地方历史。"]]],
  ["disney-resort", "上海迪士尼度假区", 121.6676, 31.1496, "culture", [["ticket", "奇想入园券", "主题叙事、表演与家庭旅行在这里形成高密度的共同想象和节日感。"]]],
  ["wild-animal-park", "上海野生动物园", 121.7289, 31.0583, "park", [["ticket", "动物保育票", "大尺度动物园承担物种保护、科普和城市家庭接近自然的入口。"]]],
  ["dishui-lake", "滴水湖环湖景观带", 121.9326, 30.9023, "park", [["ribbon", "临港环湖带", "人工湖、新城公共空间与海风共同构成上海东南端鲜明的未来城市界面。"]]],
  ["astronomy-museum", "上海天文馆", 121.9254, 30.9143, "culture", [["ticket", "宇宙观测票", "大型天文馆让行星、引力和人类探索成为临港面向全城的科学体验。"]]],
  ["maritime-museum", "中国航海博物馆", 121.9263, 30.9149, "culture", [["photo", "远洋船模照", "航海技术、港口与海洋文化让临港的空间使命获得更长历史背景。"]]],
]);

const MINHANG = sites("shanghai-minhang", "闵行区", [
  [
    "qibao",
    "七宝古镇",
    121.3562,
    31.1578,
    "culture",
    [
      ["postcard", "蒲汇塘桥信", "水巷、老街与地方小吃保存上海西南市镇的步行尺度和生活味道。"],
      ["voice", "七宝皮影声", "非遗表演与民间工艺让古镇不只保留立面，也继续产生地方声音。"],
    ],
  ],
  ["pujiang-country-park", "浦江郊野公园", 121.5005, 31.0917, "forest", [["seed", "奇迹花园种", "森林、滨水与主题花园为闵行东部保留大尺度自然教育和周末活动空间。"]]],
  ["minhang-museum", "闵行博物馆", 121.3786, 31.149, "culture", [["ticket", "马桥文化展签", "地方考古、民族乐器与城市发展史为快速变化的闵行建立公共记忆。"]]],
  ["minhang-culture-park", "闵行文化公园", 121.385, 31.154, "park", [["postcard", "城市舞台卡", "博物馆、剧院与公园步道集中在一起，形成服务周边社区的文化绿心。"]]],
  ["jinjiang-park", "锦江乐园", 121.414, 31.1405, "culture", [["ticket", "摩天轮旧票", "老牌游乐园记录几代人的城市娱乐记忆，也为南上海夜色留下醒目标志。"]]],
  ["zhaojialou", "召稼楼古镇", 121.5277, 31.0658, "neighborhood", [["postcard", "稻作水乡信", "水网、农耕和市镇生活让浦江地区仍能读到上海乡土生产的历史。"]]],
  ["maqiao-site", "马桥古文化遗址", 121.3718, 31.031, "culture", [["nameplate", "马桥考古签", "遗址把闵行的城市时间向前延伸到数千年前的聚落和生产生活。"]]],
  ["sjtu-minhang", "上海交通大学闵行校区", 121.438, 31.028, "culture", [["postcard", "思源湖校园信", "大学、实验室与闵行产业走廊共同构成上海西南的重要创新社区。"]]],
]);

const BAOSHAN = sites("shanghai-baoshan", "宝山区", [
  [
    "glass-museum",
    "上海玻璃博物馆",
    121.4775,
    31.3224,
    "culture",
    [
      ["ticket", "玻璃熔炉票", "旧玻璃厂被转化为博物馆，让材料科学、工艺与工业建筑共同发光。"],
      ["photo", "窑炉火光照", "现场演示把看不见的制造过程变成适合所有年龄理解的城市课堂。"],
    ],
  ],
  ["gucun-park", "顾村公园", 121.3741, 31.3498, "park", [["seed", "樱花林种", "大尺度森林公园和季节花事为北上海提供稳定的家庭游园目的地。"]]],
  ["paotaiwan", "吴淞炮台湾国家湿地公园", 121.4958, 31.3916, "park", [["voice", "长江口潮声", "滨江湿地、军事遗迹与候鸟共同标记黄浦江汇入长江的地理转折。"]]],
  ["cruise-port", "吴淞口国际邮轮港", 121.5066, 31.3971, "culture", [["ticket", "远洋登船牌", "邮轮、港口与江海交汇把宝山直接连接到更广阔的旅行网络。"]]],
  ["liberation-memorial", "上海解放纪念馆", 121.4943, 31.3889, "culture", [["nameplate", "吴淞战役纪念签", "纪念场馆把上海解放的历史与发生地的江岸空间郑重连接。"]]],
  ["meilan-lake", "美兰湖", 121.3495, 31.3997, "park", [["postcard", "北欧新镇湖卡", "新城公共湖面、居住社区与休闲活动共同构成罗店的日常中心。"]]],
  ["luodian-old-town", "罗店古镇", 121.3562, 31.4167, "neighborhood", [["postcard", "花神堂市镇信", "老街、节俗与水网保存宝山北部市镇在工业化之前的地方性。"]]],
  ["wisdom-bay", "智慧湾科创园", 121.451, 31.3385, "culture", [["photo", "机器人工作照", "旧仓储空间容纳艺术、机器人与公共活动，展示工业片区的新生产方式。"]]],
]);

const JIADING = sites("shanghai-jiading", "嘉定区", [
  [
    "international-circuit",
    "上海国际赛车场",
    121.2255,
    31.3384,
    "sports",
    [
      ["ticket", "上赛道入场券", "世界级汽车赛事、工程技术与观众文化共同塑造嘉定鲜明的速度名片。"],
      ["voice", "引擎声纹", "声音、机械与赛道空间让汽车工业文化获得可被身体感受的城市现场。"],
    ],
  ],
  ["auto-museum", "上海汽车博物馆", 121.1808, 31.2904, "culture", [["photo", "经典车底片", "汽车设计、技术演进与产业历史在安亭形成面向公众的系统叙事。"]]],
  ["confucian-temple", "嘉定孔庙·中国科举博物馆", 121.2516, 31.3885, "culture", [["ticket", "科举试卷签", "古代教育制度、地方文脉与保存完整的建筑群共同构成嘉定老城核心。"]]],
  ["qiuxia-garden", "秋霞圃", 121.2558, 31.3933, "park", [["poem", "秋霞园林笺", "古典园林以小尺度山水连接嘉定老城的季节、书画与日常游园生活。"]]],
  ["guyi-garden", "古猗园", 121.3175, 31.2906, "park", [["ribbon", "翠竹曲廊结", "明代园林、竹景与南翔小笼共同形成上海西北最具辨识度的江南体验。"]]],
  ["nanxiang-old-street", "南翔老街", 121.3156, 31.2991, "neighborhood", [["postcard", "双塔老街信", "古塔、老店和水巷让南翔的地方生活在交通新城旁继续可见。"]]],
  ["yuanxiang-lake", "远香湖", 121.2452, 31.3533, "park", [["voice", "新城湖风", "湖面、图书馆与公共文化设施共同构成嘉定新城可以停留的开放中心。"]]],
  ["poly-theatre", "上海保利大剧院", 121.2472, 31.3477, "culture", [["ticket", "水景剧场票", "大型剧院与远香湖景观相连，为新城提供持续发生的表演艺术生活。"]]],
]);

const JINSHAN = sites("shanghai-jinshan", "金山区", [
  [
    "fengjing",
    "枫泾古镇",
    121.022,
    30.8915,
    "culture",
    [
      ["postcard", "三桥水巷信", "密集河道、桥梁与老街保存上海西南连接江浙的水乡生活和商贸记忆。"],
      ["photo", "枫泾画乡照", "金山农民画与古镇日常相邻，让地方艺术继续从生活场景中生长。"],
    ],
  ],
  ["city-beach", "金山城市沙滩", 121.3465, 30.7297, "sports", [["ticket", "杭州湾海风票", "面向杭州湾的公共海岸让上海获得与江河完全不同的滨海休闲尺度。"]]],
  ["fishing-village", "金山嘴渔村", 121.3717, 30.7139, "neighborhood", [["voice", "渔港潮声", "渔业生产、海鲜饮食与村落生活保存上海少见的海洋文化现场。"]]],
  ["peasant-painting", "中国农民画村", 121.0151, 30.9068, "culture", [["photo", "灶头画色卡", "鲜明色彩和乡村题材让普通人的劳动、节庆与想象成为可共享的地方艺术。"]]],
  ["donglin-temple", "东林寺", 121.1605, 30.896, "culture", [["ribbon", "朱泾钟声结", "古寺与朱泾市镇共同保存金山内陆地区延续数百年的信俗与社区时间。"]]],
  ["langxia-park", "廊下生态园", 121.1705, 30.794, "park", [["seed", "田园稻种", "农业生产、乡村休闲与科普体验让都市边缘的土地继续被理解和使用。"]]],
  ["huakai-haishang", "花开海上生态园", 121.243, 30.817, "park", [["seed", "四季花田种", "大地花田以季节变化组织乡村旅行，为金山中部建立持续更新的物候地标。"]]],
  ["caojing-country-park", "漕泾郊野公园", 121.422, 30.817, "forest", [["voice", "水库村鸟声", "河网、村落与生态修复空间共同展示杭州湾北岸柔软的乡村边界。"]]],
]);

const SONGJIANG = sites("shanghai-songjiang", "松江区", [
  [
    "guangfulin",
    "广富林文化遗址",
    121.2237,
    31.0574,
    "culture",
    [
      ["ticket", "上海之根考古签", "遗址把上海地区数千年的聚落、稻作与文化交流集中呈现在地面之上。"],
      ["photo", "水下展馆倒影", "当代展馆与遗址水面共同建立理解松江历史的鲜明入口。"],
    ],
  ],
  ["sheshan", "佘山国家森林公园", 121.1912, 31.1047, "forest", [["seed", "九峰林种", "上海少见的山地地貌、森林与历史建筑共同提供城市之外的垂直视野。"]]],
  ["chenshan-botanical", "上海辰山植物园", 121.1825, 31.081, "forest", [["seed", "矿坑花园种", "植物保育、科研温室与矿坑花园把生态修复转化为可以亲近的公共体验。"]]],
  ["thames-town", "泰晤士小镇", 121.2069, 31.0422, "neighborhood", [["postcard", "新城街角卡", "异域建筑实验、公共艺术与松江新城生活共同记录一代新城建设想象。"]]],
  ["zuibaichi", "醉白池公园", 121.2302, 31.0107, "park", [["poem", "醉白池诗笺", "古典园林、书画与老城生活保存松江府城安静而细密的一层文化。"]]],
  ["fangta-park", "方塔园", 121.2482, 31.0062, "culture", [["photo", "宋塔园林影", "古塔、照壁与现代园林设计把不同年代的建筑放进同一段游园路径。"]]],
  ["film-park", "上海影视乐园", 121.3116, 30.9958, "culture", [["ticket", "旧上海片场票", "实景片场、电影制作与大众想象让城市记忆以表演方式被不断重建。"]]],
  ["pujiang-head", "浦江之首", 121.187, 30.953, "park", [["voice", "三水汇流声", "多条河流在此汇合成为黄浦江，让上海的母亲河拥有可抵达的地理起点。"]]],
]);

const QINGPU = sites("shanghai-qingpu", "青浦区", [
  [
    "zhujiajiao",
    "朱家角古镇",
    121.059,
    31.113,
    "culture",
    [
      ["postcard", "放生桥水乡信", "河港、古桥、寺庙与仍在营业的店铺共同维持江南水镇真实的生活层。"],
      ["ticket", "课植园游园票", "园林、书院与水路让古镇漫游不仅看街，也能进入更细的文化空间。"],
    ],
  ],
  ["qingxi-country-park", "青西郊野公园", 121.044, 31.027, "forest", [["seed", "水上森林种", "池杉、水网和候鸟栖息地保存淀山湖南部稀有的湿地生态景观。"]]],
  ["grand-view-garden", "上海大观园", 121.0154, 31.0805, "culture", [["ticket", "红楼游园票", "文学想象通过园林、戏曲与节庆活动获得可以行走的空间版本。"]]],
  ["oriental-land", "东方绿舟", 121.0118, 31.1035, "sports", [["ribbon", "淀山湖训练带", "湖滨营地、国防教育与户外运动承载几代上海青少年的集体活动记忆。"]]],
  ["national-exhibition-center", "国家会展中心（上海）", 121.3007, 31.1947, "culture", [["ticket", "四叶草参展证", "大型会展、虹桥枢纽与全球贸易活动在青浦东端形成高密度城市门户。"]]],
  ["panlong-tiandi", "蟠龙天地", 121.286, 31.185, "neighborhood", [["postcard", "蟠龙水岸卡", "江南古镇肌理、公共绿地与当代社区商业在虹桥附近重新组合。"]]],
  ["qingpu-museum", "青浦博物馆", 121.1246, 31.1555, "culture", [["nameplate", "崧泽文化展签", "考古、水乡与区域发展史让青浦作为上海文明源头之一获得完整叙述。"]]],
  ["qushui-garden", "曲水园", 121.1209, 31.1514, "park", [["poem", "曲水廊桥笺", "小型古典园林在青浦老城中保留适合日常进入的江南山水尺度。"]]],
]);

const FENGXIAN = sites("shanghai-fengxian", "奉贤区", [
  [
    "shanghai-fish",
    "上海之鱼·金海湖",
    121.4977,
    30.9181,
    "park",
    [
      ["postcard", "奉贤新城水岸卡", "环湖公园、公共建筑与社区活动共同形成奉贤新城清晰的开放中心。"],
      ["voice", "金海湖晚风", "连续水岸让散步、骑行与夜间社交可以围绕湖面自然发生。"],
    ],
  ],
  ["fengxian-museum", "奉贤区博物馆", 121.506, 30.917, "culture", [["nameplate", "海塘贤文化签", "地方历史、海塘工程与贤文化为滨海新城补上一条清晰的时间线。"]]],
  ["guhua-park", "古华公园", 121.458, 30.9208, "park", [["ribbon", "南桥古桥结", "传统桥梁、亭台与社区游园生活在南桥老城中心持续相遇。"]]],
  ["bihaijinsha", "碧海金沙", 121.5261, 30.8261, "sports", [["ticket", "奉贤海湾票", "人工沙滩、水上活动与杭州湾视野让南上海拥有明确的滨海度假入口。"]]],
  ["bay-forest", "上海海湾国家森林公园", 121.6764, 30.8385, "forest", [["seed", "海湾森林种", "大面积人工林、湿地和鸟类栖息空间共同构成奉贤东部生态屏障。"]]],
  ["zhuangxing", "花米庄行景区", 121.406, 30.888, "neighborhood", [["seed", "庄行菜花种", "农业、非遗与乡村节庆让奉贤西部的生产景观转化为可参与的地方体验。"]]],
  ["nine-trees", "九棵树未来艺术中心", 121.475, 30.945, "culture", [["ticket", "森林剧场票", "剧院嵌入林地，尝试让表演艺术、自然和新城公共文化在同一场景中发生。"]]],
  ["fengpu-four-seasons", "奉浦四季生态园", 121.448, 30.933, "park", [["postcard", "社区四季卡", "花园、步道与邻近居住区共同承担南桥北部的日常休闲和物候观察。"]]],
]);

const CHONGMING = sites("shanghai-chongming", "崇明区", [
  [
    "dongtan-wetland",
    "东滩湿地",
    121.9766,
    31.5215,
    "forest",
    [
      ["voice", "候鸟迁徙声", "长江口潮滩是东亚候鸟迁徙网络的重要停歇地，也是理解上海生态边界的入口。"],
      ["seed", "盐沼植物种", "潮汐、芦苇与盐生植物共同记录陆地仍在河口缓慢生长的过程。"],
    ],
  ],
  ["xisha-wetland", "西沙明珠湖景区", 121.264, 31.725, "park", [["postcard", "落日栈桥卡", "湖泊、潮沟和湿地栈道让崇明西部拥有安静而开阔的生态游览线路。"]]],
  ["dongping-forest", "东平国家森林公园", 121.4787, 31.6876, "forest", [["seed", "杉林露营种", "岛屿中部的大型森林为骑行、自然教育和家庭活动提供稳定绿心。"]]],
  ["mingzhu-lake", "明珠湖", 121.264, 31.715, "park", [["voice", "湖岛水鸟声", "淡水湖面、林带与乡村共同保存崇明西部舒缓的岛屿生活节奏。"]]],
  ["changxing-country-park", "长兴岛郊野公园", 121.707, 31.383, "park", [["seed", "橘园果种", "柑橘农业、乡野步道与亲子活动让工业岛仍保留可进入的生产景观。"]]],
  ["qianwei-village", "前卫生态村", 121.44, 31.707, "neighborhood", [["postcard", "生态岛村信", "村庄实验记录崇明如何把农业、循环利用与乡村旅游组合成日常实践。"]]],
  ["chongming-academy", "崇明学宫", 121.4076, 31.6291, "culture", [["nameplate", "瀛洲文脉签", "古代学宫和地方博物展示为县城保存一处清晰的人文时间坐标。"]]],
  ["flower-expo-park", "光明花博邨·花博文化园", 121.479, 31.691, "park", [["seed", "花岛更新种", "花博会留下的园区继续承载园艺展示、乡村休闲与生态岛的季节活动。"]]],
]);

const REGION_SCENE_ZOOM = 17.2;

export const SHANGHAI_GARDEN_REGIONS: readonly ShanghaiGardenRegion[] = [
  {
    id: "shanghai-huangpu",
    label: "黄浦",
    center: HUANGPU[0].position,
    zoom: REGION_SCENE_ZOOM,
    sites: HUANGPU,
  },
  {
    id: "shanghai-xuhui",
    label: "徐汇",
    center: XUHUI[0].position,
    zoom: REGION_SCENE_ZOOM,
    sites: XUHUI,
  },
  {
    id: "shanghai-changning",
    label: "长宁",
    center: CHANGNING[0].position,
    zoom: REGION_SCENE_ZOOM,
    sites: CHANGNING,
  },
  {
    id: "shanghai-jingan",
    label: "静安",
    center: JINGAN[0].position,
    zoom: REGION_SCENE_ZOOM,
    sites: JINGAN,
  },
  {
    id: "shanghai-putuo",
    label: "普陀",
    center: PUTUO[0].position,
    zoom: REGION_SCENE_ZOOM,
    sites: PUTUO,
  },
  {
    id: "shanghai-hongkou",
    label: "虹口",
    center: HONGKOU[0].position,
    zoom: REGION_SCENE_ZOOM,
    sites: HONGKOU,
  },
  {
    id: "shanghai-yangpu",
    label: "杨浦",
    center: YANGPU[0].position,
    zoom: REGION_SCENE_ZOOM,
    sites: YANGPU,
  },
  {
    id: "shanghai-pudong",
    label: "浦东",
    center: PUDONG[0].position,
    zoom: REGION_SCENE_ZOOM,
    sites: PUDONG,
  },
  {
    id: "shanghai-minhang",
    label: "闵行",
    center: MINHANG[0].position,
    zoom: REGION_SCENE_ZOOM,
    sites: MINHANG,
  },
  {
    id: "shanghai-baoshan",
    label: "宝山",
    center: BAOSHAN[0].position,
    zoom: REGION_SCENE_ZOOM,
    sites: BAOSHAN,
  },
  {
    id: "shanghai-jiading",
    label: "嘉定",
    center: JIADING[0].position,
    zoom: REGION_SCENE_ZOOM,
    sites: JIADING,
  },
  {
    id: "shanghai-jinshan",
    label: "金山",
    center: JINSHAN[0].position,
    zoom: REGION_SCENE_ZOOM,
    sites: JINSHAN,
  },
  {
    id: "shanghai-songjiang",
    label: "松江",
    center: SONGJIANG[0].position,
    zoom: REGION_SCENE_ZOOM,
    sites: SONGJIANG,
  },
  {
    id: "shanghai-qingpu",
    label: "青浦",
    center: QINGPU[0].position,
    zoom: REGION_SCENE_ZOOM,
    sites: QINGPU,
  },
  {
    id: "shanghai-fengxian",
    label: "奉贤",
    center: FENGXIAN[0].position,
    zoom: REGION_SCENE_ZOOM,
    sites: FENGXIAN,
  },
  {
    id: "shanghai-chongming",
    label: "崇明",
    center: CHONGMING[0].position,
    zoom: REGION_SCENE_ZOOM,
    sites: CHONGMING,
  },
];

export const SHANGHAI_GIANT_FLOWER_SITES: readonly GiantFlowerGardenSite[] =
  SHANGHAI_GARDEN_REGIONS.flatMap((region) => region.sites);

export const SHANGHAI_OVERVIEW_CENTER: [number, number] = [121.47, 31.19];
export const SHANGHAI_OVERVIEW_ZOOM = 8.75;
