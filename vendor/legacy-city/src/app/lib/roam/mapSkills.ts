// 地图内容包（.skill）：把「一组书 + 精编地点」封装成可加载/卸载/分发的包，
// mapping 因此成为开放平台——用我发布的包，或导入/铸造你自己的包。
//
// 格式规范化自黄佳《Claude Code实战：Harness工程之道》Skills 章节：
// - 包名 kebab-case，字符集 [a-z0-9-]，≤64 字符（跨平台「世界语」）；中文展示名放元数据不放包名
// - description ≤1024 字，按「做什么 + 何时用（触发词）+ 不适用」三段写——它是用户决定要不要加载的唯一信号
// - 声明式自包含：一个 JSON 文件即全部内容，复制即安装，不绑平台、品牌中立
// - 渐进披露三层：常驻仅目录页（name/description）→ 加载才进书架 → 地点确认后才上图
// - 坐标/地点是确定性数据，包里直接给结构化字段，不让模型推算
//
// 状态存 pe.mapSkills.v2（照 garden.ts 模式）；书本体注册进 roam store（pe.roam.v1）。

import { updateUserMarkPosition } from '../../data/userMarks';
import gujiSkillIndex from '../../data/guji-skill-index.json';
import { gcj02ToWgs84 } from '../location/chinaCoordinates';
import { fetchWithDeadline } from '../runtime/fetchWithDeadline';
import type { RoamBookSeed, RoamPlaceSeed } from './catalog';
import {
  getRoamBooks,
  getRoamPlaces,
  reconcileSkillBooks,
  registerSkillBooks,
  replaceBookPlaces,
  ROAM_PIN_PREFIX,
  setBookCityGeo,
  unregisterSkillBooks,
} from './store';
import type { RoamBook } from './types';

export const MAP_SKILL_FORMAT = 'map-skill/v1';
const MAP_SKILL_DOWNLOAD_TIMEOUT_MS = 20_000;

export interface MapSkillBook extends RoamBookSeed {
  places: RoamPlaceSeed[];
}

/** .skill 文件本体（自包含、declarative、可直接导出/导入的 JSON） */
export interface MapSkillFile {
  format: typeof MAP_SKILL_FORMAT;
  name: string;          // kebab-case 包名，[a-z0-9-] ≤64
  displayName: string;   // 中文展示名：杭州文学地图
  description: string;   // 做什么 + 何时用 + 不适用，≤1024 字
  version: string;       // 语义化版本
  author?: string;
  /**
   * books[].places 与 books[].cityGeo 的原始坐标系。
   * 业务域一律使用 WGS84，并只在高德渲染边界转为 GCJ-02。
   * 旧 .skill 未声明时按 WGS84 处理，避免改变已有开放格式的含义。
   */
  coordinateSystem?: 'wgs84' | 'gcj02';
  /** 个人内容包不进入公共古籍总舆图；省略时保持旧包的全局目录行为。 */
  worldScope?: 'personal' | 'global';
  books: MapSkillBook[];
}

export interface MapSkillInfo extends MapSkillFile {
  origin: 'builtin' | 'imported';
  permanent?: boolean;   // 常驻包（创始包，不可卸载）
  loaded: boolean;
  hydrated: boolean;     // 包内地点是否已经按需下载并解析
  loading: boolean;
  bookCount: number;
  placeCount: number;
  loadError?: string;
}

// —— 内置发布包 ——
// 单一事实来源是「城市 Skills 总库」的机器注册表；npm run guji:sync 负责机械同步，
// 前端不再维护一套会与真实研究成果漂移的演示书单。
interface GujiCatalogBook extends Omit<MapSkillBook, 'places'> {
  placeCount: number;
}

interface GujiCatalogEntry extends Omit<MapSkillFile, 'books'> {
  assetPath: string;
  bookCount: number;
  placeCount: number;
  books: GujiCatalogBook[];
}

interface GujiLibraryIndex {
  featuredSkillName: string;
  bookCount: number;
  placeCount: number;
  cityCounts: Array<{ city: string; books: number }>;
  skills: GujiCatalogEntry[];
  cityAggregates?: GujiAggregateCatalogEntry[];
}

interface GujiAggregateCatalogEntry extends GujiCatalogEntry {
  city: string;
  id: string;
}

export interface MapSkillCatalogBook extends Omit<MapSkillBook, 'places'> {
  skillName: string;
  skillDisplayName: string;
  placeCount: number;
  loaded: boolean;
  hydrated: boolean;
}

export interface GujiCityAggregateInfo {
  city: string;
  id: string;
  assetPath: string;
  placeCount: number;
  hydrated: boolean;
  loading: boolean;
  loadError?: string;
  skill: MapSkillFile;
}

const GUIJI_LIBRARY = gujiSkillIndex as unknown as GujiLibraryIndex;
const BUILTIN_CATALOG = GUIJI_LIBRARY.skills;
const BUILTIN_SKILLS = new Map<string, MapSkillFile>();
const BUILTIN_LOADS = new Map<string, Promise<MapSkillFile>>();
const BUILTIN_LOAD_ERRORS = new Map<string, string>();
const BUILTIN_AGGREGATE_LOADS = new Map<string, Promise<MapSkillFile>>();
const BUILTIN_AGGREGATE_LOAD_ERRORS = new Map<string, string>();
const PERMANENT_IDS = new Set<string>();

/**
 * 古籍正文包不进入手机首包：开发态从本地 public/ 读取，生产构建使用
 * Vite 的绝对 BASE_URL 指向同一版本的 OSS 发布目录。不能直接 fetch
 * `/assets/...`，否则轻量应用服务器上没有这些重 JSON，会整架书统一 404。
 */
export function resolveMapSkillAssetPath(
  assetPath: string,
  baseUrl = import.meta.env.BASE_URL,
): string {
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  if (!/^https?:\/\//i.test(baseUrl)) return assetPath;
  return new URL(assetPath.replace(/^\/+/, ''), baseUrl).toString();
}

export const FEATURED_GUIJI_SKILL_NAME = GUIJI_LIBRARY.featuredSkillName;
export const GUIJI_LIBRARY_STATS = {
  books: GUIJI_LIBRARY.bookCount,
  places: GUIJI_LIBRARY.placeCount,
  cities: GUIJI_LIBRARY.cityCounts.length,
  cityCounts: GUIJI_LIBRARY.cityCounts,
} as const;

// 城市总 Skill 只把轻目录编进首包；用户打开/加载总图时才下载对应城市资产。
// 这样保留公益古籍赛道的“城市总览”，又不会把 5.7MB 全库重新塞回首屏。
export const GUIJI_CITY_AGGREGATES: GujiCityAggregateInfo[] = (GUIJI_LIBRARY.cityAggregates ?? []).map((entry) => ({
  city: entry.city,
  id: entry.id,
  assetPath: entry.assetPath,
  placeCount: entry.placeCount,
  hydrated: false,
  loading: false,
  skill: {
    format: entry.format,
    name: entry.name,
    displayName: entry.displayName,
    description: entry.description,
    version: entry.version,
    author: entry.author,
    coordinateSystem: entry.coordinateSystem,
    worldScope: entry.worldScope,
    books: entry.books.map(({ placeCount: _placeCount, ...book }) => ({ ...book, places: [] })),
  },
}));

// —— 状态（pe.mapSkills.v2）——
const KEY = 'pe.mapSkills.v2';
const LEGACY_KEY = 'pe.mapSkills.v1';

interface MapSkillState {
  loadedIds: string[];         // 已加载包名（常驻包恒在）
  publishedIds: string[];      // 用户明确发布到城市漫游公共层的包名
  imported: MapSkillFile[];    // 用户导入/铸造的包
  seeded?: string[];           // 已播过种的默认包（用户之后卸载不会被强行加回）
  publicSeeded?: string[];     // 已播到公共层的默认包（用户撤下后不会被强行发布）
  defaultSeedVersion?: number;
}

// 首次进入中间地图时保留六册杭州古籍作为“已装入”的轻目录，避免左下角 Skills 空白。
// loadedIds 只表示装入/可选；包体仍由 fetchBuiltinSkill 按当前激活项下载与解析。
// 运行时最多保留六份内建包，继续加载会释放最早的一份，避免长期使用后内存累积。
export const DEFAULT_LOADED_MAP_SKILL_IDS = [
  'library-hangzhou-map-hangzhou-xihu-mengxun-preview',
  'library-hangzhou-map-wulin-jiushi-hangzhou-preview',
  'library-hangzhou-map-hangzhou-taoan-mengyi-preview',
  'library-hangzhou-map-wulin-fangxiang-zhi-hangzhou-preview',
  'library-hangzhou-map-xihu-wenxian-jicheng-3-hangzhou-preview',
  'library-hangzhou-map-xianchun-linan-zhi-hangzhou-preview',
].filter((id) => BUILTIN_CATALOG.some((skill) => skill.name === id));
export const DEFAULT_PUBLIC_MAP_SKILL_IDS = [...DEFAULT_LOADED_MAP_SKILL_IDS];
const DEFAULT_SEED_VERSION = 3;
const MAX_LOADED_BUILTIN_SKILLS = 6;
const MAX_PREVIEWED_BUILTIN_SKILLS = 3;
const PREVIEWED_BUILTIN_SKILL_IDS: string[] = [];

function seedDefaultLoadedSkills(value: MapSkillState): MapSkillState {
  const seeded = new Set(value.seeded ?? []);
  let loadedIds = [...value.loadedIds];
  if (value.defaultSeedVersion !== DEFAULT_SEED_VERSION) {
    // v3 将《武林坊巷志》重新列入默认六册。旧版本曾把它记为“已经播过”，
    // 这里仅清掉这一个旧迁移标记，让现有设备也能收到本次新增默认项。
    if (!loadedIds.includes(FEATURED_GUIJI_SKILL_NAME)) {
      seeded.delete(FEATURED_GUIJI_SKILL_NAME);
    }
  }
  const unseenDefaults = DEFAULT_LOADED_MAP_SKILL_IDS.filter((id) => !seeded.has(id));
  let builtinCount = loadedIds.filter((id) => BUILTIN_CATALOG.some((skill) => skill.name === id)).length;
  for (const id of unseenDefaults) {
    seeded.add(id);
    if (builtinCount >= MAX_LOADED_BUILTIN_SKILLS || loadedIds.includes(id)) continue;
    loadedIds.push(id);
    builtinCount += 1;
  }
  const publicSeeded = new Set(value.publicSeeded ?? []);
  const publishedIds = [...value.publishedIds];
  if (
    value.defaultSeedVersion !== DEFAULT_SEED_VERSION
    && !publishedIds.includes(FEATURED_GUIJI_SKILL_NAME)
  ) {
    publicSeeded.delete(FEATURED_GUIJI_SKILL_NAME);
  }
  for (const id of DEFAULT_PUBLIC_MAP_SKILL_IDS) {
    if (publicSeeded.has(id)) continue;
    publicSeeded.add(id);
    if (loadedIds.includes(id) && !publishedIds.includes(id)) publishedIds.push(id);
  }
  return {
    ...value,
    loadedIds,
    publishedIds,
    seeded: [...seeded],
    publicSeeded: [...publicSeeded],
    defaultSeedVersion: DEFAULT_SEED_VERSION,
  };
}

function defaults(): MapSkillState {
  return {
    loadedIds: [...DEFAULT_LOADED_MAP_SKILL_IDS],
    publishedIds: [...DEFAULT_PUBLIC_MAP_SKILL_IDS],
    imported: [],
    seeded: [...DEFAULT_LOADED_MAP_SKILL_IDS],
    publicSeeded: [...DEFAULT_PUBLIC_MAP_SKILL_IDS],
    defaultSeedVersion: DEFAULT_SEED_VERSION,
  };
}

function load(): MapSkillState {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as MapSkillState) : null;
    if (s && Array.isArray(s.loadedIds) && Array.isArray(s.imported)) {
      const knownIds = new Set([...BUILTIN_CATALOG.map((skill) => skill.name), ...s.imported.map((skill) => skill.name)]);
      s.loadedIds = s.loadedIds.filter((id) => knownIds.has(id));
      s.publishedIds = Array.isArray(s.publishedIds)
        ? s.publishedIds.filter((id) => knownIds.has(id))
        : [];
      for (const id of PERMANENT_IDS) if (!s.loadedIds.includes(id)) s.loadedIds.push(id);
      return seedDefaultLoadedSkills(s);
    }

    // v1 曾把全部内建包默认加载。升级时只保留用户导入包，避免旧状态把数千点重新塞回地图。
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    const legacy = legacyRaw ? (JSON.parse(legacyRaw) as MapSkillState) : null;
    if (legacy && Array.isArray(legacy.imported)) {
      const importedIds = new Set(legacy.imported.map((skill) => skill.name));
      return seedDefaultLoadedSkills({
        loadedIds: (legacy.loadedIds ?? []).filter((id) => importedIds.has(id)),
        publishedIds: [],
        imported: legacy.imported,
        seeded: [],
      });
    }
  } catch { /* 首次/隐私模式 */ }
  return defaults();
}

let state: MapSkillState = load();
let lastLoadedSkillName: string | null = null;
const subs = new Set<() => void>();
function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 内存可用 */ } }
function emit() { subs.forEach((fn) => fn()); }

export function subscribeMapSkills(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

function findSkill(name: string): MapSkillFile | undefined {
  return BUILTIN_SKILLS.get(name) ?? state.imported.find((s) => s.name === name);
}

function findCatalogEntry(name: string): GujiCatalogEntry | undefined {
  return BUILTIN_CATALOG.find((skill) => skill.name === name);
}

function catalogEntryToInfo(entry: GujiCatalogEntry): MapSkillInfo {
  const hydrated = BUILTIN_SKILLS.get(entry.name);
  const skill: MapSkillFile = hydrated ?? {
    format: entry.format,
    name: entry.name,
    displayName: entry.displayName,
    description: entry.description,
    version: entry.version,
    author: entry.author,
    coordinateSystem: entry.coordinateSystem,
    worldScope: entry.worldScope,
    books: entry.books.map(({ placeCount: _placeCount, ...book }) => ({
      ...book,
      places: [],
    })),
  };
  return {
    ...skill,
    origin: 'builtin',
    permanent: PERMANENT_IDS.has(entry.name),
    loaded: state.loadedIds.includes(entry.name),
    hydrated: Boolean(hydrated),
    loading: BUILTIN_LOADS.has(entry.name),
    bookCount: entry.bookCount,
    placeCount: entry.placeCount,
    loadError: BUILTIN_LOAD_ERRORS.get(entry.name),
  };
}

async function fetchBuiltinSkill(entry: GujiCatalogEntry): Promise<MapSkillFile> {
  const cached = BUILTIN_SKILLS.get(entry.name);
  if (cached) return cached;
  const pending = BUILTIN_LOADS.get(entry.name);
  if (pending) return pending;

  BUILTIN_LOAD_ERRORS.delete(entry.name);
  const request = fetchWithDeadline(
    resolveMapSkillAssetPath(entry.assetPath),
    { cache: 'force-cache' },
    MAP_SKILL_DOWNLOAD_TIMEOUT_MS,
  )
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const skill = await response.json() as MapSkillFile;
      const errors = validateMapSkill(skill);
      if (errors.length > 0 || skill.name !== entry.name) {
        throw new Error(errors[0] ?? 'Skill 包名与目录不一致');
      }
      BUILTIN_SKILLS.set(entry.name, skill);
      return skill;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error && error.name === 'TimeoutError'
        ? '网络超时，请重试'
        : error instanceof Error ? error.message : '下载失败';
      BUILTIN_LOAD_ERRORS.set(entry.name, message);
      throw error;
    })
    .finally(() => {
      BUILTIN_LOADS.delete(entry.name);
      emit();
    });
  BUILTIN_LOADS.set(entry.name, request);
  emit();
  return request;
}

/**
 * 只下载内容包供详情页浏览，不把它注册进书架，也不改变个人/公共地图图层。
 *
 * 这条链路刻意与 loadMapSkill 分开：用户点进 Skill 时可以先读完整地点与书证，
 * 只有明确点击“加载到地图”后，包才会进入 loadedIds 并参与地图渲染。
 */
export async function previewMapSkill(name: string): Promise<MapSkillFile | undefined> {
  const imported = state.imported.find((skill) => skill.name === name);
  if (imported) return imported;
  const entry = findCatalogEntry(name);
  if (!entry) return undefined;
  try {
    const skill = await fetchBuiltinSkill(entry);
    const existingIndex = PREVIEWED_BUILTIN_SKILL_IDS.indexOf(name);
    if (existingIndex >= 0) PREVIEWED_BUILTIN_SKILL_IDS.splice(existingIndex, 1);
    PREVIEWED_BUILTIN_SKILL_IDS.push(name);
    while (PREVIEWED_BUILTIN_SKILL_IDS.length > MAX_PREVIEWED_BUILTIN_SKILLS) {
      const evicted = PREVIEWED_BUILTIN_SKILL_IDS.shift();
      if (evicted && !state.loadedIds.includes(evicted)) BUILTIN_SKILLS.delete(evicted);
    }
    return skill;
  } catch {
    return undefined;
  }
}

export function listMapSkillCatalogBooks(city?: string): MapSkillCatalogBook[] {
  return BUILTIN_CATALOG.flatMap((entry) => entry.books
    .filter((book) => !city || book.city === city)
    .map(({ placeCount, ...book }) => ({
      ...book,
      skillName: entry.name,
      skillDisplayName: entry.displayName,
      placeCount,
      loaded: state.loadedIds.includes(entry.name),
      hydrated: BUILTIN_SKILLS.has(entry.name),
    })));
}

export function getGujiCityAggregate(nameOrCity: string): GujiCityAggregateInfo | undefined {
  return GUIJI_CITY_AGGREGATES.find((entry) => (
    entry.skill.name === nameOrCity || entry.id === nameOrCity || entry.city === nameOrCity
  ));
}

export async function loadGujiCityAggregate(nameOrCity: string): Promise<MapSkillFile | undefined> {
  const aggregate = getGujiCityAggregate(nameOrCity);
  if (!aggregate) return undefined;
  if (aggregate.hydrated) return aggregate.skill;
  const pending = BUILTIN_AGGREGATE_LOADS.get(aggregate.skill.name);
  if (pending) return pending;

  BUILTIN_AGGREGATE_LOAD_ERRORS.delete(aggregate.skill.name);
  aggregate.loading = true;
  aggregate.loadError = undefined;
  emit();
  const request = fetchWithDeadline(
    resolveMapSkillAssetPath(aggregate.assetPath),
    { cache: 'force-cache' },
    MAP_SKILL_DOWNLOAD_TIMEOUT_MS,
  )
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const skill = await response.json() as MapSkillFile;
      const errors = validateMapSkill(skill);
      if (errors.length > 0 || skill.name !== aggregate.skill.name) {
        throw new Error(errors[0] ?? '城市总 Skill 包名与目录不一致');
      }
      aggregate.skill = skill;
      aggregate.hydrated = true;
      return skill;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error && error.name === 'TimeoutError'
        ? '网络超时，请重试'
        : error instanceof Error ? error.message : '下载失败';
      BUILTIN_AGGREGATE_LOAD_ERRORS.set(aggregate.skill.name, message);
      aggregate.loadError = message;
      throw error;
    })
    .finally(() => {
      aggregate.loading = false;
      BUILTIN_AGGREGATE_LOADS.delete(aggregate.skill.name);
      emit();
    });
  BUILTIN_AGGREGATE_LOADS.set(aggregate.skill.name, request);
  return request;
}

/** 把内容包点位归一到业务域 WGS84；高德适配层之后只做一次 WGS84 → GCJ-02。 */
export function normalizeMapSkillPlace(
  skill: Pick<MapSkillFile, 'coordinateSystem'>,
  place: RoamPlaceSeed,
): RoamPlaceSeed {
  if (skill.coordinateSystem !== 'gcj02') return { ...place };
  const [lng, lat] = gcj02ToWgs84([place.lng, place.lat]);
  return { ...place, lng, lat };
}

/** 把内容包的城市中心归一到业务域 WGS84。 */
export function normalizeMapSkillGeo(
  skill: Pick<MapSkillFile, 'coordinateSystem'>,
  geo: { lat: number; lng: number },
): { lat: number; lng: number } {
  if (skill.coordinateSystem !== 'gcj02') return { ...geo };
  const [lng, lat] = gcj02ToWgs84([geo.lng, geo.lat]);
  return { lng, lat };
}

/** 目录页：全部可用包（常驻仅此层，包内数据不进上下文——渐进披露第一层） */
export function listMapSkills(): MapSkillInfo[] {
  const seen = new Set<string>();
  const all: MapSkillInfo[] = [];
  for (const entry of BUILTIN_CATALOG) {
    seen.add(entry.name);
    all.push(catalogEntryToInfo(entry));
  }
  for (const s of state.imported) {
    if (seen.has(s.name)) continue; // 同名冲突：内置优先（导入时已挡，这里兜底）
    all.push({
      ...s,
      origin: 'imported',
      loaded: state.loadedIds.includes(s.name),
      hydrated: true,
      loading: false,
      bookCount: s.books.length,
      placeCount: s.books.reduce((total, book) => total + book.places.length, 0),
    });
  }
  return all;
}

export function isSkillLoaded(name: string): boolean { return state.loadedIds.includes(name); }
export function isMapSkillPublishedToPublic(name: string): boolean {
  return state.publishedIds.includes(name);
}

export function publishMapSkillToPublic(name: string): boolean {
  const known = Boolean(findCatalogEntry(name) || state.imported.some((skill) => skill.name === name));
  if (!known || !isSkillLoaded(name)) return false;
  if (isMapSkillPublishedToPublic(name)) return true;
  state = { ...state, publishedIds: [...state.publishedIds, name] };
  persist();
  emit();
  return true;
}

export function unpublishMapSkillFromPublic(name: string): boolean {
  if (!isMapSkillPublishedToPublic(name)) return false;
  state = {
    ...state,
    publishedIds: state.publishedIds.filter((id) => id !== name),
  };
  persist();
  emit();
  return true;
}

export function getSkillDisplayName(name: string): string {
  return findSkill(name)?.displayName ?? findCatalogEntry(name)?.displayName ?? name;
}

function skillBookToRoamBook(skill: MapSkillFile, b: MapSkillBook): RoamBook {
  return {
    id: b.id, title: b.title, author: b.author, era: b.era, city: b.city,
    cityGeo: normalizeMapSkillGeo(skill, b.cityGeo), blurb: b.blurb,
    source: 'skill', skillId: skill.name,
    research: 'idle', addedAt: new Date().toISOString(),
  };
}

/** 渐进披露第三层：按书取包内精编地点（agent 研究管线用，与 CURATED_PLACES 同构） */
export function getSkillCuratedPlaces(bookId: string): RoamPlaceSeed[] {
  for (const name of state.loadedIds) {
    const skill = findSkill(name);
    const book = skill?.books.find((b) => b.id === bookId);
    if (skill && book) return book.places.map((place) => normalizeMapSkillPlace(skill, place));
  }
  return [];
}

export async function loadMapSkill(name: string): Promise<boolean> {
  const imported = state.imported.find((skill) => skill.name === name);
  const entry = findCatalogEntry(name);
  if (!imported && !entry) return false;
  let skill: MapSkillFile;
  try {
    skill = imported ?? await fetchBuiltinSkill(entry!);
  } catch {
    return false;
  }
  const previewIndex = PREVIEWED_BUILTIN_SKILL_IDS.indexOf(name);
  if (previewIndex >= 0) PREVIEWED_BUILTIN_SKILL_IDS.splice(previewIndex, 1);

  // 手机运行态最多保留三份内建包；下载缓存仍在，切回被释放的包无需重新传输。
  const builtinQueue = [
    ...state.loadedIds.filter((id) => id !== name && Boolean(findCatalogEntry(id))),
    ...(entry ? [name] : []),
  ];
  const evictedBuiltinIds = builtinQueue.slice(0, Math.max(0, builtinQueue.length - MAX_LOADED_BUILTIN_SKILLS));
  evictedBuiltinIds.forEach((id) => {
    unregisterSkillBooks(id);
    BUILTIN_SKILLS.delete(id);
  });
  state = {
    ...state,
    loadedIds: [
      ...state.loadedIds.filter((id) => !evictedBuiltinIds.includes(id) && id !== name),
      name,
    ],
  };
  persist();
  registerSkillBooks(skill.books.map((b) => skillBookToRoamBook(skill, b)));
  lastLoadedSkillName = name;
  emit();
  return true;
}

/** Last explicit load intent, shared by Skills Plaza and map control surfaces. */
export function getLastLoadedMapSkillName(): string | null {
  return lastLoadedSkillName;
}

export function unloadMapSkill(name: string): boolean {
  if (PERMANENT_IDS.has(name)) return false;   // 创始包常驻
  if (!state.loadedIds.includes(name)) return false;
  state = { ...state, loadedIds: state.loadedIds.filter((id) => id !== name) };
  persist();
  unregisterSkillBooks(name);
  if (findCatalogEntry(name)) BUILTIN_SKILLS.delete(name);
  emit();
  return true;
}

/** 删除导入包（先卸载再从注册表移除；内置包不可删） */
export function removeImportedSkill(name: string) {
  if (!state.imported.some((s) => s.name === name)) return;
  unloadMapSkill(name);
  state = {
    ...state,
    publishedIds: state.publishedIds.filter((id) => id !== name),
    imported: state.imported.filter((s) => s.name !== name),
  };
  persist(); emit();
}

// —— 校验（导入/铸造共用；返回错误列表，空数组=合法）——
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const STATUSES = new Set(['extant', 'rebuilt', 'memory-only']);
const CONFIDENCES = new Set(['high', 'medium', 'low']);

export function validateMapSkillCoordinates(
  skill: Pick<MapSkillFile, 'books'>,
): string[] {
  const errs: string[] = [];
  for (const book of skill.books ?? []) {
    const tag = book?.title ? `《${book.title}》` : '某书';
    if (!Number.isFinite(book.cityGeo?.lat) || book.cityGeo.lat < -90 || book.cityGeo.lat > 90) errs.push(`${tag}城市中心纬度非法`);
    if (!Number.isFinite(book.cityGeo?.lng) || book.cityGeo.lng < -180 || book.cityGeo.lng > 180) errs.push(`${tag}城市中心经度非法`);
    for (const place of book.places ?? []) {
      const point = place?.name ? `「${place.name}」` : '某地点';
      if (!Number.isFinite(place?.lat) || place.lat < -90 || place.lat > 90) errs.push(`${tag}${point}纬度非法`);
      if (!Number.isFinite(place?.lng) || place.lng < -180 || place.lng > 180) errs.push(`${tag}${point}经度非法`);
    }
  }
  return errs;
}

export function validateMapSkill(obj: unknown): string[] {
  const errs: string[] = [];
  const s = obj as Partial<MapSkillFile> | null;
  if (!s || typeof s !== 'object') return ['不是合法的 JSON 对象'];
  if (s.format !== MAP_SKILL_FORMAT) errs.push(`format 必须是 "${MAP_SKILL_FORMAT}"`);
  if (!s.name || !NAME_RE.test(s.name) || s.name.length > 64) errs.push('包名须为 kebab-case（[a-z0-9-]，≤64 字符），如 hangzhou-food-map');
  if (!s.displayName?.trim()) errs.push('缺少展示名 displayName');
  if (!s.description?.trim()) errs.push('缺少 description（做什么 + 何时用 + 不适用）');
  if ((s.description ?? '').length > 1024) errs.push('description 超过 1024 字');
  if (!s.version?.trim()) errs.push('缺少 version（如 1.0.0）');
  if (s.coordinateSystem && s.coordinateSystem !== 'wgs84' && s.coordinateSystem !== 'gcj02') {
    errs.push('coordinateSystem 须为 wgs84/gcj02');
  }
  if (!Array.isArray(s.books) || s.books.length === 0) errs.push('books 至少要有一部书');
  if (Array.isArray(s.books)) errs.push(...validateMapSkillCoordinates({ books: s.books } as Pick<MapSkillFile, 'books'>));
  for (const b of s.books ?? []) {
    const tag = b?.title ? `《${b.title}》` : '某书';
    if (!b?.id || !b?.title?.trim() || !b?.author?.trim()) { errs.push(`${tag}缺少 id/title/author`); continue; }
    if (!Array.isArray(b.places) || b.places.length === 0) { errs.push(`${tag}至少要有一个地点`); continue; }
    for (const p of b.places) {
      const pt = p?.name ? `「${p.name}」` : '某地点';
      if (!p?.id || !p?.name?.trim()) errs.push(`${tag}${pt}缺少 id/name`);
      if (!STATUSES.has(p?.status as string)) errs.push(`${tag}${pt}status 须为 extant/rebuilt/memory-only`);
      if (p?.confidence && !CONFIDENCES.has(p.confidence as string)) errs.push(`${tag}${pt}confidence 须为 high/medium/low`);
      if (p?.mapReady !== undefined && typeof p.mapReady !== 'boolean') errs.push(`${tag}${pt}mapReady 须为布尔值`);
      if (p?.mapReady === false && !p.mapAdmissionReason?.trim()) errs.push(`${tag}${pt}研究保留点须说明 mapAdmissionReason`);
      if (!p?.note?.trim()) errs.push(`${tag}${pt}缺少一句话小注 note`);
      if (p?.quote && !p?.chapter) errs.push(`${tag}${pt}有 quote 必须给 chapter 出处（引文纪律）`);
      if (p?.quote && p.quote.length > 280) errs.push(`${tag}${pt}引文超过 280 字——请保留与地点直接相关的完整原句`);
    }
  }
  return errs;
}

/** 导入 .skill（JSON 字符串）。书/地点 id 加包名前缀防冲突；同名包拒绝（先删旧的）。 */
export function importMapSkill(json: string, opts?: { load?: boolean }): { ok: boolean; error?: string; skill?: MapSkillFile } {
  let obj: unknown;
  try { obj = JSON.parse(json); } catch { return { ok: false, error: 'JSON 解析失败' }; }
  const errs = validateMapSkill(obj);
  if (errs.length) return { ok: false, error: errs.slice(0, 3).join('；') };
  const raw = obj as MapSkillFile;
  if (BUILTIN_CATALOG.some((s) => s.name === raw.name)) return { ok: false, error: `包名 ${raw.name} 与内置包冲突` };
  if (state.imported.some((s) => s.name === raw.name)) return { ok: false, error: `包 ${raw.name} 已导入过（先删除旧版）` };
  const ns = (id: string) => (id.startsWith(`${raw.name}--`) ? id : `${raw.name}--${id}`);
  const skill: MapSkillFile = {
    format: MAP_SKILL_FORMAT,
    name: raw.name,
    displayName: raw.displayName.trim().slice(0, 24),
    description: raw.description.trim(),
    version: raw.version.trim().slice(0, 16),
    author: raw.author?.trim().slice(0, 24),
    coordinateSystem: raw.coordinateSystem ?? 'wgs84',
    books: raw.books.map((b) => ({
      ...b,
      id: ns(b.id),
      places: b.places.map((p) => ({ ...p, id: ns(p.id) })),
    })),
  };
  state = { ...state, imported: [...state.imported, skill] };
  persist(); emit();
  if (opts?.load !== false) void loadMapSkill(skill.name);
  return { ok: true, skill };
}

/** 导出 .skill 文件内容（自包含 JSON——复制即安装） */
export function exportMapSkill(name: string): string | null {
  const skill = findSkill(name);
  return skill ? JSON.stringify(skill, null, 2) : null;
}

/** 开机自愈：pe.roam.v1 被单独清掉时，把已加载包的书补注册回书架（幂等） */
export function ensureLoadedSkillsRegistered() {
  reconcileSkillBooks(new Set(state.loadedIds));
  const have = new Set(getRoamBooks().map((b) => b.id));
  for (const name of state.loadedIds) {
    const skill = findSkill(name);
    if (!skill) continue;
    const missing = skill.books.filter((b) => !have.has(b.id));
    if (missing.length) registerSkillBooks(missing.map((b) => skillBookToRoamBook(skill, b)));
  }
}
ensureLoadedSkillsRegistered();

const sameCoordinate = (a: number, b: number) => Math.abs(a - b) < 1e-7;

/**
 * 兼容旧本地状态：早期版本把内置高德坐标直接存进了 WGS84 业务域。
 * 只迁移仍与包内原值完全一致的端侧精编点，用户自定义、云端与 OSM 坐标都不动。
 */
export function migrateCuratedSkillCoordinates() {
  const roamBooks = new Map(getRoamBooks().map((book) => [book.id, book]));
  for (const name of state.loadedIds) {
    const skill = findSkill(name);
    if (!skill || skill.coordinateSystem !== 'gcj02') continue;
    for (const book of skill.books) {
      const storedBook = roamBooks.get(book.id);
      if (
        storedBook?.cityGeo &&
        sameCoordinate(storedBook.cityGeo.lng, book.cityGeo.lng) &&
        sameCoordinate(storedBook.cityGeo.lat, book.cityGeo.lat)
      ) {
        setBookCityGeo(book.id, normalizeMapSkillGeo(skill, book.cityGeo));
      }
      if (storedBook?.researchVia !== 'local-curated') continue;
      const rawById = new Map(book.places.map((place) => [place.id, place]));
      let changed = false;
      const next = getRoamPlaces(book.id).map((place) => {
        const raw = rawById.get(place.id);
        if (
          !raw ||
          !place.geo ||
          !sameCoordinate(place.geo.lng, raw.lng) ||
          !sameCoordinate(place.geo.lat, raw.lat)
        ) {
          return place;
        }
        const normalized = normalizeMapSkillPlace(skill, raw);
        changed = true;
        if (place.suggest === 'confirmed') {
          updateUserMarkPosition(
            `${ROAM_PIN_PREFIX}${place.id}`,
            normalized.lng,
            normalized.lat,
          );
        }
        return {
          ...place,
          geo: {
            ...place.geo,
            lng: normalized.lng,
            lat: normalized.lat,
          },
        };
      });
      if (changed) replaceBookPlaces(book.id, next);
    }
  }
}
migrateCuratedSkillCoordinates();

/** 测试/演示复位：复位后立刻自愈——默认包的书重新注册回书架 */
export function resetMapSkills() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
  state = defaults();
  BUILTIN_SKILLS.clear();
  BUILTIN_LOADS.clear();
  BUILTIN_LOAD_ERRORS.clear();
  BUILTIN_AGGREGATE_LOADS.clear();
  BUILTIN_AGGREGATE_LOAD_ERRORS.clear();
  PREVIEWED_BUILTIN_SKILL_IDS.length = 0;
  for (const aggregate of GUIJI_CITY_AGGREGATES) {
    aggregate.hydrated = false;
    aggregate.loading = false;
    aggregate.loadError = undefined;
    const catalog = (GUIJI_LIBRARY.cityAggregates ?? []).find((entry) => entry.name === aggregate.skill.name);
    if (!catalog) continue;
    aggregate.skill = {
      format: catalog.format,
      name: catalog.name,
      displayName: catalog.displayName,
      description: catalog.description,
      version: catalog.version,
      author: catalog.author,
      coordinateSystem: catalog.coordinateSystem,
      worldScope: catalog.worldScope,
      books: catalog.books.map(({ placeCount: _placeCount, ...book }) => ({ ...book, places: [] })),
    };
  }
  lastLoadedSkillName = null;
  persist();
  ensureLoadedSkillsRegistered();
  migrateCuratedSkillCoordinates();
  emit();
}
