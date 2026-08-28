import type { GiantFlowerGardenSite } from "../grove";
import { isAmapMapAdmitted, resolveAmapVerifiedPosition } from "../amapCoordinateOverrides";
import { GONGSHU_GIANT_FLOWER_SITES } from "./gongshu";

export type HangzhouGardenRegion = {
  id: string;
  label: string;
  center: [number, number];
  zoom: number;
  sites: readonly GiantFlowerGardenSite[];
};

type SiteSeed = readonly [
  id: string,
  name: string,
  lng: number,
  lat: number,
  category: GiantFlowerGardenSite["category"],
  kind: GiantFlowerGardenSite["hangings"][number]["kind"],
  label: string,
  note: string,
];

const ACCENTS = [
  "#397560",
  "#d26a37",
  "#745ca8",
  "#b64232",
  "#3575a8",
  "#9a7134",
  "#a34e6f",
  "#487d4b",
] as const;

function sites(
  districtId: string,
  district: string,
  seeds: readonly SiteSeed[],
): GiantFlowerGardenSite[] {
  return seeds.filter(([id]) => isAmapMapAdmitted("map-hangzhou-public-garden", id)).map(
    ([id, name, lng, lat, category, kind, label, note], index) => ({
      id,
      name,
      district,
      districtId,
      position: resolveAmapVerifiedPosition(
        "map-hangzhou-public-garden",
        id,
        [lng, lat],
      ),
      category,
      hangings: [
        {
          kind,
          label,
          note,
          accent: ACCENTS[index % ACCENTS.length],
        },
      ],
      scale: index === 0 ? 1.02 : undefined,
    }),
  );
}

const SHANGCHENG = sites("shangcheng", "上城区", [
  ["hubin", "湖滨步行街", 120.1648, 30.2558, "neighborhood", "postcard", "湖岸来信", "城市商业界面在这里与西湖景观直接相接。"],
  ["qinghefang", "清河坊历史街区", 120.1692, 30.2413, "culture", "ticket", "坊巷票根", "南宋以来的街巷尺度仍适合步行、停留与交换故事。"],
  ["deshou-palace", "南宋德寿宫遗址博物馆", 120.1771, 30.2428, "culture", "photo", "宫墙叠影", "遗址、博物馆与当代街区在同一处叠合。"],
  ["wushan", "吴山城隍阁", 120.1627, 30.2377, "culture", "poem", "吴山眺望笺", "从山城交界处辨认杭州旧城的屋顶与街巷。"],
  ["hu-xueyan", "胡雪岩故居", 120.172, 30.2352, "culture", "photo", "宅园窗影", "宅园空间保存晚清城市生活与营造技艺。"],
  ["baguatian", "八卦田遗址公园", 120.153, 30.2117, "park", "seed", "南宋稻种", "农耕遗址让城市南缘仍能读到土地秩序。"],
  ["southern-song-kiln", "南宋官窑博物馆", 120.1512, 30.2085, "culture", "ticket", "青瓷火签", "官窑遗址把泥土、火与审美留在钱塘江北岸。"],
  ["city-balcony", "钱江新城城市阳台", 120.2142, 30.2455, "park", "voice", "江潮声样", "城市新中轴在这里面向钱塘江开放。"],
]);

const XIHU = sites("xihu", "西湖区", [
  ["lingyin", "灵隐寺", 120.1012, 30.2409, "culture", "ribbon", "灵隐风结", "山谷、寺院与古树共同形成杭州最深的静谧界面。"],
  ["feilai-peak", "飞来峰", 120.1027, 30.2378, "culture", "photo", "石刻拓影", "摩崖造像把山体本身变成可阅读的历史。"],
  ["xixi", "西溪国家湿地公园", 120.0674, 30.2697, "forest", "voice", "芦荡声景", "河汊、芦荡与村落保存了稀有的城市湿地生活。"],
  ["longjing", "龙井村", 120.1113, 30.2236, "forest", "seed", "狮峰茶种", "茶园把山地生产、季节气味和村落日常连在一起。"],
  ["meijiawu", "梅家坞茶文化村", 120.0979, 30.2049, "forest", "postcard", "茶山来信", "茶园步道适合让访客与当地生活慢慢相遇。"],
  ["jiuxi", "九溪烟树", 120.1194, 30.2029, "forest", "photo", "九溪水影", "溪流、林荫和山路构成杭州代表性的步行体验。"],
  ["liuhe-pagoda", "六和塔", 120.1267, 30.1995, "culture", "poem", "镇潮诗笺", "古塔在山江交界处记录钱塘潮与城市航路。"],
  ["xiangshan", "中国美术学院象山校区", 120.0787, 30.1578, "culture", "postcard", "象山草图", "建筑、山水与艺术教育在开放校园里彼此穿插。"],
]);

const BINJIANG = sites("binjiang", "滨江区", [
  ["white-horse-lake", "白马湖生态创意城", 120.201, 30.1644, "park", "postcard", "白马湖漫游卡", "湖区把动漫、创意产业与湿地公共空间放在一起。"],
  ["animation-museum", "中国动漫博物馆", 120.2017, 30.1658, "culture", "ticket", "动画入场券", "中国动漫记忆在这里转化为可参与的城市文化。"],
  ["wentao-road", "闻涛路最美跑道", 120.2077, 30.1983, "sports", "ribbon", "江风跑带", "连续滨江慢行空间让运动、观潮和社交自然发生。"],
  ["xixing", "西兴古镇", 120.1955, 30.1876, "culture", "ticket", "过塘行票", "浙东运河起点保留了过塘行与水陆转运的记忆。"],
  ["changhe", "长河老街", 120.191, 30.1793, "neighborhood", "postcard", "槐街家书", "老街仍以生活尺度连接宗祠、店铺和居民日常。"],
  ["star-avenue", "星光大道", 120.2109, 30.2083, "neighborhood", "photo", "星光快照", "产业社区需要一处能在下班后继续停留的公共客厅。"],
  ["binjiang-park", "滨江公园", 120.2058, 30.2107, "park", "voice", "潮汐录音", "江岸草坡是观察潮汐、天际线与城市夜色的前排座位。"],
  ["guanshan", "冠山公园", 120.1834, 30.1541, "forest", "seed", "冠山野籽", "低山绿地为高密度城区保留了连续的自然入口。"],
]);

const XIAOSHAN = sites("xiaoshan", "萧山区", [
  ["xianghu", "湘湖国家旅游度假区", 120.2248, 30.1548, "park", "postcard", "湘湖水色卡", "湖山、村落与考古遗址共同构成杭州南部的文化客厅。"],
  ["kuahuqiao", "跨湖桥遗址博物馆", 120.2158, 30.1435, "culture", "ticket", "独木舟票根", "八千年独木舟让湘湖的水上生活获得更长时间尺度。"],
  ["tourism-museum", "世界旅游博物馆", 120.2261, 30.1453, "culture", "postcard", "远行护照", "世界旅行经验在湘湖边变成可交流的公共知识。"],
  ["qianjiang-century", "钱江世纪公园", 120.2477, 30.244, "park", "voice", "世纪江风", "新城公园承接大型活动，也服务普通人的日常散步。"],
  ["olympic-lotus", "杭州奥体中心", 120.2194, 30.2394, "sports", "ticket", "大莲花赛票", "亚运场馆已成为钱塘江两岸共享的新城市地标。"],
  ["east-canal", "浙东运河萧山展示馆", 120.265, 30.178, "canal", "ribbon", "运河纤绳", "古运河把萧山与更广阔的江南交通网络连接起来。"],
  ["yaqian", "衙前农民运动纪念馆", 120.3769, 30.1814, "culture", "photo", "衙前旧照", "近代乡村社会行动在这里留下清晰的公共记忆。"],
  ["louta", "楼塔古镇", 120.1914, 29.9514, "neighborhood", "postcard", "楼塔家书", "浦阳江上游的古镇保留山地聚落和乡土节庆。"],
]);

const YUHANG = sites("yuhang", "余杭区", [
  ["liangzhu-city", "良渚古城遗址公园", 119.9904, 30.3956, "culture", "seed", "良渚稻种", "水利、稻作与古城共同呈现五千年前的文明组织力。"],
  ["liangzhu-museum", "良渚博物院", 120.0232, 30.3797, "culture", "ticket", "玉鸟入场券", "玉器与考古叙事让古城经验更容易被今天理解。"],
  ["national-archives", "杭州国家版本馆", 120.0128, 30.3842, "culture", "postcard", "文润版本笺", "版本收藏以当代建筑重新连接典籍与江南山水。"],
  ["pingyao", "瓶窑老街", 119.9768, 30.3902, "neighborhood", "postcard", "窑火街信", "老街承接良渚文化之外持续生长的市镇生活。"],
  ["jingshan", "径山寺", 119.7804, 30.3837, "forest", "ribbon", "径山茶结", "山寺、茶宴与古道共同形成余杭西部的人文路径。"],
  ["shuangxi", "双溪竹海", 119.7876, 30.4304, "forest", "voice", "竹海风声", "竹林溪谷让山地生态与亲水体验相互靠近。"],
  ["dream-town", "梦想小镇", 120.0012, 30.2828, "neighborhood", "ticket", "创业工牌", "仓前水乡肌理与青年创新社区在这里并置。"],
  ["nanhu", "南湖公园", 119.9437, 30.2752, "park", "photo", "南湖天光", "城市发展边缘仍需要宽阔水面与候鸟停留地。"],
]);

const LINPING = sites("linping", "临平区", [
  ["chaoshan", "超山风景名胜区", 120.1855, 30.4145, "forest", "photo", "十里梅影", "古梅、山寺与江南园林组成杭州重要的早春花事。"],
  ["tangqi", "塘栖古镇", 120.1924, 30.4564, "canal", "ticket", "广济桥船票", "京杭运河沿岸的廊檐、桥梁和水市仍可连续阅读。"],
  ["linping-park", "临平公园", 120.3024, 30.4275, "park", "ribbon", "东来阁风带", "城市山体提供俯瞰临平新旧空间的公共视角。"],
  ["linping-museum", "临平博物馆", 120.3074, 30.4166, "culture", "ticket", "水乡展签", "地方馆把运河、水乡与区域变迁收束为一条时间线。"],
  ["yishang", "艺尚小镇", 120.2988, 30.3948, "neighborhood", "photo", "时装街拍", "设计产业与街区公共空间在这里形成可见的城市舞台。"],
  ["dinghe", "丁山湖湿地", 120.2218, 30.4305, "park", "voice", "水鸟声样", "运河边的湿地为临平留下更柔软的生态边界。"],
  ["gaodi", "临平山绿道", 120.297, 30.429, "sports", "ribbon", "山径里程带", "环山步道把社区运动和城市观景串成一圈。"],
  ["yunhe", "运河街道水乡", 120.257, 30.472, "canal", "postcard", "水乡来信", "稻田、河港与村落保留运河北岸的生产景观。"],
]);

const QIANTANG = sites("qiantang", "钱塘区", [
  ["jinsha-lake", "金沙湖公园", 120.3227, 30.3073, "park", "postcard", "金沙湖晚风", "人工湖已成为下沙高密度城区的共享客厅。"],
  ["grand-theatre", "金沙湖大剧院", 120.327, 30.3062, "culture", "ticket", "湖畔演出票", "大型文化设施让大学城与产业新城拥有夜间公共生活。"],
  ["university-town", "下沙大学城", 120.3512, 30.3162, "neighborhood", "postcard", "青年交换卡", "密集校园为跨专业、跨城市的青年社交提供土壤。"],
  ["riverfront", "下沙沿江景观带", 120.3527, 30.2786, "sports", "voice", "江堤风声", "宽阔江堤适合骑行、观潮与观看城市日出。"],
  ["dongwan", "东湾湿地", 120.467, 30.309, "park", "seed", "滩涂草籽", "钱塘江东部滩涂为迁徙水鸟保留停歇空间。"],
  ["jianghai", "江海湿地", 120.538, 30.2705, "park", "voice", "江海潮声", "江、海、围垦地在此交汇，呈现钱塘独特地貌。"],
  ["yipeng", "义蓬老街", 120.488, 30.279, "neighborhood", "postcard", "沙地家书", "老街记录围垦人群如何在沙地上建立日常生活。"],
  ["reclamation", "大江东围垦文化园", 120.56, 30.25, "culture", "photo", "围垦群像", "围垦史让新区宏大尺度背后的人与劳动被看见。"],
]);

const FUYANG = sites("fuyang", "富阳区", [
  ["huang-gongwang", "黄公望隐居地", 119.9465, 30.0664, "forest", "poem", "富春山居笺", "画史、山林与真实地貌在此互相校照。"],
  ["dongziguan", "东梓关村", 119.8376, 29.9986, "neighborhood", "postcard", "江边村信", "富春江古渡与当代乡村住宅形成新旧共生样本。"],
  ["longmen", "龙门古镇", 119.9586, 29.9068, "culture", "ticket", "卵石巷票", "宗族聚落、溪渠和卵石街巷保存江南山村结构。"],
  ["yangpi-lake", "阳陂湖湿地公园", 119.932, 30.101, "park", "seed", "湖田种子", "生态修复让消失多年的湖泊重新进入城市生活。"],
  ["stork-mountain", "鹳山", 119.9559, 30.0491, "forest", "poem", "春江眺望笺", "临江小山是理解富春江城关系的天然看台。"],
  ["xinsha", "新沙岛", 119.9692, 30.0383, "park", "ribbon", "渡船风带", "江心洲把渡船、田园和露营体验留在城市近旁。"],
  ["fuchun-taoyuan", "富春桃源", 119.812, 29.955, "forest", "seed", "山坞桃核", "溶洞、林地与山村共同构成富春西部的自然入口。"],
  ["longlin-dam", "龙鳞坝", 119.777, 29.957, "park", "voice", "壶源溪声", "亲水设施把乡村溪流变成共享的夏日公共空间。"],
]);

const LINAN = sites("linan", "临安区", [
  ["qingshan-lake", "青山湖国家森林公园", 119.735, 30.242, "forest", "postcard", "水上森林卡", "湖面与池杉林形成临安城市入口最鲜明的生态场景。"],
  ["tianmu", "天目山国家级自然保护区", 119.438, 30.344, "forest", "seed", "古柳杉种", "古树群与生物多样性让山林具有跨越世代的尺度。"],
  ["daming", "大明山", 118.985, 30.043, "forest", "photo", "山巅云影", "高山峡谷为杭州西部提供完全不同的气候与视野。"],
  ["taihuyuan", "太湖源", 119.578, 30.351, "forest", "voice", "源头水声", "清溪与峡谷提示杭州水系如何从山中开始。"],
  ["wuyue", "吴越国王陵考古遗址公园", 119.7158, 30.2267, "culture", "ticket", "吴越纪年签", "王陵与临安城把杭州作为吴越国都的历史拉回地面。"],
  ["heqiao", "河桥古镇", 119.066, 30.165, "neighborhood", "postcard", "柳溪家书", "昌化溪边的古镇保留浙西水陆贸易的街巷形态。"],
  ["tuankou", "湍口温泉小镇", 118.872, 30.055, "neighborhood", "ribbon", "温泉雾带", "山谷温泉让休养、村落与自然体验结合。"],
  ["hongye", "红叶指南村", 119.537, 30.252, "neighborhood", "photo", "梯田秋影", "古村、梯田与季节色彩共同构成山地聚落景观。"],
]);

const TONGLU = sites("tonglu", "桐庐县", [
  ["yaolin", "瑶琳仙境", 119.661, 29.894, "forest", "photo", "溶洞光影", "喀斯特洞穴把富春山水延伸到地下空间。"],
  ["daqishan", "大奇山国家森林公园", 119.697, 29.765, "forest", "seed", "山泉林籽", "瀑布、山泉与常绿林构成县城附近的自然课堂。"],
  ["yan-ziling", "严子陵钓台", 119.553, 29.888, "culture", "poem", "钓台江笺", "古迹与富春江峡谷共同承载隐逸文化。"],
  ["tongjun", "桐君山", 119.694, 29.805, "culture", "seed", "桐君药籽", "两江交汇处连接中医药传说与城市山水。"],
  ["lutz", "芦茨村", 119.553, 29.876, "neighborhood", "postcard", "溪谷来信", "溪流民宿与乡村生活形成可步行的慢旅行节点。"],
  ["shishe", "石舍村", 119.507, 29.86, "neighborhood", "photo", "石舍屋影", "石屋、古道与山溪保留富春江上游的聚落纹理。"],
  ["shen-ao", "深澳古村", 119.826, 29.744, "culture", "voice", "水塘回声", "地下水系与明清建筑展示古村精密的生活基础设施。"],
  ["chuiyun", "垂云通天河", 119.706, 29.837, "forest", "ticket", "地下河船票", "乘船进入地下河，让地质体验具备明确的行动线。"],
]);

const CHUNAN = sites("chunan", "淳安县", [
  ["qiandao-lake", "千岛湖中心湖区", 119.024, 29.593, "park", "postcard", "千岛水色卡", "群岛、森林与水库工程共同构成杭州最辽阔的湖面景观。"],
  ["meifeng", "梅峰岛", 118.903, 29.616, "forest", "photo", "群岛俯瞰照", "高处视角能直观看见千岛湖复杂的岛屿结构。"],
  ["huangshanjian", "黄山尖", 119.141, 29.523, "forest", "ribbon", "山脊风带", "山顶视线把珍珠列岛组合成清晰的山水图案。"],
  ["tianyu", "天屿山观景台", 118.998, 29.617, "park", "photo", "落日湖影", "县城附近的高点让居民也能共享湖区日落。"],
  ["qilong-lane", "骑龙巷", 119.035, 29.604, "neighborhood", "postcard", "山城巷信", "坡地巷道与旧城生活补足了千岛湖不只有水景的叙事。"],
  ["lion-city", "文渊狮城", 118.677, 29.48, "culture", "ticket", "水下古城票", "复原街区提示水库之下仍有被迁移的城镇记忆。"],
  ["longchuan-bay", "龙川湾", 118.652, 29.441, "forest", "voice", "湿地鸟声", "西南湖区的湿地与芦苇保留更安静的生态体验。"],
  ["xiajiang", "下姜村", 118.826, 29.337, "neighborhood", "seed", "共富稻种", "乡村产业与公共服务变化在这里有可被观察的现场。"],
]);

const JIANDE = sites("jiande", "建德市", [
  ["xin-an-river", "新安江风景区", 119.278, 29.477, "park", "voice", "十七度江雾", "恒温江水在夏季形成白沙奇雾这一独特城市气候景观。"],
  ["hydropower", "新安江水电站", 119.225, 29.476, "culture", "ticket", "水电机组票", "大型工程改变了河流、城市与千岛湖的形成。"],
  ["meicheng", "梅城古镇", 119.507, 29.542, "culture", "postcard", "严州府家书", "两江汇合处延续严州府城、码头与古街的历史。"],
  ["seven-mile", "七里扬帆", 119.475, 29.514, "park", "ribbon", "峡江船帆", "富春江峡谷把船行体验与《富春山居图》的空间联系起来。"],
  ["daci-cliff", "大慈岩", 119.337, 29.302, "culture", "photo", "悬空寺影", "山体建筑与峡谷栈道形成建德南部的垂直景观。"],
  ["lingqi-cave", "灵栖洞", 119.102, 29.415, "forest", "voice", "洞穴滴水声", "多层溶洞把地质演化变成可听、可走的体验。"],
  ["xinye", "新叶古村", 119.292, 29.329, "neighborhood", "postcard", "宗祠村信", "宗祠、巷道与水系保存完整的传统聚落秩序。"],
  ["xiaya", "下涯湿地", 119.382, 29.522, "park", "photo", "晨雾渔影", "富春江缓流和滩地为摄影、观鸟与慢行提供空间。"],
]);

const REGION_SCENE_ZOOM = 17.2;

const REGIONS: HangzhouGardenRegion[] = [
  { id: "shangcheng", label: "上城", center: SHANGCHENG[0].position, zoom: REGION_SCENE_ZOOM, sites: SHANGCHENG },
  { id: "gongshu", label: "拱墅", center: GONGSHU_GIANT_FLOWER_SITES[0].position, zoom: REGION_SCENE_ZOOM, sites: GONGSHU_GIANT_FLOWER_SITES },
  { id: "xihu", label: "西湖", center: XIHU[0].position, zoom: REGION_SCENE_ZOOM, sites: XIHU },
  { id: "binjiang", label: "滨江", center: BINJIANG[0].position, zoom: REGION_SCENE_ZOOM, sites: BINJIANG },
  { id: "xiaoshan", label: "萧山", center: XIAOSHAN[0].position, zoom: REGION_SCENE_ZOOM, sites: XIAOSHAN },
  { id: "yuhang", label: "余杭", center: YUHANG[0].position, zoom: REGION_SCENE_ZOOM, sites: YUHANG },
  { id: "linping", label: "临平", center: LINPING[0].position, zoom: REGION_SCENE_ZOOM, sites: LINPING },
  { id: "qiantang", label: "钱塘", center: QIANTANG[0].position, zoom: REGION_SCENE_ZOOM, sites: QIANTANG },
  { id: "fuyang", label: "富阳", center: FUYANG[0].position, zoom: REGION_SCENE_ZOOM, sites: FUYANG },
  { id: "linan", label: "临安", center: LINAN[0].position, zoom: REGION_SCENE_ZOOM, sites: LINAN },
  { id: "tonglu", label: "桐庐", center: TONGLU[0].position, zoom: REGION_SCENE_ZOOM, sites: TONGLU },
  { id: "chunan", label: "淳安", center: CHUNAN[0].position, zoom: REGION_SCENE_ZOOM, sites: CHUNAN },
  { id: "jiande", label: "建德", center: JIANDE[0].position, zoom: REGION_SCENE_ZOOM, sites: JIANDE },
];

export const HANGZHOU_GARDEN_REGIONS: readonly HangzhouGardenRegion[] = REGIONS;

export const HANGZHOU_GIANT_FLOWER_SITES: readonly GiantFlowerGardenSite[] =
  REGIONS.flatMap((region) => region.sites);

export const HANGZHOU_OVERVIEW_CENTER: [number, number] = [119.72, 30.1];
export const HANGZHOU_OVERVIEW_ZOOM = 8.35;
