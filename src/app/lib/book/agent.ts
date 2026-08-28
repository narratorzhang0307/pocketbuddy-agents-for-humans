// 编排层：端侧优先生成可确认草稿；云端查全是用户主动触发的独立增强，不在首次标记时自动上传。
import { sense } from './sense';
import { matchInCatalog } from './catalog';
import { enrichTags, geoResolve, organizeTagsOnDevice, type EnrichRaw } from './tagging';
import { applyCritic, applyUserFix, mergeKnown } from './critic';
import { getKnownBook } from './store';
import { bookKey, type BookDraft, type BookInput, type OnBookPhase } from './types';
import { decideTextPlacementOnDevice } from '../skills/suggestMapPlacement';

const today = () => new Date().toISOString().slice(0, 10);

function mergeEnrichment(draft: BookDraft, raw: EnrichRaw): void {
  draft.tags.author = draft.tags.author || raw.author;
  draft.tags.translator = draft.tags.translator || raw.translator;
  draft.tags.genre = draft.tags.genre || raw.genre;
  draft.tags.movement = draft.tags.movement || raw.movement;
  draft.tags.plot = draft.tags.plot || raw.plot;
  draft.country = draft.country || raw.country;
  draft.year = draft.year ?? raw.year;
}

export async function runBookAgent(input: BookInput, onPhase?: OnBookPhase): Promise<BookDraft | null> {
  const ph: OnBookPhase = onPhase || (() => {});

  // ① 感知
  ph(input.kind === 'image' ? '书封认书' : '解析输入');
  const sensed = await sense({ kind: input.kind, text: input.text, imageDataUrl: input.imageDataUrl, manualTitle: input.manual?.title, manualRating: input.manual?.rating });
  const title = sensed.title;
  if (!title) return null;

  const draft: BookDraft = {
    id: '', title, year: null, country: '',
    tags: { author: input.manual?.author || sensed.author, translator: sensed.translator, genre: '', movement: '', plot: '', userRating: sensed.rating ?? input.manual?.rating ?? 0 },
    geo: null, needPlace: true, source: sensed.from === 'edge-vision' ? 'edge' : 'manual', confidence: sensed.from === 'edge-vision' ? 0.62 : 0.3, needsConfirm: true,
    reason: `感知:${sensed.from}「${title}」`, date: today(),
    evidence: {
      onDevice: true,
      recognition: sensed.from === 'edge-vision'
        ? (sensed.ocrUsed ? 'pp-ocr-v6+qwen-vl-2b-mnn' : 'qwen-vl-2b-mnn')
        : sensed.from === 'manual' ? 'manual' : 'text-rule',
      rawVisibleText: sensed.rawVisibleText || undefined,
    },
  };

  // ② 本地书库
  ph('查本地书库', 'matchCatalog');
  const hit = matchInCatalog(title);
  if (hit) {
    const r = hit.record;
    draft.title = r.title || title; draft.year = r.year ?? null; draft.country = r.country || '';
    draft.tags.author = draft.tags.author || r.author || ''; draft.tags.plot = r.synopsis || '';
    draft.source = 'catalog'; draft.confidence = hit.exact ? 0.8 : 0.65;
    const localGeo = r.locations?.find((location) => Number.isFinite(location.lng) && Number.isFinite(location.lat));
    if (localGeo) draft.geo = { kind: localGeo.kind, place: localGeo.place, lng: localGeo.lng, lat: localGeo.lat, confidence: localGeo.confidence };
    draft.reason += `；本地库${hit.exact ? '精确' : '模糊'}命中`;
  }
  draft.id = bookKey(draft.title, draft.tags.author);

  // ③ 本地索引复用
  const known = await getKnownBook(draft.id);
  const alreadyEnriched = mergeKnown(draft, known);

  // ④ 端侧 2B 只把封面可见字段整理进草稿；不靠参数知识补书目事实。
  if (sensed.from === 'edge-vision' && !alreadyEnriched) {
    ph('端侧整理标签', 'Qwen3-VL-2B · MNN · 原图不出端');
    const organized = await organizeTagsOnDevice(draft.title, {
      author: sensed.author, translator: sensed.translator, publisher: sensed.publisher, visibleTags: sensed.visibleTags,
    });
    if (organized.ok) {
      mergeEnrichment(draft, organized.raw);
      draft.confidence = Math.max(draft.confidence, 0.66);
      draft.reason += '；端侧2B整理可见字段';
    }
  }

  // ⑤ Qwen-2B 决定地点语义与角色；resolvePlace 只负责确定性坐标转换。
  ph('定位故事地/作者地', 'Qwen3-VL-2B/MNN → resolvePlace');
  if (!draft.geo) draft.geo = await geoResolve({ country: draft.country });
  const placement = await decideTextPlacementOnDevice({
    domain: '书籍卡片', title: draft.title,
    text: [
      draft.tags.author ? `作者：${draft.tags.author}` : '',
      draft.country ? `作者国家：${draft.country}` : '',
      draft.tags.genre ? `类型：${draft.tags.genre}` : '',
      draft.tags.plot ? `内容：${draft.tags.plot}` : '',
    ].filter(Boolean).join('\n'),
    roles: [{ value: 'story', label: '故事地' }, { value: 'author', label: '作者地' }, { value: 'country', label: '国家' }],
    candidate: draft.geo ? { place: draft.geo.place, role: draft.geo.kind, evidence: draft.reason } : undefined,
  });
  if (placement) {
    draft.geo = { kind: placement.role as 'story' | 'author' | 'country', place: placement.geo.place, lng: placement.geo.lng, lat: placement.geo.lat, confidence: placement.confidence };
    draft.source = draft.source === 'manual' ? 'edge' : 'mixed';
    draft.reason += `；端侧 Qwen-2B 决定${placement.role}:${placement.place}（${placement.evidence}）`;
  }
  draft.needPlace = !draft.geo;

  // ⑥ 校验 + 历史纠错
  ph('校验');
  applyCritic(draft);
  applyUserFix(draft);
  // 置信度只影响提示强弱；任何模型或 Data Pack 结果都仍是草稿，写入动作永远由用户确认。
  draft.needsConfirm = true;

  ph('完成');
  return draft;
}

/** 用户主动联网后，才把书名与已有公开字段发送给 Qwen 搜索；原图、阅读史和原始笔记均不上传。 */
export async function enhanceBookDraftCloud(draft: BookDraft, options: { consent: boolean }, onPhase?: OnBookPhase): Promise<BookDraft> {
  const ph: OnBookPhase = onPhase || (() => {});
  if (!options.consent) return { ...draft, reason: `${draft.reason}；未授权联网，端侧草稿保留` };
  ph('云端查全资料', 'Qwen 联网搜索 · 仅书名与已有书目字段');
  const result = await enrichTags(draft.title, { author: draft.tags.author, country: draft.country, year: draft.year });
  if (!result.ok) return { ...draft, reason: `${draft.reason}；云端查全失败，端侧草稿保留` };

  const next: BookDraft = { ...draft, tags: { ...draft.tags }, evidence: { ...draft.evidence } };
  mergeEnrichment(next, result.raw);
  if (!next.geo || next.geo.kind !== 'story') {
    const resolved = await geoResolve({ storyPlace: result.raw.storyPlace, authorPlace: result.raw.authorPlace, country: next.country });
    if (resolved) next.geo = resolved;
  }
  next.needPlace = !next.geo;
  next.source = 'mixed';
  next.confidence = Math.max(next.confidence, 0.78);
  next.needsConfirm = true;
  next.reason = `${draft.reason}；云端联网查全（待你确认）`;
  next.evidence = { ...next.evidence, cloudModel: result.model || 'Qwen', cloudSearched: true, cloudConsentAt: new Date().toISOString() };
  applyCritic(next);
  return next;
}

export { confirmPin, archiveOnly, alreadyPinned, unpin } from './pin';
export { recordPlaceFix, recordRatingFix } from './store';
