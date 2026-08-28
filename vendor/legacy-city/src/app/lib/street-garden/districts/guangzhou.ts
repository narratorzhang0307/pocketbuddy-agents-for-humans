import type { GiantFlowerHangingKind } from "../GiantFlower";
import type { GiantFlowerGardenSite } from "../grove";
import { isAmapMapAdmitted, resolveAmapVerifiedPosition } from "../amapCoordinateOverrides";

export type GuangzhouGardenRegion = {
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
  kind: GiantFlowerHangingKind,
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
  return seeds.filter(([id]) => isAmapMapAdmitted("map-guangzhou-public-garden", id)).map(
    ([id, name, lng, lat, category, kind, label, note], index) => ({
      id,
      name,
      district,
      districtId,
      position: resolveAmapVerifiedPosition(
        "map-guangzhou-public-garden",
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
        {
          kind: "postcard",
          label: `${district.replace(/区$/, "")}漫游卡`,
          note: `从${name}寄出一张属于${district}公共生活的地点明信片。`,
          accent: ACCENTS[(index + 3) % ACCENTS.length],
        },
      ],
      scale: index === 0 ? 1.04 : undefined,
    }),
  );
}

const YUEXIU = sites("guangzhou-yuexiu", "越秀区", [
  ["yuexiu-park", "越秀公园", 113.263, 23.139, "park", "postcard", "五羊城山卡", "山体、湖面、城墙遗迹与市民游园共同组成广州老城最大的公共绿心。"],
  ["zhenhai-tower", "广州博物馆·镇海楼", 113.264, 23.142, "culture", "ticket", "城史登楼票", "古城楼和城市史展览让越秀山成为阅读广州城区演变的入口。"],
  ["sun-yat-sen-memorial", "中山纪念堂", 113.259, 23.129, "culture", "photo", "蓝瓦穹顶影", "大型礼堂、木棉与开敞庭园共同构成近代广州鲜明的建筑坐标。"],
  ["beijing-road", "北京路步行街", 113.271, 23.125, "neighborhood", "ticket", "千年街道票", "道路遗址、骑楼商业与日常人流在同一条步行街上叠合。"],
  ["dongshankou", "东山口历史文化街区", 113.296, 23.123, "neighborhood", "postcard", "红砖街角信", "近代住宅、街边小店和梧桐树荫形成细密的社区漫游网络。"],
  ["guangzhou-zoo", "广州动物园", 113.309, 23.147, "park", "ticket", "动物邻居票", "动物保育、自然教育与几代广州人的家庭记忆在这里相遇。"],
  ["liuhua-lake", "流花湖公园", 113.249, 23.14, "park", "voice", "榕荫湖风", "湖面、榕树与社区活动为老城西北部保留舒展的日常水岸。"],
  ["ersha-art-park", "二沙岛艺术公园", 113.307, 23.107, "park", "ribbon", "珠江艺术带", "滨江草地、艺术场馆与城市天际线构成开放的文化休闲岛。"],
]);

const HAIZHU = sites("guangzhou-haizhu", "海珠区", [
  ["canton-tower", "广州塔", 113.324, 23.106, "culture", "ticket", "云端登塔票", "珠江南岸的高点让城市中轴、江面与两岸街区获得清晰全景。"],
  ["haizhu-wetland", "海珠国家湿地公园", 113.327, 23.069, "park", "voice", "万亩果林鸟声", "湿地、果林和河涌在高密度城区中央保留连续生态空间。"],
  ["party-pier", "琶醍啤酒文化创意艺术区", 113.319, 23.1, "neighborhood", "postcard", "珠江夜游卡", "旧厂房、滨江步道与夜间消费共同形成城市工业岸线的新生活。"],
  ["tit-creative", "TIT创意园", 113.323, 23.1, "neighborhood", "nameplate", "纺织厂更新签", "旧纺织工业空间通过设计、互联网与街区绿地重新进入日常。"],
  ["xiaozhou-village", "小洲村", 113.33, 23.05, "neighborhood", "postcard", "水乡画室信", "河涌、祠堂、蚝壳屋与工作室保留城中村独特的岭南水乡纹理。"],
  ["huangpu-port", "黄埔古港", 113.38, 23.1, "culture", "ticket", "海丝船票", "古码头、村落与外贸历史把广州连接世界的水路落回真实岸线。"],
  ["sysu-south", "中山大学广州校区南校园", 113.298, 23.096, "culture", "postcard", "康乐园树影卡", "红砖建筑、古树与校园生活延续珠江南岸的百年教育空间。"],
  ["haizhu-lake", "海珠湖公园", 113.33, 23.08, "park", "seed", "湖岛花田种", "环湖绿道、花田与湿地水网构成中心城区南部的开放生态客厅。"],
]);

const LIWAN = sites("guangzhou-liwan", "荔湾区", [
  ["shamian", "沙面岛", 113.24, 23.108, "culture", "photo", "榕荫建筑照", "近代建筑、古树与珠江支流水岸组成适合步行的历史街区。"],
  ["yongqing-fang", "永庆坊", 113.242, 23.117, "neighborhood", "postcard", "西关更新信", "骑楼、粤剧、手艺与社区更新让老城生活继续留在原有街巷。"],
  ["lizhiwan", "荔枝湾涌", 113.238, 23.121, "canal", "voice", "西关水巷声", "河涌、桥梁与沿岸民居提示广州老城曾经密集的水网生活。"],
  ["chen-clan-academy", "陈家祠", 113.246, 23.129, "culture", "ticket", "广作工艺票", "木雕、石雕、陶塑与灰塑集中展示岭南传统建筑的装饰技艺。"],
  ["cantonese-opera-museum", "粤剧艺术博物馆", 113.24, 23.116, "culture", "voice", "水榭粤韵", "园林式场馆、戏服和唱腔把粤剧带回西关水岸的生活环境。"],
  ["xiguan-mansions", "逢源路西关大屋街区", 113.237, 23.118, "neighborhood", "nameplate", "趟栊门生活签", "传统民居、麻石街和社区小店保存西关居住文化的真实尺度。"],
  ["baietan-art-center", "白鹅潭大湾区艺术中心", 113.231, 23.102, "culture", "ticket", "三馆联展票", "美术、非遗与文学场馆在珠江交汇处形成新的公共文化岸线。"],
  ["liwan-lake", "荔湾湖公园", 113.237, 23.124, "park", "postcard", "泮塘荷香卡", "湖面、荷塘、骑楼与居民晨练共同组成西关稳定的日常公园。"],
]);

const TIANHE = sites("guangzhou-tianhe", "天河区", [
  ["guangdong-museum", "广东省博物馆", 113.33, 23.1197, "culture", "ticket", "岭南万物票", "自然、历史与广作收藏在珠江新城形成面向全省的公共知识空间。"],
  ["huacheng-square", "花城广场", 113.325, 23.119, "park", "postcard", "城市中轴卡", "城市客厅、公共建筑与地下慢行系统共同承接广州新中轴生活。"],
  ["guangzhou-library", "广州图书馆", 113.328, 23.12, "culture", "ticket", "城市读者证", "开放阅览、展览与公共学习让大型图书馆成为每日可进入的基础设施。"],
  ["tianhe-park", "天河公园", 113.37, 23.127, "park", "voice", "湖榕晨声", "湖面、林荫和运动空间为天河东部社区提供共享绿色核心。"],
  ["south-china-botanical", "华南国家植物园", 113.36, 23.18, "forest", "seed", "南亚热带植物种", "植物科研、迁地保护与园林展示构成广州最重要的物种课堂。"],
  ["olympic-sports-center", "广东奥林匹克体育中心", 113.407, 23.137, "sports", "ticket", "体育赛场票", "大型场馆、训练和公共健身共同承接城市东部的运动生活。"],
  ["huolu-mountain", "火炉山森林公园", 113.38, 23.19, "forest", "ribbon", "山林健行带", "低山林地与登山步道为高密度城区保留可随时进入的自然边界。"],
  ["tianhe-sports-center", "天河体育中心", 113.324, 23.135, "sports", "ribbon", "中心跑步带", "体育场、商业与地铁枢纽在城市中心形成高强度公共活动场。"],
]);

const BAIYUN = sites("guangzhou-baiyun", "白云区", [
  ["baiyun-mountain", "白云山风景名胜区", 113.299, 23.184, "forest", "ribbon", "云山登高带", "连绵山体、湖谷和步道构成广州中心城区最重要的自然背景。"],
  ["yuntai-garden", "云台花园", 113.295, 23.16, "park", "seed", "云山花境种", "山麓花园、温室与季节花事为白云山南入口增添园艺层次。"],
  ["baiyun-lake", "白云湖公园", 113.254, 23.223, "park", "voice", "湖湾候鸟声", "大型湖面、湿地和骑行绿道为城区西北部保留生态缓冲空间。"],
  ["children-park", "广州市儿童公园", 113.26, 23.19, "park", "ticket", "童趣游园票", "游戏、自然教育和家庭活动让公共空间真正适合儿童使用。"],
  ["design-capital", "广州设计之都", 113.28, 23.21, "neighborhood", "nameplate", "创意街区签", "设计机构、公共艺术与开放街区共同形成白云新城的创意节点。"],
  ["maofeng-mountain", "帽峰山森林公园", 113.44, 23.29, "forest", "seed", "北岭森林种", "山林、水库和乡村道路展现白云区北部更辽阔的生态尺度。"],
  ["nanhu-resort", "南湖国家旅游度假区绿道", 113.32, 23.24, "sports", "ribbon", "湖山骑行带", "湖面、山麓与连续绿道串联同和片区的休闲生活。"],
  ["longgui-wetland", "龙归城湿地公园", 113.3, 23.3, "park", "postcard", "北城湿地卡", "河涌、湿地与社区绿地为北部大型居住区提供柔软生态边界。"],
]);

const HUANGPU = sites("guangzhou-huangpu", "黄埔区", [
  ["science-city-square", "广州科学城广场", 113.45, 23.17, "park", "postcard", "科学城生活卡", "公共广场、绿道与文化设施为产业新城提供可停留的城市中心。"],
  ["luogang-xiangxue", "萝岗香雪公园", 113.51, 23.18, "park", "seed", "香雪梅种", "古荔、梅林与村落共同形成广州东部鲜明的季节花事。"],
  ["nanhai-temple", "南海神庙", 113.5, 23.085, "culture", "ticket", "海丝祭海票", "古庙、碑刻与扶胥港记忆记录广州长期面向海洋的城市身份。"],
  ["longtoushan-forest", "龙头山森林公园", 113.53, 23.1, "forest", "ribbon", "山海健行带", "山地林木与珠江岸线共同构成黄埔东南部的自然入口。"],
  ["changzhou-island", "长洲岛历史文化街区", 113.42, 23.08, "neighborhood", "postcard", "江岛村落信", "古村、码头、校园与江岸生活在岛屿尺度上紧密相邻。"],
  ["maritime-museum", "广州海事博物馆", 113.51, 23.08, "culture", "ticket", "海贸航路票", "船舶、港口与海上贸易展览把广州海洋史连接到现实江岸。"],
  ["huangpu-park", "黄埔公园", 113.45, 23.1, "park", "voice", "港湾榕风", "老城区公园、广场与邻里活动为工业港区保留日常公共客厅。"],
  ["phoenix-lake", "中新广州知识城凤凰湖", 113.53, 23.34, "park", "ribbon", "知识城环湖带", "湖面、绿道与公共建筑构成黄埔北部新城的开放生态核心。"],
]);

const PANYU = sites("guangzhou-panyu", "番禺区", [
  ["chimelong", "长隆旅游度假区", 113.33, 22.99, "park", "ticket", "动物游园票", "动物保育、主题乐园和家庭旅行形成番禺北部高强度的休闲目的地。"],
  ["baomo-garden", "宝墨园", 113.3, 22.89, "culture", "photo", "岭南园林影", "水系、廊桥、砖雕与园艺集中呈现岭南园林的材料和空间语言。"],
  ["shawan-old-town", "沙湾古镇", 113.32, 22.91, "neighborhood", "postcard", "古镇飘色信", "祠堂、麻石巷、音乐与民俗保存珠三角传统市镇生活。"],
  ["lotus-mountain", "莲花山旅游区", 113.5, 22.99, "forest", "photo", "红砂岩山影", "古采石场、山体与珠江口视线共同展现番禺东部地貌。"],
  ["yuyin-shanfang", "余荫山房", 113.39, 23.01, "culture", "postcard", "小园窗景卡", "紧凑庭园、漏窗和水石布局体现岭南私家园林精巧尺度。"],
  ["dafu-mountain", "大夫山森林公园", 113.35, 22.95, "forest", "ribbon", "湖山骑行带", "低山、湖泊和长距离绿道成为番禺居民共享的户外运动空间。"],
  ["haibang-water-village", "海傍水乡", 113.45, 22.95, "neighborhood", "voice", "水田蛙声", "河涌、田野与村落保留番禺东部仍可阅读的农业水乡景观。"],
  ["university-city-lake", "广州大学城中心湖", 113.38, 23.05, "park", "postcard", "青年岛屿卡", "校园、绿道和珠江小岛共同形成跨学校共享的青年公共空间。"],
]);

const HUADU = sites("guangzhou-huadu", "花都区", [
  ["huadu-lake", "花都湖国家湿地公园", 113.21, 23.38, "park", "voice", "湖岸白鹭声", "湿地、水面和连续绿道构成花都城区最重要的生态公共空间。"],
  ["wangzishan", "王子山森林公园", 113.14, 23.58, "forest", "seed", "北部山林种", "山谷、溪流与森林展示花都北部不同于平原城区的自然尺度。"],
  ["jiulong-lake", "九龙湖度假区", 113.3, 23.45, "park", "postcard", "湖谷慢游卡", "湖面、山麓与步道为花都东部提供连续休闲景观。"],
  ["furong-resort", "芙蓉嶂风景区", 113.23, 23.46, "forest", "voice", "山塘松风", "水库、山林和石景构成广州北部经典的近郊自然空间。"],
  ["hongshan-village", "红山村", 113.14, 23.5, "neighborhood", "postcard", "花田村落信", "村路、花田和客家生活把乡村生产转化为季节漫游体验。"],
  ["guangzhou-folklore-museum", "广州民俗博物馆", 113.21, 23.39, "culture", "ticket", "资政大夫祠票", "祠堂建筑、灰塑和地方民俗展览保存花都传统社会的空间记忆。"],
  ["langtou-village", "塱头古村", 113.12, 23.39, "neighborhood", "nameplate", "古村书院签", "祠堂、书室、池塘与村巷构成保存完整的广府传统聚落。"],
  ["timian-town", "梯面镇山林绿道", 113.19, 23.55, "sports", "ribbon", "高地骑行带", "山路、溪谷与村落把花都最北端串成适合慢行的生态路线。"],
]);

const NANSHA = sites("guangzhou-nansha", "南沙区", [
  ["nansha-wetland", "南沙湿地公园", 113.63, 22.66, "park", "voice", "候鸟芦荡声", "珠江口潮滩、红树林与候鸟共同构成广州最南端的生态课堂。"],
  ["puzhou-garden", "蒲洲花园", 113.58, 22.75, "park", "seed", "滨海园艺种", "滨海花园、草坡与水岸为南沙湾提供舒展的公共休闲空间。"],
  ["nansha-tianhou", "南沙天后宫", 113.59, 22.75, "culture", "ribbon", "珠江口海风结", "山海地形、传统建筑与港湾视线共同形成南沙代表性文化景观。"],
  ["huangshanlu-forest", "黄山鲁森林公园", 113.56, 22.77, "forest", "ribbon", "南沙登高带", "山林高点能够同时观察蕉门水道、港区与珠江口城市发展。"],
  ["jiaomen-river", "蕉门河公园", 113.53, 22.8, "park", "postcard", "新城水岸卡", "滨河绿道、桥梁和公共建筑组成南沙中心城区的连续开放空间。"],
  ["shijiuyong-port", "十九涌渔人码头", 113.61, 22.63, "neighborhood", "ticket", "出海鱼市票", "渔港、海鲜市场与水乡生产让珠江口生活保持真实烟火气。"],
  ["pearl-bay", "明珠湾城市客厅", 113.54, 22.79, "park", "postcard", "湾区江景卡", "新建筑、滨水平台与蕉门水道共同构成面向公众的新城岸线。"],
  ["nansha-seaside", "南沙滨海公园", 113.58, 22.74, "sports", "ribbon", "滨海慢跑带", "海风、堤岸和连续步道为珠江口城市提供日常运动场。"],
]);

const CONGHUA = sites("guangzhou-conghua", "从化区", [
  ["liuxihe-forest", "流溪河国家森林公园", 113.8, 23.75, "forest", "seed", "流溪河林种", "水库、群岛与亚热带森林构成广州北部最辽阔的山水空间。"],
  ["shimen-forest", "石门国家森林公园", 113.77, 23.62, "forest", "photo", "石门花海影", "高山林场、溪谷与季节花色展示从化丰富的垂直生态。"],
  ["bishuiwan", "碧水湾温泉度假区滨河", 113.74, 23.7, "park", "voice", "温泉溪流声", "流溪河、温泉和山谷步道形成适合休养的北部水岸空间。"],
  ["xitou-village", "溪头村", 113.83, 23.74, "neighborhood", "postcard", "流溪源头信", "溪流、果园、石巷与村居共同组成从化北端的山村慢游路线。"],
  ["tianren-mountain", "天人山水", 113.58, 23.52, "park", "postcard", "山谷艺术卡", "山水地形、公共艺术与乡村景观构成从化南部的新型文化空间。"],
  ["fengyunling", "风云岭森林公园", 113.58, 23.55, "forest", "ribbon", "城区登山带", "靠近城区的山体步道让居民可以快速进入森林和高处视线。"],
  ["eco-design-town", "生态设计小镇", 113.58, 23.61, "neighborhood", "nameplate", "乡村设计签", "旧村、设计机构和流溪河岸共同探索公共空间与乡村更新。"],
  ["rose-world", "宝趣玫瑰世界", 113.61, 23.57, "park", "seed", "玫瑰花田种", "规模化花田和园艺展示为从化城区近郊增加鲜明季节景观。"],
]);

const ZENGCHENG = sites("guangzhou-zengcheng", "增城区", [
  ["baishuizhai", "白水寨风景名胜区", 113.77, 23.57, "forest", "voice", "瀑布山谷声", "高山瀑布、栈道与森林构成广州东部最鲜明的垂直自然景观。"],
  ["zengcheng-square", "增城广场", 113.81, 23.26, "park", "postcard", "荔城生活卡", "城市广场、博物馆与公共活动共同构成增城中心城区的客厅。"],
  ["gualv-lake", "挂绿湖", 113.82, 23.29, "park", "voice", "荔湖晚风", "湖面、湿地和新城绿道为荔城北部保留开阔生态核心。"],
  ["xiaolou-litchi", "小楼人家荔枝文化村", 113.8, 23.4, "neighborhood", "seed", "古荔枝种", "荔枝园、祠堂与村落生活呈现增城最具代表性的农业文化。"],
  ["zhengguo-old-street", "正果老街", 113.9, 23.42, "neighborhood", "postcard", "增江古镇信", "骑楼、码头和地方小吃保存增江沿岸市镇的日常尺度。"],
  ["film-town-1978", "1978电影小镇", 113.77, 23.28, "culture", "ticket", "旧厂片场票", "旧糖纸厂与仓库通过影像、展览和市集转化为滨江文化街区。"],
  ["niuguzhang", "牛牯嶂", 113.88, 23.55, "forest", "ribbon", "东部山脊带", "山林、溪谷与高处视野展现增城北部连续的南昆山余脉。"],
  ["zengjiang-gallery", "增江画廊绿道", 113.84, 23.28, "sports", "ribbon", "增江骑行带", "河岸、荔枝林与村镇被连续绿道串成可骑行的水乡路径。"],
]);

const REGION_SCENE_ZOOM = 17.2;

export const GUANGZHOU_GARDEN_REGIONS: readonly GuangzhouGardenRegion[] = [
  { id: "guangzhou-yuexiu", label: "越秀", center: YUEXIU[0].position, zoom: REGION_SCENE_ZOOM, sites: YUEXIU },
  { id: "guangzhou-haizhu", label: "海珠", center: HAIZHU[0].position, zoom: REGION_SCENE_ZOOM, sites: HAIZHU },
  { id: "guangzhou-liwan", label: "荔湾", center: LIWAN[0].position, zoom: REGION_SCENE_ZOOM, sites: LIWAN },
  { id: "guangzhou-tianhe", label: "天河", center: TIANHE[0].position, zoom: REGION_SCENE_ZOOM, sites: TIANHE },
  { id: "guangzhou-baiyun", label: "白云", center: BAIYUN[0].position, zoom: REGION_SCENE_ZOOM, sites: BAIYUN },
  { id: "guangzhou-huangpu", label: "黄埔", center: HUANGPU[0].position, zoom: REGION_SCENE_ZOOM, sites: HUANGPU },
  { id: "guangzhou-panyu", label: "番禺", center: PANYU[0].position, zoom: REGION_SCENE_ZOOM, sites: PANYU },
  { id: "guangzhou-huadu", label: "花都", center: HUADU[0].position, zoom: REGION_SCENE_ZOOM, sites: HUADU },
  { id: "guangzhou-nansha", label: "南沙", center: NANSHA[0].position, zoom: REGION_SCENE_ZOOM, sites: NANSHA },
  { id: "guangzhou-conghua", label: "从化", center: CONGHUA[0].position, zoom: REGION_SCENE_ZOOM, sites: CONGHUA },
  { id: "guangzhou-zengcheng", label: "增城", center: ZENGCHENG[0].position, zoom: REGION_SCENE_ZOOM, sites: ZENGCHENG },
];

export const GUANGZHOU_GIANT_FLOWER_SITES: readonly GiantFlowerGardenSite[] =
  GUANGZHOU_GARDEN_REGIONS.flatMap((region) => region.sites);

export const GUANGZHOU_OVERVIEW_CENTER: [number, number] = [113.44, 23.18];
export const GUANGZHOU_OVERVIEW_ZOOM = 8.15;
