// FROST 的总舆图数据源：全部地图内容包（不论是否加载进书架）+ 用户研究出的地点，
// 跨城市汇成一份「考据过的地点」总清单。纯读、零副作用——总舆图是浏览层，不是工作台：
// mapping tab 的漫游图管「这次上街去哪」（单城市、确认上图、排线回放），
// 这里管「FROST 知道什么」（全城市、全考据点，点开看出处引文）。
import { listMapSkills, normalizeMapSkillPlace } from './mapSkills';
import type { MapSkillFile } from './mapSkills';
import { getBookDisplayTitle } from './bookTitle';
import { formatGujiDisplayText } from './gujiText';
import { getRoamBooks, getRoamPlaces } from './store';
import type { RoamConfidence, RoamPlaceStatus } from './types';

export interface AtlasSpotSource {
  key: string;
  skillId: string;
  skillName: string;
  bookId: string;
  bookTitle: string;
  author: string;
  era: string;
  quote?: string;
  chapter?: string;
  note?: string;
}

export interface AtlasSpot {
  key: string;                 // 去重键：城市:地名（同名同城跨书视为同一处，合并出处）
  name: string;
  modernName?: string;
  city: string;
  status: RoamPlaceStatus;
  confidence?: RoamConfidence;
  lat: number;
  lng: number;
  coordinateType?: string;     // 上图准入所需：不能把研究排布锚点冒充真实地点
  coordinateAccuracy?: string;
  mapReady?: boolean;
  mapAdmissionReason?: string;
  books: string[];             // 出处书目（跨书合并）
  quote?: string;
  chapter?: string;
  note?: string;
  sources: AtlasSpotSource[];  // 点开地图标记后，用这些可靠出处生成可翻阅书页
}

export interface AtlasListOptions {
  includePersonalSkills?: boolean;
  includeUserResearch?: boolean;
  mergeAcrossBooks?: boolean;
  bookFilter?: (input: {
    bookId: string;
    city: string;
    skillName: string;
    worldScope?: 'personal' | 'global';
  }) => boolean;
}

/**
 * 对一组已经取得的 Skill 包执行全量内容质检。
 *
 * 生产运行态仍由 listAtlasSpots() 只传入“已加载且已水合”的少量包；构建期测试则可把
 * 离线总库传进来检查 29 个包，避免为了做质量回归而把 5.7MB 总库编入手机首包。
 */
export function listAtlasSpotsFromSkills(
  skills: MapSkillFile[],
  options: AtlasListOptions = {},
): AtlasSpot[] {
  const byKey = new Map<string, AtlasSpot>();
  const push = (spot: AtlasSpot) => {
    const had = byKey.get(spot.key);
    if (!had) {
      byKey.set(spot.key, spot);
      return;
    }
    for (const book of spot.books) if (!had.books.includes(book)) had.books.push(book);
    for (const source of spot.sources) {
      if (!had.sources.some((candidate) => candidate.key === source.key)) {
        had.sources.push(source);
      }
    }
    if (!had.quote && spot.quote) {
      had.quote = spot.quote;
      had.chapter = spot.chapter;
    }
    if (!had.modernName && spot.modernName) had.modernName = spot.modernName;
  };

  for (const pack of skills) {
    if (pack.worldScope === 'personal' && !options.includePersonalSkills) continue;
    for (const book of pack.books) {
      if (options.bookFilter && !options.bookFilter({
        bookId: book.id,
        city: book.city,
        skillName: pack.name,
        worldScope: pack.worldScope,
      })) continue;
      const displayTitle = getBookDisplayTitle(book);
      for (const place of book.places) {
        const normalized = normalizeMapSkillPlace(pack, place);
        push({
          key: options.mergeAcrossBooks === false
            ? `${book.city}:${book.id}:${place.name}:${place.id}`
            : `${book.city}:${place.name}`,
          name: formatGujiDisplayText(place.name),
          modernName: formatGujiDisplayText(place.modernName),
          city: book.city,
          status: place.status,
          lat: normalized.lat,
          lng: normalized.lng,
          confidence: place.confidence,
          coordinateType: place.coordinateType,
          coordinateAccuracy: place.coordinateAccuracy,
          mapReady: place.mapReady,
          mapAdmissionReason: place.mapAdmissionReason,
          books: [displayTitle],
          quote: formatGujiDisplayText(place.quote),
          chapter: formatGujiDisplayText(place.chapter),
          note: formatGujiDisplayText(place.note),
          sources: [{
            key: `${pack.name}:${book.id}:${place.id}`,
            skillId: pack.name,
            skillName: pack.displayName,
            bookId: book.id,
            bookTitle: displayTitle,
            author: book.author,
            era: book.era,
            quote: formatGujiDisplayText(place.quote),
            chapter: formatGujiDisplayText(place.chapter),
            note: formatGujiDisplayText(place.note),
          }],
        });
      }
    }
  }

  return [...byKey.values()];
}

/** 全部考据地点：内容包（95 处级别）∪ 用户研究成果（有坐标且未否决）。 */
export function listAtlasSpots(options: AtlasListOptions = {}): AtlasSpot[] {
  const hydratedSkills = listMapSkills().filter((pack) => pack.loaded && pack.hydrated);
  const byKey = new Map(
    listAtlasSpotsFromSkills(hydratedSkills, options).map((spot) => [spot.key, spot]),
  );
  const personalSkillIds = new Set(
    listMapSkills().filter((pack) => pack.worldScope === 'personal').map((pack) => pack.name),
  );
  const push = (s: AtlasSpot) => {
    const had = byKey.get(s.key);
    if (!had) { byKey.set(s.key, s); return; }
    for (const b of s.books) if (!had.books.includes(b)) had.books.push(b);
    for (const source of s.sources) {
      if (!had.sources.some((candidate) => candidate.key === source.key)) {
        had.sources.push(source);
      }
    }
    if (!had.quote && s.quote) { had.quote = s.quote; had.chapter = s.chapter; }
    if (!had.modernName && s.modernName) had.modernName = s.modernName;
  };

  // 用户研究成果（粘贴书云脑考据等）：包外的新地点一并入图
  if (options.includeUserResearch === false) return [...byKey.values()];
  const bookById = new Map(getRoamBooks().map((b) => [b.id, b]));
  for (const p of getRoamPlaces()) {
    if (!p.geo || p.suggest === 'rejected') continue;
    const b = bookById.get(p.bookId);
    if (!b) continue;
    if (b.skillId && personalSkillIds.has(b.skillId)) continue;
    if (options.bookFilter && !options.bookFilter({
      bookId: b.id,
      city: b.city || '未标城',
      skillName: b.skillId ?? 'user-research',
    })) continue;
    const displayTitle = getBookDisplayTitle(b);
    push({
      key: options.mergeAcrossBooks === false
        ? `${b.city || '未标城'}:${b.id}:${p.name}:${p.id}`
        : `${b.city || '未标城'}:${p.name}`,
      name: formatGujiDisplayText(p.name), modernName: formatGujiDisplayText(p.modernName), city: b.city || '未标城',
      status: p.status, lat: p.geo.lat, lng: p.geo.lng,
      confidence: p.confidence,
      coordinateType: p.coordinateType,
      coordinateAccuracy: p.coordinateAccuracy,
      mapReady: p.mapReady,
      mapAdmissionReason: p.mapAdmissionReason,
      books: [displayTitle], quote: formatGujiDisplayText(p.quote), chapter: formatGujiDisplayText(p.chapter), note: formatGujiDisplayText(p.note),
      sources: [{
        key: `user-research:${b.id}:${p.id}`,
        skillId: b.skillId ?? 'user-research',
        skillName: b.skillId ? '已加载地图 Skill' : '我的古籍考据',
        bookId: b.id,
        bookTitle: displayTitle,
        author: b.author,
        era: b.era,
        quote: formatGujiDisplayText(p.quote),
        chapter: formatGujiDisplayText(p.chapter),
        note: formatGujiDisplayText(p.note),
      }],
    });
  }

  return [...byKey.values()];
}
