import { listAtlasSpots, type AtlasSpot, type AtlasSpotSource } from '../roam/atlas';
import { getBookDisplayTitle } from '../roam/bookTitle';
import { formatGujiDisplayText } from '../roam/gujiText';
import {
  GUIJI_CITY_AGGREGATES,
  listMapSkillCatalogBooks,
  listMapSkills,
  loadGujiCityAggregate,
  loadMapSkill,
  subscribeMapSkills,
} from '../roam/mapSkills';
import type { RoamPlaceSeed } from '../roam/catalog';
import { subscribeRoam } from '../roam/store';

const STORAGE_KEY = 'shangjie.gujiAtlas.visible.v1';
const HANGZHOU_MODE_KEY = 'shangjie.gujiAtlas.hangzhou.mode.v1';
const HANGZHOU_DISABLED_KEY = 'shangjie.gujiAtlas.hangzhou.disabled.v1';
type HangzhouGujiMode = 'aggregate' | 'custom';

let visible = (() => {
  if (typeof localStorage === 'undefined') return true;
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
})();
let hangzhouMode: HangzhouGujiMode = (() => {
  if (typeof localStorage === 'undefined') return 'aggregate';
  try {
    return localStorage.getItem(HANGZHOU_MODE_KEY) === 'custom' ? 'custom' : 'aggregate';
  } catch {
    return 'aggregate';
  }
})();
let disabledHangzhouBookIds = (() => {
  if (typeof localStorage === 'undefined') return new Set<string>();
  try {
    const value = JSON.parse(localStorage.getItem(HANGZHOU_DISABLED_KEY) ?? '[]');
    return new Set<string>(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set<string>();
  }
})();
const subscribers = new Set<() => void>();
let overviewRequest = 0;

export interface HangzhouGujiBookOption {
  id: string;
  skillName: string;
  title: string;
  places: number;
  enabled: boolean;
}

interface AggregateSourcePlace {
  childSkillId: string;
  bookId: string;
  bookTitle: string;
  runtimePlaceId?: string;
  name?: string;
  modernName?: string;
  chapter?: string;
}

type AggregatePlace = RoamPlaceSeed & {
  sourcePlaces?: AggregateSourcePlace[];
  sourceBooks?: string[];
};

const RESEARCH_ONLY_COORDINATE_TYPES = new Set([
  'historical-layout-anchor',
  'route-layout-anchor',
  'historical-locator-anchor',
]);

/**
 * 精确点地图只接收有现实承载物或有范围证据的坐标。
 * 研究阶段为了让目录“铺开看”的排布点仍保留在原 Skill 中，但不能冒充遗址。
 */
export function isGujiSpotReadyForMap(
  spot: Pick<AtlasSpot, 'confidence' | 'coordinateType' | 'modernName' | 'note' | 'mapReady'>,
): boolean {
  if (spot.mapReady === false) return false;
  if (spot.confidence === 'low') return false;
  if (spot.coordinateType && RESEARCH_ONLY_COORDINATE_TYPES.has(spot.coordinateType)) return false;
  const disclosure = `${spot.modernName ?? ''} ${spot.note ?? ''}`;
  return !/(?:排布|可视化排布|历史范围)锚点|不是(?:南宋)?原址|不是(?:市肆|楼店|古址|遗址).*原(?:基)?址/.test(disclosure);
}

function emit() {
  subscribers.forEach((subscriber) => subscriber());
}

function persistHangzhouSelection() {
  try {
    localStorage.setItem(HANGZHOU_MODE_KEY, hangzhouMode);
    localStorage.setItem(HANGZHOU_DISABLED_KEY, JSON.stringify([...disabledHangzhouBookIds]));
  } catch {
    // 隐私模式下保留内存态。
  }
}

export function listHangzhouGujiBooks(): HangzhouGujiBookOption[] {
  return listMapSkillCatalogBooks('杭州').map((book) => ({
    id: book.id,
    skillName: book.skillName,
    title: getBookDisplayTitle(book),
    places: book.placeCount,
    enabled: hangzhouMode === 'aggregate' || !disabledHangzhouBookIds.has(book.id),
  }));
}

export function getHangzhouGujiMode(): HangzhouGujiMode {
  return hangzhouMode;
}

export function getHangzhouGujiAggregateCount(): number {
  const aggregate = GUIJI_CITY_AGGREGATES.find((item) => item.city === 'hangzhou');
  return aggregate?.placeCount ?? 0;
}

export function isHangzhouGujiAggregateReady(): boolean {
  return GUIJI_CITY_AGGREGATES.find((item) => item.city === 'hangzhou')?.hydrated ?? false;
}

export function isHangzhouGujiAggregateLoading(): boolean {
  return GUIJI_CITY_AGGREGATES.find((item) => item.city === 'hangzhou')?.loading ?? false;
}

export function getHangzhouGujiAggregateError(): string | undefined {
  return GUIJI_CITY_AGGREGATES.find((item) => item.city === 'hangzhou')?.loadError;
}

export async function loadHangzhouGujiAggregate(): Promise<boolean> {
  try {
    return Boolean(await loadGujiCityAggregate('hangzhou'));
  } catch {
    return false;
  }
}

export function getHangzhouGujiMappableAggregateCount(): number {
  return listAggregateHangzhouSpots().length;
}

export function setHangzhouGujiBookEnabled(bookId: string, enabled: boolean) {
  hangzhouMode = 'custom';
  if (enabled) disabledHangzhouBookIds.delete(bookId);
  else disabledHangzhouBookIds.add(bookId);
  if (enabled) {
    visible = true;
    const book = listHangzhouGujiBooks().find((candidate) => candidate.id === bookId);
    if (book) void loadMapSkill(book.skillName);
  }
  persistHangzhouSelection();
  emit();
}

export function setAllHangzhouGujiBooksEnabled(enabled: boolean) {
  const bookIds = listHangzhouGujiBooks().map((book) => book.id);
  hangzhouMode = enabled ? 'aggregate' : 'custom';
  disabledHangzhouBookIds = enabled ? new Set() : new Set(bookIds);
  if (enabled) visible = true;
  persistHangzhouSelection();
  emit();
}

function listAggregateHangzhouSpots(): AtlasSpot[] {
  const aggregate = GUIJI_CITY_AGGREGATES.find((item) => item.city === 'hangzhou')?.skill;
  const aggregateBook = aggregate?.books[0];
  if (!aggregateBook) return [];

  const sourceByPlace = new Map<string, {
    skillName: string;
    skillDisplayName: string;
    bookId: string;
    bookTitle: string;
    author: string;
    era: string;
    place: RoamPlaceSeed;
  }>();
  const bookById = new Map<string, {
    skillName: string;
    skillDisplayName: string;
    bookId: string;
    bookTitle: string;
    author: string;
    era: string;
  }>();
  for (const skill of listMapSkills()) {
    for (const book of skill.books) {
      if (book.city !== '杭州') continue;
      const sourceBook = {
        skillName: skill.name,
        skillDisplayName: skill.displayName,
        bookId: book.id,
        bookTitle: getBookDisplayTitle(book),
        author: book.author,
        era: book.era,
      };
      bookById.set(book.id, sourceBook);
      for (const place of book.places) {
        sourceByPlace.set(`${book.id}:${place.id}`, { ...sourceBook, place });
      }
    }
  }

  const readySpots = (aggregateBook.places as AggregatePlace[]).map((place) => {
    const sources: AtlasSpotSource[] = (place.sourcePlaces ?? []).map((reference, index) => {
      const original = reference.runtimePlaceId
        ? sourceByPlace.get(`${reference.bookId}:${reference.runtimePlaceId}`)
        : undefined;
      const book = original ?? bookById.get(reference.bookId);
      return {
        key: `${book?.skillName ?? reference.childSkillId}:${reference.bookId}:${reference.runtimePlaceId ?? index}`,
        skillId: book?.skillName ?? reference.childSkillId,
        skillName: book?.skillDisplayName ?? reference.childSkillId,
        bookId: reference.bookId,
        bookTitle: book?.bookTitle ?? getBookDisplayTitle({ id: reference.bookId, title: reference.bookTitle }),
        author: book?.author ?? '',
        era: book?.era ?? '',
        quote: original?.place.quote,
        chapter: formatGujiDisplayText(original?.place.chapter ?? reference.chapter),
        note: formatGujiDisplayText(original?.place.note),
      };
    });
    return {
      key: `杭州总:${place.id}`,
      name: formatGujiDisplayText(place.name),
      modernName: formatGujiDisplayText(place.modernName),
      city: '杭州',
      status: place.status,
      confidence: place.confidence,
      lat: place.lat,
      lng: place.lng,
      coordinateType: place.coordinateType,
      coordinateAccuracy: place.coordinateAccuracy,
      mapReady: place.mapReady,
      mapAdmissionReason: place.mapAdmissionReason,
      books: [...new Set(sources.map((source) => source.bookTitle))],
      quote: sources.find((source) => source.quote)?.quote,
      chapter: formatGujiDisplayText(place.chapter),
      note: formatGujiDisplayText(place.note),
      sources,
    };
  }).filter(isGujiSpotReadyForMap);

  // 总 Skill 的地图层按“同名 + 同坐标”再做一次纯展示合并。
  // 原总库为避免误删同书不同条目会保留这些记录；地图上则不能让五个“孤山”方块叠在一起。
  const byDisplayPoint = new Map<string, AtlasSpot>();
  for (const spot of readySpots) {
    const key = `${spot.name}:${spot.lat.toFixed(6)}:${spot.lng.toFixed(6)}`;
    const existing = byDisplayPoint.get(key);
    if (!existing) {
      byDisplayPoint.set(key, spot);
      continue;
    }
    for (const book of spot.books) if (!existing.books.includes(book)) existing.books.push(book);
    for (const source of spot.sources) {
      if (!existing.sources.some((candidate) => candidate.key === source.key)) existing.sources.push(source);
    }
    if (!existing.quote && spot.quote) existing.quote = spot.quote;
    if (!existing.chapter && spot.chapter) existing.chapter = spot.chapter;
  }
  return [...byDisplayPoint.values()];
}

export function listGujiAtlasSpots(): AtlasSpot[] {
  if (hangzhouMode === 'aggregate') return listAggregateHangzhouSpots();
  const enabledBookIds = new Set(
    listHangzhouGujiBooks().filter((book) => book.enabled).map((book) => book.id),
  );
  if (enabledBookIds.size === 0) return [];
  return listAtlasSpots({
    includePersonalSkills: true,
    includeUserResearch: false,
    mergeAcrossBooks: false,
    bookFilter: ({ city, bookId }) => city === '杭州' && enabledBookIds.has(bookId),
  }).filter(isGujiSpotReadyForMap);
}

export interface GujiLeafPage {
  key: string;
  kicker: string;
  title: string;
  attribution?: string;
  body: string;
  footer: string;
  modernText?: string;
  hasOriginal: boolean;
}

// 读者运行资产的单条书证硬上限；长句在同一叶内自适应字号，不拆句。
export const GUIJI_LEAF_BODY_LIMIT = 280;

const VERTICAL_BRACKETS = /[\[\]［］【】〔〕（）()｛｝{}「」『』《》〈〉“”‘’]/g;
const VERTICAL_CIRCLES = /[○◯]/g;
const VERTICAL_RESEARCH_PREFIXES =
  /【[^】]*(?:同址合并|待人工复核|待复核|私人预览)[^】]*】/g;

/**
 * 只用于竖版“城市古笺”的排印副本：运行 Skill 原文保持不变。
 * 竖排里去掉研究日志、横置括号与直角引号，并把缺字圆圈改成古籍常用方框。
 */
export function formatGujiVerticalText(
  text: string | undefined,
  fallback = '',
): string {
  const formatted = formatGujiDisplayText(text)
    .replace(VERTICAL_RESEARCH_PREFIXES, '')
    .replace(/SOURCE\s+INDEX/gi, '')
    .replace(/Skill/gi, '')
    .replace(/现代承载按[“”「」]?([^“”「」；。]+)[“”「」]?表达/g, '今以$1落位')
    .replace(/保留全部来源书证[。；]?/g, '')
    .replace(VERTICAL_BRACKETS, '')
    .replace(VERTICAL_CIRCLES, '□')
    .replace(/〇/g, '零')
    .replace(/[“”]/g, '')
    .replace(/…+/g, '。')
    .replace(/[·•]+/g, '，')
    .replace(/[A-Za-z]+(?:[-_/][A-Za-z0-9]+)*/g, '')
    .replace(/\s+/g, '')
    .replace(/，{2,}/g, '，')
    .replace(/。{2,}/g, '。')
    .replace(/^[，。；：、]+|[，；：、]+$/g, '')
    .trim();
  return formatted || fallback;
}

function splitLeafBody(body: string): string[] {
  // 一条书证是一个语义单元：不再因字数把分号前后拆成两页。
  // 长句由组件按字数自适应字号。
  return [body.trim()];
}

interface CompleteGujiSentence {
  text: string;
  start: number;
}

function completeGujiSentences(text: string): CompleteGujiSentence[] {
  return [...text.matchAll(/[^。！？]+[。！？]+/g)].map((match) => ({
    text: match[0],
    start: match.index,
  }));
}

function gujiSentenceLength(text: string): number {
  return Array.from(text.replace(/[。！？]+$/g, '')).length;
}

function hasBrokenGujiSentenceStart(text: string): boolean {
  // OCR 固定字数窗口常从“当心，”的末字起截，形成“心，……”。
  // 单字加逗号不是可独立阅读的句首，必须回到上一个句界重取。
  return /^[\u3400-\u9fff][）)\]］】〕」』》〉]*，/.test(text);
}

function normalizedPlaceLabel(placeName: string): string {
  return placeName.replace(/^[\s·•\[\]［］【】]+|[\s·•\[\]［］【】]+$/g, '');
}

/**
 * 从运行 quote 中选择语义闭合的原文。优先从“包含当前地点”的完整句起排，
 * 因而不会把 OCR 上下文窗口前端的“围。”“之。”等上一句残尾带进书叶；
 * 末尾没有句号的截断窗口同样不显示。横排调用可继续保留正常中文标点。
 */
export function selectCompleteGujiExcerpt(
  text: string | undefined,
  placeName = '',
): string {
  const raw = formatGujiDisplayText(text).replace(/\s+/g, '').trim();
  if (/={3,}|-{3,}|全书完|(?:^|。)卷\d+·|OCR|PDF|SOURCE\s+INDEX|编辑委员会|前言|出版说明|(?:19|20)世纪|改革开放|现代化经济建设|\d{3,}/i.test(raw)) return '';
  const hadLeadingBoundary = /^[，。！？；：、]+/.test(raw);
  const original = raw.replace(/^[，。！？；：、]+/, '');
  if (Array.from(original).length < 6) return '';

  const sentences = completeGujiSentences(original);
  const label = normalizedPlaceLabel(placeName);
  const labelOnlyInOpenTail = Boolean(label)
    && original.includes(label)
    && !sentences.some((sentence) => sentence.text.includes(label));
  const targetIndex = label
    ? sentences.findIndex((sentence) => sentence.text.includes(label))
    : -1;

  if (targetIndex >= 0) {
    let startIndex = targetIndex;
    let endIndex = targetIndex;
    const target = sentences[targetIndex];
    const previous = sentences[targetIndex - 1];
    // “其东”“又北”等承接句需要上一完整句才能读懂；单字残句绝不回带。
    if (
      previous
      && /^(?:其|此|乃|遂|故|因|又|亦|则|而|盖|即|仍)/.test(target.text)
      && gujiSentenceLength(previous.text) > 2
      && !hasBrokenGujiSentenceStart(previous.text)
    ) {
      startIndex -= 1;
    }
    if (hasBrokenGujiSentenceStart(target.text)) return '';
    const targetPlain = target.text.replace(/[。！？\s（）()「」『』“”《》〈〉]/g, '');
    const labelPlain = label.replace(/[\s（）()「」『』“”《》〈〉]/g, '');
    const following = sentences[targetIndex + 1];
    if (
      targetPlain === labelPlain
      && following
      && gujiSentenceLength(following.text) > 2
      && !hasBrokenGujiSentenceStart(following.text)
    ) {
      endIndex += 1;
    }
    return sentences
      .slice(startIndex, endIndex + 1)
      .map((sentence) => sentence.text)
      .join('');
  }

  // 地名只落在窗口末端的未完句里：前面即使有句号，也不是该地的完整书证。
  if (labelOnlyInOpenTail) return '';

  if (sentences.length > 0) {
    const firstReadable = sentences.findIndex((sentence) => (
      gujiSentenceLength(sentence.text) > 2
      && !hasBrokenGujiSentenceStart(sentence.text)
    ));
    if (firstReadable < 0) return '';
    // 如开端已明显是 OCR 残句，不得跳到后面与当前地点无关的句子。
    if (firstReadable > 0 && hasBrokenGujiSentenceStart(sentences[0].text)) return '';
    return sentences.slice(firstReadable).map((sentence) => sentence.text).join('');
  }

  // 无句末的字窗无法证明是榜额、诗题还是 OCR 截断；读者层一律不上图。
  void hadLeadingBoundary;
  return '';
}

/** 竖排印刷副本：先保证原文语义完整，再处理竖排不兼容的符号。 */
export function formatGujiOriginalExcerpt(
  text: string | undefined,
  placeName = '',
): string {
  const complete = selectCompleteGujiExcerpt(text, placeName);
  if (!complete) return '';
  const vertical = formatGujiVerticalText(complete).replace(/^[，。；：、]+/, '');
  return Array.from(vertical).length >= 6 ? vertical : '';
}

function prepareGujiOriginalExcerpt(
  source: AtlasSpotSource,
  placeName: string,
): string {
  return formatGujiOriginalExcerpt(source.quote, placeName);
}

function paginateLeafPage(page: GujiLeafPage): GujiLeafPage[] {
  const printablePage = {
    ...page,
    title: formatGujiVerticalText(page.title),
    attribution: page.attribution,
    kicker: formatGujiVerticalText(page.kicker, '原书卷目'),
    body: formatGujiVerticalText(page.body),
  };
  const chunks = splitLeafBody(printablePage.body);
  return chunks.map((body, index) => ({
    ...printablePage,
    key: chunks.length === 1 ? page.key : `${page.key}:part:${index + 1}`,
    kicker: index === 0 ? printablePage.kicker : `${printablePage.kicker}续篇`,
    body,
  }));
}

function leafBookTitle(bookId: string, title: string): string {
  return getBookDisplayTitle({ id: bookId, title })
    .replace(/\s*第[一二三四五六七八九十百千\d]+册\s*$/g, '')
    .trim();
}

function gujiDynastyLabel(era: string | undefined): string {
  const value = String(era || '').trim();
  const rules: Array<[RegExp, string]> = [
    [/民国/, '民国'],
    [/明末清初/, '明末清初'],
    [/宋末元初/, '宋末元初'],
    [/(?=.*唐)(?=.*五代)/, '唐、五代'],
    [/南宋/, '南宋'],
    [/北宋/, '北宋'],
    [/清/, '清'],
    [/明/, '明'],
    [/元/, '元'],
    [/五代/, '五代'],
    [/唐/, '唐'],
    [/宋/, '宋'],
    [/隋/, '隋'],
    [/六朝/, '六朝'],
    [/现代|近现代|现当代|(?:19|20)\d{2}/, '现代'],
  ];
  return rules.find(([pattern]) => pattern.test(value))?.[1] ?? '未详';
}

function gujiAuthorLabel(author: string | undefined): string {
  const rawParts = String(author || '')
    .split(/[　·，,;；、/]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const secondaryRole = /校记|校核|点注|校注|整理|主编|编委|审定|转化/;
  const primaryParts = rawParts.filter((value) => !secondaryRole.test(value));
  const selected = primaryParts.length > 0 ? primaryParts : rawParts;
  const names = selected
    .map((value) => value
      .replace(/^[（(](?:先秦|秦|汉|晋|隋|唐|宋|元|明|清|民国)[）)]/, '')
      .replace(/[（(][^）)]*(?:注解|校注|点注|整理|主编|编纂|修撰)[）)]/g, '')
      .replace(/(?:原著|编纂|修撰|撰|纂|著|辑|路线本)$/g, '')
      .replace(/等$/g, '')
      .trim())
    .filter((value) => value && value !== '上街去');
  return [...new Set(names)].join('、') || '未详';
}

/** 古籍书页署名统一只显示“朝代·作者”，不带版本、编校或追记说明。 */
export function formatGujiAttribution(
  era: string | undefined,
  author: string | undefined,
): string {
  return `${gujiDynastyLabel(era)}·${gujiAuthorLabel(author)}`;
}

function leafAttribution(source: AtlasSpotSource): string | undefined {
  return formatGujiAttribution(source.era, source.author);
}

/** 今译/地点考据只保留面向读者的信息，并删除运行资产里完全重复的句段。 */
export function formatGujiModernText(text: string | undefined): string {
  const formatted = formatGujiDisplayText(text);
  if (!formatted) return '';
  const segments = formatted.match(/[^。！？；]+[。！？；]?/g) ?? [formatted];
  const seen = new Set<string>();
  return segments
    .map((segment) => segment.trim())
    .filter((segment) => {
      const key = segment.replace(/[。！？；，、：\s]/g, '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('')
    .trim();
}

export function buildGujiLeafPages(spot: AtlasSpot): GujiLeafPage[] {
  const sourcePages: GujiLeafPage[] = spot.sources.flatMap((source) => {
    const original = prepareGujiOriginalExcerpt(source, spot.name);
    if (!original) return [];
    return [{
      key: `source:${source.key}`,
      kicker: source.chapter || '原书卷目',
      title: leafBookTitle(source.bookId, source.bookTitle),
      attribution: leafAttribution(source),
      body: original,
      footer: `${spot.name} · ${leafBookTitle(source.bookId, source.bookTitle)}`,
      modernText: formatGujiModernText(source.note || spot.note),
      hasOriginal: true,
    }];
  });

  if (sourcePages.length > 0) return sourcePages.flatMap(paginateLeafPage);

  const source = spot.sources[0];
  const placeholder: GujiLeafPage = {
    key: `source:${source?.key ?? spot.key}:no-original`,
    kicker: source?.chapter || '原书卷目',
    title: source
      ? leafBookTitle(source.bookId, source.bookTitle)
      : spot.books[0] || spot.name,
    attribution: source
      ? leafAttribution(source)
      : undefined,
    body: '',
    footer: `${spot.name} · 原文未附`,
    modernText: formatGujiModernText(source?.note || spot.note),
    hasOriginal: false,
  };
  return paginateLeafPage(placeholder);
}

export function isGujiAtlasVisible(): boolean {
  return visible;
}

export function setGujiAtlasVisible(next: boolean) {
  if (visible === next) return;
  visible = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    // 隐私模式下保留内存态。
  }
  emit();
}

export function subscribeGujiAtlas(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  const offMapSkills = subscribeMapSkills(subscriber);
  const offRoam = subscribeRoam(subscriber);
  return () => {
    subscribers.delete(subscriber);
    offMapSkills();
    offRoam();
  };
}

export function requestGujiAtlasOverview() {
  overviewRequest += 1;
  emit();
}

export function getGujiAtlasOverviewRequest(): number {
  return overviewRequest;
}
