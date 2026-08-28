// 杭州展览地图 .skill · 内置目录（exhibition-skill/v1 自包含包）
// 数据纪律（与 map-skill/v1 同源，出自黄佳《Harness 工程之道》Skills 章节）：
// - 坐标是确定性数据：展讯一律引用 venues 场馆表（venueId），不手写、不让模型推算
// - 收录规则：只收 S/A（党建宣传/注水展不收，B 级顺路展交给用户截图导入自定）
// - 每条展讯必有 highlight（一句话亮点）与 tierReason（评级理由，审计留痕）
// - 展讯有时效：updatedAt 是包的鲜度戳；已闭幕的展运行时自动下图（store.listExhibitions）
// 信息核实：2026-07-11 逐展一 agent 联网核实（展期/场馆/坐标/亮点/评级），confidence 标注可信度；
// 内置场馆原始坐标来自高德 GCJ-02，导出前统一归一为 WGS84（同馆同坐标）。
// 已核实但按规则未收录：已闭幕（欧洲十九世纪现实主义@全山石 7.8 / 彩墨星辰@浙美 7.9 / Mark Power@X-SPACE 7.10）、
// 党建宣传类 2 条、B 级顺路展约 25 条（小空间/商业展/存疑展——可经截图导入自行收录）。

import type { ExVenue, ExhibitionEntry, ExhibitionSkillFile } from './types';
import { gcj02ToWgs84 } from '../../location/chinaCoordinates';

// —— 场馆坐标表（确定性数据底座；导入管线的校正基准；与 hangzhou-museums 包 OSM 值对齐）——
// 历史内置表来自高德核验，原始值为 GCJ-02。业务域统一使用 WGS84，
// 仅由 CityMapRuntime 在高德 SDK 边界转换回 GCJ-02，避免静态点二次偏移。
const GCJ02_VENUES: ExVenue[] = [
  { id: 'liangzhu-museum', name: '良渚博物院', aliases: ['良渚博物馆'], lng: 120.0231, lat: 30.3797, area: '良渚', blurb: '实证中华五千年文明的圣地' },
  { id: 'hangzhou-museum', name: '杭州博物馆', aliases: ['杭博', '杭州博物馆北馆'], lng: 120.1616, lat: 30.2412, area: '吴山', blurb: '粮道山下的杭州通史之馆' },
  { id: 'zhejiang-museum-zhijiang', name: '浙江省博物馆之江馆区', aliases: ['浙博之江馆', '之江文化中心', '浙江省博物馆'], lng: 120.0963, lat: 30.1613, area: '之江', blurb: '之江文化中心的浙博新旗舰' },
  { id: 'china-silk-museum', name: '中国丝绸博物馆', aliases: ['国丝馆', '国丝'], lng: 120.1465, lat: 30.2251, area: '玉皇山', blurb: '全球最大丝绸专题博物馆' },
  { id: 'zhejiang-art-museum', name: '浙江美术馆', aliases: ['浙美'], lng: 120.1523, lat: 30.2334, area: '南山路', blurb: '西湖南线的当代艺术主场' },
  { id: 'hz-arts-crafts-museum', name: '杭州工艺美术博物馆', aliases: ['工美馆', '杭州工美馆'], lng: 120.1335, lat: 30.3185, area: '拱宸桥', blurb: '运河边的工艺美术群落' },
  { id: 'knife-scissors-sword-museum', name: '中国刀剪剑博物馆', aliases: ['刀剪剑博物馆'], lng: 120.1335, lat: 30.3185, area: '拱宸桥', blurb: '运河工业遗存里的技艺馆' },
  { id: 'china-wetland-museum', name: '中国湿地博物馆', aliases: ['湿地博物馆'], lng: 120.0870, lat: 30.2641, area: '西溪', blurb: '西溪湿地旁的国家级专题馆' },
  { id: 'qianwang-temple', name: '钱王祠', aliases: ['钱王祠景区'], lng: 120.1578, lat: 30.2427, area: '西湖', blurb: '柳浪闻莺畔的吴越王祠' },
  { id: 'kuahuqiao-museum', name: '跨湖桥遗址博物馆', aliases: ['跨湖桥博物馆'], lng: 120.2173, lat: 30.1442, area: '湘湖', blurb: '八千年独木舟的出土地' },
  { id: 'zj-nature-museum-hz', name: '浙江自然博物院（杭州馆）', aliases: ['浙江自然博物院', '自博', '浙江自然博物馆'], lng: 120.1596, lat: 30.2789, area: '武林', blurb: '西湖文化广场的自然史殿堂' },
  { id: 'deshougong-museum', name: '南宋德寿宫遗址博物馆', aliases: ['德寿宫'], lng: 120.1685, lat: 30.2414, area: '望江路', blurb: '南宋皇家宫苑遗址上的红墙' },
  { id: 'caa-design-museum', name: '中国国际设计博物馆', aliases: ['设计博物馆', '中国美院设计博物馆'], lng: 120.0754, lat: 30.1545, area: '象山', blurb: '西扎红砂岩里的包豪斯收藏' },
  { id: 'xihu-museum', name: '杭州西湖博物馆总馆', aliases: ['西湖博物馆'], lng: 120.1574, lat: 30.2420, area: '南山路', blurb: '把西湖本身做成展品的馆' },
  { id: 'zj-literature-museum', name: '浙江文学馆', aliases: ['浙江文学馆之江馆'], lng: 120.0963, lat: 30.1613, area: '之江', blurb: '之江文化中心的文学之翼' },
  { id: 'zju-art-museum', name: '浙江大学艺术与考古博物馆', aliases: ['浙大艺博馆', '浙大艺术与考古博物馆'], lng: 120.0716, lat: 30.2979, area: '紫金港', blurb: '大学博物馆的学术策展标杆' },
  { id: 'linping-museum', name: '临平博物馆', aliases: ['杭州市临平博物馆', '中国江南水乡文化博物馆'], lng: 120.3074, lat: 30.4166, area: '临平', blurb: '江南水乡文化的区级黑马' },
  { id: 'saili-art-museum', name: '浙江赛丽美术馆', aliases: ['赛丽美术馆'], lng: 120.1727, lat: 30.2292, area: '西湖大道', blurb: '城中民营馆的日式趣味' },
  { id: 'delta-godown', name: '三角洲 GODOWN 空间', aliases: ['三角洲GODOWN', 'GODOWN'], lng: 120.0648, lat: 30.1580, area: '转塘', blurb: '之江独立艺术空间' },
];

const VENUES: ExVenue[] = GCJ02_VENUES.map((venue) => {
  const [lng, lat] = gcj02ToWgs84([venue.lng, venue.lat]);
  return { ...venue, lng, lat };
});

// —— 精选展讯（只收 S/A；坐标由 buildCuratedEntries 从场馆表回填）——
interface CuratedSeed extends Omit<ExhibitionEntry, 'lng' | 'lat' | 'source' | 'venueId'> {
  venueId: string;
}

const CURATED: CuratedSeed[] = [
  // —— S 殿堂级 ——
  {
    id: 'greek-journey-2026',
    title: '古希腊的旅程',
    venueId: 'liangzhu-museum',
    venueName: '良渚博物院',
    dateStart: '2026-01-30',
    dateEnd: '2026-07-31',
    ticket: '免费',
    highlight: '希腊 31 家机构借展、163 件原件文物——基克拉迪抱臂人像、桃金娘金冠、阿尔忒弥斯石像，从青铜时代走到希腊化时期。',
    tier: 'S',
    tierReason: '重量级国际借展 + 原件文物量级，殿堂级',
    confidence: 'high',
    sourceNote: '官方展讯 · 已核实',
  },
  {
    id: 'yiweihangzhi-guji-2026',
    title: '一苇杭之——馆藏明清古籍展',
    venueId: 'hangzhou-museum',
    venueName: '杭州博物馆',
    dateStart: '2025-12-12',
    dateEnd: '2026-08-31',
    ticket: '免费',
    highlight: '杭博馆藏明清古籍与文字的可视化呈现，配体验手册；「近两年杭博最有味道的展」，已延期至 8 月底。',
    tier: 'S',
    tierReason: '馆藏珍本古籍 + 策展口碑，值得专程',
    confidence: 'medium',
    sourceNote: '截图清单 + 网络核实（延期信息以馆方为准）',
  },
  // —— A 高水准 · 闭幕倒计时窗口内 ——
  {
    id: 'xiushi-ceramics-2026',
    title: '修·饰——古陶瓷修补装饰技艺展',
    venueId: 'zhejiang-museum-zhijiang',
    venueName: '浙江省博物馆之江馆区',
    dateStart: '2026-04-21',
    dateEnd: '2026-07-19',
    ticket: '免费',
    highlight: '锔钉、金缮、包边——古陶瓷「修补即装饰」的技艺史，小切口看物质文化，已延期至 7.19。',
    tier: 'A',
    tierReason: '省博工艺专题，选题精巧',
    confidence: 'medium',
    sourceNote: '截图清单 + 网络核实',
  },
  {
    id: 'zhangshuqi-2026',
    title: '故园有此声——张书旂艺术研究书画特展',
    venueId: 'zhejiang-museum-zhijiang',
    venueName: '浙江省博物馆之江馆区',
    dateStart: '2026-06-25',
    dateEnd: '2026-07-23',
    ticket: '免费',
    highlight: '民国花鸟画名家张书旂（与徐悲鸿、柳子谷并称「金陵三杰」）艺术研究特展，白粉主调的「任伯年后一人」。',
    tier: 'A',
    tierReason: '省博策展 + 名家研究型特展',
    confidence: 'high',
    sourceNote: '官方展讯 · 已核实',
  },
  {
    id: 'kuahuqiao-jiahu-2026',
    title: '八千年文明起源的交响——贾湖遗址·跨湖桥遗址联展',
    venueId: 'kuahuqiao-museum',
    venueName: '跨湖桥遗址博物馆',
    dateStart: '2026-04-29',
    dateEnd: '2026-07-29',
    ticket: '免费',
    highlight: '河南贾湖与萧山跨湖桥两大史前遗址联展——八千年前的骨笛与独木舟同场对话。',
    tier: 'A',
    tierReason: '跨省重要遗址联展，展品来源硬',
    confidence: 'high',
    sourceNote: '官方展讯 · 已核实',
  },
  {
    id: 'cambrian-chengjiang-2026',
    title: '万物始兴——寒武纪澄江生物群化石精品展',
    venueId: 'zj-nature-museum-hz',
    venueName: '浙江自然博物院（杭州馆）',
    dateStart: '2026-04-17',
    dateEnd: '2026-07-30',
    ticket: '免费',
    highlight: '世界自然遗产澄江生物群化石精品——5.18 亿年前寒武纪生命大爆发的第一现场。',
    tier: 'A',
    tierReason: '世界自然遗产级标本，来源等级高',
    confidence: 'high',
    sourceNote: '官方展讯 · 已核实',
  },
  // —— A 高水准 · 展期宽裕 ——
  {
    id: 'wujunyong-family-moon-2026',
    title: '吴俊勇「全家月光」',
    venueId: 'delta-godown',
    venueName: '三角洲 GODOWN 空间',
    dateStart: '2026-06-13',
    dateEnd: '2026-08-10',
    highlight: '中国美院动画名家吴俊勇个人项目——影像与绘画交织的「家庭月光」叙事，独立空间气质生猛。',
    tier: 'A',
    tierReason: '知名艺术家个人项目',
    confidence: 'medium',
    sourceNote: '截图清单 + 网络核实',
  },
  {
    id: 'haojin-chunhe-2026',
    title: '豪劲与醇和——九至十一世纪的中国南北建筑',
    venueId: 'linping-museum',
    venueName: '临平博物馆',
    dateStart: '2026-05-16',
    dateEnd: '2026-08-23',
    ticket: '免费',
    highlight: '晚唐至北宋的南北木构建筑断代史——从佛光寺到保国寺，区级馆做出了学术深度。',
    tier: 'A',
    tierReason: '选题专业（古建断代史），策展扎实',
    confidence: 'medium',
    sourceNote: '截图清单 + 网络核实',
  },
  {
    id: 'yingzao-jiangnan-2026',
    title: '营造江南——杭州与宁波的宋代官式建筑美学',
    venueId: 'deshougong-museum',
    venueName: '南宋德寿宫遗址博物馆',
    dateStart: '2026-05-29',
    dateEnd: '2026-08-31',
    highlight: '在南宋皇家宫苑遗址里看宋代官式建筑美学——展与馆互为注脚，红墙即展品。',
    tier: 'A',
    tierReason: '选题与馆舍高度契合，德寿宫策展水准',
    confidence: 'high',
    sourceNote: '官方展讯 · 已核实',
  },
  {
    id: 'montage-caa-2026',
    title: '蒙太奇：从辩证法到动力学',
    venueId: 'caa-design-museum',
    venueName: '中国国际设计博物馆',
    dateStart: '2026-04-10',
    dateEnd: '2026-09-01',
    ticket: '收费',
    highlight: '建筑、电影、摄影、诗歌、绘画、戏剧的蒙太奇研究——红黑先锋展陈 + 分镜式展墙，展厅设计本身就值回票价。',
    tier: 'A',
    tierReason: '美院学术策展，展陈设计出众',
    confidence: 'high',
    sourceNote: '官方展讯 · 已核实',
  },
  {
    id: 'jinshi-xihu-2026',
    title: '湖山之约 金石之美',
    venueId: 'xihu-museum',
    venueName: '杭州西湖博物馆总馆',
    dateStart: '2026-06-24',
    dateEnd: '2026-09-06',
    ticket: '免费',
    highlight: '西湖美学系列第二篇章——金石传拓与西泠文脉，湖山与金石互证。',
    tier: 'A',
    tierReason: '西湖美学系列策展，文脉扎实',
    confidence: 'high',
    sourceNote: '官方展讯 · 已核实',
  },
  {
    id: 'luxun-maodun-2026',
    title: '子夜待朝花——鲁迅与茅盾文学对话展',
    venueId: 'zj-literature-museum',
    venueName: '浙江文学馆',
    dateStart: '2026-06-10',
    dateEnd: '2026-09-06',
    ticket: '免费',
    highlight: '两位文学巨匠的「对话展」——手稿文献里的鲁迅与茅盾，之江文化中心新馆策展。',
    tier: 'A',
    tierReason: '名家文献展，馆新展精',
    confidence: 'medium',
    sourceNote: '截图清单 + 网络核实',
  },
  {
    id: 'yaohuo-ciyun-2026',
    title: '窑火·瓷韵——亚洲古代陶瓷技艺的交流',
    venueId: 'zju-art-museum',
    venueName: '浙江大学艺术与考古博物馆',
    dateStart: '2026-05-15',
    dateEnd: '2026-09-15',
    ticket: '免费',
    highlight: '亚洲视野下的古代陶瓷技艺传播与交流——浙大艺博馆的学术策展，看展先看方法论。',
    tier: 'A',
    tierReason: '大学博物馆学术策展标杆',
    confidence: 'high',
    sourceNote: '官方展讯 · 已核实',
  },
  {
    id: 'morocco-textile-2026',
    title: '天方织绣——摩洛哥传统服饰展',
    venueId: 'china-silk-museum',
    venueName: '中国丝绸博物馆',
    dateStart: '2026-06-24',
    dateEnd: '2026-09-23',
    ticket: '免费',
    highlight: '国丝馆国际借展——摩洛哥传统服饰与织绣，北非的色彩体系扑面而来。',
    tier: 'A',
    tierReason: '国家级专题馆的国际借展',
    confidence: 'high',
    sourceNote: '官方展讯 · 已核实',
  },
  {
    id: 'moonlit-silver-mountain-2026',
    title: '月照银山——丝绸之路上的高昌与龟兹',
    venueId: 'china-silk-museum',
    venueName: '中国丝绸博物馆',
    dateStart: '2026-06-24',
    dateEnd: '2026-09-01',
    ticket: '免费',
    highlight: '新疆与浙江 14 家机构 200 余件文物（一级文物 20 件/组），沿唐代银山道串起高昌与龟兹两座西域重镇。',
    tier: 'A',
    tierReason: '跨省重量借展 + 一级文物 20 件',
    confidence: 'high',
    sourceNote: '官方展讯 · 已核实',
  },
  {
    id: 'dadao-jiangxing-2026',
    title: '大道匠行——浙江工艺美术的历史经典与时代价值',
    venueId: 'hz-arts-crafts-museum',
    venueName: '杭州工艺美术博物馆',
    dateStart: '2026-06-26',
    dateEnd: '2026-10-12',
    ticket: '免费',
    highlight: '青瓷、东阳木雕、黄杨木雕、瓯塑——浙江工艺美术百年经典器物的一次集中检阅。',
    tier: 'A',
    tierReason: '省域工艺美术综述，展品成体系',
    confidence: 'medium',
    sourceNote: '截图清单 + 网络核实',
  },
  {
    id: 'kuniyoshi-2026',
    title: '诞幻若梦——武者国芳的足迹',
    venueId: 'saili-art-museum',
    venueName: '浙江赛丽美术馆',
    dateStart: '2026-06-27',
    dateEnd: '',
    highlight: '浮世绘武者绘大家歌川国芳主题展——妖怪、武者与奇想（闭幕日期馆方未公布，去前查询）。',
    tier: 'A',
    tierReason: '浮世绘名家专题，民营馆用心之作',
    confidence: 'high',
    sourceNote: '官方展讯 · 已核实（展期待定）',
  },
];

const VENUE_BY_ID = new Map(VENUES.map((v) => [v.id, v]));

/** 内置精选 → 运行时条目（坐标从场馆表回填——单一事实来源） */
export function buildCuratedEntries(): ExhibitionEntry[] {
  return CURATED.map((c) => {
    const v = VENUE_BY_ID.get(c.venueId);
    return { ...c, lng: v?.lng ?? 0, lat: v?.lat ?? 0, venueName: v?.name ?? c.venueName, source: 'curated' as const };
  });
}

export const HANGZHOU_EXHIBITION_SKILL: ExhibitionSkillFile = {
  format: 'exhibition-skill/v1',
  name: 'hangzhou-exhibition-map',
  displayName: '杭州展览地图',
  description:
    '把杭州正在展出的高质量展讯精选成一层可开关的地图图层：S 殿堂级（古希腊、一苇杭之量级）/ A 高水准分级标记，' +
    '快闭幕的好展自动进入倒计时置顶提醒；小红书/公号截图丢进来即可端侧识图、按规则筛选、场馆表校正坐标后上图。' +
    '适用：聊到 看展/杭州展览/美术馆/博物馆/周末去哪/快闭幕 等话题，或要把展讯截图收进地图时。' +
    '不适用：书籍地点漫游（用 map-skill/v1 内容包）、单件展品记录与 3D（用看展搭子）、党建宣传类展讯（按规则不收录）。',
  version: '1.1.0',
  author: '上街去',
  updatedAt: '2026-07-11',
  rules: {
    tiers: {
      S: '殿堂级：重量级国际借展 / 国宝文物 / 顶级艺术家大型个展——看展品来源与分量，不看营销声量。',
      A: '高水准：省级馆特展、学术策展、名家个展，值得专程去。',
      B: '顺路看：内置目录不收；截图导入的由你定夺。',
    },
    urgentWithinDays: 21,
    excluded: ['党建/主题教育/献礼/成就展等宣传类', '无像样展品的注水商业展'],
  },
  venues: VENUES,
  exhibitions: CURATED.map((c) => {
    const v = VENUE_BY_ID.get(c.venueId);
    return { ...c, lng: v?.lng ?? 0, lat: v?.lat ?? 0, venueName: v?.name ?? c.venueName };
  }),
};
