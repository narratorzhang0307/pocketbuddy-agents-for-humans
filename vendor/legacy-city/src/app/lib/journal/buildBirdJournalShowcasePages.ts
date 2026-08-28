// 杭州观鸟手帐的三页固定样张：树冠晨声 / 湖面蓝闪 / 林下雨后。
// 主鸟插画来自用户提供的 82 款矢量鸟类素材包，经裁切与透明化后作为普通 cutout 元素使用；
// 所有元素仍可在 CollageCanvas 中拖动、缩放、删除和导出。
import type { InitialInput } from './buildInitialPage';
import type { JournalElement, JournalPage } from './types';

export const BIRD_JOURNAL_SHOWCASE_PREFIX = 'pg-bird-journal-showcase-v3-hangzhou';

export type BirdJournalMotion = 'perch' | 'hop' | 'flutter' | 'forage' | 'scan' | 'dive';

export interface BirdJournalScene {
  slug: string;
  eyebrow: string;
  environment: string;
  targetBird: string;
  targetBehavior: string;
  cue: string;
  success: string;
  captureX: number;
  captureY: number;
  accent: string;
}

const BIRD_JOURNAL_SCENES: BirdJournalScene[] = [
  {
    slug: 'bulbul-morning', eyebrow: '06:42 · 苏堤树冠', environment: '晨风 / 香樟 / 连续短鸣',
    targetBird: '白头鹎', targetBehavior: '振翅换枝', cue: '先听一串短音，再找白色枕斑',
    success: '树冠换枝的瞬间已收入手帐', captureX: 0.84, captureY: 0.16, accent: '#76c99d',
  },
  {
    slug: 'kingfisher-flash', eyebrow: '07:18 · 茅家埠湖岸', environment: '静水 / 低枝 / 贴水飞行',
    targetBird: '普通翠鸟', targetBehavior: '俯冲前探身', cue: '听见短促尖声后，盯住水面上方',
    success: '湖面的蓝色闪光已收入手帐', captureX: 0.84, captureY: 0.16, accent: '#6acbd3',
  },
  {
    slug: 'blackbird-after-rain', eyebrow: '16:26 · 孤山林下', environment: '雨后 / 湿草 / 翻叶觅食',
    targetBird: '乌鸫', targetBehavior: '低头翻叶', cue: '等它停下两步，再看橙黄色的嘴',
    success: '雨后翻叶的动作已收入手帐', captureX: 0.84, captureY: 0.16, accent: '#e4a25e',
  },
];

export function getBirdJournalScene(pageId: string): BirdJournalScene | undefined {
  return BIRD_JOURNAL_SCENES.find((scene) => pageId === `${BIRD_JOURNAL_SHOWCASE_PREFIX}-${scene.slug}`);
}

type ElementSpec = Omit<JournalElement, 'id' | 'z'>;

function makePage(input: InitialInput, slug: string, title: string, bg: JournalPage['bg']) {
  const id = `${BIRD_JOURNAL_SHOWCASE_PREFIX}-${slug}`;
  const elements: JournalElement[] = [];
  let z = 0;
  const add = (suffix: string, element: ElementSpec) => {
    elements.push({ ...element, id: `${id}-${suffix}`, z: z++ });
  };
  const art = (
    suffix: string, ref: string, birdName: string, motion: BirdJournalMotion,
    behavior: string, x: number, y: number, w: number, rot = 0,
  ) => {
    add(suffix, {
      type: 'cutout', x, y, w, rot, scale: 1,
      meta: {
        photoRef: { ref, isUrl: true }, birdJournalAsset: true, showcase: true,
        birdName, birdMotion: motion, birdBehavior: behavior,
      },
    });
  };
  const finish = (): JournalPage => ({
    id, city: input.city, title, bg, elements, createdAt: 0, updatedAt: 0,
  });
  return { add, art, finish };
}

function buildBulbulMorning(input: InitialInput): JournalPage {
  const page = makePage(input, 'bulbul-morning', '苏堤晨声', 'paper');
  const month = input.date ?? '2026-08';

  page.add('paper-field', { type: 'kraft', x: 0.50, y: 0.50, w: 0.96, rot: -1, scale: 1, color: '#eee3c9', meta: { ar: 0.82 } });
  page.add('canopy-field', { type: 'kraft', x: 0.59, y: 0.45, w: 0.78, rot: 2, scale: 1, color: '#d8e4c2', meta: { ar: 1.35 } });
  page.add('branch-one', { type: 'tape', x: 0.61, y: 0.54, w: 0.72, rot: -8, scale: 1, color: '#876647dd' });
  page.add('branch-two', { type: 'tape', x: 0.74, y: 0.42, w: 0.40, rot: 25, scale: 1, color: '#9c7d5ddd' });
  page.add('title', { type: 'note', x: 0.25, y: 0.105, w: 0.43, rot: -2, scale: 1, color: '#fffaf0', text: '01 · 苏堤晨声\n树冠里的三位邻居' });
  page.add('title-tape', { type: 'tape', x: 0.24, y: 0.035, w: 0.22, rot: -3, scale: 1, color: '#a8c9a4cc' });
  page.add('clip', { type: 'clip', x: 0.08, y: 0.13, w: 0.045, rot: 10, scale: 1 });
  page.art('bulbul', '/assets/bird-journal/white-headed-bulbul.png', '白头鹎', 'flutter', '振翅换枝', 0.65, 0.34, 0.39, 2);
  page.art('sparrow', '/assets/bird-journal/eurasian-tree-sparrow.png', '麻雀', 'hop', '枝头跳跃', 0.24, 0.62, 0.20, -5);
  page.art('blackbird', '/assets/bird-journal/common-blackbird.png', '乌鸫', 'scan', '侧头听声', 0.78, 0.64, 0.24, 4);

  page.add('field-note', { type: 'bubble', x: 0.28, y: 0.37, w: 0.31, rot: -2, scale: 1, color: '#fffdf5', text: '一串短音从樟树顶滚下来。\n别急着翻图鉴，先抬头。' });
  page.add('sound-ticket', { type: 'note', x: 0.27, y: 0.83, w: 0.39, rot: -3, scale: 1, text: `晨间观察页\n苏堤 · 柳岸 · ${month}\n白头鹎 / 麻雀 / 乌鸫\nLIVE-0642`, meta: { ticketVariant: 'city' } });
  page.add('legend', { type: 'note', x: 0.73, y: 0.83, w: 0.39, rot: 2, scale: 1, color: '#f7f1df', text: '观察提示\n● 跳枝  ● 侧听  ● 振翅\n等动作出现，再按下抓拍' });
  page.add('seal', { type: 'sticker', x: 0.92, y: 0.72, w: 0.075, rot: -9, scale: 1, color: '#5c8467', meta: { shape: 'seal' } });

  return page.finish();
}

function buildKingfisherFlash(input: InitialInput): JournalPage {
  const page = makePage(input, 'kingfisher-flash', '湖面蓝闪', 'grid');
  const month = input.date ?? '2026-08';

  page.add('paper-field', { type: 'kraft', x: 0.50, y: 0.50, w: 0.96, rot: 1, scale: 1, color: '#edf0e7', meta: { ar: 0.82 } });
  page.add('water-field', { type: 'kraft', x: 0.49, y: 0.45, w: 0.88, rot: -1, scale: 1, color: '#c9e4e6', meta: { ar: 1.25 } });
  page.add('bank-field', { type: 'kraft', x: 0.22, y: 0.45, w: 0.24, rot: 3, scale: 1, color: '#cbd9ad', meta: { ar: 0.54 } });
  page.add('perch', { type: 'tape', x: 0.51, y: 0.48, w: 0.42, rot: -9, scale: 1, color: '#765a42dd' });
  page.add('title', { type: 'note', x: 0.25, y: 0.10, w: 0.43, rot: 2, scale: 1, color: '#fffaf0', text: '02 · 湖面蓝闪\n水边的等待练习' });
  page.add('title-tape', { type: 'tape', x: 0.29, y: 0.035, w: 0.24, rot: 3, scale: 1, color: '#78cbd3cc' });
  page.art('kingfisher', '/assets/bird-journal/common-kingfisher.png', '普通翠鸟', 'dive', '探身俯冲', 0.52, 0.38, 0.34, -1);
  page.art('bulbul', '/assets/bird-journal/white-headed-bulbul.png', '白头鹎', 'perch', '湖岸停栖', 0.80, 0.61, 0.21, 5);
  page.art('sparrow', '/assets/bird-journal/eurasian-tree-sparrow.png', '麻雀', 'hop', '岸边跳步', 0.18, 0.65, 0.18, -5);

  page.add('watch-note', { type: 'note', x: 0.19, y: 0.35, w: 0.27, rot: -3, scale: 1, color: '#e9f8f7', text: '低枝静候\n探身确认\n突然俯冲\n贴水直飞' });
  page.add('flash-note', { type: 'bubble', x: 0.79, y: 0.38, w: 0.28, rot: 2, scale: 1, color: '#fffdf5', text: '别追着蓝色跑。\n盯住它刚才停过的低枝。' });
  page.add('water-line-one', { type: 'tape', x: 0.50, y: 0.66, w: 0.73, rot: -2, scale: 1, color: '#72bfd0aa' });
  page.add('water-line-two', { type: 'tape', x: 0.61, y: 0.70, w: 0.54, rot: 1, scale: 1, color: '#a5d7dd99' });
  page.add('route-ticket', { type: 'note', x: 0.29, y: 0.84, w: 0.42, rot: -2, scale: 1, text: `水岸观察页\n茅家埠 → 曲院风荷\n${month} · 07:18\n翠鸟 / 白头鹎 / 麻雀`, meta: { ticketVariant: 'route' } });
  page.add('legend', { type: 'note', x: 0.72, y: 0.84, w: 0.37, rot: 3, scale: 1, color: '#eff9f8', text: '抓拍目标\n普通翠鸟俯冲前的探身\n安静一点，等它自己出现' });
  page.add('seal', { type: 'sticker', x: 0.91, y: 0.70, w: 0.07, rot: 7, scale: 1, color: '#3196a8', meta: { shape: 'seal' } });

  return page.finish();
}

function buildBlackbirdAfterRain(input: InitialInput): JournalPage {
  const page = makePage(input, 'blackbird-after-rain', '林下雨后', 'kraft');
  const month = input.date ?? '2026-08';

  page.add('paper-field', { type: 'kraft', x: 0.50, y: 0.50, w: 0.96, rot: -1, scale: 1, color: '#e9dec9', meta: { ar: 0.82 } });
  page.add('lawn-field', { type: 'kraft', x: 0.48, y: 0.45, w: 0.87, rot: 2, scale: 1, color: '#d5dfbd', meta: { ar: 1.24 } });
  page.add('puddle', { type: 'kraft', x: 0.58, y: 0.62, w: 0.44, rot: -3, scale: 1, color: '#b9d6d4', meta: { ar: 2.8 } });
  page.add('title', { type: 'note', x: 0.25, y: 0.105, w: 0.43, rot: -2, scale: 1, color: '#fffaf0', text: '03 · 林下雨后\n落叶下面有什么？' });
  page.add('title-tape', { type: 'tape', x: 0.28, y: 0.035, w: 0.23, rot: -4, scale: 1, color: '#d9a15fcc' });
  page.add('clip', { type: 'clip', x: 0.08, y: 0.13, w: 0.045, rot: 8, scale: 1 });
  page.art('blackbird', '/assets/bird-journal/common-blackbird.png', '乌鸫', 'forage', '低头翻叶', 0.46, 0.39, 0.54, -2);
  page.art('bulbul', '/assets/bird-journal/white-headed-bulbul.png', '白头鹎', 'scan', '侧头观察', 0.80, 0.62, 0.21, 5);
  page.art('sparrow', '/assets/bird-journal/eurasian-tree-sparrow.png', '麻雀', 'hop', '雨后跳步', 0.17, 0.70, 0.18, -5);

  page.add('id-note', { type: 'note', x: 0.80, y: 0.31, w: 0.25, rot: 3, scale: 1, color: '#fff0d7', text: '乌鸫观察卡\n橙黄嘴与眼圈\n走两步，停一下\n翻开湿落叶' });
  page.add('field-note', { type: 'bubble', x: 0.27, y: 0.57, w: 0.32, rot: -1, scale: 1, color: '#fffdf5', text: '雨刚停，草地松软。\n每片落叶都像一扇小门。' });
  page.add('sound-ticket', { type: 'note', x: 0.28, y: 0.84, w: 0.41, rot: -3, scale: 1, text: `雨后观察页\n孤山 · 林下草坪 · ${month}\n乌鸫 / 白头鹎 / 麻雀\nAFTER-RAIN`, meta: { ticketVariant: 'city' } });
  page.add('legend', { type: 'note', x: 0.72, y: 0.84, w: 0.38, rot: 2, scale: 1, color: '#f7ead8', text: '抓拍目标\n乌鸫低头翻开落叶的瞬间\n不要靠近，等它走回来' });
  page.add('seal', { type: 'sticker', x: 0.92, y: 0.70, w: 0.075, rot: -8, scale: 1, color: '#bb6e31', meta: { shape: 'seal' } });

  return page.finish();
}

export function buildBirdJournalShowcasePages(input: InitialInput): JournalPage[] {
  return [buildBulbulMorning(input), buildKingfisherFlash(input), buildBlackbirdAfterRain(input)];
}

export function isBirdJournalShowcasePage(id: string): boolean {
  return id.startsWith(`${BIRD_JOURNAL_SHOWCASE_PREFIX}-`);
}
