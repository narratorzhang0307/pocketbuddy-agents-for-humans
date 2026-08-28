// 杭州博物馆地图 .skill · 截图导入管线
// 小红书/公众号刷到好馆（或某馆的重磅特展）→ 截图丢进来
// → ① 端侧识图（visionExtract，原图不出端）
// → ② 收录规则过滤（党建/宣传类挂牌馆拦下、给理由，可人工覆盖）
// → ③ 场馆校正：先查包内馆表（确定性坐标，正名+别名模糊匹配）
//      · 命中内置馆 → 不重复钉点，产出「挂特展到这座馆」的草稿（信息归位）
//      · 未命中 → resolvePlace 地理编码（杭州近邻偏置），作为新馆草稿
// → ④ 草稿卡（suggest-then-confirm，用户确认才上图——绝不静默落点）。

import { visionExtract, type FieldSpec } from '../visionExtract';
import { resolvePlace } from '../resolvePlace';
import { HANGZHOU_MUSEUM_SKILL } from './catalog';
import type { MuseumConfidence, MuseumEntry, MuseumShow, MuseumTier } from './types';

// 收录规则 · 拦截词（用户定的纪律：党建/主旋律宣传类千万别收）
const EXCLUDE_RE = /党建|党史|党性|主题教育|廉政|廉洁|红色教育|爱国主义教育|喜迎|献礼|学习贯彻|成就展|普法|税收宣传|警示教育/;

// 质量线索 → 建议分级（只是建议，确认卡上用户可改）
const S_HINT = /国宝|一级文物|镇馆之宝|世界遗产|良渚|富春山居|必去|殿堂/;
const A_HINT = /博物院|博物馆|美术馆|艺术中心|遗址|特展|大展/;

export interface MuseumImportDraft {
  /** 新馆草稿（未命中内置馆时有效） */
  entry: MuseumEntry;
  /** 命中内置馆 → 建议把截图里的特展挂到这座馆（attachShowToMuseum），不重复钉点 */
  matchedMuseumId?: string;
  matchedMuseumName?: string;
  /** 截图里读出的特展（可挂馆，也可随新馆入库） */
  show?: MuseumShow;
  /** 场馆校正方式：museum-table=命中包内馆表 / geocode=地理编码 / none=没解析出坐标（需手动） */
  placeVia: 'museum-table' | 'geocode' | 'none';
  suggestedTier: MuseumTier;
  rejected?: string;         // 命中不收录规则时给出理由（仍展示草稿，让用户知道为什么）
  rawText: string;           // 端侧读出的原文（可核对）
  visionOk: boolean;         // false = 端侧视觉未就绪/没读出 → UI 走手填兜底
}

const FIELDS: FieldSpec[] = [
  { key: 'museum', label: '博物馆/美术馆名', hint: '场馆全名，如「良渚博物院」' },
  { key: 'city', label: '城市' },
  { key: 'blurb', label: '馆的看点', hint: '这个馆好在哪，一句话' },
  { key: 'treasures', label: '镇馆之宝', hint: '具体展品名，顿号分隔' },
  { key: 'ticket', label: '门票', hint: '如 免费预约 / 30元' },
  { key: 'closedDay', label: '闭馆日', hint: '如 周一闭馆' },
  { key: 'show', label: '在展特展', hint: '正在办的特展名（若截图是展讯）' },
  { key: 'showEnd', label: '特展结束日期', hint: '如 2026.10.8 / 10月8日' },
];

// 「2026.6.18 / 6月18日 / 2026-06-18」→ YYYY-MM-DD（缺年份按今年补；解析失败返回空）
export function normalizeMuseumDate(raw: string, today: Date = new Date()): string {
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

/** 「周一闭馆 / 逢周二休 / 星期一」→ 0~6；解析不出返回 undefined */
export function parseClosedDay(raw: string): number | undefined {
  const m = (raw || '').match(/[周星][期]?([一二三四五六日天])/);
  if (!m) return undefined;
  const idx = '日一二三四五六'.indexOf(m[1] === '天' ? '日' : m[1]);
  return idx >= 0 ? idx : undefined;
}

/** 馆名 → 包内馆表匹配（正名 + 别名，去空白模糊包含） */
export function matchSkillMuseum(name: string): (typeof HANGZHOU_MUSEUM_SKILL.museums)[number] | null {
  const q = (name || '').replace(/\s/g, '');
  if (!q) return null;
  for (const v of HANGZHOU_MUSEUM_SKILL.museums) {
    for (const n of [v.name, ...v.aliases]) {
      const t = n.replace(/\s/g, '');
      if (t && (q.includes(t) || t.includes(q))) return v;
    }
  }
  return null;
}

export function suggestMuseumTier(text: string): MuseumTier {
  if (S_HINT.test(text)) return 'S';
  if (A_HINT.test(text)) return 'A';
  return 'B';
}

interface DraftInput {
  museum: string; city?: string; blurb?: string; treasures?: string;
  ticket?: string; closedDay?: string; show?: string; showEnd?: string; tier?: MuseumTier;
}

async function buildDraft(f: DraftInput, sourceNote: string, rawText: string, visionOk: boolean, today: Date): Promise<MuseumImportDraft> {
  const museumName = (f.museum || '').trim();
  const joined = `${museumName} ${f.blurb || ''} ${f.treasures || ''} ${f.show || ''}`;

  const show: MuseumShow | undefined = (f.show || '').trim()
    ? {
        title: (f.show || '').trim(),
        dateEnd: normalizeMuseumDate(f.showEnd || '', today) || undefined,
        note: sourceNote,
        major: S_HINT.test(f.show || '') || A_HINT.test(f.show || ''),
      }
    : undefined;

  // 场馆校正：包内馆表优先（确定性坐标）→ resolvePlace 地理编码兜底（杭州近邻偏置）
  let placeVia: MuseumImportDraft['placeVia'] = 'none';
  let lng = 0; let lat = 0; let canonicalName = museumName;
  let confidence: MuseumConfidence = 'low';
  let matchedMuseumId: string | undefined;
  let matchedMuseumName: string | undefined;

  const hit = matchSkillMuseum(museumName);
  if (hit) {
    placeVia = 'museum-table';
    ({ lng, lat } = hit);
    canonicalName = hit.name;
    confidence = 'high';
    matchedMuseumId = hit.id;
    matchedMuseumName = hit.name;
  } else if (museumName) {
    const geo = await resolvePlace(`${f.city || '杭州'} ${museumName}`, { near: [120.15, 30.25] });
    if (geo) { placeVia = 'geocode'; ({ lng, lat } = geo); confidence = 'medium'; }
  }

  const entry: MuseumEntry = {
    id: `imp-${Date.now().toString(36)}`,
    name: canonicalName || '未知场馆',
    aliases: [],
    lng, lat,
    tier: f.tier ?? suggestMuseumTier(joined),
    tierReason: visionOk ? '截图导入 · 待你定级' : '手动录入',
    blurb: (f.blurb || '').trim() || undefined,
    treasures: (f.treasures || '').split(/[、,，;；]/).map((s) => s.trim()).filter(Boolean),
    ticket: (f.ticket || '').trim() || undefined,
    closedDay: parseClosedDay(f.closedDay || ''),
    nowShowing: show && !matchedMuseumId ? [show] : undefined,
    source: 'screenshot',
    confidence,
    sourceNote,
    addedAt: new Date().toISOString(),
  };

  return {
    entry,
    matchedMuseumId,
    matchedMuseumName,
    show,
    placeVia,
    suggestedTier: entry.tier,
    rejected: EXCLUDE_RE.test(joined) ? '命中不收录规则（党建/宣传类）——按包规则不建议收录' : undefined,
    rawText,
    visionOk,
  };
}

/** 手填兜底（端侧视觉未就绪/读不出时）：同一套场馆校正，只是字段来自用户。 */
export async function buildManualMuseumDraft(input: DraftInput, today: Date = new Date()): Promise<MuseumImportDraft> {
  return buildDraft(input, '手动录入', '', true, today);
}

/** 主管线：截图 dataURL → 博物馆/特展草稿。原图只进端侧视觉；读不出时 visionOk=false（UI 走手填）。 */
export async function importMuseumScreenshot(
  imageDataUrl: string,
  today: Date = new Date(),
): Promise<MuseumImportDraft> {
  const r = await visionExtract({ imageDataUrl, domain: '博物馆/美术馆推荐或展讯', fields: FIELDS });
  const f = r.fields;
  return buildDraft(
    {
      museum: f.museum || '', city: f.city, blurb: f.blurb, treasures: f.treasures,
      ticket: f.ticket, closedDay: f.closedDay, show: f.show, showEnd: f.showEnd,
    },
    '截图导入', r.raw, r.ok, today,
  );
}
