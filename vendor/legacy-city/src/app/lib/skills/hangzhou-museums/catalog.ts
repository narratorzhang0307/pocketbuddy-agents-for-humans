// 杭州博物馆地图 .skill · 内置目录（museum-skill/v1 自包含包）
// 数据纪律（与 exhibition-skill/v1 同源，出自黄佳《Harness 工程之道》Skills 章节）：
// - 坐标是确定性数据：内置目录保留高德 GCJ-02 核验值，导出前归一为 WGS84，不让模型推算
// - 收录规则：只收真有货的馆（党建/成就宣传类挂牌馆、场地租赁型小馆、运营存疑馆不收）
// - 每馆必有 blurb（一句话馆格）与 tierReason（评级理由，审计留痕）；S 级必有镇馆之宝
// - closedDay 是确定性字段：杭州市属馆错峰闭馆（多数周一，茶博双峰/官窑/工美群是周二）——白跑警示的数据底座
// - nowShowing 有时效：updatedAt 是包的鲜度戳；已闭幕特展运行时自动从馆卡消失（store.listMuseums）
// 信息核实：2026-07-11 由五路网络调研逐馆核实（坐标/门票/闭馆日/镇馆之宝/在展特展），confidence 标注可信度。

import type { MuseumEntry, MuseumSkillFile } from './types';
import { gcj02ToWgs84 } from '../../location/chinaCoordinates';

type CuratedSeed = Omit<MuseumEntry, 'source' | 'addedAt'>;

// 历史内置表以高德 GCJ-02 坐标核验。进入业务域时统一归一为 WGS84；
// 高德 SDK 只在 CityMapRuntime 边界做一次 WGS84 → GCJ-02 转换。
const GCJ02_MUSEUMS: CuratedSeed[] = [
  // ══ S · 镇馆级（来杭必去）═══════════════════════════════════════════
  {
    id: 'zhejiang-museum-zhijiang',
    name: '浙江省博物馆之江馆区',
    aliases: ['浙博之江馆', '浙博', '之江文化中心', '浙江省博物馆'],
    lng: 120.0963, lat: 30.1613, area: '之江',
    tier: 'S', tierReason: '十大镇馆之宝坐镇的省博旗舰，浙江一万年通史',
    blurb: '压箱底的浙江通史——《剩山图》、玉琮王、千年古琴都搬进了之江新馆。',
    treasures: ['富春山居图·剩山图', '良渚玉琮王', '唐·彩凤鸣岐七弦琴', '宁波万工轿'],
    ticket: '免费（周末需预约）', closedDay: 1,
    nowShowing: [
      { title: '故园有此声——张书旂艺术研究书画特展', dateEnd: '2026-07-23', note: '金陵三杰之一的花鸟画研究展', major: true },
      { title: '修·饰——古陶瓷修补装饰技艺展', dateEnd: '2026-07-19', note: '锔钉金缮，修补即装饰', major: true },
    ],
    confidence: 'high', sourceNote: 'OSM 坐标 + 官方展讯核实',
  },
  {
    id: 'liangzhu-museum',
    name: '良渚博物院',
    aliases: ['良渚博物馆'],
    lng: 120.0231, lat: 30.3797, area: '良渚',
    tier: 'S', tierReason: '实证中华五千年文明的圣地，世界遗产的文物正厅',
    blurb: '五千年前的水城与玉礼——反山瑶山玉器精品在此列阵。',
    treasures: ['反山·瑶山出土玉琮玉钺', '刻符黑陶罐', '玉璧'],
    ticket: '免费（小程序实名预约）', closedDay: 1,
    nowShowing: [
      { title: '古希腊的旅程', dateEnd: '2026-07-31', note: '希腊 31 家机构 163 件原件文物', major: true },
    ],
    confidence: 'high', sourceNote: 'OSM 坐标 + 官网展讯核实',
  },
  {
    id: 'china-silk-museum',
    name: '中国丝绸博物馆',
    aliases: ['国丝馆', '国丝'],
    lng: 120.1465, lat: 30.2251, area: '玉皇山',
    tier: 'S', tierReason: '全球最大丝绸专题博物馆，纺织考古的国家队',
    blurb: '锦程织就半部中国史——从汉晋织锦到清宫龙袍。',
    treasures: ['汉晋「王侯合昏」锦衾', '清·缂丝九龙袍', '明·织金霞帔大衫'],
    ticket: '免费', closedDay: 1,
    nowShowing: [
      { title: '月照银山——丝绸之路上的高昌与龟兹', dateEnd: '2026-09-01', note: '14 家机构 200 余件文物，一级文物 20 件', major: true },
    ],
    confidence: 'high', sourceNote: 'OSM 坐标 + 丝绸之路周官方报道',
  },
  {
    id: 'hangzhou-museum',
    name: '杭州博物馆',
    aliases: ['杭博', '杭州历史博物馆'],
    lng: 120.1616, lat: 30.2412, area: '吴山',
    tier: 'S', tierReason: '战国水晶杯（首批禁止出境国宝）坐镇的城市通史馆',
    blurb: '粮道山下的杭州故事——那只两千年前的水晶杯就在这里。',
    treasures: ['战国水晶杯', '吴越国石刻星象图', '影青观音坐像'],
    ticket: '免费', closedDay: 1,
    nowShowing: [
      { title: '一苇杭之——馆藏明清古籍展', dateEnd: '2026-08-31', note: '近两年杭博最有味道的展，已延期', major: true },
    ],
    confidence: 'high', sourceNote: 'OSM 坐标 + 展讯核实',
  },

  // ══ A · 高水准（值得专程）═══════════════════════════════════════════
  {
    id: 'deshou-palace-museum',
    name: '南宋德寿宫遗址博物馆',
    aliases: ['德寿宫', '德寿宫遗址'],
    lng: 120.1685, lat: 30.2414, area: '望江路',
    tier: 'A', tierReason: '南宋皇家宫苑遗址原址数字化展示，近年杭州最出圈的新馆',
    blurb: '一面红墙带火的南宋——遗址之上，数字光影复原孝宗的宫苑。',
    treasures: ['重华宫正殿遗址', '数字化宫苑复原展示'],
    ticket: '免费（周末节假日公众号预约）', closedDay: 1,
    confidence: 'high', sourceNote: 'OSM 坐标 + 博物馆护照截图收录 + 网络核实',
  },
  {
    id: 'zhejiang-museum-gushan',
    name: '浙江省博物馆孤山馆区',
    aliases: ['浙博孤山馆', '浙江西湖美术馆', '文澜阁'],
    lng: 120.1389, lat: 30.2533, area: '孤山',
    tier: 'A', tierReason: '雷峰塔地宫文物 + 皇家藏书楼原址，西湖文化景观的一部分',
    blurb: '白堤尽头的老浙博——阿育王塔留守，文澜阁遗泽犹在。',
    treasures: ['五代·鎏金纯银阿育王塔', '文澜阁与《四库全书》'],
    ticket: '免费', closedDay: 1,
    confidence: 'high', sourceNote: '维基坐标 + 馆区信息核实',
  },
  {
    id: 'zhejiang-art-museum',
    name: '浙江美术馆',
    aliases: ['浙美'],
    lng: 120.1523, lat: 30.2334, area: '南山路',
    tier: 'A', tierReason: '省级美术馆主场，大展轮换水准稳定',
    blurb: '程泰宁的水墨坡顶大馆——黄宾虹、林风眠一脉的浙籍谱系轮番登场。',
    ticket: '免费', closedDay: 1,
    confidence: 'high', sourceNote: 'OSM 坐标核实',
  },
  {
    id: 'caa-art-museum',
    name: '中国美术学院美术馆',
    aliases: ['国美美术馆', '中国美院美术馆'],
    lng: 120.1551, lat: 30.2452, area: '南山路',
    tier: 'A', tierReason: '学院美术馆的天花板，特展规格常年在线',
    blurb: '南山路的学院重镇——赵无极级别的大展说来就来。',
    ticket: '常规展免费预约，大展另购票', closedDay: 1,
    confidence: 'high', sourceNote: 'OSM 坐标 + 官网核实',
  },
  {
    id: 'china-design-museum',
    name: '中国国际设计博物馆',
    aliases: ['设计博物馆', '西扎楼', '国际设计博物馆'],
    lng: 120.0754, lat: 30.1545, area: '象山',
    tier: 'A', tierReason: '德美之外全球最大包豪斯收藏之一 + 西扎的建筑本身',
    blurb: '西扎的红砂岩几何体——365 件包豪斯原作安家象山。',
    treasures: ['布劳耶钢管椅', '瓦根菲尔德台灯', '馆藏西方现代设计 700 余件'],
    ticket: '¥20', closedDay: 1,
    nowShowing: [
      { title: '蒙太奇：从辩证法到动力学', dateEnd: '2026-08-31', note: '展期以馆方为准', major: false },
    ],
    confidence: 'high', sourceNote: 'OSM+维基坐标双验',
  },
  {
    id: 'caa-folk-art-museum',
    name: '中国美术学院民艺博物馆',
    aliases: ['民艺博物馆', '国美民艺馆'],
    lng: 120.0739, lat: 30.1576, area: '象山',
    tier: 'A', tierReason: '隈研吾建筑 + 4.8 万件皮影收藏，民艺研究重镇',
    blurb: '隈研吾的瓦片幕墙下——四万八千件皮影与江南百椅。',
    treasures: ['光影世象·馆藏皮影', '江南民间坐具百椅百态'],
    ticket: '¥10', closedDay: 1,
    confidence: 'high', sourceNote: 'OSM 坐标核实',
  },
  {
    id: 'china-tea-museum',
    name: '中国茶叶博物馆（双峰馆区）',
    aliases: ['茶博', '中茶博', '茶叶博物馆'],
    lng: 120.1156, lat: 30.2348, area: '双峰·龙井',
    tier: 'A', tierReason: '国家一级馆，馆在茶园里的体验独一份',
    blurb: '龙井茶山环抱的茶文化正馆——馆即茶园，茶园即馆。',
    treasures: ['良渚文化灰陶双鼻壶', '春秋原始瓷弦纹碗'],
    ticket: '免费', closedDay: 2,
    confidence: 'high', sourceNote: 'OSM 坐标核实（注意：双峰馆区周二闭馆，龙井馆区周一闭馆）',
  },
  {
    id: 'southern-song-guan-kiln-museum',
    name: '南宋官窑博物馆',
    aliases: ['官窑博物馆', '杭州南宋官窑博物馆', '南宋官窑馆区'],
    lng: 120.1504, lat: 30.2120, area: '玉皇山南',
    tier: 'A', tierReason: '郊坛下官窑遗址原址保护 + 南宋青瓷体系陈列',
    blurb: '窑址之上建馆——青瓷开片里照见南宋。',
    treasures: ['郊坛下龙窑遗址', '修内司/郊坛下官窑瓷标本'],
    ticket: '免费（公众号预约）', closedDay: 2,
    confidence: 'high', sourceNote: 'OSM 坐标核实（周二闭馆，周一开放）',
  },
  {
    id: 'hz-arts-crafts-museums',
    name: '杭州工艺美术博物馆群',
    aliases: ['工美馆', '刀剪剑博物馆', '伞博物馆', '扇博物馆', '中国刀剪剑博物馆'],
    lng: 120.1335, lat: 30.3185, area: '拱宸桥西',
    tier: 'A', tierReason: '一馆四址的国字号工艺群落，运河工业遗存活化范本',
    blurb: '桥西老厂房里的一馆四址——张小泉、王星记、西湖绸伞都是老邻居。',
    treasures: ['张小泉剪刀', '王星记扇', '西湖绸伞'],
    ticket: '免费（一次预约四馆通用）', closedDay: 2,
    nowShowing: [
      { title: '大道匠行——浙江工艺美术的历史经典与时代价值', dateEnd: '2026-10-12', note: '青瓷、东阳木雕、瓯塑集中检阅', major: false },
      { title: '印证千秋·河系大运——大运河主题篆刻邀请展', dateEnd: '2026-07-21', note: '15 家运河沿线印社 60 余方原石', major: false },
    ],
    confidence: 'high', sourceNote: 'OSM 坐标 + 官网展讯核实',
  },
  {
    id: 'grand-canal-museum',
    name: '中国京杭大运河博物馆',
    aliases: ['运博', '运河博物馆'],
    lng: 120.1370, lat: 30.3197, area: '拱宸桥',
    tier: 'A', tierReason: '大运河专题的国家队，今年开馆 20 周年',
    blurb: '拱宸桥畔读运河——沟通南北的千年水路怎么改写了杭州。',
    ticket: '免费（小程序预约）', closedDay: 1,
    confidence: 'high', sourceNote: 'OSM 坐标核实',
  },
  {
    id: 'hangzhou-national-archives',
    name: '杭州国家版本馆',
    aliases: ['文润阁', '版本馆', '中国国家版本馆杭州分馆'],
    lng: 120.0129, lat: 30.3836, area: '良渚·瓶窑',
    tier: 'A', tierReason: '王澍的宋韵建筑群 + 江南版本文化，建筑与馆藏双看点',
    blurb: '王澍的当代藏书楼——十米高的龙泉青瓷屏扇如宋代画屏开合。',
    treasures: ['龙泉青瓷屏扇门', '文献之邦·江南版本常设展'],
    ticket: '免费（周末需预约）', closedDay: 1,
    confidence: 'high', sourceNote: 'OSM 坐标核实',
  },
  {
    id: 'kuahuqiao-museum',
    name: '跨湖桥遗址博物馆',
    aliases: ['跨湖桥博物馆'],
    lng: 120.2173, lat: 30.1442, area: '湘湖',
    tier: 'A', tierReason: '八千年独木舟原址饱水保护展示，独此一家',
    blurb: '独木舟形的馆体里，泊着八千岁的「中华第一舟」。',
    treasures: ['八千年独木舟（原址展示）', '世界最早漆弓', '炭化稻米'],
    ticket: '免费（公众号预约）', closedDay: 1,
    confidence: 'high', sourceNote: 'OSM 坐标核实',
  },
  {
    id: 'zhejiang-nature-museum-hz',
    name: '浙江自然博物院（杭州馆）',
    aliases: ['浙自博', '自然博物馆', '浙江自然博物馆'],
    lng: 120.1596, lat: 30.2789, area: '武林',
    tier: 'A', tierReason: '国家一级馆，市中心地铁直达的自然通史',
    blurb: '城中心的 46 亿年——灰鲸骨架与恐龙在西湖文化广场迎客。',
    treasures: ['灰鲸骨骼', '海百合化石', '鲸鲨标本'],
    ticket: '免费（公众号预约）', closedDay: 1,
    confidence: 'high', sourceNote: 'OSM+维基坐标双验',
  },
  {
    id: 'by-art-matters',
    name: 'BY ART MATTERS 天目里美术馆',
    aliases: ['天目里美术馆', '之驻美术馆', 'BY ART MATTERS'],
    lng: 120.0947, lat: 30.2692, area: '天目里',
    tier: 'A', tierReason: '皮亚诺设计园区 + 国际当代艺术的杭州现场',
    blurb: '皮亚诺的天目里 17 号楼——国际当代艺术在杭州的落脚点。',
    ticket: '¥90 起（周末 ¥120）', closedDay: 1,
    nowShowing: [
      { title: '达米安·奥尔特加个展 Planets: Battle, Paper', dateEnd: '2026-09-13', note: '墨西哥艺术家大型个展，覆盖整个暑期', major: true },
    ],
    confidence: 'high', sourceNote: 'OSM 坐标 + 展讯核实',
  },
  {
    id: 'quanshanshi-art-center',
    name: '全山石艺术中心',
    aliases: ['全山石'],
    lng: 120.0961, lat: 30.1580, area: '之江·江涵路',
    tier: 'A', tierReason: '国内公认高水准的俄苏及东欧油画真迹收藏，免费',
    blurb: '96 岁油画家的收藏殿堂——列宾、费钦、巴比松画派真迹免费看。',
    treasures: ['俄苏油画厅（列宾/费钦/梅尔尼科夫）', '巴比松画派厅（柯罗/米勒）'],
    ticket: '常设免费（服务号预约）', closedDay: 1,
    confidence: 'medium', sourceNote: '坐标为江涵路街道级（88 号），到附近后循导引',
  },
  {
    id: 'china-seal-museum',
    name: '中国印学博物馆',
    aliases: ['印学博物馆', '西泠印社'],
    lng: 120.1348, lat: 30.2536, area: '孤山',
    tier: 'A', tierReason: '国家级印学专业馆，西泠印社的展示窗口',
    blurb: '西泠桥畔的方寸天地——历代玺印到流派篆刻，隔壁就是孤山社址。',
    treasures: ['历代玺印厅', '汉三老讳字忌日碑（社址石室）'],
    ticket: '免费', closedDay: 1,
    confidence: 'high', sourceNote: 'OSM 坐标核实',
  },
  {
    id: 'liangzhu-ancient-city-park',
    name: '良渚古城遗址公园',
    aliases: ['良渚遗址公园', '良渚古城'],
    lng: 119.9853, lat: 30.3967, area: '良渚·瓶窑',
    tier: 'A', tierReason: '世界遗产核心区的考古现场；文物在博物院，现场看格局',
    blurb: '五千年王城的考古现场——莫角山、反山与稻田水城，配良渚博物院刚好一天。',
    treasures: ['莫角山宫殿台地', '反山王陵', '南城墙剖面'],
    ticket: '¥60（含接驳车）',
    confidence: 'high', sourceNote: '维基坐标；夏季少遮荫，尽量早场',
  },

  // ══ B · 顺路看 ═══════════════════════════════════════════════════════
  {
    id: 'china-comic-museum',
    name: '中国动漫博物馆',
    aliases: ['动漫博物馆'],
    lng: 120.2011, lat: 30.1645, area: '滨江·白马湖',
    tier: 'B', tierReason: '国家级动漫专题馆，亲子/动漫爱好者顺路佳选',
    blurb: '白马湖边的「气泡云」建筑——中国动漫百年从戏台皮影讲到国漫崛起。',
    ticket: '免费（公众号预约）', closedDay: 1,
    confidence: 'high', sourceNote: 'OSM 坐标 + 博物馆护照截图收录',
  },
  {
    id: 'china-wetland-museum',
    name: '中国湿地博物馆',
    aliases: ['湿地博物馆'],
    lng: 120.0870, lat: 30.2641, area: '西溪',
    tier: 'B', tierReason: '国家级湿地专题馆，逛西溪湿地顺路一站',
    blurb: '西溪门口的国家级专题馆——看完展再进湿地，刚好一套。',
    ticket: '免费', closedDay: 1,
    confidence: 'high', sourceNote: '博物馆护照截图收录 + 姊妹包场馆表同源坐标',
  },
  {
    id: 'huqingyutang-museum',
    name: '胡庆余堂中药博物馆',
    aliases: ['胡庆余堂'],
    lng: 120.1640, lat: 30.2422, area: '河坊街',
    tier: 'B', tierReason: '晚清药号建筑一绝，逛河坊街顺路必进',
    blurb: '江南药王的晚清老宅——「戒欺」匾下，金铲银锅还在柜上。',
    treasures: ['金铲银锅（一级文物）', '晚清药号建筑本身'],
    ticket: '¥10',
    confidence: 'high', sourceNote: 'OSM 坐标核实（随药号营业，无固定闭馆日）',
  },
];

const MUSEUMS: CuratedSeed[] = GCJ02_MUSEUMS.map((museum) => {
  const [lng, lat] = gcj02ToWgs84([museum.lng, museum.lat]);
  return { ...museum, lng, lat };
});

/** 内置精选 → 运行时条目（source=curated） */
export function buildCuratedMuseums(): MuseumEntry[] {
  return MUSEUMS.map((m) => ({ ...m, source: 'curated' as const }));
}

export const HANGZHOU_MUSEUM_SKILL: MuseumSkillFile = {
  format: 'museum-skill/v1',
  name: 'hangzhou-museum-map',
  displayName: '杭州博物馆地图',
  description:
    '把杭州真有货的博物馆/美术馆精选成一层可开关的地图图层：S 镇馆级（水晶杯、玉琮王量级）/ A 高水准 / B 顺路三级钤印标记，' +
    '每馆带馆格、镇馆之宝、门票与闭馆日（当天闭馆挂「休」防白跑），馆内重磅特展临闭幕自动倒计时提醒；' +
    '小红书/公号截图丢进来即可端侧识图、按规则筛选、馆表校正坐标后上图。' +
    '适用：聊到 杭州博物馆/美术馆推荐/周末去哪个馆/镇馆之宝/闭馆日 等话题，或要把好馆截图收进地图时。' +
    '不适用：具体展讯钉图与闭幕追踪（用姊妹包 exhibition-skill/v1）、书籍地点漫游（用 map-skill/v1）、党建宣传类场馆（按规则不收录）。',
  version: '1.0.0',
  author: '上街去',
  updatedAt: '2026-07-11',
  rules: {
    tiers: {
      S: '镇馆级：来杭必去——藏品有国宝坐镇（水晶杯、玉琮王量级），或馆本身就是一件作品。看藏品分量，不看名头级别。',
      A: '高水准：值得专程去一趟——专题做得深、常设展成体系、或建筑与收藏双绝。',
      B: '顺路看：路过不亏，不必专程；内置目录少收，截图导入的由你定夺。',
    },
    urgentWithinDays: 21,
    excluded: ['党建/主题教育/成就宣传类挂牌馆', '无像样藏品的空壳馆、场地租赁型展厅', '运营状态存疑的馆（去了吃闭门羹）'],
  },
  museums: MUSEUMS,
};
