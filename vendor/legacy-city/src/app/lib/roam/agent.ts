// 编排层：跑一本书的地点研究流水线。
// 读取全文 → 提取地名 → 古今考据 → 坐标解析 → 生成建议（全部产 suggested，确认才上图）。
// 内置书走端侧精编数据（zero API）；粘贴书走云脑考据（enrichJSON），云脑不在则退化为本地候选清单——
// 舱壁：任何一级失败都不抛错，研究状态诚实标注 via（local-curated / cloud / none）。

import { enrichJSON } from '../skills/enrichEntity';
import { BUILTIN_BOOKS } from './catalog';
import { getSkillCuratedPlaces, loadMapSkill } from './mapSkills';
import { clampCloudPlaces } from './critic';
import { extractPlaceNames } from './sense';
import { getRoamBook, getRoamPlaces, replaceBookPlaces, setBookCityGeo, setBookResearch } from './store';
import type { RoamPhase, RoamPlace } from './types';

/** 增量合并（持续学习语义）：重研究不丢用户决定——
 *  同名地点已确认的保留原条目（含 id/坐标，地球标记不漂移），已排除的保持排除；新地名照常进建议。 */
function mergeSuggestStates(bookId: string, fresh: RoamPlace[]): RoamPlace[] {
  const prevByName = new Map(getRoamPlaces(bookId).map((p) => [p.name, p]));
  return fresh.map((p) => {
    const prev = prevByName.get(p.name);
    if (!prev) return p;
    if (prev.suggest === 'confirmed') {
      return { ...p, id: prev.id, geo: prev.geo, suggest: 'confirmed', createdAt: prev.createdAt, order: p.order };
    }
    if (prev.suggest === 'rejected') return { ...p, suggest: 'rejected' as const };
    return p;
  });
}

export type OnRoamPhase = (p: RoamPhase) => void;

const tick = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function statusCounts(places: RoamPlace[]): string {
  const n = (s: RoamPlace['status']) => places.filter((p) => p.status === s).length;
  return `尚在 ${n('extant')} · 重建 ${n('rebuilt')} · 已无 ${n('memory-only')}`;
}

function buildPrompt(title: string, author: string, city: string, text: string): string {
  return [
    `你是古今地名考据助手。下面是《${title}》${author ? `（${author}）` : ''}的正文片段${city ? `，漫游目标城市：${city}` : ''}。`,
    '任务：提取书中出现的具体地点（8-15 个），逐个做古今考据，输出 JSON 数组，每项字段：',
    '{"name":"书中地名","modernName":"今名(古今同名则省略)","status":"extant|rebuilt|memory-only","confidence":"high|medium|low",',
    '"note":"古今考据一句话(≤50字)","lat":纬度,"lng":经度,"chapter":"出处篇目(可省)","quote":"原文摘录(≤60字，只在确有把握时给，绝不虚构)"}',
    '硬性要求：status 诚实——实体尚在用 extant，原址重建用 rebuilt，已无实体仅存记忆用 memory-only；',
    '坐标给 WGS84 近似值即可，不确定就 confidence:"low"；宁可少列，不可编造。只输出 JSON 数组。',
    '',
    '正文：',
    text.slice(0, 6000),
  ].join('\n');
}

/** 跑一本书的研究；stepDelayMs 只影响进度可视节奏（测试传 0） */
export async function runRoamResearch(
  bookId: string,
  onPhase?: OnRoamPhase,
  opts?: { stepDelayMs?: number },
): Promise<{ ok: boolean; places: RoamPlace[] }> {
  const delay = opts?.stepDelayMs ?? 350;
  const book = getRoamBook(bookId);
  if (!book || book.research === 'running') return { ok: false, places: [] };
  setBookResearch(bookId, 'running');

  const phase = async (p: RoamPhase) => { onPhase?.(p); if (delay) await tick(delay); };
  const now = () => new Date().toISOString();

  try {
    // —— 内置书 / 内容包书：端侧精编数据集（zero API）——
    if (book.source === 'builtin' || book.source === 'skill') {
      let seeds = getSkillCuratedPlaces(bookId);
      // 书的轻量元数据会持久化，但内置 .skill 包体只保存在当前页面内存中。
      // 手机刷新/PWA 重启后必须重新恢复包体，不能把“未加载”误判成 0 个地点。
      if (book.source === 'skill' && book.skillId && seeds.length === 0) {
        await phase({ step: '读取全文', note: '正在恢复端侧精编内容包…' });
        const loaded = await loadMapSkill(book.skillId);
        if (loaded) seeds = getSkillCuratedPlaces(bookId);
      }
      if (seeds.length === 0) {
        await phase({ step: '读取全文', note: '内容包未加载成功，请检查网络后重试' });
        setBookResearch(bookId, 'failed');
        return { ok: false, places: [] };
      }
      await phase({ step: '读取全文', note: `《${book.title}》· ${book.era}` });
      await phase({ step: '提取地名', note: `候选 ${seeds.length} 处` });
      const places = seeds.map<RoamPlace>((s, i) => ({
        id: s.id,
        bookId,
        canonicalPlaceId: s.canonicalPlaceId,
        name: s.name,
        ancientName: s.ancientName,
        modernName: s.modernName,
        status: s.status,
        confidence: s.confidence,
        quote: s.quote,
        chapter: s.chapter,
        note: s.note,
        coordinateType: s.coordinateType,
        coordinateAccuracy: s.coordinateAccuracy,
        mapReady: s.mapReady,
        mapAdmissionReason: s.mapAdmissionReason,
        evidenceRef: s.evidenceRef,
        route: s.route,
        ancientSiteStatus: s.ancientSiteStatus,
        modernCarrierStatus: s.modernCarrierStatus,
        geo: { lat: s.lat, lng: s.lng, accuracy: s.coordinateAccuracy === 'exact' ? 'exact' : 'approx' },
        order: i + 1,
        suggest: 'suggested',
        createdAt: now(),
      }));
      await phase({ step: '古今考据', note: statusCounts(places) });
      await phase({ step: '坐标解析', note: '全部约略坐标 · 待你确认' });
      replaceBookPlaces(bookId, mergeSuggestStates(bookId, places));
      await phase({ step: '生成建议', note: `${places.length} 处待确认` });
      setBookResearch(bookId, 'done', 'local-curated');
      return { ok: true, places };
    }

    // —— 粘贴书：本地感知 + 云脑考据 ——
    const text = book.text ?? '';
    if (text.trim().length < 50) {
      await phase({ step: '读取全文', note: '正文太短，无法研究' });
      setBookResearch(bookId, 'failed');
      return { ok: false, places: [] };
    }
    await phase({ step: '读取全文', note: `${text.length} 字` });
    const candidates = extractPlaceNames(text);
    await phase({ step: '提取地名', note: `本地候选 ${candidates.length} 处` });

    await phase({ step: '古今考据', note: '云脑考据中…' });
    const raw = await enrichJSON<unknown[]>({
      prompt: buildPrompt(book.title, book.author, book.city, text),
      system: '你是严谨的古今地名考据助手，只输出 JSON，不编造原文引文。',
      task: 'multilingual',
      timeoutMs: 30000,
    });
    const cloudPlaces = clampCloudPlaces(bookId, raw);

    if (cloudPlaces.length) {
      await phase({ step: '坐标解析', note: `${cloudPlaces.filter((p) => p.geo).length} 处有坐标（均为约略值）` });
      replaceBookPlaces(bookId, mergeSuggestStates(bookId, cloudPlaces));
      const withGeo = cloudPlaces.filter((p) => p.geo);
      if (!book.cityGeo && withGeo.length) {
        const mid = withGeo[Math.floor(withGeo.length / 2)].geo!;
        setBookCityGeo(bookId, { lat: mid.lat, lng: mid.lng });
      }
      await phase({ step: '生成建议', note: `${cloudPlaces.length} 处待确认` });
      setBookResearch(bookId, 'done', 'cloud');
      return { ok: true, places: cloudPlaces };
    }

    // 云脑不在 / 返回不可用 → 本地候选兜底（无坐标，不可上图，诚实标注）
    if (candidates.length) {
      const fallback = candidates.map<RoamPlace>((name, i) => ({
        id: `${bookId}-l${i + 1}`,
        bookId,
        name,
        status: 'extant',
        confidence: 'low',
        note: '云脑未接入：仅本地候选，接入后可自动考据坐标与状态。',
        geo: null,
        order: i + 1,
        suggest: 'suggested',
        createdAt: now(),
      }));
      await phase({ step: '坐标解析', note: '云脑未接入 · 本地候选无坐标' });
      replaceBookPlaces(bookId, mergeSuggestStates(bookId, fallback));
      await phase({ step: '生成建议', note: `${fallback.length} 处候选（待云端考据）` });
      setBookResearch(bookId, 'done', 'none');
      return { ok: true, places: fallback };
    }

    await phase({ step: '生成建议', note: '没有提取到可用地点' });
    setBookResearch(bookId, 'failed');
    return { ok: false, places: [] };
  } catch {
    setBookResearch(bookId, 'failed');
    return { ok: false, places: [] };
  }
}

export const BUILTIN_BOOK_IDS = BUILTIN_BOOKS.map((b) => b.id);
