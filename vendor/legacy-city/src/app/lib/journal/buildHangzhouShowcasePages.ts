// 杭州手帐的三张默认样张。它们不是随机撒素材，而是三套固定叙事构图：
// 湖上黄昏 / 城市异客 / 搭子夜行。所有元素仍是普通 JournalElement，
// 因而进入画布后照常可拖拽、删改、导出，不产生第二套手帐系统。
import type { JournalElement, JournalPage } from './types';
import type { InitialInput, InitialPhotoRef } from './buildInitialPage';

export const HANGZHOU_SHOWCASE_PREFIX = 'pg-journal-showcase-v1-hangzhou';

type ElementSpec = Omit<JournalElement, 'id' | 'z'>;
type PageBuilder = {
  add: (suffix: string, element: ElementSpec) => void;
  photo: (
    suffix: string,
    photo: InitialPhotoRef | undefined,
    layout: Pick<JournalElement, 'x' | 'y' | 'w' | 'rot' | 'frame' | 'tone'>,
  ) => void;
  material: (suffix: string, materialId: string, x: number, y: number, w: number, rot?: number) => void;
  finish: (title: string, bg?: JournalPage['bg']) => JournalPage;
};

function makePage(input: InitialInput, pageId: string): PageBuilder {
  const elements: JournalElement[] = [];
  let z = 0;
  const add = (suffix: string, element: ElementSpec) => {
    elements.push({ ...element, id: `${pageId}-${suffix}`, z: z++ });
  };
  return {
    add,
    photo: (suffix, photo, layout) => {
      if (!photo) return;
      add(suffix, {
        type: 'photo', scale: 1, ...layout,
        text: [photo.place, photo.date?.slice(5)].filter(Boolean).join(' · '),
        meta: { photoRef: photo, showcase: true },
      });
    },
    material: (suffix, materialId, x, y, w, rot = 0) => {
      add(suffix, {
        type: 'sticker', x, y, w, rot, scale: 1,
        meta: { pack: 'journal-materials', materialId, showcase: true },
      });
    },
    finish: (title, bg = 'paper') => ({
      id: pageId, city: input.city, title, bg, elements, createdAt: 0, updatedAt: 0,
    }),
  };
}

function buildGoldenHour(input: InitialInput): JournalPage {
  const id = `${HANGZHOU_SHOWCASE_PREFIX}-golden-hour`;
  const page = makePage(input, id);
  const photos = input.photos ?? [];

  page.add('paper-field', { type: 'kraft', x: 0.50, y: 0.49, w: 0.94, rot: -1, scale: 1, color: '#eee2c7', meta: { ar: 0.82 } });
  page.add('lake-band', { type: 'kraft', x: 0.72, y: 0.48, w: 0.44, rot: 2, scale: 1, color: '#d5e6df', meta: { ar: 0.58 } });
  page.add('title', { type: 'note', x: 0.24, y: 0.105, w: 0.39, rot: -2, scale: 1, color: '#fffaf0', text: `${input.city} · 湖上金时\nWEST LAKE / 03.14—03.22` });
  page.add('title-tape', { type: 'tape', x: 0.24, y: 0.038, w: 0.19, rot: -3, scale: 1, color: '#b8d8dfcc' });
  page.add('clip', { type: 'clip', x: 0.09, y: 0.13, w: 0.045, rot: 8, scale: 1 });

  page.photo('hero', photos[0], { x: 0.30, y: 0.34, w: 0.43, rot: -3, frame: 'white', tone: 2 });
  page.photo('lake-two', photos[1], { x: 0.71, y: 0.25, w: 0.34, rot: 3, frame: 'film', tone: 2 });
  page.photo('lake-three', photos[2], { x: 0.72, y: 0.53, w: 0.31, rot: -2, frame: 'black', tone: 2 });
  page.add('hero-tape', { type: 'tape', x: 0.30, y: 0.20, w: 0.19, rot: -5, scale: 1, color: '#f0c58fcc' });

  page.add('field-note', { type: 'bubble', x: 0.31, y: 0.61, w: 0.35, rot: 1, scale: 1, color: '#fffdf5', text: '风把湖面折成一张旧唱片。\n今天，城市在金色里慢下来。' });
  page.add('city-ticket', { type: 'note', x: 0.21, y: 0.80, w: 0.31, rot: -3, scale: 1, text: `湖上黄昏收录票\n${input.city} · 6 帧 · 2025.03\nCTC-WEST-LAKE`, meta: { ticketVariant: 'city' } });
  page.add('route-ticket', { type: 'note', x: 0.58, y: 0.84, w: 0.45, rot: 2, scale: 1, text: '沿湖散步路线\n断桥残雪 → 曲院风荷\n暮色抵达 · 带两位搭子\nROUTE-0314', meta: { ticketVariant: 'route' } });
  page.add('arrow', { type: 'arrow', x: 0.49, y: 0.70, w: 0.23, rot: 16, scale: 1, color: '#52645f' });

  page.material('squirrel', 'city-companion-squirrel', 0.12, 0.65, 0.14, -7);
  page.material('chick', 'city-companion-chick', 0.86, 0.72, 0.12, 7);
  page.material('visitor-one', 'alien-v2-14-02', 0.89, 0.11, 0.105, 5);
  page.material('visitor-two', 'alien-v2-15-03', 0.89, 0.88, 0.09, -8);
  page.material('planet', 'mat-deco-05', 0.49, 0.13, 0.10, -10);
  page.material('sparkles', 'mat-deco-17', 0.45, 0.91, 0.11, 0);

  return page.finish('湖上金时', 'paper');
}

function buildCityVisitors(input: InitialInput): JournalPage {
  const id = `${HANGZHOU_SHOWCASE_PREFIX}-city-visitors`;
  const page = makePage(input, id);
  const photos = input.photos ?? [];

  page.add('paper-field', { type: 'kraft', x: 0.50, y: 0.49, w: 0.95, rot: 1, scale: 1, color: '#e7eddc', meta: { ar: 0.82 } });
  page.add('specimen-field', { type: 'kraft', x: 0.52, y: 0.61, w: 0.86, rot: -1, scale: 1, color: '#fff5d7', meta: { ar: 1.28 } });
  page.add('title', { type: 'note', x: 0.30, y: 0.10, w: 0.51, rot: -1, scale: 1, color: '#fffdf5', text: '城市异客观察簿\nPOCKET BUDDIES · HANGZHOU' });
  page.add('title-tape', { type: 'tape', x: 0.31, y: 0.035, w: 0.24, rot: 2, scale: 1, color: '#f2a7bdcc' });
  page.photo('skyline', photos[3] ?? photos[0], { x: 0.67, y: 0.18, w: 0.45, rot: 2, frame: 'film', tone: 2 });

  page.add('visit-pass', { type: 'note', x: 0.18, y: 0.27, w: 0.26, rot: -3, scale: 1, text: '城市异客通行证\nADMIT FIVE · 西湖边\nVISITOR-537', meta: { ticketVariant: 'admit' } });
  page.add('observation', { type: 'bubble', x: 0.50, y: 0.34, w: 0.38, rot: 1, scale: 1, color: '#ffffff', text: '目击记录 17:42\n它们先看湖，再围着路边的种子争论晚饭。' });

  page.material('alien-a', 'alien-v2-16-03', 0.14, 0.51, 0.16, -4);
  page.material('alien-b', 'alien-v2-17-01', 0.34, 0.52, 0.15, 3);
  page.material('alien-c', 'alien-v2-18-01', 0.52, 0.53, 0.14, -2);
  page.material('alien-d', 'alien-v2-18-02', 0.69, 0.51, 0.14, 4);
  page.material('alien-e', 'alien-v2-19-01', 0.86, 0.53, 0.15, -4);
  page.add('line-one', { type: 'tape', x: 0.50, y: 0.67, w: 0.69, rot: 0, scale: 1, color: '#9ed9d1aa' });

  page.add('name-a', { type: 'note', x: 0.17, y: 0.70, w: 0.20, rot: -2, scale: 1, color: '#f9d5df', text: '01 · 泡泡\n喜欢桥洞回声' });
  page.add('name-b', { type: 'note', x: 0.40, y: 0.72, w: 0.22, rot: 2, scale: 1, color: '#d6ebf2', text: '02 · 靛蓝\n收集湖风与落叶' });
  page.add('name-c', { type: 'note', x: 0.64, y: 0.72, w: 0.22, rot: -1, scale: 1, color: '#e2efcf', text: '03 · 三眼\n把路灯当作星星' });
  page.add('field-ticket', { type: 'note', x: 0.31, y: 0.88, w: 0.40, rot: -2, scale: 1, text: '本日目击路线\n北山街 → 中山北路\n5 位异客 · 2 位搭子\nFIELD-1742', meta: { ticketVariant: 'route' } });
  page.add('quote-ticket', { type: 'note', x: 0.74, y: 0.88, w: 0.33, rot: 2, scale: 1, text: '观察员留言\n「城市也在偷偷观察我们。」\n— 小猪哼豆\nSOURCE-05', meta: { ticketVariant: 'quote' } });

  page.material('pig', 'city-companion-pig', 0.90, 0.74, 0.14, 6);
  page.material('eye', 'mat-deco-19', 0.07, 0.84, 0.12, -8);
  page.material('cool', 'mat-deco-15', 0.91, 0.30, 0.12, 6);

  return page.finish('城市异客录', 'grid');
}

function buildCompanionLetters(input: InitialInput): JournalPage {
  const id = `${HANGZHOU_SHOWCASE_PREFIX}-companion-letters`;
  const page = makePage(input, id);
  const photos = input.photos ?? [];

  page.add('paper-field', { type: 'kraft', x: 0.50, y: 0.50, w: 0.95, rot: -1, scale: 1, color: '#e8dfd0', meta: { ar: 0.82 } });
  page.add('night-field', { type: 'kraft', x: 0.26, y: 0.54, w: 0.42, rot: 2, scale: 1, color: '#cfdde1', meta: { ar: 0.63 } });
  page.add('title', { type: 'note', x: 0.29, y: 0.10, w: 0.47, rot: -2, scale: 1, color: '#fffaf0', text: '桥边来信\nA WALK WITH FOUR COMPANIONS' });
  page.add('title-tape', { type: 'tape', x: 0.29, y: 0.035, w: 0.23, rot: -3, scale: 1, color: '#b8d7c9cc' });
  page.material('books', 'mat-deco-08', 0.82, 0.10, 0.16, 4);

  page.photo('photo-one', photos[4] ?? photos[1], { x: 0.24, y: 0.34, w: 0.34, rot: -4, frame: 'black', tone: 2 });
  page.photo('photo-two', photos[5] ?? photos[2], { x: 0.62, y: 0.28, w: 0.36, rot: 3, frame: 'white', tone: 2 });
  page.photo('photo-three', photos[2] ?? photos[0], { x: 0.43, y: 0.55, w: 0.29, rot: -1, frame: 'film', tone: 2 });
  page.add('photo-tape', { type: 'tape', x: 0.62, y: 0.15, w: 0.17, rot: 5, scale: 1, color: '#e7c6d2cc' });

  page.add('letter', { type: 'bubble', x: 0.75, y: 0.51, w: 0.34, rot: 1, scale: 1, color: '#fffdf5', text: '给明天的信：\n今晚我们绕过三棵树，看见湖面把月亮交还给岸边。' });
  page.add('walk-route', { type: 'note', x: 0.70, y: 0.69, w: 0.42, rot: 2, scale: 1, text: '搭子夜行路线\n平湖秋月 → 雷峰塔\n4 位搭子 · 1 封来信\nWALK-2025', meta: { ticketVariant: 'route' } });
  page.add('memory-ticket', { type: 'note', x: 0.23, y: 0.86, w: 0.31, rot: -3, scale: 1, text: '桥边记忆召回券\nADMIT ONE · 杭州夜风\nMEM-0321', meta: { ticketVariant: 'admit' } });
  page.add('arrow-one', { type: 'arrow', x: 0.37, y: 0.70, w: 0.19, rot: 45, scale: 1, color: '#455d66' });

  page.material('pig', 'city-companion-pig', 0.14, 0.65, 0.14, -5);
  page.material('siamese', 'city-companion-siamese', 0.34, 0.73, 0.14, 5);
  page.material('squirrel', 'city-companion-squirrel', 0.52, 0.80, 0.13, -4);
  page.material('chick', 'city-companion-chick', 0.84, 0.83, 0.13, 4);
  page.material('visitor', 'alien-v2-14-02', 0.90, 0.36, 0.10, -5);
  page.material('moon', 'mat-sticker-05', 0.10, 0.16, 0.11, -10);
  page.material('music', 'mat-deco-14', 0.47, 0.93, 0.13, 0);
  page.material('plant', 'mat-deco-07', 0.91, 0.94, 0.09, 5);

  return page.finish('桥边来信', 'kraft');
}

function buildPocketGarden(input: InitialInput): JournalPage {
  const id = `${HANGZHOU_SHOWCASE_PREFIX}-pocket-garden`;
  const page = makePage(input, id);
  const photos = input.photos ?? [];

  page.add('paper-field', { type: 'kraft', x: 0.50, y: 0.49, w: 0.95, rot: 1, scale: 1, color: '#f1e8d9', meta: { ar: 0.82 } });
  page.add('garden-field', { type: 'kraft', x: 0.50, y: 0.74, w: 0.88, rot: -1, scale: 1, color: '#dce7cd', meta: { ar: 2.25 } });
  page.add('title', { type: 'note', x: 0.28, y: 0.10, w: 0.47, rot: -2, scale: 1, color: '#fffaf0', text: '花下访客簿\nPOCKET GARDEN · HANGZHOU' });
  page.add('title-tape', { type: 'tape', x: 0.28, y: 0.035, w: 0.22, rot: 3, scale: 1, color: '#f2b8a6cc' });

  page.photo('garden-photo', photos[0], { x: 0.29, y: 0.31, w: 0.42, rot: -3, frame: 'white', tone: 2 });
  page.photo('visitor-photo', photos[5] ?? photos[2], { x: 0.72, y: 0.24, w: 0.34, rot: 3, frame: 'film', tone: 2 });
  page.add('garden-note', { type: 'bubble', x: 0.65, y: 0.47, w: 0.42, rot: 1, scale: 1, color: '#fffdf5', text: '种下一枚种子，\n城市就多了一处可以被拜访的地方。' });
  page.add('visit-ticket', { type: 'note', x: 0.22, y: 0.88, w: 0.33, rot: -2, scale: 1, text: '花下访客记录\n今日来访 · 3\n重访次数 · 2\nGARDEN-0421', meta: { ticketVariant: 'city' } });
  page.add('route-ticket', { type: 'note', x: 0.70, y: 0.88, w: 0.38, rot: 2, scale: 1, text: '种子散步路线\n北山街 → 玉泉\n蓝羽扇豆 · 粉色秋英\nSEED-WALK-04', meta: { ticketVariant: 'route' } });

  page.material('lupine', 'city-plant-blue-lupine', 0.18, 0.69, 0.10, -4);
  page.material('cosmos', 'city-plant-pink-cosmos', 0.37, 0.70, 0.15, 3);
  page.material('protea', 'city-plant-protea', 0.58, 0.70, 0.15, -2);
  page.material('lavender', 'city-plant-lavender', 0.77, 0.70, 0.10, 4);
  page.material('visitor-one', 'alien-v2-15-03', 0.28, 0.61, 0.10, -7);
  page.material('visitor-two', 'alien-v2-17-01', 0.68, 0.60, 0.10, 6);
  page.material('siamese', 'city-companion-siamese', 0.88, 0.74, 0.13, 4);
  page.material('sparkles', 'mat-deco-17', 0.89, 0.11, 0.10, -5);

  return page.finish('花下访客簿', 'grid');
}

export function buildHangzhouShowcasePages(input: InitialInput): JournalPage[] {
  return [buildGoldenHour(input), buildCityVisitors(input), buildCompanionLetters(input), buildPocketGarden(input)];
}

export function isHangzhouShowcasePage(id: string): boolean {
  return id.startsWith(`${HANGZHOU_SHOWCASE_PREFIX}-`);
}
