// 杭州赏花地图 · 内置精编目录（四季四册 · 35 处）
// 册序：秋桂（市花，单列首册）→ 冬梅 → 夏荷 → 春日群芳（樱/郁金香/桃/油菜花/海棠合集）。
// 数据纪律（与 builtinPacks.ts 同）：
//   · 诗引只收核验过原文的名句（柳永《望海潮》/ 林逋《山园小梅》/ 杨万里《晓出净慈寺送林子方》/
//     白居易《钱塘湖春行》/ 宋之问《灵隐寺》均为传世定本），核不到就只写 note；
//   · 旧目录的原始坐标为 GCJ-02；buildCuratedSpots 进入业务域时统一转成 WGS84，
//     confidence 诚实三档——山谷村落级标 medium/low，绝不假装精确；
//   · 花期窗口取杭州本地宝/杭州网历年报道的常年区间（近年桂花偏晚，peak 已按 9 月下旬校准）。
// 远郊（大明山杜鹃/桐洲岛油菜花等）刻意不入内置目录——坐标可信度不够，留给截图导入。
import type { FlowerSkillFile } from './types';
import { gcj02ToWgs84 } from '../../location/chinaCoordinates';

export const HANGZHOU_FLOWER_SKILL: FlowerSkillFile = {
  format: 'flower-skill/v1',
  name: 'hangzhou-flowers-map',
  displayName: '杭州赏花地图',
  description:
    '把杭州的一年读成四册花历：秋桂（市花单列）、冬梅、夏荷、春日群芳，35 处赏花点带花期、花量、热度与诗引，' +
    '此刻在花的点位会在地图上亮起。适用：聊到 赏花/桂花/满觉陇/梅花/灵峰/超山/荷花/曲院风荷/樱花/太子湾/郁金香/油菜花/花期 等话题，' +
    '或在小红书刷到花讯想钉到地图上时（支持截图导入）。' +
    '不适用：展览看展（用杭州展览地图）、文学古籍行迹（用杭州文学地图）。',
  version: '1.0.0',
  author: '上街去',
  coordinateSystem: 'gcj02',
  updatedAt: '2026-07-11',
  volumes: [
    {
      id: 'osmanthus',
      flower: '桂花',
      season: '秋',
      color: '#ffb928',
      window: { start: '09-10', end: '10-31' },
      peak: { start: '09-22', end: '10-15' },
      quote: '重湖叠巘清嘉，有三秋桂子，十里荷花',
      source: '柳永《望海潮·东南形胜》',
      blurb: '桂花是杭州市花——满城暗香的秋天，从满觉陇的第一阵桂雨开始。金桂银桂丹桂四季桂，香胜于色，宜闻宜走宜捡一杯。',
    },
    {
      id: 'plum',
      flower: '梅花',
      season: '冬',
      color: '#ff7a9e',
      window: { start: '12-20', end: '03-15' },
      peak: { start: '02-01', end: '03-05' },
      quote: '疏影横斜水清浅，暗香浮动月黄昏',
      source: '林逋《山园小梅·其一》',
      blurb: '蜡梅腊月先来探路，红梅白梅正月接棒。从孤山的梅妻鹤子到超山的唐宋古梅，杭州人把冬天过成了寻梅的季节。',
    },
    {
      id: 'lotus',
      flower: '荷花',
      season: '夏',
      color: '#37d0a0',
      window: { start: '06-10', end: '08-31' },
      peak: { start: '06-25', end: '07-31' },
      quote: '接天莲叶无穷碧，映日荷花别样红',
      source: '杨万里《晓出净慈寺送林子方》',
      blurb: '「十里荷花」自南宋写进了城市简历。西湖荷区以曲院风荷为心，白莲红莲重台莲各占一湾，清晨最盛。',
    },
    {
      id: 'spring',
      flower: '春日群芳',
      season: '春',
      color: '#7ec8ff',
      window: { start: '03-05', end: '05-10' },
      peak: { start: '03-15', end: '04-15' },
      quote: '乱花渐欲迷人眼，浅草才能没马蹄',
      source: '白居易《钱塘湖春行》',
      blurb: '樱花、郁金香、桃花、油菜花、海棠、玉兰轮番登场——三月到五月的杭州不指定花种，出门即是。',
    },
  ],
  spots: [
    // ── 秋 · 桂花（12 处，主线即桂花地图截图里的两日路线）──
    {
      id: 'gui-manlong', volumeId: 'osmanthus', name: '满陇桂雨 · 少儿公园', area: '满觉陇',
      lng: 120.1435, lat: 30.2237, mass: 'sea', crowd: 'burst',
      note: '「宇宙赏桂中心」：明代已盛产桂花，沿山道七千余株、老树两百岁，花时香落如雨——新西湖十景「满陇桂雨」即此。',
      aliases: ['满觉陇', '满陇桂雨', '少儿公园', '上满觉陇', '下满觉陇'], confidence: 'medium',
    },
    {
      id: 'gui-shiwudong', volumeId: 'osmanthus', name: '石屋洞', area: '满觉陇',
      lng: 120.1380, lat: 30.2258, mass: 'patch', crowd: 'hot',
      note: '五代石窟前庭桂花环抱，园里挂满网红「桂」字灯笼；洞中造像虽毁损大半，桂香里的石屋别有静气。',
      aliases: ['石屋洞'], confidence: 'medium',
    },
    {
      id: 'gui-yanxiadong', volumeId: 'osmanthus', name: '烟霞洞', area: '南高峰',
      lng: 120.1280, lat: 30.2213, mass: 'patch', crowd: 'quiet',
      note: '路上最精美的石窟：五代十八罗汉造像尚存，山道桂树夹径——赏桂与访古在此是同一件事。',
      aliases: ['烟霞洞'], confidence: 'medium',
    },
    {
      id: 'gui-wengjiashan', volumeId: 'osmanthus', name: '翁家山村', area: '龙井',
      lng: 120.1195, lat: 30.2255, mass: 'patch', crowd: 'quiet',
      note: '山路上的茶村，户户门前桂花开；运气好能遇上晒茶人家，捡一杯落桂回去窨糖。',
      aliases: ['翁家山'], confidence: 'medium',
    },
    {
      id: 'gui-jiuxi', volumeId: 'osmanthus', name: '九溪烟树', area: '九溪',
      lng: 120.1173, lat: 30.2043, mass: 'patch', crowd: 'hot',
      note: '七点半从山口开走：溪水杉影一路相送，桂花从山民院墙里探出来——两日赏桂路线的经典起点。',
      aliases: ['九溪', '九溪十八涧'], confidence: 'medium',
    },
    {
      id: 'gui-hupao', volumeId: 'osmanthus', name: '虎跑', area: '大慈山',
      lng: 120.1475, lat: 30.2155, mass: 'patch', crowd: 'hot',
      note: '桂从山中人字排开，泉声与桂香互不相扰；遇上 500 孩童秋游虎跑的热闹，也自有梦泉的清幽兜底。',
      aliases: ['虎跑', '虎跑公园', '虎跑梦泉'], confidence: 'medium',
    },
    {
      id: 'gui-meiling', volumeId: 'osmanthus', name: '梅灵路 · 梅家坞茶村', area: '梅家坞',
      lng: 120.0995, lat: 30.2110, mass: 'patch', crowd: 'quiet',
      note: '三百年老桂散在茶田与农家院里，桂花树下吃农家菜——中国茶叶研究所的茶田大桂花就在这条线上。',
      aliases: ['梅家坞', '梅灵路', '梅岭', '梵村', '中茶所'], confidence: 'low',
    },
    {
      id: 'gui-zhiwuyuan', volumeId: 'osmanthus', name: '杭州植物园 · 桂花紫薇园', area: '玉泉',
      lng: 120.1230, lat: 30.2520, mass: 'sea', crowd: 'hot',
      note: '北门进去就是桂花林：两千多棵、金银丹四季四大品种群齐全，是看「桂花有多少种开法」的地方。',
      aliases: ['植物园', '杭州植物园', '桂花紫薇园'], confidence: 'medium',
    },
    {
      id: 'gui-huapu', volumeId: 'osmanthus', name: '杭州花圃', area: '杨公堤',
      lng: 120.1265, lat: 30.2465, mass: 'sea', crowd: 'hot',
      note: '花圃深处有一条桂花大道，两边桂花握手成荫，长椅与慢时光管够。',
      aliases: ['花圃'], confidence: 'medium',
    },
    {
      id: 'gui-gushan', volumeId: 'osmanthus', name: '孤山 · 中山公园一带', area: '孤山',
      lng: 120.1436, lat: 30.2542, mass: 'patch', crowd: 'hot',
      note: '从平湖秋月沿白堤到中山公园，巨大的孤山字壁配柿子树与桂花；一路漫步一路甜空气。',
      aliases: ['中山公园', '平湖秋月', '孤山'], confidence: 'high',
    },
    {
      id: 'gui-wenlange', volumeId: 'osmanthus', name: '文澜阁', area: '孤山',
      lng: 120.1420, lat: 30.2547, mass: 'tree', crowd: 'quiet',
      note: '清代皇家藏书楼的绿色古建，庭院古桂依水而开，与门窗回廊白墙相映——中式审美的呼应题。',
      aliases: ['文澜阁', '浙江省博物馆孤山馆'], confidence: 'medium',
    },
    {
      id: 'gui-qianwangci', volumeId: 'osmanthus', name: '钱王祠', area: '柳浪闻莺',
      lng: 120.1548, lat: 30.2438, mass: 'patch', crowd: 'hot',
      quote: '桂子月中落，天香云外飘',
      source: '宋之问《灵隐寺》',
      note: '院外红墙桂影，院内大殿戏台栏杆走廊处处是桂——桂花「都开在点子上」的一处；夜里连着柳浪闻莺与长桥的湖上暗香。',
      aliases: ['钱王祠', '柳浪闻莺', '长桥'], confidence: 'medium',
    },

    // ── 冬 · 梅花（8 处）──
    {
      id: 'mei-lingfeng', volumeId: 'plum', name: '灵峰探梅 · 品梅苑', area: '杭州植物园',
      lng: 120.1135, lat: 30.2570, mass: 'sea', crowd: 'burst',
      note: '市区含金量最高的赏梅地：百余品种、梅花五千余株、蜡梅千二百丛，笼月楼与香雪亭把梅海框成画。',
      aliases: ['灵峰', '灵峰探梅', '品梅苑'], confidence: 'medium',
    },
    {
      id: 'mei-gushan', volumeId: 'plum', name: '孤山 · 放鹤亭', area: '孤山',
      lng: 120.1450, lat: 30.2572, mass: 'patch', crowd: 'hot',
      window: { start: '12-05', end: '03-25' },
      quote: '疏影横斜水清浅，暗香浮动月黄昏',
      source: '林逋《山园小梅·其一》',
      note: '林逋在此梅妻鹤子，五百余株梅有早晚之分——早梅冬至前先开，晚梅可开到清明，观花期近三个月。',
      aliases: ['孤山', '放鹤亭'], confidence: 'high',
    },
    {
      id: 'mei-chaoshan', volumeId: 'plum', name: '超山', area: '塘栖',
      lng: 120.1855, lat: 30.4145, mass: 'sea', crowd: 'hot',
      window: { start: '01-20', end: '03-10' },
      note: '「十里梅花香雪海」：以古、广、奇三绝闻名，中国五大古梅超山有其二（唐梅、宋梅），花开六瓣傲视天下五瓣；吴昌硕自择葬于宋梅亭畔。',
      aliases: ['超山', '超山风景区', '塘栖'], confidence: 'medium',
    },
    {
      id: 'mei-xixi', volumeId: 'plum', name: '西溪 · 梅墅曲水寻梅', area: '西溪湿地',
      lng: 120.0705, lat: 30.2610, mass: 'sea', crowd: 'hot',
      note: '从周家村口进，梅竹山庄到梅墅一线是半岛大片白梅林；坐摇橹船曲水寻梅，是杭州独一份的赏法。',
      aliases: ['西溪', '西溪湿地', '梅墅', '梅竹山庄', '曲水寻梅'], confidence: 'low',
    },
    {
      id: 'mei-guozhuang', volumeId: 'plum', name: '郭庄', area: '杨公堤',
      lng: 120.1308, lat: 30.2435, mass: 'tree', crowd: 'quiet',
      note: '杭州最美庭院式赏梅：湖边园林梅点缀，一树红梅倚水榭，宜拍宜坐宜发呆。',
      aliases: ['郭庄'], confidence: 'medium',
    },
    {
      id: 'mei-qianwangci', volumeId: 'plum', name: '钱王祠', area: '柳浪闻莺',
      lng: 120.1548, lat: 30.2438, mass: 'patch', crowd: 'hot',
      note: '热门红墙背景：红白黄三色梅倚着红墙开，秋天是桂、冬天是梅——一祠管两季。',
      aliases: ['钱王祠'], confidence: 'medium',
    },
    {
      id: 'mei-wansong', volumeId: 'plum', name: '万松书院', area: '万松岭',
      lng: 120.1560, lat: 30.2248, mass: 'patch', crowd: 'quiet',
      note: '梁祝同窗处的白墙蜡梅中式美，登石阶寻梅顺带把凤凰山的清净一并收下。',
      aliases: ['万松书院'], confidence: 'low',
    },
    {
      id: 'mei-changqiao', volumeId: 'plum', name: '长桥公园', area: '南山路',
      lng: 120.1522, lat: 30.2325, mass: 'tree', crowd: 'hot',
      note: '湖山塔影一抹红：一树梅花借雷峰塔作远景，是梅花地图里出镜率最高的机位。',
      aliases: ['长桥', '长桥公园'], confidence: 'medium',
    },

    // ── 夏 · 荷花（5 处）──
    {
      id: 'he-quyuan', volumeId: 'lotus', name: '曲院风荷', area: '北山街',
      lng: 120.1360, lat: 30.2478, mass: 'sea', crowd: 'burst',
      note: '西湖十景里的夏季主场：南宋酒坊蒸酿伴荷香得名，白莲红莲重台莲各占一湾，清晨与雨后最盛。',
      aliases: ['曲院风荷', '风荷御苑'], confidence: 'medium',
    },
    {
      id: 'he-duanqiao', volumeId: 'lotus', name: '断桥 · 北里湖荷区', area: '白堤',
      lng: 120.1508, lat: 30.2588, mass: 'sea', crowd: 'burst',
      note: '断桥一侧接天莲叶铺满北里湖，保俶塔作背景——杭州人心里「夏天开始了」的标准画面。',
      aliases: ['断桥', '北里湖', '白堤'], confidence: 'high',
    },
    {
      id: 'he-guozhuang', volumeId: 'lotus', name: '郭庄 · 卧波桥畔', area: '杨公堤',
      lng: 120.1308, lat: 30.2435, mass: 'patch', crowd: 'quiet',
      note: '园内一池睡莲、园外西里湖荷区，隔窗借荷是郭庄的夏日限定；冬梅夏荷，一园两季。',
      aliases: ['郭庄'], confidence: 'medium',
    },
    {
      id: 'he-maojiabu', volumeId: 'lotus', name: '茅家埠', area: '杨公堤',
      lng: 120.1225, lat: 30.2408, mass: 'patch', crowd: 'quiet',
      note: '上香古道边的野趣荷塘，芦苇与荷共生，人少景野——避开曲院人潮的私藏选项。',
      aliases: ['茅家埠'], confidence: 'medium',
    },
    {
      id: 'he-xianghu', volumeId: 'lotus', name: '湘湖 · 跨湖桥荷区', area: '萧山',
      lng: 120.2255, lat: 30.1585, mass: 'sea', crowd: 'hot',
      note: '八千年独木舟出土地的湖面夏荷成片，骑行环湖顺路赏荷，比西湖松弛。',
      aliases: ['湘湖', '跨湖桥'], confidence: 'medium',
    },

    // ── 春 · 群芳（10 处）──
    {
      id: 'chun-taiziwan', volumeId: 'spring', name: '太子湾公园', area: '南山路',
      lng: 120.1418, lat: 30.2278, mass: 'sea', crowd: 'burst',
      window: { start: '03-10', end: '04-15' },
      note: '春日顶流：望山坪逍遥坡的郁金香与樱花同框，花期三月中到四月中；工作日清早去才躲得开人海。',
      aliases: ['太子湾', '太子湾公园'], confidence: 'high',
    },
    {
      id: 'chun-baidi', volumeId: 'spring', name: '白堤 · 桃柳夹岸', area: '西湖',
      lng: 120.1495, lat: 30.2578, mass: 'sea', crowd: 'burst',
      note: '一株桃花一株柳的经典配置从锦带桥铺到平湖秋月；白居易当年主持修的堤，春行诗就写在这里。',
      aliases: ['白堤', '锦带桥'], confidence: 'high',
    },
    {
      id: 'chun-sudi', volumeId: 'spring', name: '苏堤春晓', area: '西湖',
      lng: 120.1394, lat: 30.2415, mass: 'sea', crowd: 'hot',
      note: '西湖十景之首：六桥烟柳间杂桃樱玉兰，春晓时分从南往北走完最好。',
      aliases: ['苏堤'], confidence: 'high',
    },
    {
      id: 'chun-zhiwuyuan', volumeId: 'spring', name: '杭州植物园 · 玉兰樱花', area: '玉泉',
      lng: 120.1252, lat: 30.2496, mass: 'patch', crowd: 'hot',
      window: { start: '03-01', end: '04-15' },
      note: '玉兰三月初打头阵，樱花三月中接力；配上灵峰晚梅的尾声，一园能看三种花的交接班。',
      aliases: ['植物园', '杭州植物园'], confidence: 'medium',
    },
    {
      id: 'chun-longjing', volumeId: 'spring', name: '龙井村 · 茶田油菜花', area: '龙井',
      lng: 120.1085, lat: 30.2245, mass: 'patch', crowd: 'quiet',
      window: { start: '03-05', end: '04-10' },
      note: '茶田垄间散着油菜花，明前茶季的忙碌与花期重叠——喝一杯狮峰龙井再下山。',
      aliases: ['龙井村', '龙井'], confidence: 'medium',
    },
    {
      id: 'chun-baguatian', volumeId: 'spring', name: '八卦田', area: '玉皇山南',
      lng: 120.1523, lat: 30.2129, mass: 'sea', crowd: 'hot',
      window: { start: '03-05', end: '04-10' },
      note: '南宋籍田遗址上八边形的油菜花田，登玉皇山紫来洞俯瞰八卦纹样最完整。',
      aliases: ['八卦田'], confidence: 'medium',
    },
    {
      id: 'chun-wentao', volumeId: 'spring', name: '闻涛路樱花跑道', area: '滨江',
      lng: 120.2100, lat: 30.1960, mass: 'sea', crowd: 'burst',
      window: { start: '03-15', end: '04-15' },
      note: '钱塘江边「最美跑道」数公里樱花隧道，三月中下旬满开；晚樱接力可看到四月中。',
      aliases: ['闻涛路', '樱花跑道', '滨江樱花'], confidence: 'low',
    },
    {
      id: 'chun-gongchenqiao', volumeId: 'spring', name: '大运河 · 拱宸桥垂丝海棠', area: '拱墅',
      lng: 120.1390, lat: 30.3193, mass: 'patch', crowd: 'hot',
      window: { start: '03-15', end: '04-20' },
      note: '四百年石拱桥配垂丝海棠，水上巴士穿桥而过——运河人家的春天比景区的更日常。',
      aliases: ['拱宸桥', '大运河', '桥西直街'], confidence: 'high',
    },
    {
      id: 'chun-liangzhu', volumeId: 'spring', name: '良渚古城遗址公园', area: '良渚',
      lng: 119.9870, lat: 30.3945, mass: 'patch', crowd: 'quiet',
      window: { start: '03-15', end: '04-10' },
      note: '五千年城址上的樱花与桃花开在草坡鹿苑之间，人少而旷——把赏花过成踏青。',
      aliases: ['良渚', '良渚古城'], confidence: 'medium',
    },
    {
      id: 'chun-xianghu', volumeId: 'spring', name: '湘湖 · 油菜花与桃花', area: '萧山',
      lng: 120.2280, lat: 30.1620, mass: 'patch', crowd: 'quiet',
      window: { start: '03-05', end: '04-15' },
      note: '湖畔油菜花与桃花错落，下孙文化村一带最集中；春天骑行环湖的理由又多一个。',
      aliases: ['湘湖'], confidence: 'medium',
    },
  ],
};

/** 内置目录 → 运行时点位（打 origin 戳；截图导入的由 store 另行合并） */
export function buildCuratedSpots() {
  return HANGZHOU_FLOWER_SKILL.spots.map((s) => {
    const [lng, lat] = HANGZHOU_FLOWER_SKILL.coordinateSystem === 'gcj02'
      ? gcj02ToWgs84([s.lng, s.lat])
      : [s.lng, s.lat];
    return { ...s, lng, lat, origin: 'curated' as const };
  });
}
