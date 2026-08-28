// 杭州展览地图 .skill · 截图导入管线
// 小红书/公众号看到好展 → 截图丢进来 → ① 端侧识图（visionExtract，原图不出端）
// → ② 收录规则过滤（党建/注水拦下） → ③ 场馆校正（先查包内场馆表，再退 resolvePlace 地理编码）
// → ④ 产出草稿卡（needsConfirm，用户确认才上图——suggest-then-confirm，绝不静默落点）。

import { visionExtract, type FieldSpec } from '../visionExtract';
import { resolvePlace } from '../resolvePlace';
import { HANGZHOU_EXHIBITION_SKILL } from './catalog';
import type { ExConfidence, ExTier, ExVenue, ExhibitionEntry } from './types';

// 收录规则 · 拦截词（用户定的纪律：党建/主旋律宣传类千万别收）
const EXCLUDE_RE = /党建|党史|党性|主题教育|廉政|廉洁|红色教育|爱国主义教育|喜迎|献礼|学习贯彻|成就展|普法|税收宣传/;

// 质量线索 → 建议分级（只是建议，确认卡上用户可改）
const S_HINT = /大英博物馆|卢浮宫|埃及|希腊|庞贝|故宫博物院|国家博物馆|国宝|一级文物|真迹/;
const A_HINT = /美术馆|博物馆|艺术中心|双年展|回顾展|文献展|个展|特展/;

export interface ExImportDraft {
  entry: ExhibitionEntry;
  /** 场馆校正方式：venue-table=命中包内场馆表 / geocode=地理编码 / none=没解析出坐标（需手动） */
  placeVia: 'venue-table' | 'geocode' | 'none';
  suggestedTier: ExTier;
  rejected?: string;         // 命中不收录规则时给出理由（仍展示草稿，让用户知道为什么）
  rawText: string;           // 端侧读出的原文（可核对）
  visionOk: boolean;         // false = 端侧视觉未就绪/没读出 → UI 走手填兜底
}

const FIELDS: FieldSpec[] = [
  { key: 'title', label: '展览名称', hint: '主标题，如「淬火：古希腊的黄金时代」' },
  { key: 'venue', label: '场馆', hint: '博物馆/美术馆/艺术空间名' },
  { key: 'city', label: '城市' },
  { key: 'dateStart', label: '开始日期', hint: '如 2026.6.18 / 6月18日' },
  { key: 'dateEnd', label: '结束日期', hint: '如 2026.10.8 / 10月8日' },
  { key: 'ticket', label: '票价', hint: '如 免费 / 88元' },
  { key: 'highlight', label: '亮点', hint: '明星展品、借展来源、艺术家，一句话' },
];

// 「2026.6.18 / 6月18日 / 2026-06-18」→ YYYY-MM-DD（缺年份按今年补；解析失败返回空）
export function normalizeDate(raw: string, today: Date = new Date()): string {
  const s = (raw || '').trim();
  if (!s) return '';
  const m = s.match(/(?:(\d{4})[\s年.\-/]+)?(\d{1,2})[\s月.\-/]+(\d{1,2})/);
  if (!m) return '';
  const y = m[1] ? Number(m[1]) : today.getFullYear();
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 场馆名 → 包内场馆表匹配（正名 + 别名，去空白模糊包含） */
export function matchSkillVenue(name: string): ExVenue | null {
  const q = (name || '').replace(/\s/g, '');
  if (!q) return null;
  for (const v of HANGZHOU_EXHIBITION_SKILL.venues) {
    for (const n of [v.name, ...v.aliases]) {
      const t = n.replace(/\s/g, '');
      if (t && (q.includes(t) || t.includes(q))) return v;
    }
  }
  return null;
}

export function suggestTier(text: string): ExTier {
  if (S_HINT.test(text)) return 'S';
  if (A_HINT.test(text)) return 'A';
  return 'B';
}

/** 手填兜底（端侧视觉未就绪/读不出时）：同一套场馆校正，只是字段来自用户。 */
export async function buildManualDraft(input: {
  title: string; venueName: string; city?: string;
  dateStart?: string; dateEnd?: string; ticket?: string; highlight?: string; tier?: ExTier;
}, today: Date = new Date()): Promise<ExImportDraft> {
  const joined = `${input.title} ${input.venueName} ${input.highlight || ''}`;
  let placeVia: ExImportDraft['placeVia'] = 'none';
  let lng = 0; let lat = 0; let venueId: string | undefined;
  let canonicalVenue = input.venueName.trim();
  let confidence: ExConfidence = 'low';
  const hit = matchSkillVenue(input.venueName);
  if (hit) {
    placeVia = 'venue-table';
    ({ lng, lat } = hit);
    venueId = hit.id;
    canonicalVenue = hit.name;
    confidence = 'high';
  } else if (canonicalVenue) {
    const geo = await resolvePlace(`${input.city || '杭州'} ${canonicalVenue}`, { near: [120.15, 30.25] });
    if (geo) { placeVia = 'geocode'; ({ lng, lat } = geo); confidence = 'medium'; }
  }
  const entry: ExhibitionEntry = {
    id: `imp-${Date.now().toString(36)}`,
    title: input.title.trim() || '未命名展览',
    venueId,
    venueName: canonicalVenue || '未知场馆',
    lng, lat,
    dateStart: normalizeDate(input.dateStart || '', today),
    dateEnd: normalizeDate(input.dateEnd || '', today),
    ticket: input.ticket?.trim() || undefined,
    highlight: input.highlight?.trim() || undefined,
    tier: input.tier ?? suggestTier(joined),
    tierReason: '手动录入',
    source: 'screenshot',
    confidence,
    sourceNote: '手动录入',
    addedAt: new Date().toISOString(),
  };
  return {
    entry, placeVia, suggestedTier: entry.tier,
    rejected: EXCLUDE_RE.test(joined) ? '命中不收录规则（党建/宣传类）——按包规则不建议收录' : undefined,
    rawText: '', visionOk: true,
  };
}

/** 主管线：截图 dataURL → 展讯草稿。原图只进端侧视觉；读不出时 visionOk=false（UI 走手填）。 */
export async function importExhibitionScreenshot(
  imageDataUrl: string,
  today: Date = new Date(),
): Promise<ExImportDraft> {
  const r = await visionExtract({ imageDataUrl, domain: '展览海报/展讯', fields: FIELDS });
  const f = r.fields;
  const title = (f.title || '').trim();
  const venueName = (f.venue || '').trim();
  const joined = `${title} ${venueName} ${f.highlight || ''}`;

  // 场馆校正：包内场馆表优先（确定性坐标）→ resolvePlace 地理编码兜底（杭州近邻偏置）
  let placeVia: ExImportDraft['placeVia'] = 'none';
  let lng = 0; let lat = 0; let venueId: string | undefined; let canonicalVenue = venueName;
  let confidence: ExConfidence = 'low';
  const hit = matchSkillVenue(venueName) ?? matchSkillVenue(title);
  if (hit) {
    placeVia = 'venue-table';
    ({ lng, lat } = hit);
    venueId = hit.id;
    canonicalVenue = hit.name;
    confidence = 'high';
  } else if (venueName) {
    const geo = await resolvePlace(`${f.city || '杭州'} ${venueName}`, { near: [120.15, 30.25] });
    if (geo) { placeVia = 'geocode'; ({ lng, lat } = geo); confidence = 'medium'; }
  }

  const entry: ExhibitionEntry = {
    id: `imp-${Date.now().toString(36)}`,
    title: title || '未命名展览',
    venueId,
    venueName: canonicalVenue || '未知场馆',
    lng, lat,
    dateStart: normalizeDate(f.dateStart || '', today),
    dateEnd: normalizeDate(f.dateEnd || '', today),
    ticket: (f.ticket || '').trim() || undefined,
    highlight: (f.highlight || '').trim() || undefined,
    tier: suggestTier(joined),
    tierReason: '截图导入 · 待你定级',
    source: 'screenshot',
    confidence,
    sourceNote: '截图导入',
    addedAt: new Date().toISOString(),
  };

  return {
    entry,
    placeVia,
    suggestedTier: entry.tier,
    rejected: EXCLUDE_RE.test(joined) ? '命中不收录规则（党建/宣传类）——按包规则不建议收录' : undefined,
    rawText: r.raw,
    visionOk: r.ok,
  };
}
