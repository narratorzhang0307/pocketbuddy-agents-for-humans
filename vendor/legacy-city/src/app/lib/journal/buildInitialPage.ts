// 漫游手帐 · 从一座城的漫游数据「智能铺一页」（纯逻辑，可 node 单测）。
// 深度=把 roam 的结构化素材编排成一张有叙事的手帐：
//   点位按 order 沿手绘路径落「地名标签」，consecutive 之间连 InkArrow（算中点/角度/长度）；
//   状态（尚在/重建/已无）→ 朱戳配色；书摘 quote → 气泡文字；照片 → 拍立得槽（先留 photoRef，物化在 I/O 层）；
//   再撒牛皮纸底 / 和纸胶带 / 回形针 / 收录小票。用 FNV seed 播种（同城每次铺出一致、不跳动）。
// 关注点分离：本层只产「元素布局 spec」（含 photoRef 占位），不碰 blob/IndexedDB/网络——物化交给 materialize.ts。
import type { JournalElement, JournalPage } from './types';

export interface InitialPlace { name: string; quote?: string; status?: string; order?: number }
export interface InitialPhotoRef { ref: string; isUrl: boolean; place?: string; date?: string }
export interface InitialStickerSeed { id: string; x: number; y: number; w: number; rot?: number; layer?: 'under' | 'over' }
export interface InitialInput {
  city: string;
  kind?: 'roaming' | 'birding';
  date?: string;
  places: InitialPlace[];
  photos?: InitialPhotoRef[];
  stickers?: InitialStickerSeed[];
  layout?: 'paper' | 'map';
  seed?: string;
}

function fnv(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(sd: number): () => number { let s = sd || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0xffffffff; }; }
const TAPE = ['#e9d8a6cc', '#cde7f0cc', '#f0cdd8cc', '#d4f0cdcc'];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
// 状态 → 朱戳配色（对齐 roam STATUS：尚在 extant / 重建 rebuilt / 已无 memory-only）
const STATUS_COLOR: Record<string, string> = { extant: '#4a7a53', rebuilt: '#3c5a78', 'memory-only': '#b3352b' };

// 右侧手绘路线的落点（像川西手帐那样蜿蜒），左侧留给标题/照片/小票
const ROUTE = [{ x: 0.72, y: 0.24 }, { x: 0.55, y: 0.39 }, { x: 0.76, y: 0.54 }, { x: 0.57, y: 0.70 }, { x: 0.74, y: 0.85 }];
// 左栏三张照片竖向错开、心距 ~0.23、x 交错，形成拍立得叠落而非糊成一坨
const PHOTO_SLOTS = [{ x: 0.25, y: 0.33, w: 0.30 }, { x: 0.21, y: 0.57, w: 0.26 }, { x: 0.31, y: 0.79, w: 0.24 }];
// 地图本身已经承载地点与原文，叠层只需要照片、票根和少量装饰，给底图留出呼吸。
const MAP_PHOTO_SLOTS = [{ x: 0.20, y: 0.34, w: 0.23 }, { x: 0.16, y: 0.53, w: 0.20 }, { x: 0.34, y: 0.66, w: 0.17 }];

/**
 * 智能铺一页初始手帐（纯函数）：返回 JournalPage。photo 元素只带 meta.photoRef 占位，blob 由 materialize 补。
 * pageId 由调用方给；createdAt/updatedAt 置 0，落库时由 upsertPage 补真实时间。
 */
export function buildInitialPageSpec(input: InitialInput, pageId: string): JournalPage {
  const r = rng(fnv(input.seed ?? input.city));
  const birding = input.kind === 'birding';
  const els: JournalElement[] = [];
  let z = 0;
  const rot = (amp = 8) => Math.round((r() - 1 / 2) * amp * 2);
  const jit = (v: number, amp: number) => clamp01(v + (r() - 1 / 2) * amp);
  const push = (e: Omit<JournalElement, 'id' | 'z'>, id: string) => { els.push({ ...e, id, z: z++ }); };
  const mapLayout = input.layout === 'map';
  const stickerSeeds = input.stickers ?? [];
  const pushStickers = (layer: 'under' | 'over') => {
    stickerSeeds.forEach((sticker, i) => {
      if ((sticker.layer ?? 'over') !== layer) return;
      push({
        type: 'sticker', x: sticker.x, y: sticker.y, w: sticker.w,
        rot: sticker.rot ?? 0, scale: 1,
        meta: { pack: 'journal-stickers', stickerId: sticker.id },
      }, `${pageId}-pack-${i}`);
    });
  };

  // ① 牛皮纸底（衬右侧路线区）
  if (!mapLayout) push({ type: 'kraft', x: 0.66, y: 0.5, w: 0.6, rot: rot(5), scale: 1, meta: { ar: 0.8 } }, `${pageId}-kraft`);
  pushStickers('under');

  // ② 路线：先连箭头（压在标签下），再落地名标签 + 状态朱戳
  const routed = input.places.slice(0, ROUTE.length);
  const hasPhotos = (input.photos ?? []).length > 0;
  const route = ROUTE.map((s) => ({ x: clamp01(s.x + (hasPhotos ? 0 : -0.1)), y: s.y }));   // 无照片时路线左移，填补左栏空白
  if (!mapLayout) {
    for (let i = 0; i < routed.length - 1; i++) {
      const a = route[i], b = route[i + 1];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;   // A→B 方向；箭头美术已改成水平端点，rot(ang) 精确连线
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      push({ type: 'arrow', x: mx, y: my, w: Math.max(0.12, dist * 0.86), rot: Math.round(ang), scale: 1, meta: { flip: false } }, `${pageId}-leg${i}`);
    }
    routed.forEach((p, i) => {
      const s = route[i];
      push({ type: 'note', x: s.x, y: s.y, w: 0.17, rot: rot(7), scale: 1, text: p.name }, `${pageId}-mk${i}`);
      const col = STATUS_COLOR[p.status ?? ''] ?? '#8a7a55';   // 圆朱戳盖在标签右上角
      push({ type: 'sticker', x: clamp01(s.x + 0.075), y: clamp01(s.y - 0.055), w: 0.045, rot: rot(20), scale: 1, color: col, meta: { shape: 'seal' } }, `${pageId}-st${i}`);
    });
  } else {
    // 地图已经给出真实路线，只补两笔手绘连线与一张地点便签，维持手帐气息但不重画整条路线。
    push({ type: 'arrow', x: 0.51, y: 0.34, w: 0.18, rot: 56, scale: 1, color: '#6a756d' }, `${pageId}-map-leg0`);
    push({ type: 'arrow', x: 0.60, y: 0.64, w: 0.17, rot: 76, scale: 1, color: '#6a756d' }, `${pageId}-map-leg1`);
    if (routed[1]?.name) push({ type: 'note', x: 0.49, y: 0.17, w: 0.13, rot: rot(4), scale: 1, text: routed[1].name }, `${pageId}-map-label0`);
  }

  // ③ 书摘 → 气泡文字（挑前 2 条带 quote 的点位，落在其标签下方偏右的空白）
  if (!mapLayout) routed.filter((p) => p.quote).slice(0, 2).forEach((p, i) => {
    const idx = routed.indexOf(p);
    const s = route[idx] ?? { x: 0.6, y: 0.4 };
    push({ type: 'bubble', x: clamp01(s.x + 0.03), y: clamp01(s.y + 0.115), w: 0.30, rot: rot(5), scale: 1, text: `「${p.quote}」\n— ${p.name}` }, `${pageId}-q${i}`);
  });
  if (mapLayout) {
    // 复用知识库的 LOC_SYNC 长条便签语言：真实古文沿地图中轴错落排开，
    // 不再使用对白气泡，也不额外编造第五条引文。
    const mapKnowledgeSlots = [
      { x: 0.50, y: 0.27, w: 0.38, rot: -2 },
      { x: 0.69, y: 0.42, w: 0.34, rot: 2 },
      { x: 0.49, y: 0.57, w: 0.36, rot: -1 },
      { x: 0.65, y: 0.71, w: 0.34, rot: 2 },
    ];
    routed.filter((p) => p.quote).slice(0, mapKnowledgeSlots.length).forEach((p, i) => {
      const slot = mapKnowledgeSlots[i];
      const quote = p.quote!.length > 34 ? `${p.quote!.slice(0, 34)}…` : p.quote!;
      push({
        type: 'note', x: slot.x, y: slot.y, w: slot.w, rot: slot.rot, scale: 1,
        text: `${p.name} · LOC_SYNC\n「${quote}」`,
        meta: { noteVariant: 'locSync' },
      }, `${pageId}-map-q${i}`);
    });
  }

  // ④ 普通照片进拍立得；观鸟透明鸟图直接做剪纸（只留 photoRef 占位，materialize 补 blob）
  const photoSlots = mapLayout ? MAP_PHOTO_SLOTS : PHOTO_SLOTS;
  (input.photos ?? []).slice(0, photoSlots.length).forEach((ph, i) => {
    const slot = photoSlots[i];
    push({
      type: birding ? 'cutout' : 'photo',
      x: jit(slot.x, 0.03), y: jit(slot.y, 0.03), w: slot.w, rot: rot(7), scale: 1,
      ...(birding ? {} : { tone: Math.floor(r() * 3), frame: (['white', 'black', 'film'] as const)[Math.floor(r() * 3)] }),
      meta: { photoRef: ph },
    }, `${pageId}-ph${i}`);
    push({ type: 'tape', x: jit(slot.x, 0.03), y: clamp01(slot.y - slot.w * 0.5), w: slot.w * 0.5, rot: rot(10), scale: 1, color: TAPE[Math.floor(r() * TAPE.length)] }, `${pageId}-pt${i}`);
  });

  // ⑤ 标题便签（城名 + 日期）+ 和纸胶带 + 回形针
  push({ type: 'note', x: mapLayout ? 0.20 : 0.26, y: 0.12, w: mapLayout ? 0.30 : 0.42, rot: rot(5), scale: 1, text: `${input.city}\n${input.date ?? ''}`.trim() }, `${pageId}-title`);
  push({ type: 'tape', x: mapLayout ? 0.20 : 0.26, y: 0.045, w: mapLayout ? 0.16 : 0.22, rot: rot(8), scale: 1, color: TAPE[Math.floor(r() * TAPE.length)] }, `${pageId}-tape0`);
  push({ type: 'clip', x: 0.14, y: 0.16, w: 0.05, rot: rot(18), scale: 1 }, `${pageId}-clip`);

  // ⑥ 一组彼此不同的票根：城市收录 / 路线 / 原文书摘 / 现场召回。
  // 仍用 note 承载，meta 只决定版式；所以每张都能独立拖动、旋转、改字和删除。
  const count = (input.photos ?? []).length;
  const ticketNo = fnv(input.city + count).toString(36).slice(0, 6).toUpperCase();
  push({ type: 'note', x: mapLayout ? 0.17 : 0.20, y: mapLayout ? 0.82 : 0.91, w: mapLayout ? 0.22 : 0.29, rot: rot(6), scale: 1,
    text: `${birding ? '观鸟收录票' : '漫游收录票'}\n${input.city} · ${count} ${birding ? '次遇见' : '帧'} · ${input.date ?? ''}\nCTC-${ticketNo}`,
    meta: { ticketVariant: 'city' } }, `${pageId}-receipt`);

  const from = birding && routed.length === 1 ? `${input.city}起点` : (routed[0]?.name ?? input.city);
  const to = routed[routed.length - 1]?.name ?? '下一站';
  push({ type: 'note', x: mapLayout ? 0.50 : 0.53, y: mapLayout ? 0.88 : 0.92, w: mapLayout ? 0.28 : 0.36, rot: rot(4), scale: 1,
    text: `${birding ? '识声路线票' : '漫游路线票'}\n${from} → ${to}\n${input.city} · ${input.date ?? '日期待定'}\nR-${ticketNo}`,
    meta: { ticketVariant: 'route' } }, `${pageId}-route-ticket`);

  const quotePlace = routed.find((p) => p.quote);
  if (quotePlace?.quote) {
    const quote = quotePlace.quote.length > 26 ? `${quotePlace.quote.slice(0, 26)}…` : quotePlace.quote;
    push({ type: 'note', x: mapLayout ? 0.82 : 0.82, y: mapLayout ? 0.19 : 0.13, w: mapLayout ? 0.23 : 0.29, rot: rot(5), scale: 1,
      text: `${birding ? '鸣声凭条' : '原文凭条'}\n「${quote}」\n— ${quotePlace.name}\nSOURCE-${ticketNo}`,
      meta: { ticketVariant: 'quote' } }, `${pageId}-quote-ticket`);
  }

  push({ type: 'note', x: mapLayout ? 0.86 : 0.84, y: mapLayout ? 0.69 : 0.82, w: mapLayout ? 0.19 : 0.25, rot: rot(6), scale: 1,
    text: `${birding ? '现场复听券' : '现场召回券'}\nADMIT ONE · ${from}\nMEM-${ticketNo}`,
    meta: { ticketVariant: 'admit' } }, `${pageId}-admit-ticket`);

  // ⑦ 空数据引导：既无点位又无照片时，右侧空白不寒酸，给一枚引导气泡（有真实元素后用户会删/盖掉）
  if (!routed.length && !(input.photos ?? []).length) {
    push({ type: 'bubble', x: 0.66, y: 0.5, w: 0.42, rot: rot(4), scale: 1, text: birding ? '还没有听见鸟鸣\n先去苏堤记下第一声' : '点下方「剪 ✂」或「素材」\n开始拼你的这座城', meta: { ephemeral: true } }, `${pageId}-empty`);
  }

  // ⑧ 上层小贴纸最后落；胶带/胶片等衬底已在正文之前落下，不再盖住票根和书摘。
  pushStickers('over');

  return { id: pageId, city: input.city, bg: mapLayout ? 'paper' : 'kraft', elements: els, createdAt: 0, updatedAt: 0 };
}
