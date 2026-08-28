// 杭州古建筑地图 .skill · 内置目录（一部《武林梵志》领读吴越「东南佛国」的塔·幢·梵刹·造像）。
// 引文纪律：quote 全部在维基文库《武林梵志》(四庫全書本) 原文页逐字核验后才收；核不到只写 note。
// 核验记录（2026-07 联网核验，源：zh.wikisource.org/wiki/武林梵志_(四庫全書本) 各卷正文页）：
//   卷一「真教寺」；卷二「六和塔·開化寺」「天龍禪寺」「梵天講寺」；卷三「淨慈寺」「烟霞寺」「大仁院」；
//   卷五「保叔寺」「靈隱寺」「上天竺」「下天竺」「永福寺」——共十二条逐字核到。
//   雷峰塔/闸口白塔/香积寺塔/飞来峰造像/慈云岭造像 未核到宜引之句，按纪律只存 note。
//   用字一律从四库本原页（如「保叔塔」「開寳」「阿喇卜丹」「晉開運」「呉越」），未擅改为今通行写法。
import type { ArchSite, ArchSkillFile } from './types';
import { gcj02ToWgs84 } from '../../location/chinaCoordinates';

const SITES: ArchSite[] = [
  // —— 塔 ——
  {
    id: 'liuheta', name: '六和塔', kind: '塔', era: '吴越·北宋（970）', status: 'extant', confidence: 'high',
    quote: '六和塔在月輪峯傍，宋開寳三年智覺禪師建。', chapter: '卷二·南山「開化寺」',
    note: '北宋开宝三年（970）吴越国为镇钱塘江潮而建，塔成后夜航海船以塔灯为指南。今存砖身木檐，外观十三层内里七级，是南宋重修留下的骨架；登塔俯瞰之江与奔涌的潮头，八百年来它一直站在月轮山上看江。',
    lat: 30.1983, lng: 120.1266,
  },
  {
    id: 'leifengta', name: '雷峰塔', modernName: '雷峰夕照', kind: '塔', era: '吴越（977）', status: 'rebuilt', confidence: 'high',
    note: '吴越王妃黄氏建于开宝八年（977），本拟千尺十三层因财力「姑建七级」。乡人盗挖塔砖藏「白蛇」，1924 年 9 月 25 日午后轰然崩塌，鲁迅为此两写《论雷峰塔的倒掉》；2002 年原址起新塔，钢构罩护着塌落的旧塔基与地宫。',
    lat: 30.2339, lng: 120.145,
  },
  {
    id: 'baochuta', name: '保俶塔', kind: '塔', era: '吴越·北宋', status: 'rebuilt', confidence: 'high',
    quote: '後燬，咸平中僧永保重建，去其二級，人呼為保叔塔。', chapter: '卷五·北山「保叔寺」',
    note: '一座名字被「叫错」的塔：本是吴越相吴延爽所建的九级应天塔，宋咸平间僧永保重修、去其二级，世人遂讹称「保叔（俶）塔」，后又附会成祈钱俶自汴京平安归来之塔。今为 1933 年按旧样重砌的实心砖塔，宝石山上一道最秀挺的剪影。',
    lat: 30.2633, lng: 120.1436,
  },
  {
    id: 'zhakou-baita', name: '闸口白塔', kind: '塔', era: '吴越', status: 'extant', confidence: 'high',
    note: '吴越末年以纯白石雕成的仿木楼阁式塔，八面九级，通身满刻经文与佛龛，连斗栱、瓦当、椽头都照木构一丝不苟——研究吴越建筑形制的「石头标本」。曾立于钱塘江航道口为船只导航，如今静守在闸口老铁路桥边，少有人识。',
    lat: 30.2028, lng: 120.1404,
  },
  {
    id: 'xiangjita', name: '香积寺塔', modernName: '大兜路', kind: '塔', era: '清（1713）', status: 'extant', confidence: 'medium',
    note: '运河大兜路边一座清康熙五十二年（1713）的砖塔，原是香积寺东西双塔之一，西塔已毁独存东塔。塔砖仿木出檐，是杭州城北运河畔唯一幸存的古塔，也曾是船工望塔知归的旧路标。',
    lat: 30.2925, lng: 120.1485,
  },
  // —— 经幢 ——
  {
    id: 'fantiansi-chuang', name: '梵天寺经幢', kind: '幢', era: '北宋（965）', status: 'extant', confidence: 'high',
    quote: '梵天講寺，宋乾徳中吳越王建，名南塔，治平中改今額。', chapter: '卷二·南山「梵天講寺」',
    note: '寺身元代焚毁、明代重建、屡兴屡废，唯门前这对北宋乾德三年（965）的八面石幢巍然独存千年。通高约 15.76 米，是浙江现存最高的经幢，幢身佛经与造像的刀口至今如新——吴越「造塔立幢」遗风最完整的活证。',
    lat: 30.2200, lng: 120.1625,
  },
  // —— 梵刹 ——
  {
    id: 'lingyinsi', name: '灵隐寺', modernName: '云林禅寺', kind: '寺', era: '东晋（326）', status: 'extant', confidence: 'high',
    quote: '晉咸和元年僧慧理建，山門扁曰絶勝覺塲。', chapter: '卷五·北山「靈隱寺」',
    note: '东晋咸和元年（326）印度僧慧理见此峰疑是「仙灵所隐」而开山，杭城最古的梵刹，号云林。殿宇屡焚屡建、多是清代以来重修，唯大殿前一对吴越国石塔与经幢仍立原处，替这一千七百年的香火作证。',
    lat: 30.2427, lng: 120.0968,
  },
  {
    id: 'shangtianzhu', name: '上天竺', modernName: '法喜寺', kind: '寺', era: '后晋（936–947）', status: 'extant', confidence: 'medium',
    quote: '晉天福間僧道翊結菴山中，一夕見瑞光發于前澗。', chapter: '卷五·北山「天竺教寺」',
    note: '后晋天福年间僧道翊结庵，一夜见前涧瑞光、捞得奇木刻成观音大士像——遂成江南观音道场之首。历代帝王香客络绎，「三天竺」以它为尊；今法喜寺仍在天竺山坳，晨钟里满是求签的人。',
    lat: 30.2447, lng: 120.0906,
  },
  {
    id: 'xiatianzhu', name: '下天竺', modernName: '法镜寺', kind: '寺', era: '东晋', status: 'extant', confidence: 'medium',
    quote: '坐靈鷲山麓，亦晉僧慧理建。', chapter: '卷五·北山「下天竺」',
    note: '三天竺里最古的一座，与灵隐同为慧理东晋所建，坐灵鹫峰南麓。隋代高僧真观（钱塘人，操行高洁）曾在此住持，宋室南渡后香火愈盛；今法镜寺是杭州唯一的女众律寺，藏在飞来峰后的清溪深处。',
    lat: 30.2388, lng: 120.1015,
  },
  {
    id: 'jingcisi', name: '净慈寺', kind: '寺', era: '后周·吴越（954）', status: 'rebuilt', confidence: 'high',
    quote: '淨慈寺在南山，周顯徳元年建，名慧日永明院。', chapter: '卷三·南山「淨慈寺」',
    note: '后周显德元年（954）吴越钱俶为永明延寿禅师建，本名慧日永明院。「南屏晚钟」即出此寺，济公也在这里出家。历经七毁七建，今殿宇多为近世重修，钟声却照旧漫过南屏山——是西湖听得最远的一记钟。',
    lat: 30.2335, lng: 120.1447,
  },
  {
    id: 'yongfusi', name: '永福寺', kind: '寺', era: '东晋', status: 'rebuilt', confidence: 'medium',
    quote: '在天聖寺側，與呼猿洞相對，晉有上下永福寺。', chapter: '卷五·北山「永福寺」',
    note: '与灵隐同源、同出慧理法师之手的古刹，隐在飞来峰后石笋峰下，正对传说中慧理唤出灵猿的呼猿洞。久废之后近年循古脉重建，是灵隐一带最清幽、最少游人的一处梵境。',
    lat: 30.2455, lng: 120.0925,
  },
  {
    id: 'fenghuangsi', name: '凤凰寺', modernName: '真教寺', kind: '寺', era: '唐·元延祐重建', status: 'extant', confidence: 'high',
    quote: '真教寺在文錦坊南，元延祐間囘囘大師阿喇卜丹所建。', chapter: '卷一·城内「真教寺」',
    note: '中国伊斯兰教东南沿海四大古寺之一，志中作「真教寺」。相传唐时创建，元延祐间回回大师阿老丁（志作「阿喇卜丹」）重建；礼拜殿一连三间元代砖砌的无梁穹顶完好至今，藏在中山中路的市声之后，是杭州最不像杭州的一座古建筑。',
    lat: 30.2478, lng: 120.1658,
  },
  // —— 南山造像 ——
  {
    id: 'feilaifeng', name: '飞来峰造像', kind: '造像', era: '五代—元', status: 'extant', confidence: 'high',
    note: '灵隐寺前一座石灰岩小峰，五代至元在崖壁与洞窟间凿出四百七十余尊摩崖造像，江南石窟之冠。南宋那尊袒腹大肚弥勒已在岩上笑了八百年；元代梵式造像更是汉地罕见——一座峰，刻着半部南方佛教艺术史。',
    lat: 30.2407, lng: 120.099,
  },
  {
    id: 'yanxiadong', name: '烟霞洞造像', kind: '造像', era: '五代（吴越）', status: 'extant', confidence: 'medium',
    quote: '烟霞寺，晉開運元年僧彌洪結菴洞口，遇仙人指山後有勝蹟。', chapter: '卷三·南山「烟霞寺」',
    note: '南高峰南麓一处天然石灰岩洞，五代吴越至宋在洞壁凿满造像。其中一堂十八罗汉，被学者考订为国内现存最早的「十八罗汉」实例——比后世通行的十八罗汉早了几百年，是佛教造像史上的一处孤本。',
    lat: 30.2093, lng: 120.1146,
  },
  {
    id: 'shiwudong', name: '石屋洞造像', kind: '造像', era: '五代（吴越）', status: 'extant', confidence: 'medium',
    quote: '大仁院在南山石屋洞，呉越王建，宣和三年改賜今額。', chapter: '卷三·南山「大仁院」',
    note: '洞形如石屋而得名，吴越王曾在此建大仁院。五代时于洞壁密凿五百罗汉，小巧精致、排列成阵，是江南少见的罗汉窟；惜多毁于近世兵燹与人祸，残龛断像之间，仍看得出当年的匠心。',
    lat: 30.2078, lng: 120.1181,
  },
  {
    id: 'tianlongsi', name: '天龙寺造像', kind: '造像', era: '唐·吴越（965）', status: 'extant', confidence: 'medium',
    quote: '天龍禪寺在慈雲嶺之陽，唐真覺禪師建。', chapter: '卷二·南山「天龍禪寺」',
    note: '慈云岭南坡的古寺，北宋乾德三年（965）前后吴越在寺侧崖壁造像，与慈云岭、烟霞洞同列「西湖南山造像」三处代表。寺久废而龛像犹存，弥勒、罗汉圆润饱满，是吴越造像最盛期的标准器。',
    lat: 30.2285, lng: 120.1552,
  },
  {
    id: 'ciyunling', name: '慈云岭造像', modernName: '资贤寺', kind: '造像', era: '后晋（942）', status: 'extant', confidence: 'medium',
    note: '后晋天福七年（942）吴越王钱元瓘凿岭通道、建资贤寺时所造，就在玉皇山与凤凰山之间的隘口上。七尊大龛的阿弥陀、观音、大势至气象雍容，衣纹与刀法是吴越造像断代的「标准器」——想认识五代江南石刻，先来这里对一遍眼。',
    lat: 30.2226, lng: 120.1502,
  },
];

export const HANGZHOU_ARCH_SKILL: ArchSkillFile = {
  format: 'architecture-skill/v1',
  name: 'hangzhou-architecture-map',
  displayName: '杭州古建筑地图',
  description:
    '把杭州的古建筑读成一张地图：跟着明代钱塘人吴之鲸的《武林梵志》，走遍吴越「东南佛国」残存的塔、幢、梵刹与南山造像——从月轮峰的六和塔到石屋洞的五代罗汉，逐处考据始建兴废、存废与重建。' +
    '适用：聊到 古建筑/古塔/经幢/石窟造像/寺庙/六和塔/雷峰塔/灵隐/飞来峰/吴越/文保 等话题时。' +
    '不适用：现代建筑、文学行迹、美食寻店（请用对应内容包）。',
  version: '1.0.0',
  author: '上街去',
  coordinateSystem: 'gcj02',
  sourceBook: '《武林梵志》· 明 吴之鲸',
  sites: SITES,
};

/** 内置目录（demo 每刷新回默认，与全站纪律一致） */
export function buildArchSites(): ArchSite[] {
  return HANGZHOU_ARCH_SKILL.sites.map((s) => {
    const [lng, lat] = HANGZHOU_ARCH_SKILL.coordinateSystem === 'gcj02'
      ? gcj02ToWgs84([s.lng, s.lat])
      : [s.lng, s.lat];
    return { ...s, lng, lat };
  });
}
