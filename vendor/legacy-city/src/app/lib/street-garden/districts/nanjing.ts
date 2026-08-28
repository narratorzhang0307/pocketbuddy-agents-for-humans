import type { GiantFlowerHangingKind } from "../GiantFlower";
import type { GiantFlowerGardenSite } from "../grove";
import { isAmapMapAdmitted, resolveAmapVerifiedPosition } from "../amapCoordinateOverrides";

export type NanjingGardenRegion = {
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
  return seeds.filter(([id]) => isAmapMapAdmitted("map-nanjing-public-garden", id)).map(
    ([id, name, lng, lat, category, kind, label, note], index) => ({
      id,
      name,
      district,
      districtId,
      position: resolveAmapVerifiedPosition(
        "map-nanjing-public-garden",
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

const XUANWU = sites("nanjing-xuanwu", "玄武区", [
  ["xuanwu-lake", "玄武湖公园", 118.795, 32.071, "park", "postcard", "环湖城墙卡", "湖面、城墙与林荫步道组成南京中心城区最开阔的公共水岸。"],
  ["zhongshan-botanical", "中山植物园", 118.833, 32.06, "forest", "seed", "钟山植物种", "植物收集、科研与山麓生态把四季变化变成可行走的自然课堂。"],
  ["ming-xiaoling", "明孝陵", 118.84, 32.059, "culture", "photo", "石象路晨影", "陵寝、神道与钟山林木共同保存明代营造和山川秩序。"],
  ["linggu-scenic", "灵谷景区", 118.868, 32.055, "forest", "voice", "无梁殿松声", "古建、桂林与山间步道为钟山东部留下一片安静空间。"],
  ["nanjing-museum", "南京博物院", 118.827, 32.043, "culture", "ticket", "六朝展览票", "考古、艺术和民俗收藏把江苏与南京的时间层次集中呈现。"],
  ["jimingsi", "鸡鸣寺", 118.796, 32.056, "culture", "ribbon", "樱路风结", "山寺、樱花路与台城相邻，构成玄武湖西南角清晰的步行线。"],
  ["taicheng-wall", "台城明城墙", 118.795, 32.06, "culture", "photo", "城湖并景照", "登上城墙可以同时辨认旧城边界、玄武湖与钟山天际线。"],
  ["purple-mountain-trail", "紫金山绿道", 118.829, 32.067, "sports", "ribbon", "山林健行带", "连续绿道把天文、植物与林间运动连接成城市近山路径。"],
]);

const QINHUAI = sites("nanjing-qinhuai", "秦淮区", [
  ["confucius-temple", "夫子庙", 118.788, 32.02, "culture", "postcard", "泮池灯影卡", "文庙、街巷与秦淮河共同组成南京最具辨识度的旧城漫游入口。"],
  ["imperial-examination-museum", "中国科举博物馆", 118.7904, 32.0219, "culture", "ticket", "号舍应试票", "明远楼、号舍遗存与地下展馆把科举制度放回真实城市空间。"],
  ["baoen-temple", "大报恩寺遗址公园", 118.782, 32.007, "culture", "photo", "琉璃塔影", "遗址、考古和当代轻质塔共同呈现长干里的多层历史。"],
  ["laomendong", "老门东历史街区", 118.787, 32.003, "neighborhood", "postcard", "城南巷陌信", "城墙脚下的街巷、手艺和社区生活保留南京南城步行尺度。"],
  ["bailuzhou", "白鹭洲公园", 118.795, 32.016, "park", "voice", "水街桨声", "园林水系、桥廊和邻近街区让内秦淮拥有更舒展的停留空间。"],
  ["chaotian-palace", "朝天宫", 118.773, 32.039, "culture", "nameplate", "金陵礼制签", "红墙、棂星门与南京市博物馆共同保存旧城西南部的建筑层次。"],
  ["ganxi-residence", "甘熙故居", 118.78, 32.029, "culture", "ticket", "九十九间半票", "大型民居、非遗展陈与南捕厅街区连接家族生活和城市手艺。"],
  ["dongshuiguan", "东水关遗址公园", 118.8, 32.024, "canal", "ribbon", "秦淮入城带", "水关、城墙与河道交汇处让人看见内秦淮如何进入旧城。"],
]);

const JIANYE = sites("nanjing-jianye", "建邺区", [
  ["mochou-lake", "莫愁湖公园", 118.76, 32.032, "park", "postcard", "海棠湖岸卡", "古湖、园林与社区游园共同维持河西东缘柔和的日常水面。"],
  ["nanjing-eye", "南京眼步行桥", 118.727, 31.987, "sports", "ribbon", "夹江夜跑带", "步行桥连接河西与江心洲，是观察长江新城夜景的开放路径。"],
  ["yuzui-wetland", "鱼嘴湿地公园", 118.682, 31.981, "park", "voice", "江湾落日声", "长江与夹江交汇处的湿地、灯塔和堤岸适合观看潮水与日落。"],
  ["green-expo-garden", "绿博园", 118.72, 32.02, "park", "seed", "滨江园艺种", "不同植物展园与滨江绿地构成河西连续公共空间的一部分。"],
  ["jiangxinzhou-eco", "江心洲生态科技岛滨江", 118.69, 31.997, "park", "ribbon", "岛岸慢行带", "江岛、湿地和骑行路线让新城发展仍能贴近长江自然边界。"],
  ["yunjin-museum", "南京云锦博物馆", 118.738, 32.031, "culture", "nameplate", "织金工艺签", "织机、纹样与工匠演示让南京传统丝织技艺保持可见。"],
  ["poly-grand-theatre", "南京保利大剧院", 118.725, 32.012, "culture", "ticket", "河西演出票", "剧场建筑与夜间演出为新城区提供稳定的公共文化目的地。"],
  ["hexi-ecological-park", "河西生态公园", 118.73, 31.999, "park", "seed", "新城绿心种", "草坡、水景和步道为办公、居住与文化设施之间留出共享绿心。"],
]);

const GULOU = sites("nanjing-gulou", "鼓楼区", [
  ["yuejiang-tower", "阅江楼", 118.74, 32.09, "culture", "photo", "狮子山江景照", "登高视线把长江、南京港与西北城墙连接为一幅城市地理图。"],
  ["treasure-shipyard", "宝船厂遗址公园", 118.734, 32.087, "culture", "ticket", "船坞考古票", "大型船坞遗迹和造船展示让明代航海技术回到真实生产场地。"],
  ["yihe-road", "颐和路历史文化街区", 118.767, 32.066, "neighborhood", "postcard", "梧桐街角信", "坡地道路、院落与梧桐树荫构成适合慢行的近代城市街区。"],
  ["nanjing-university", "南京大学鼓楼校区", 118.778, 32.058, "culture", "postcard", "百年校园卡", "历史建筑、学术生活和城市街道在鼓楼中心彼此交织。"],
  ["suiyuan-campus", "南京师范大学随园校区", 118.769, 32.056, "culture", "photo", "随园书院影", "园林式校园延续随园文脉，也为宁海路片区保留静谧空间。"],
  ["qingliangshan", "清凉山公园", 118.756, 32.052, "forest", "seed", "银杏山林种", "低山、古迹与林荫步道为老城西部提供日常登高和散步入口。"],
  ["stone-city-park", "石头城公园", 118.746, 32.051, "park", "voice", "鬼脸城潮声", "古城墙依山临水，秦淮河与山石共同提示金陵城的早期边界。"],
  ["xiaotaoyuan", "小桃园滨江公园", 118.745, 32.095, "park", "postcard", "城北花岸卡", "桃林、城墙与滨江绿地连接下关老城和长江岸线。"],
]);

const PUKOU = sites("nanjing-pukou", "浦口区", [
  ["laoshan-forest", "老山国家森林公园", 118.58, 32.09, "forest", "seed", "老山林籽", "连绵山林、步道与生物多样性为江北保留大尺度自然腹地。"],
  ["pearl-spring", "珍珠泉风景区", 118.655, 32.117, "park", "voice", "泉眼水声", "泉水、湖面与山麓游园构成浦口东部经典的亲水休闲空间。"],
  ["sifang-art-lake", "四方当代美术馆", 118.568, 32.096, "culture", "ticket", "山谷建筑票", "当代建筑与艺术展览散落在老山脚下，形成可步行的艺术聚落。"],
  ["pukou-station", "浦口火车站历史文化街区", 118.72, 32.12, "culture", "photo", "百年站台影", "老站房、铁路和长江轮渡记忆保存南京近代交通的重要节点。"],
  ["xiangshan-lake", "象山湖公园", 118.62, 32.08, "park", "postcard", "山湖社区卡", "湖面、绿道和周边社区共同组成江浦新城的日常公共客厅。"],
  ["qiu-yushan", "求雨山文化名人纪念馆", 118.617, 32.057, "culture", "nameplate", "书画山馆签", "书画收藏和山地园林为浦口留下清晰的地方文化坐标。"],
  ["bulao-village", "不老村", 118.57, 32.12, "neighborhood", "postcard", "老山村落信", "村居、田园与小型文化空间把山脚生活转化为慢游路线。"],
  ["chu-river-greenway", "滁河滨水绿道", 118.68, 32.15, "sports", "ribbon", "江北骑行带", "河道、堤岸与平原绿地形成浦口北部连续的慢行边界。"],
]);

const QIXIA = sites("nanjing-qixia", "栖霞区", [
  ["qixia-mountain", "栖霞山", 118.951, 32.154, "forest", "photo", "枫林山色照", "山林、地质和季节红叶构成南京东北部最鲜明的山地景观。"],
  ["qixia-temple", "栖霞寺", 118.9515, 32.153, "culture", "nameplate", "千佛岩拓签", "古寺、舍利塔与南朝石刻把山林游览连接到深厚的佛教艺术史。"],
  ["yanziji", "燕子矶公园", 118.826, 32.157, "park", "voice", "江矶潮声", "临江石矶、幕燕风景带与长江航运共同形成开阔的水岸视角。"],
  ["mufu-mountain", "幕府山风景区", 118.777, 32.135, "forest", "ribbon", "江山健行带", "山脊步道连接城市北缘与长江，是观察岸线变化的天然高地。"],
  ["yangshan-lake", "羊山湖公园", 118.91, 32.11, "park", "postcard", "大学城湖光卡", "湖面、草坡与校园社区为仙林提供共享的日常活动中心。"],
  ["happy-valley", "南京欢乐谷", 118.94, 32.11, "park", "ticket", "欢乐游园票", "大型游乐设施为栖霞东部带来面向家庭和青年的城市娱乐节点。"],
  ["longtan-waterfront", "龙潭水一方公园", 119.06, 32.17, "park", "voice", "江湾湿地声", "东部江湾的湿地、堤岸和村镇生活共同展现长江岸线尺度。"],
  ["qixia-riverfront", "栖霞滨江风光带", 118.85, 32.16, "sports", "ribbon", "幕燕骑行带", "连续滨江绿道把燕子矶、湿地与社区运动连接起来。"],
]);

const YUHUATAI = sites("nanjing-yuhuatai", "雨花台区", [
  ["juhuatai-park", "菊花台公园", 118.745, 31.99, "park", "seed", "城南菊种", "林地、坡道与社区游园为城南居民提供安静的日常绿地。"],
  ["huashen-lake", "花神湖公园", 118.779, 31.973, "park", "postcard", "花神湖水色卡", "湖面、湿地和环湖步道连接南京南站片区的多个居住社区。"],
  ["science-museum", "南京科技馆", 118.778, 31.979, "culture", "ticket", "动手实验票", "互动展览、球幕与户外公园让科学教育成为家庭共同体验。"],
  ["lianhua-lake", "莲花湖公园", 118.668, 31.923, "park", "voice", "板桥湖风", "开阔水面和绿道为雨花西南部的新社区提供共享休闲空间。"],
  ["sanshanji-wetland", "三山矶湿地公园", 118.65, 31.98, "park", "voice", "长江芦荡声", "江滩、湿地与候鸟构成南京西南岸线的重要生态片段。"],
  ["banqiao-riverfront", "板桥新城滨河公园", 118.64, 31.89, "park", "ribbon", "新城滨水带", "河道和慢行设施把大型居住片区连接成连续公共空间。"],
  ["daishan-community", "岱山社区中心公园", 118.66, 31.94, "neighborhood", "postcard", "社区生活信", "小尺度绿地、服务设施和邻里活动共同形成可停留的社区中心。"],
  ["qinhuai-new-river", "秦淮新河百里风光带", 118.75, 31.94, "sports", "ribbon", "新河骑行带", "堤岸绿道把河流、防洪空间与南部城区的日常运动串联起来。"],
]);

const JIANGNING = sites("nanjing-jiangning", "江宁区", [
  ["niushou-mountain", "牛首山文化旅游区", 118.735, 31.916, "culture", "photo", "双阙山景照", "山体、寺塔遗存与当代建筑共同塑造南京南部鲜明的文化地标。"],
  ["tangshan-mine-park", "汤山矿坑公园", 119.064, 32.057, "park", "photo", "矿坑再生影", "废弃矿坑通过地质展示、温泉水景和公共活动转化为开放公园。"],
  ["fangshan-park", "方山国家地质公园", 118.89, 31.94, "forest", "seed", "火山岩林种", "古火山地貌、茶园与登山步道为大学城保留近郊自然入口。"],
  ["yangshan-stele", "阳山碑材景区", 119.066, 32.049, "culture", "nameplate", "巨石营造签", "巨大碑材和采石遗迹直观展示古代工程组织与材料尺度。"],
  ["ginkgo-lake", "银杏湖生态旅游区", 118.74, 31.81, "park", "seed", "湖谷花木种", "丘陵、湖面与花木园林构成江宁西南部的大尺度游园空间。"],
  ["huanglongxian", "黄龙岘茶文化村", 118.61, 31.77, "neighborhood", "postcard", "茶山村信", "茶园、村道与水库景观连接乡村生产和慢行体验。"],
  ["shitang-bamboo", "石塘竹海", 118.52, 31.78, "forest", "voice", "竹海风声", "竹林、溪塘与村落构成南京西南边缘安静的山地生态路径。"],
  ["tangshan-geology", "汤山方山国家地质公园博物馆", 119.047, 32.07, "culture", "ticket", "地层化石票", "地质、古生物和温泉知识为汤山自然景观补充科学阅读层。"],
]);

const LIUHE = sites("nanjing-liuhe", "六合区", [
  ["jinniu-lake", "金牛湖风景区", 118.99, 32.47, "park", "postcard", "湖山北境卡", "湖面、丘陵与环湖步道构成南京北部开阔的自然休闲空间。"],
  ["pingshan-forest", "平山森林公园", 118.86, 32.4, "forest", "seed", "平山林场种", "人工林、茶园与湿地展示江北丘陵长期生态经营的结果。"],
  ["zhuzhen-bamboo", "竹镇止马岭", 118.59, 32.47, "forest", "voice", "杉林水鸟声", "水库、池杉与候鸟让南京西北边缘保持安静的自然观察尺度。"],
  ["longpao-wetland", "龙袍长江湿地公园", 118.99, 32.23, "park", "voice", "江滩潮声", "洲滩、芦苇与迁徙鸟类共同形成长江北岸重要生态空间。"],
  ["guabu-geopark", "瓜埠山国家地质公园", 118.99, 32.25, "forest", "photo", "石柱林影", "火山岩石柱与废弃采石场展示六合独特的地质形成过程。"],
  ["lianhu-lake", "莲湖公园", 118.86, 32.32, "park", "postcard", "六合水城卡", "湖面、桥廊与城区绿道为六合老城提供稳定的公共客厅。"],
  ["yeshan-mine-park", "冶山国家矿山公园", 118.79, 32.45, "culture", "ticket", "矿业轨道票", "矿井、窄轨铁路和工业遗存记录江北矿业生产的历史。"],
  ["liuhe-confucius-temple", "六合文庙", 118.84, 32.34, "culture", "nameplate", "棠邑文脉签", "地方文庙和历史街区为六合保存一处清晰的人文时间坐标。"],
]);

const LISHUI = sites("nanjing-lishui", "溧水区", [
  ["wuxiang-mountain", "无想山国家森林公园", 119.02, 31.63, "forest", "seed", "无想山林种", "丘陵森林、湖泊与登山路径构成溧水城区近旁的生态屏障。"],
  ["tiansheng-bridge", "天生桥景区", 119.02, 31.64, "canal", "ticket", "胭脂河船票", "人工开凿的胭脂河和天然石桥共同展示古代水运工程尺度。"],
  ["fujiabian", "傅家边农业科技园", 119.11, 31.58, "neighborhood", "seed", "梅园果树种", "梅林、果园与农业体验把生产景观转化为季节性的乡村课堂。"],
  ["shiqiu-film-town", "石湫影视基地街区", 119.18, 31.65, "culture", "ticket", "片场漫游票", "影视场景、制作空间与周边村镇形成独特的文化生产节点。"],
  ["dongping-lake", "东屏湖滨水公园", 119.06, 31.69, "park", "voice", "湖湾风声", "宽阔水面与滨湖绿道为溧水东北部保留连续自然边界。"],
  ["zhouyuan", "周园", 118.95, 31.58, "culture", "nameplate", "江南营造签", "宅院、石雕和传统家具收藏集中呈现江南民间营造细节。"],
  ["wuxiang-water-town", "无想水镇", 119.03, 31.65, "neighborhood", "postcard", "水镇夜游信", "小尺度水街、演艺和公共活动为城区增添夜间步行目的地。"],
  ["shishanxia", "石山下乡村文化空间", 119.14, 31.53, "neighborhood", "postcard", "丘陵村落信", "老宅、田野与小型展览让乡村更新保留真实生活纹理。"],
]);

const GAOCHUN = sites("nanjing-gaochun", "高淳区", [
  ["gaochun-old-street", "高淳老街", 118.875, 31.327, "culture", "postcard", "砖木街巷信", "传统店铺、宗祠和水运市镇格局保存高淳老城的生活尺度。"],
  ["gucheng-lake", "固城湖水慢城", 118.9, 31.29, "park", "voice", "湖荡水声", "湖面、湿地与水乡游线展示高淳与固城湖长期共生的地理关系。"],
  ["youzishan", "游子山国家森林公园", 118.92, 31.38, "forest", "seed", "游子山林种", "低山森林、古建与乡村道路构成高淳北部的自然文化入口。"],
  ["yaxi-slow-city", "桠溪国际慢城", 118.95, 31.47, "neighborhood", "ribbon", "丘陵慢行带", "茶园、竹林、村落与田野共同形成连续的乡村慢游网络。"],
  ["qiqiao-village", "漆桥古村落", 118.97, 31.32, "neighborhood", "postcard", "古村巷陌卡", "街巷、古井和传统民居保存高淳乡村聚落的细密空间。"],
  ["gaochun-museum", "高淳博物馆", 118.89, 31.34, "culture", "ticket", "水乡民俗票", "地方考古、民俗和生产器物为湖区生活建立完整时间线。"],
  ["ceramics-museum", "高淳陶瓷博物馆", 118.91, 31.35, "culture", "nameplate", "釉彩工艺签", "陶瓷材料、设计和生产流程展示当地持续发展的制造传统。"],
  ["shijiu-lake-wetland", "石臼湖湿地西岸", 118.96, 31.46, "park", "voice", "候鸟湖风", "季节水位、滩涂与候鸟让南京南端呈现辽阔的湖区生态尺度。"],
]);

const REGION_SCENE_ZOOM = 17.2;

export const NANJING_GARDEN_REGIONS: readonly NanjingGardenRegion[] = [
  { id: "nanjing-xuanwu", label: "玄武", center: XUANWU[0].position, zoom: REGION_SCENE_ZOOM, sites: XUANWU },
  { id: "nanjing-qinhuai", label: "秦淮", center: QINHUAI[0].position, zoom: REGION_SCENE_ZOOM, sites: QINHUAI },
  { id: "nanjing-jianye", label: "建邺", center: JIANYE[0].position, zoom: REGION_SCENE_ZOOM, sites: JIANYE },
  { id: "nanjing-gulou", label: "鼓楼", center: GULOU[0].position, zoom: REGION_SCENE_ZOOM, sites: GULOU },
  { id: "nanjing-pukou", label: "浦口", center: PUKOU[0].position, zoom: REGION_SCENE_ZOOM, sites: PUKOU },
  { id: "nanjing-qixia", label: "栖霞", center: QIXIA[0].position, zoom: REGION_SCENE_ZOOM, sites: QIXIA },
  { id: "nanjing-yuhuatai", label: "雨花台", center: YUHUATAI[0].position, zoom: REGION_SCENE_ZOOM, sites: YUHUATAI },
  { id: "nanjing-jiangning", label: "江宁", center: JIANGNING[0].position, zoom: REGION_SCENE_ZOOM, sites: JIANGNING },
  { id: "nanjing-liuhe", label: "六合", center: LIUHE[0].position, zoom: REGION_SCENE_ZOOM, sites: LIUHE },
  { id: "nanjing-lishui", label: "溧水", center: LISHUI[0].position, zoom: REGION_SCENE_ZOOM, sites: LISHUI },
  { id: "nanjing-gaochun", label: "高淳", center: GAOCHUN[0].position, zoom: REGION_SCENE_ZOOM, sites: GAOCHUN },
];

export const NANJING_GIANT_FLOWER_SITES: readonly GiantFlowerGardenSite[] =
  NANJING_GARDEN_REGIONS.flatMap((region) => region.sites);

export const NANJING_OVERVIEW_CENTER: [number, number] = [118.78, 31.92];
export const NANJING_OVERVIEW_ZOOM = 8.4;
