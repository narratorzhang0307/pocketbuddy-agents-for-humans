// 编排层：串起六层流水线（感知→本地库→本地索引→Qwen 补全 Skill→地理 Skill→校验→draft）。
// 产出一张「电影票根草稿」（suggest，未钉）；阶段 onPhase 回调供 UI 显示进度。单级失败降级、不抛错（舱壁）。
import { sense } from './sense';
import { matchInCatalog } from './catalog';
import { geoResolve, organizeTagsOnDevice } from './tagging';
import { applyCritic, applyUserFix, mergeKnown } from './critic';
import { getKnownMovie } from './store';
import { movieKey, type MovieDraft, type MovieInput, type OnMoviePhase } from './types';
import { decideTextPlacementOnDevice } from '../skills/suggestMapPlacement';

const today = () => new Date().toISOString().slice(0, 10);

export async function runMovieAgent(input: MovieInput, onPhase?: OnMoviePhase): Promise<MovieDraft | null> {
  const ph: OnMoviePhase = onPhase || (() => {});

  // ① 感知：三种输入归一成候选片名 + 可选评分
  ph(input.kind === 'image' ? '截图认片' : '解析输入');
  const sensed = await sense({ kind: input.kind, text: input.text, imageDataUrl: input.imageDataUrl, manualTitle: input.manual?.title, manualRating: input.manual?.rating });
  const title = sensed.title;
  if (!title) return null;   // 认不出片名 → 交回 UI 走纯手填兜底

  const draft: MovieDraft = {
    id: '', title, original: '', year: input.manual?.year ?? null, country: input.manual?.country || '',
    douban: null,
    tags: { director: '', cast: [], genre: '', movement: '', plot: '', userRating: sensed.rating ?? input.manual?.rating ?? 0 },
    geo: null, needPlace: true, source: 'manual', confidence: 0.3, needsConfirm: true,
    reason: `感知:${sensed.from}「${title}」`, date: today(),
  };

  // ② 本地片库（确定锚点：导演/国家/年份/豆瓣分/简介）
  ph('查本地片库', 'matchCatalog');
  const hit = matchInCatalog(title);
  if (hit) {
    const r = hit.record;
    draft.title = r.title || title; draft.original = r.original || '';
    draft.year = draft.year ?? r.year ?? null; draft.country = draft.country || r.country || '';
    draft.douban = hit.douban ?? null;
    // 注意：豆瓣 r.type 是「媒介」(电影/剧集/纪录片)，不是 genre；genre(犯罪/剧情…) 留给云脑补全子 agent。
    draft.tags.director = r.director || ''; draft.tags.plot = r.synopsis || '';
    draft.source = 'catalog'; draft.confidence = hit.exact ? 0.8 : 0.65;
    draft.reason += `；本地库${hit.exact ? '精确' : '模糊'}命中`;
  }
  draft.id = movieKey(draft.title, draft.year);

  // ③ 本地索引：之前补全/钉过 → 复用，省云脑、保持一致
  const known = await getKnownMovie(draft.id);
  const alreadyEnriched = mergeKnown(draft, known);
  if (!Array.isArray(draft.tags.cast)) draft.tags.cast = [];   // mergeKnown 整体替换 tags；pe-movies 旧/坏记录可能缺 cast → 恢复数组不变式，免下面 .length 抛错（舱壁）

  // ④ 端侧补全子 agent：默认只走 Qwen/MNN；不在首次标记时自动上传片名。
  const lackTags = !draft.tags.cast.length || !draft.tags.movement || !draft.tags.genre || draft.needPlace;
  let filmingPlace = '', storyPlace = '';
  if (!alreadyEnriched && lackTags) {
    ph('端侧整理标签', 'Qwen3-VL-2B · MNN');
    const { raw, ok, model, elapsedMs } = await organizeTagsOnDevice(draft.title, {
      director: draft.tags.director, country: draft.country, year: draft.year, plot: draft.tags.plot,
    });
    if (ok) {
      draft.tags.director = draft.tags.director || raw.director;
      if (!draft.tags.cast.length) draft.tags.cast = raw.cast;
      draft.tags.genre = draft.tags.genre || raw.genre;
      draft.tags.movement = draft.tags.movement || raw.movement;
      draft.tags.plot = draft.tags.plot || raw.plot;
      draft.country = draft.country || raw.country;
      draft.year = draft.year ?? raw.year;
      filmingPlace = raw.filmingPlace; storyPlace = raw.storyPlace;
      draft.source = draft.source === 'catalog' ? 'mixed' : 'llm';
      draft.confidence = Math.max(draft.confidence, 0.72);
      draft.reason += `；端侧 Qwen/MNN 整理标签${model ? `（${model}${typeof elapsedMs === 'number' ? ` ${(elapsedMs / 1000).toFixed(1)}s` : ''}）` : ''}`;
    } else {
      draft.reason += '；端侧模型未返回合格结构，保留本地资料';
    }
  }

  // ⑤ Qwen-2B 决定地点语义与角色；resolvePlace 只负责确定性坐标转换。
  ph('定位取景地/故事地', 'Qwen3-VL-2B/MNN → resolvePlace');
  if (!draft.geo) draft.geo = await geoResolve({ filmingPlace, storyPlace, country: draft.country });
  const placement = await decideTextPlacementOnDevice({
    domain: '电影卡片', title: draft.title,
    text: [
      draft.original ? `原名：${draft.original}` : '',
      draft.tags.director ? `导演：${draft.tags.director}` : '',
      draft.country ? `国家：${draft.country}` : '',
      draft.tags.plot ? `剧情：${draft.tags.plot}` : '',
      filmingPlace ? `取景地候选：${filmingPlace}` : '',
      storyPlace ? `故事地候选：${storyPlace}` : '',
    ].filter(Boolean).join('\n'),
    roles: [{ value: 'filming', label: '取景地' }, { value: 'story', label: '故事地' }, { value: 'country', label: '国家' }],
    candidate: draft.geo ? { place: draft.geo.place, role: draft.geo.kind, evidence: draft.reason } : undefined,
  });
  if (placement) {
    draft.geo = { kind: placement.role as 'filming' | 'story' | 'country', place: placement.geo.place, lng: placement.geo.lng, lat: placement.geo.lat, confidence: placement.confidence };
    draft.source = draft.source === 'manual' ? 'llm' : 'mixed';
    draft.reason += `；端侧 Qwen-2B 决定${placement.role}:${placement.place}（${placement.evidence}）`;
  }
  draft.needPlace = !draft.geo;

  // ⑥ 校验 + 历史纠错
  ph('校验');
  applyCritic(draft);
  applyUserFix(draft);
  draft.needsConfirm = draft.confidence < 0.75 || draft.source === 'manual' || draft.needPlace;

  ph('完成');
  return draft;
}

export { confirmPin, archiveOnly, alreadyPinned, unpin } from './pin';
export { recordPlaceFix, recordRatingFix } from './store';
