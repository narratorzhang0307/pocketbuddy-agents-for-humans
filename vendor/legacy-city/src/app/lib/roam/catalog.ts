// 本地库：内置公版书 + 端侧精编地点数据（杭州首发黄金链）。
// 纪律：quote 只收录高把握名句，绝不虚构；坐标一律 approx，靠 suggest-then-confirm 由用户确认；
// status 诚实三态：尚在 extant / 重建 rebuilt / 已无 memory-only（只标记忆坐标，不假装实体存在）。

import type { RoamPlaceStatus, RoamConfidence } from './types';

export interface RoamBookSeed {
  id: string;
  title: string;
  author: string;
  era: string;
  city: string;
  cityGeo: { lat: number; lng: number };
  blurb: string;
}

export interface RoamPlaceSeed {
  id: string;
  canonicalPlaceId?: string;
  name: string;
  ancientName?: string;
  modernName?: string;
  status: RoamPlaceStatus;
  confidence: RoamConfidence;
  quote?: string;
  chapter?: string;
  note: string;
  lat: number;
  lng: number;
  coordinateType?: string;
  coordinateAccuracy?: string;
  mapReady?: boolean;
  mapAdmissionReason?: string;
  evidenceRef?: string;
  route?: string;
  ancientSiteStatus?: string;
  modernCarrierStatus?: string;
}

export const BUILTIN_BOOKS: RoamBookSeed[] = [
  {
    id: 'taoan-mengyi',
    title: '陶庵梦忆',
    author: '张岱',
    era: '明末清初',
    city: '杭州',
    cityGeo: { lat: 30.246, lng: 120.14 },
    blurb: '明亡后追忆前尘之作，湖山梦影与市井声色俱在。',
  },
  {
    id: 'xihu-mengxun',
    title: '西湖梦寻',
    author: '张岱',
    era: '明末清初',
    city: '杭州',
    cityGeo: { lat: 30.246, lng: 120.14 },
    blurb: '别西湖二十八载，凭记忆重游：「西湖无日不入吾梦中」。',
  },
  {
    id: 'wulin-jiushi',
    title: '武林旧事',
    author: '周密',
    era: '宋末元初',
    city: '杭州',
    cityGeo: { lat: 30.24, lng: 120.158 },
    blurb: '追记南宋临安的岁时、市肆、伎艺与湖山游赏。',
  },
  // —— 杭博馆藏古籍展书单（引文均经维基文库/ctext 核对原文；查不到原文的书不放引文）——
  {
    id: 'xianchun-linan-zhi',
    title: '咸淳临安志',
    author: '潜说友',
    era: '南宋·咸淳',
    city: '杭州',
    cityGeo: { lat: 30.235, lng: 120.158 },
    blurb: '南宋杭州的百科全书式方志，临安三志中最完备的一部。',
  },
  {
    id: 'xihu-youlan-zhiyu',
    title: '西湖游览志余',
    author: '田汝成',
    era: '明·嘉靖',
    city: '杭州',
    cityGeo: { lat: 30.245, lng: 120.14 },
    blurb: '辑录南宋至明中期杭州掌故轶闻，白蛇、济颠等西湖传说的早期文献源头。',
  },
  {
    id: 'yuhang-langu-ci',
    title: '余杭览古词',
    author: '陈璨（题，待考）',
    era: '清·乾隆（待考）',
    city: '杭州',
    cityGeo: { lat: 30.24, lng: 120.145 },
    blurb: '题咏杭州史事名胜的小令五十首；书目无征、原书未见，存目待考。',
  },
  {
    id: 'gushan-zhi',
    title: '孤山志',
    author: '王复礼',
    era: '清·康熙',
    city: '杭州',
    cityGeo: { lat: 30.2557, lng: 120.1412 },
    blurb: '《御览孤山志》一卷：孤山林逋遗迹与湖山胜概的山志。',
  },
  {
    id: 'yunqi-jishi',
    title: '云栖纪事',
    author: '阙名辑（旧题释袾宏，待考）',
    era: '明万历创始 · 清递增修',
    city: '杭州',
    cityGeo: { lat: 30.1637, lng: 120.091 },
    blurb: '云栖寺专志：莲池大师中兴始末、康乾南巡与八景题咏——寺今已不存。',
  },
];

export const CURATED_PLACES: Record<string, RoamPlaceSeed[]> = {
  'taoan-mengyi': [
    {
      id: 'tam-huxinting',
      name: '湖心亭',
      status: 'extant',
      confidence: 'high',
      quote: '大雪三日，湖中人鸟声俱绝。……独往湖心亭看雪。',
      chapter: '卷三 · 湖心亭看雪',
      note: '今仍在西湖外湖中央，可乘船抵达；张岱雪夜遇客共饮处。',
      lat: 30.2464,
      lng: 120.1445,
    },
    {
      id: 'tam-duanqiao',
      name: '断桥',
      modernName: '断桥残雪',
      status: 'extant',
      confidence: 'high',
      quote: '西湖七月半，一无可看，止可看看七月半之人。',
      chapter: '卷七 · 西湖七月半',
      note: '白堤东端；张岱笔下七月半看人处，今日仍是西湖最挤的打卡点。',
      lat: 30.259,
      lng: 120.1516,
    },
    {
      id: 'tam-shilihehua',
      name: '十里荷花',
      modernName: '曲院风荷一带',
      status: 'extant',
      confidence: 'medium',
      quote: '酣睡于十里荷花之中，香气拍人，清梦甚惬。',
      chapter: '卷七 · 西湖七月半',
      note: '文末纵舟酣睡处，今曲院风荷夏季荷区可对应。',
      lat: 30.25,
      lng: 120.133,
    },
  ],
  'xihu-mengxun': [
    {
      id: 'xhm-baochuta',
      name: '保俶塔',
      status: 'extant',
      confidence: 'high',
      note: '宝石山巅，西湖天际线的锚点；旧谚以「美人」拟其塔影。',
      lat: 30.2597,
      lng: 120.144,
    },
    {
      id: 'xhm-lingyin',
      name: '灵隐寺',
      status: 'extant',
      confidence: 'high',
      note: '东晋古刹，张岱记其香市之盛；冷泉亭今仍可访。',
      lat: 30.241,
      lng: 120.097,
    },
    {
      id: 'xhm-feilaifeng',
      name: '飞来峰',
      status: 'extant',
      confidence: 'high',
      note: '灵隐寺前造像山，五代至元石刻三百余尊。',
      lat: 30.24,
      lng: 120.099,
    },
    {
      id: 'xhm-yuewangfen',
      name: '岳王坟',
      modernName: '岳王庙',
      status: 'extant',
      confidence: 'high',
      note: '北山街岳庙；张岱专条记之，今岳飞墓阙与「尽忠报国」照壁仍在。',
      lat: 30.2557,
      lng: 120.13,
    },
    {
      id: 'xhm-xilingqiao',
      name: '西泠桥 · 苏小小墓',
      status: 'rebuilt',
      confidence: 'medium',
      note: '西泠桥畔慕才亭；苏小小墓屡毁屡建，今亭墓为 2004 年重修。',
      lat: 30.257,
      lng: 120.137,
    },
    {
      id: 'xhm-santanyinyue',
      name: '三潭印月',
      modernName: '小瀛洲',
      status: 'extant',
      confidence: 'high',
      note: '明万历浚湖堆岛而成；湖中三塔即「三潭」。',
      lat: 30.239,
      lng: 120.142,
    },
    {
      id: 'xhm-leifengta',
      name: '雷峰塔',
      status: 'rebuilt',
      confidence: 'high',
      note: '张岱所见旧塔 1924 年倾圮，2002 年原址重建；塔内可看旧塔砖遗址。',
      lat: 30.2318,
      lng: 120.1488,
    },
  ],
  'wulin-jiushi': [
    {
      id: 'wlj-yujie',
      name: '御街',
      modernName: '南宋御街（中山中路）',
      status: 'extant',
      confidence: 'high',
      chapter: '卷二 · 元夕',
      note: '临安城中轴天街，元夕观灯主线；今设南宋御街遗址街区。',
      lat: 30.24,
      lng: 120.1685,
    },
    {
      id: 'wlj-beiwa',
      name: '众安桥 · 北瓦',
      status: 'memory-only',
      confidence: 'medium',
      note: '南宋最大瓦子「北瓦」勾栏所在；实体无存，众安桥地名尚在。',
      lat: 30.257,
      lng: 120.166,
    },
    {
      id: 'wlj-wushan',
      name: '吴山',
      modernName: '城隍山',
      status: 'extant',
      confidence: 'high',
      note: '俯瞰御街与钱塘江的城中山，今城隍阁可登。',
      lat: 30.2408,
      lng: 120.157,
    },
    {
      id: 'wlj-zhejiangting',
      name: '浙江亭观潮',
      status: 'memory-only',
      confidence: 'medium',
      quote: '浙江之潮，天下之伟观也。自既望以至十八日为最盛。',
      chapter: '卷三 · 观潮',
      note: '京尹教阅水军之地，亭已无存；今可至钱塘江畔（南星桥—六和塔段）望江怀想。',
      lat: 30.196,
      lng: 120.15,
    },
    {
      id: 'wlj-liuheta',
      name: '六和塔',
      status: 'extant',
      confidence: 'high',
      note: '镇潮而建的江畔古塔，观潮时代的地标，今可登临。',
      lat: 30.199,
      lng: 120.122,
    },
    {
      id: 'wlj-qiwangfu',
      name: '蕲王府',
      status: 'memory-only',
      confidence: 'low',
      note: '韩世忠蕲王府邸，方位存疑（旧城清波门一带），实体无存——考据待你现场求证。',
      lat: 30.238,
      lng: 120.153,
    },
  ],
  // 引文出处：维基文库《咸淳臨安志》四库全书本（卷1/3/21/22/32），文字为四库本原貌（无句读）
  'xianchun-linan-zhi': [
    {
      id: 'xcl-yujie', name: '御街', modernName: '中山路 · 南宋御街', status: 'rebuilt', confidence: 'high',
      quote: '自和宁门外至景灵宫前为乘舆所经之路', chapter: '卷二十一',
      note: '今中山路即其走向，2009 年改造为步行街；中山中路遗址陈列馆可看宋代路面。',
      lat: 30.24, lng: 120.169,
    },
    {
      id: 'xcl-taimiao', name: '太庙', modernName: '太庙遗址公园', status: 'memory-only', confidence: 'medium',
      quote: '在瑞石山之左绍兴四年诏守臣梁汝嘉造', chapter: '卷三',
      note: '建筑早毁，1995 年考古发现基址，今太庙巷遗址广场。',
      lat: 30.231, lng: 120.1685,
    },
    {
      id: 'xcl-liubuqiao', name: '六部桥', status: 'extant', confidence: 'medium',
      quote: '六部桥〈旧称都亭驿桥〉', chapter: '卷二十一',
      note: '南宋因六部官署在侧得名，跨中河单孔石拱桥仍在原址，市文保单位。',
      lat: 30.2235, lng: 120.168,
    },
    {
      id: 'xcl-wushan', name: '吴山', status: 'extant', confidence: 'high',
      quote: '在城中吴人祠子胥山上因名曰胥山', chapter: '卷二十二',
      note: '山体如故可登；书中所记伍子胥祠已废，今山顶城隍阁为 2000 年新建。',
      lat: 30.241, lng: 120.164,
    },
    {
      id: 'xcl-huangcheng', name: '凤凰山皇城', modernName: '南宋皇城遗址', status: 'memory-only', confidence: 'medium',
      quote: '在凤凰山即杭州州治建炎三年二月诏以为行宫', chapter: '卷一',
      note: '皇城元初焚毁无存，遗址回填未展示；馒头山社区一带可寻。',
      lat: 30.223, lng: 120.156,
    },
    {
      id: 'xcl-xihu', name: '西湖', status: 'extant', confidence: 'high',
      quote: '旧名钱塘湖源出于武林泉周回三十里自唐及国朝号游观胜地', chapter: '卷三十二',
      note: '湖体如宋时周回约三十里，今为世界文化遗产。',
      lat: 30.244, lng: 120.142,
    },
    {
      id: 'xcl-sugongdi', name: '苏公堤', modernName: '苏堤', status: 'extant', confidence: 'high',
      quote: '东坡既奏开浚湖水因以所积葑草筑为长堤起南迄北横截湖面', chapter: '卷三十二',
      note: '东坡以浚湖葑草筑堤，六桥俱在，「苏堤春晓」仍居西湖十景之首。',
      lat: 30.2435, lng: 120.133,
    },
  ],
  // 引文出处：维基文库/ctext《西湖遊覽志餘》（繁体原文）
  'xihu-youlan-zhiyu': [
    {
      id: 'xyz-leifengta', name: '雷峰塔', status: 'rebuilt', confidence: 'high',
      quote: '若紅蓮、柳翠、濟顛、雷峰塔、雙魚扇墜等記，皆杭州異事',
      note: '白蛇传的早期文献线索之一；原塔 1924 年倒塌，2002 年原址重建。',
      lat: 30.2316, lng: 120.1488,
    },
    {
      id: 'xyz-feilaifeng', name: '飞来峰', status: 'extant', confidence: 'high',
      quote: '既是飛來，如何不飛去？對曰：一動不如一靜。',
      note: '石峰未动，五代至元造像三百余尊俱在。',
      lat: 30.2404, lng: 120.0995,
    },
    {
      id: 'xyz-lingyin', name: '灵隐寺', status: 'extant', confidence: 'high',
      quote: '駱賓王之敗也，落髮靈隱寺中，人無識者。',
      note: '寺史屡毁屡建，今殿宇多为清末以来重修，山门前五代双石塔尚存。',
      lat: 30.2419, lng: 120.0977,
    },
    {
      id: 'xyz-geling', name: '葛岭', status: 'extant', confidence: 'high',
      quote: '今其墓在葛嶺，而煉丹諸井，蓋其避地時遺蹟也。',
      note: '葛洪炼丹处；抱朴道院与炼丹古井遗迹尚在，北山街葛岭路口可上山。',
      lat: 30.2555, lng: 120.139,
    },
    {
      id: 'xyz-wushan', name: '吴山庙会', modernName: '吴山', status: 'extant', confidence: 'high',
      quote: '杭州行宮凡五處，而在吳山上者最盛。',
      note: '东岳庙会旧俗所在；山在城中可登，城隍阁为 2000 年新建景观楼。',
      lat: 30.2398, lng: 120.1635,
    },
    {
      id: 'xyz-duanqiao', name: '断桥', status: 'rebuilt', confidence: 'high',
      quote: '山逗晴光玉氣浮，我來乘興似王猷。',
      note: '「断桥雪棹」题咏处；桥址未移而桥身为民国改筑。',
      lat: 30.2591, lng: 120.1516,
    },
    {
      id: 'xyz-yongjinmen', name: '涌金门', modernName: '涌金公园一带', status: 'memory-only', confidence: 'high',
      quote: '湧金門外小瀛洲，寒食更風流。',
      note: '城门 1913 年拆除，今存涌金公园与地名，湖畔有金牛出水雕塑。',
      lat: 30.2473, lng: 120.1568,
    },
    {
      id: 'xyz-qingbomen', name: '清波门', modernName: '清波街口一带', status: 'memory-only', confidence: 'medium',
      quote: '清波門裏竹園山平地湧血，須臾成池',
      note: '书中灾异志怪之记；城门民国初拆除，仅存地名街巷，近柳浪闻莺。',
      lat: 30.24, lng: 120.1553,
    },
  ],
  // 原书未见（书目无征待考），全部不放引文，只做地点存目
  'yuhang-langu-ci': [
    {
      id: 'ylc-xihu', name: '西湖', status: 'extant', confidence: 'high',
      note: '全书总题所在；苏白二堤、三岛湖山格局与清代大体相承。',
      lat: 30.2455, lng: 120.1445,
    },
    {
      id: 'ylc-yanxialing', name: '烟霞岭', modernName: '南高峰烟霞洞', status: 'extant', confidence: 'medium',
      note: '烟霞三洞之一尚存，洞内吴越国石刻罗汉可看，自满觉陇上行可达。',
      lat: 30.22, lng: 120.122,
    },
    {
      id: 'ylc-biaozhongguan', name: '表忠观', modernName: '钱王祠', status: 'rebuilt', confidence: 'high',
      note: '北宋为钱氏而建，苏轼撰碑；今柳浪闻莺旁钱王祠为 2003 年原址重建。',
      lat: 30.2402, lng: 120.1512,
    },
    {
      id: 'ylc-shechao', name: '钱镠射潮处', modernName: '候潮路一带', status: 'memory-only', confidence: 'low',
      note: '钱王射潮传说地；候潮门民国拆除仅存路名，钱江新城有现代射潮雕塑。',
      lat: 30.2268, lng: 120.1786,
    },
    {
      id: 'ylc-zhongmei', name: '林逋种梅处', modernName: '孤山放鹤亭', status: 'rebuilt', confidence: 'high',
      note: '「林逋种梅」词题所咏；墓尚存孤山北麓，放鹤亭为 1915 年重修，冬可探梅。',
      lat: 30.2543, lng: 120.1449,
    },
  ],
  // 《御览孤山志》（清·王复礼，武林掌故丛编本）：原文未见电子本，不放引文
  'gushan-zhi': [
    {
      id: 'gsz-gushan', name: '孤山', status: 'extant', confidence: 'high',
      note: '西湖中最大天然岛山，全书即为此山作志；经白堤或西泠桥皆可步入。',
      lat: 30.2557, lng: 120.1412,
    },
    {
      id: 'gsz-fangheting', name: '放鹤亭', status: 'rebuilt', confidence: 'high',
      note: '纪念林逋梅妻鹤子处；今亭为 1915 年重建，内存康熙临董其昌《舞鹤赋》刻石。',
      lat: 30.257, lng: 120.1447,
    },
    {
      id: 'gsz-linbumu', name: '林逋墓', modernName: '林和靖墓', status: 'rebuilt', confidence: 'high',
      note: '和靖先生葬于孤山故庐之侧，墓在放鹤亭后，今冢为后世重修。',
      lat: 30.2567, lng: 120.145,
    },
    {
      id: 'gsz-manaopo', name: '玛瑙坡', status: 'extant', confidence: 'medium',
      note: '孤山南麓因旧产玛瑙石得名；坡地尚在，西泠印社一带有吴昌硕题刻。',
      lat: 30.2552, lng: 120.1396,
    },
    {
      id: 'gsz-xilingqiao', name: '西泠桥', status: 'rebuilt', confidence: 'high',
      note: '孤山西接北山的古渡口，宋称西林桥；今石拱桥为民国重建。',
      lat: 30.2578, lng: 120.135,
    },
    {
      id: 'gsz-sizhaoge', name: '四照阁', status: 'rebuilt', confidence: 'medium',
      note: '宋初建于孤山之巅四面轩窗可览全湖，后久废；西泠印社近旧址重建，今为社中茶室。',
      lat: 30.2555, lng: 120.1383,
    },
  ],
  // 引文出处：法鼓文理学院《中国佛寺史志》数位典藏 g027（清光绪钱塘丁氏重刊本）
  'yunqi-jishi': [
    {
      id: 'yqj-yunqisi', name: '云栖寺', modernName: '云栖竹径', status: 'memory-only', confidence: 'high',
      quote: '循山麓而西四五里，是為雲棲塢，則今蓮池禪師之道塲也', chapter: '董其昌《建云栖禅院碑记》',
      note: '寺经咸丰兵燹后湮废，今为云栖竹径景区：竹海、古枫香与亭碑尚在，寺基无存。',
      lat: 30.1637, lng: 120.091,
    },
    {
      id: 'yqj-wuyunshan', name: '五云山', status: 'extant', confidence: 'medium',
      quote: '蓋杭之諸山，最高者曰五雲，登其巔，則南北兩高峯如兒孫矣', chapter: '《云栖兰若志》',
      note: '海拔约 334 米，可自云栖竹径登山；书载伏虎禅师筑室五云顶，莲池大师塔于山麓。',
      lat: 30.174, lng: 120.102,
    },
    {
      id: 'yqj-songgugong', name: '凤凰山宋故宫', modernName: '南宋皇城遗址', status: 'memory-only', confidence: 'high',
      quote: '折而東，是為鳳皇諸山。宋之故宮在焉', chapter: '董其昌《建云栖禅院碑记》',
      note: '书开篇即以宋故宫定位云栖；皇城元初已毁，今凤凰山麓存遗址保护区与摩崖。',
      lat: 30.2228, lng: 120.165,
    },
    {
      id: 'yqj-fancun', name: '梵村', modernName: '之江路梵村', status: 'extant', confidence: 'low',
      quote: '其徑自梵村入十里，溪山窈窕，草樹蒙密，敻隔人境', chapter: '《云栖兰若志》',
      note: '古人自钱塘江畔梵村舍舟入坞进香；村落已改建，地名与公交站犹存。',
      lat: 30.154, lng: 120.094,
    },
    {
      id: 'yqj-xihu', name: '西湖', status: 'extant', confidence: 'high',
      quote: '雲棲最愛幽而樸，每至西湖必兩來', chapter: '乾隆《再游云栖作》',
      note: '康熙五幸、乾隆八度云栖，每驻跸西湖必再游；环湖即可起步循御道方向西行。',
      lat: 30.2427, lng: 120.1443,
    },
    {
      id: 'yqj-shuangbeiting', name: '云栖双碑亭', status: 'rebuilt', confidence: 'low',
      quote: '觀此便知僧皆苦修，非世法圖名聞利養者', chapter: '盛典恭纪 · 康熙二十八年幸寺',
      note: '两帝御碑已佚；竹径内碑亭与入口新碑亭尚可寻访。',
      lat: 30.166, lng: 120.089,
    },
    {
      id: 'yqj-shangfangsi', name: '上方寺放生池', modernName: '湖滨旧城垣内', status: 'memory-only', confidence: 'low',
      quote: '有上方寺者，背倚城垣，左右掖湧金錢塘二門', chapter: '袾宏《重修上方寺凿放生池记》',
      note: '莲池大师在城中兴复的放生道场，今湖滨商圈已无迹，唯涌金门、钱塘门遗址可考。',
      lat: 30.252, lng: 120.158,
    },
  ],
};
