// 案例种子：旧项目「把所有的诗都种回到地球上」的全部 11 棵诗歌树（诗 + 四维 + 地点 + 自制影像）。
// 数据逐字迁自旧项目 NearbyTab/DiscoverTab/personal.json：四维是用户原始标注，落点是当年种下的位置
// （不按诗人国籍——小林一茶的树就种在西湖边），影像是用户自制 OSS 素材（加载失败自动回退 Canvas）。
// 分区：杭州 5 棵（悉达多/乔伊斯/张枣/一茶/泽拉兹尼）+ 世界 6 棵（博尔赫斯/狄兰·托马斯/惠特曼/佩索阿/洛尔迦/策兰）。
import { type PoemTree } from './types';
import { poemSeed } from './sketch';

const OSS = 'https://poem-plant-assets.oss-cn-beijing.aliyuncs.com';
// AR视频/ 目录素材（封面、动态视频）与根目录诗歌视频，文件名含中文需编码
const ar = (name: string) => `${OSS}/${encodeURIComponent('AR视频')}/${encodeURIComponent(name)}`;
const pv = (name: string) => `${OSS}/${encodeURIComponent(name)}`;

interface Seed { title?: string; poet: string; lines: string[]; excerpt: string; place: string; lng: number; lat: number; lux: number; temp: number; flux: number; grav: number; video?: string; cover?: string; arVideo?: string }

const SEEDS: Seed[] = [
  // —— 杭州 · 西湖畔的五棵 ——
  {
    title: '悉达多', poet: '赫尔曼·黑塞', place: '西湖 · 断桥', lng: 120.1480, lat: 30.2593,
    excerpt: '我爱一块石头，爱一棵树或一块树皮。',
    lines: ['或许我想说，', '我爱石头、河水，', '爱所有我们可见并可以求教之物。', '我爱一块石头，乔文达，', '爱一棵树或一块树皮。', '这些是物，可爱之物。'],
    lux: 78, temp: 52, flux: 32, grav: 72, video: pv('1-3-《悉达多》.mp4'), arVideo: ar('10-动态视频-悉达多.mp4'),
  },
  {
    poet: '詹姆斯·乔伊斯', place: '西湖 · 平湖秋月', lng: 120.1520, lat: 30.2620,
    excerpt: '再从粗粝的泥土或是泥土生长的万物中……这就是艺术。',
    lines: ['谈论这些东西，', '设法去理解它们的性质，', '理解之后，', '再从粗粝的泥土或是泥土生长的万物中，', '慢慢地谨慎地，', '把我们所理解的美的形象表达出来，', '这就是艺术。'],
    lux: 84, temp: 28, flux: 58, grav: 55, video: pv('1-3-乔伊斯.mp4'),
  },
  {
    title: '镜中', poet: '张枣', place: '西湖 · 苏堤', lng: 120.1390, lat: 30.2410,
    excerpt: '只要想起一生中后悔的事，梅花便落满了南山。',
    lines: ['只要想起一生中后悔的事', '梅花便落了下来', '比如看她游泳到河的另一岸', '比如登上一株松木梯子', '危险的事固然美丽', '不如看她骑马归来', '面颊温暖', '羞惭。低下头，回答着皇帝', '一面镜子永远等候她', '让她坐到镜中常坐的地方', '望着窗外，只要想起一生中后悔的事', '梅花便落满了南山'],
    lux: 76, temp: 58, flux: 34, grav: 56, video: pv('1-张枣的诗.mp4'), cover: ar('07封面.jpg'), arVideo: ar('07-动态视频-张枣.mp4'),
  },
  {
    poet: '小林一茶', place: '西湖 · 花港观鱼', lng: 120.1330, lat: 30.2320,
    excerpt: '从现在起，不知还要开多少回呢……',
    lines: ['从现在起，不知', '还要开多少回呢……'],
    lux: 38, temp: 28, flux: 18, grav: 52, video: pv('3-小林一茶的诗.mp4'), cover: ar('09封面.jpg'), arVideo: ar('小林一茶.mp4'),
  },
  {
    poet: '罗杰·泽拉兹尼', place: '西湖 · 湖东岸', lng: 120.1560, lat: 30.2529,
    excerpt: '后来，她让摩根，那个平原诗人，做了自己的情人。',
    lines: ['后来，', '她让摩根，那个平原诗人，做了自己的情人', '有一天，他转世成一只灰冠雀飞走了', '你于是开始捕猎灰冠雀，', '一个月之内，', '天庭中所有的灰冠雀几乎都死在了你的箭下。'],
    lux: 82, temp: 42, flux: 56, grav: 46, video: pv('2-泽拉兹尼的诗.mp4'), cover: ar('08封面.jpg'), arVideo: ar('08-动态视频-泽拉兹尼.mp4'),
  },
  // —— 世界 · 六座城市的六棵 ——
  {
    poet: '豪尔赫·路易斯·博尔赫斯', place: 'Buenos Aires · 布宜诺斯艾利斯', lng: -58.3816, lat: -34.6037,
    excerpt: '我给你瘦落的街道，绝望的落日，荒郊的月亮。',
    lines: ['我给你瘦落的街道，', '绝望的落日，', '荒郊的月亮，', '我给你一个久久地望着孤月的人的悲哀。', '我给你我的书中所能蕴含的一切悟力，', '以及我生活中所能有的男子气概和幽默，', '我给你一个从未有过信仰的人的忠诚。', '我给你我设法保全的我自己的核心，', '不营字造句，不和梦交易，', '不被时间、欢乐和逆境触动的核心。', '我给你早在你出生前多年的一个傍晚看到的一朵黄玫瑰的记忆。', '我给你我的寂寞，', '我的黑暗，', '我心的饥渴，', '我试图用困惑、危险、失败来打动你。'],
    lux: 78, temp: 55, flux: 62, grav: 82, video: pv('1-博尔赫斯诗歌视频.mp4'), cover: ar('01封面.jpg'), arVideo: ar('01-动态视频-博尔赫斯.mp4'),
  },
  {
    poet: '狄兰·托马斯', place: 'Swansea · 斯旺西', lng: -3.9436, lat: 51.6214,
    excerpt: '通过绿色导火索催开花朵的力量，催开我绿色年华。',
    lines: ['通过绿色导火索催开花朵的力量', '催开我绿色年华；炸毁树根的力量', '是我的毁灭者。', '而我哑然告知弯曲的玫瑰', '我的青春同样被冬天的高烧压弯。', '驱动穿透岩石之水的力量', '驱动我的鲜血；枯竭滔滔不绝的力量', '使我的血凝结。', '时间之唇蛭吸源泉；', '爱情滴散聚合，但沉落的血', '会平息她的痛楚。', '我哑然告知一种气候的风', '时间怎样沿星星滴答成天堂。'],
    lux: 46, temp: 78, flux: 74, grav: 76, video: pv('2-狄兰·托马斯到诗.mp4'), cover: ar('02封面.jpg'), arVideo: ar('02-动态视频-狄兰托马斯.mp4'),
  },
  {
    poet: '沃尔特·惠特曼', place: 'New York · 纽约', lng: -74.006, lat: 40.7128,
    excerpt: '我俩，我们被愚弄了这么久。',
    lines: ['我俩，我们被愚弄了这么久，', '可现在变了，我们飞速地逃跑，像大自然一样逃跑，', '我们就是大自然，我们离开此地已久，但现在我们回来了，', '我们成了植物、树干、树叶、树根、树皮，', '我们被安装在地上，我们是岩石，', '我们是橡树，我们并排生长在林中的空地上，', '我们是两条鱼，在大海里一同游泳着，', '我们像刺槐的花朵，我们早晚在小巷周围散发芳香，', '我们是午前午后在天空中奔驰着的两朵云彩，', '我们是交缠在一起的海洋，我们是两个欢乐的浪头在彼此身上翻滚着又互相浇湿着，', '我们转了一圈又一圈直到我们又回到了家里，我们俩，', '我们排除了一切的一切除了自由和我们自己的欢乐'],
    lux: 86, temp: 72, flux: 82, grav: 38, video: pv('3-惠特曼的诗.mp4'), cover: ar('03封面.jpg'), arVideo: ar('03-动态视频-惠特曼.mp4'),
  },
  {
    poet: '费尔南多·佩索阿', place: 'Lisbon · 里斯本', lng: -9.1393, lat: 38.7223,
    excerpt: '我开始明白我自己。我不存在。',
    lines: ['我开始明白我自己。我不存在。', '我是我想成为的那个人和别人把我塑造成的那个人之间的裂缝。', '或半个裂缝，因为还有生活……', '这就是我。没有了……', '关灯，闭户，把走廊里的拖鞋声隔绝。', '让我一个人待在屋里，和我自己巨大的平静待在一起。', '这是一个冒牌的宇宙。'],
    lux: 62, temp: 32, flux: 22, grav: 72, video: pv('4-佩索阿的诗.mp4'), cover: ar('04封面.jpg'), arVideo: ar('04-动态视频-佩索阿.mp4'),
  },
  {
    poet: '费德里科·加西亚·洛尔迦', place: 'Granada · 格拉纳达', lng: -3.5986, lat: 37.1773,
    excerpt: '绿啊，我多么爱你这绿色。绿的风，绿的树枝。',
    lines: ['绿啊，我多么爱你这绿色。', '绿的风，绿的树枝。', '船在海上，', '马在山中。', '影子缠在腰间，', '她在露台上做梦。', '绿的肌肤，绿的头发，', '还有银子般沁凉的眼睛。', '在吉卜赛人的月亮下，', '一切都望着她，', '而她却看不见它们。', '可是谁将到来？从哪儿？', '她徘徊在露台上，', '绿的肌肤，绿的头发，', '梦见苦辛的大海。'],
    lux: 56, temp: 60, flux: 48, grav: 58, video: pv('5-洛尔迦的诗.mp4'), cover: ar('05封面.jpg'), arVideo: ar('05-动态视频-洛尔迦.mp4'),
  },
  {
    poet: '保罗·策兰', place: 'Paris · 巴黎', lng: 2.3522, lat: 48.8566,
    excerpt: '我们相爱像罂粟和回忆。',
    lines: ['我们互相看着，', '我们交换黑暗的词语，', '我们相爱像罂粟和回忆，', '我们睡去像海螺中的酒，', '血色月光中的海。', '我们在窗口拥抱，人们从街上张望：', '是让他们知道的时候了！', '是石头要开花的时候了，', '时间动荡有颗跳动的心。', '是过去成为此刻的时候了。', '是时候了。'],
    lux: 52, temp: 66, flux: 54, grav: 86, video: pv('6-保罗·策兰的诗.mp4'), cover: ar('06封面.jpg'), arVideo: ar('06-动态视频-保罗策兰.mp4'),
  },
];

export const POEM_TREE_SEEDS: PoemTree[] = SEEDS.map((s) => {
  const id = 'seed-' + poemSeed((s.title || '') + s.poet).toString(36);
  return {
    id,
    poem: { title: s.title, poet: s.poet, lines: s.lines, excerpt: s.excerpt },
    attributes: { lux: s.lux, temp: s.temp, flux: s.flux, grav: s.grav },
    spot: { place: s.place, lng: s.lng, lat: s.lat, kind: 'named' as const },
    seed: poemSeed(s.lines.join('')),
    videoUrl: s.video,
    coverUrl: s.cover,
    arVideoUrl: s.arVideo,
    source: 'seed' as const,
    createdAt: 0,
  };
});

/** 杭州/世界分区：按种下的坐标判（落点不按诗人国籍——一茶的树就在西湖边） */
export function isHangzhouTree(t: PoemTree): boolean {
  return !!t.spot && t.spot.lng > 119 && t.spot.lng < 121 && t.spot.lat > 29.5 && t.spot.lat < 31;
}
