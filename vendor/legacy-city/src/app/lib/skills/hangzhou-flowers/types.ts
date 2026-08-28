// 杭州赏花地图 .skill · 共享类型
// 与 hangzhou-exhibitions（exhibition-skill/v1）、lib/roam/mapSkills.ts（map-skill/v1）互为姊妹格式：
// flower-skill/v1 = 四季花册（花期窗口 + 主打诗引）+ 精编赏花点（确定性坐标/花量/热度）+ 截图导入的花讯。
// 花与展览的本质差异：展览有闭幕日（线性时间），花每年重来（环形时间）——
// 所以花期是「月-日窗口」（跨年环形，如梅花 12-20 → 03-15），状态随今天在环上的位置算出。
// 解耦纪律：本目录自成一体，只 import lib/skills 共享工具，绝不反向依赖 roam/exhibition 模块。

export const FLOWER_SKILL_FORMAT = 'flower-skill/v1';

/** 花量（借鉴民间手绘赏花地图的图例语言）：
 *  sea = 成片花海（香雪海/桂花大道级）· patch = 数株点缀入画 · tree = 一树压全场 */
export type FlowerMass = 'sea' | 'patch' | 'tree';

/** 热度：burst = 人山人海（爆）· hot = 热门 · quiet = 清静小众 */
export type FlowerCrowd = 'burst' | 'hot' | 'quiet';

export type FlowerConfidence = 'high' | 'medium' | 'low';

/** 花期窗口：'MM-DD' 起止；start > end 表示跨年（如梅花 12-20 → 03-15） */
export interface BloomWindow { start: string; end: string }

/** 一册花（四季各一册；桂花是杭州市花、单列首册的由来） */
export interface FlowerVolume {
  id: string;                // kebab-case：osmanthus / plum / lotus / spring
  flower: string;            // 桂花
  season: string;            // 秋
  color: string;             // 图例与标记主色
  window: BloomWindow;       // 常规花期
  peak?: BloomWindow;        // 盛花期（在 window 内）
  quote?: string;            // 主打诗引（≤64 字，核验过原文才收）
  source?: string;           // 诗引出处（有 quote 必填——引文纪律）
  blurb: string;             // 一句话册序
}

/** 一处赏花点 */
export interface FlowerSpot {
  id: string;
  volumeId: string;          // 属于哪一册
  name: string;              // 满陇桂雨 · 少儿公园
  area?: string;             // 城区/园区：满觉陇 / 孤山 / 西溪…
  lng: number;
  lat: number;
  mass: FlowerMass;
  crowd: FlowerCrowd;
  note: string;              // 一句话看点/考据（必填）
  quote?: string;            // 点位诗引（≤64 字）
  source?: string;           // 诗引出处（有 quote 必填）
  window?: BloomWindow;      // 点位花期覆盖（如孤山早梅冬至前开、晚梅到清明）
  aliases?: string[];        // 截图导入匹配用别名
  confidence: FlowerConfidence;   // 坐标可信度（诚实标注，不假装精确）
  origin: 'curated' | 'screenshot';
  sourceNote?: string;       // 出处备注：小红书截图 / 公号截图…（导入的才有）
  addedAt?: string;          // 导入时间 ISO（导入的才有）
}

/** .skill 文件本体（自包含 JSON——复制即安装，与 map-skill/v1 同规范） */
export interface FlowerSkillFile {
  format: typeof FLOWER_SKILL_FORMAT;
  name: string;              // kebab-case 包名，[a-z0-9-] ≤64
  displayName: string;       // 杭州赏花地图
  description: string;       // 做什么 + 何时用（触发词）+ 不适用，≤1024 字
  version: string;
  author?: string;
  /**
   * 内置目录 spots 的原始坐标系。运行时业务域统一是 WGS84，
   * 仅在高德适配层转成 GCJ-02；未声明的导入包按 WGS84 处理。
   */
  coordinateSystem?: 'wgs84' | 'gcj02';
  updatedAt: string;         // 花讯有年份鲜度（展讯级时效没有，但品种/点位会更新）
  volumes: FlowerVolume[];
  spots: Omit<FlowerSpot, 'origin' | 'sourceNote' | 'addedAt'>[];
}

// —— 花期计算（纯函数，marker/图例/详情卡共用；today 可注入方便测试）——

export type BloomStatus = 'peak' | 'blooming' | 'coming' | 'dormant';

/** 一年内的序号（月*100+日）：只比大小，不算天数——环形窗口判断够用 */
function md(date: Date): number { return (date.getMonth() + 1) * 100 + date.getDate(); }
function mdOf(s: string): number {
  const [m, d] = s.split('-').map(Number);
  return m * 100 + d;
}

/** 今天是否落在窗口内（支持跨年窗口：start > end 时窗口绕过年关） */
export function inWindow(w: BloomWindow, today: Date = new Date()): boolean {
  const t = md(today);
  const s = mdOf(w.start);
  const e = mdOf(w.end);
  return s <= e ? t >= s && t <= e : t >= s || t <= e;
}

/** 是否临近开花（今天起 within 天内会进入窗口；跨年正确） */
export function isComing(w: BloomWindow, withinDays: number, today: Date = new Date()): boolean {
  if (inWindow(w, today)) return false;
  const probe = new Date(today);
  for (let i = 1; i <= withinDays; i++) {
    probe.setDate(probe.getDate() + 1);
    if (inWindow(w, probe)) return true;
  }
  return false;
}

/** 点位/花册的当下状态：盛花 > 在花 > 将开（30 天内）> 花隐 */
export function bloomStatus(v: Pick<FlowerVolume, 'window' | 'peak'>, spotWindow?: BloomWindow, today: Date = new Date()): BloomStatus {
  const w = spotWindow ?? v.window;
  if (inWindow(w, today)) {
    return v.peak && inWindow(v.peak, today) ? 'peak' : 'blooming';
  }
  return isComing(w, 30, today) ? 'coming' : 'dormant';
}

export const BLOOM_LABEL: Record<BloomStatus, string> = {
  peak: '盛放',
  blooming: '在花',
  coming: '将开',
  dormant: '花隐',
};

export const MASS_LABEL: Record<FlowerMass, string> = {
  sea: '成片花海',
  patch: '数株点缀',
  tree: '一树压全场',
};

export const CROWD_LABEL: Record<FlowerCrowd, string> = {
  burst: '人山人海',
  hot: '热门',
  quiet: '清静',
};

/** 花期窗口的人话：如「9月中 – 10月末」 */
export function windowLabel(w: BloomWindow): string {
  const seg = (s: string) => {
    const [m, d] = s.split('-').map(Number);
    const x = d <= 10 ? '上' : d <= 20 ? '中' : '下';
    return `${m}月${x}`;
  };
  return `${seg(w.start)}–${seg(w.end)}`;
}

// —— 花名 → 花册 匹配（截图导入用；确定性关键词表，不靠模型猜）——
// 排除词优先：杨梅是果、梅家坞/梅灵路是地名，都不是梅花。
const NOT_PLUM = ['杨梅', '梅家坞', '梅灵', '话梅', '酸梅'];
const VOLUME_KEYWORDS: Array<{ volumeId: string; words: string[] }> = [
  { volumeId: 'osmanthus', words: ['桂花', '丹桂', '金桂', '银桂', '四季桂', '桂雨', '赏桂', '桂'] },
  { volumeId: 'plum', words: ['梅花', '探梅', '赏梅', '蜡梅', '腊梅', '红梅', '白梅', '宫粉', '朱砂梅', '绿萼', '梅'] },
  { volumeId: 'lotus', words: ['荷花', '睡莲', '并蒂莲', '赏荷', '荷', '莲'] },
  {
    volumeId: 'spring',
    words: ['樱花', '樱', '郁金香', '桃花', '油菜花', '海棠', '玉兰', '杜鹃', '绣球', '紫藤', '梨花', '杏花', '迎春', '二月兰', '虞美人', '月季', '蔷薇'],
  },
];

/** 从一段花讯文本里识别所属花册；识别不出返回 null（导入界面让用户自己选） */
export function matchVolume(text: string): string | null {
  const t = (text || '').trim();
  if (!t) return null;
  for (const { volumeId, words } of VOLUME_KEYWORDS) {
    for (const w of words) {
      if (!t.includes(w)) continue;
      if (volumeId === 'plum' && NOT_PLUM.some((x) => t.includes(x) && !t.replace(x, '').includes('梅'))) continue;
      return volumeId;
    }
  }
  return null;
}

// —— 校验（与 mapSkills.validateMapSkill 同风格：错误列表，空数组=合法）——
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MD_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
const MASSES = new Set(['sea', 'patch', 'tree']);
const CROWDS = new Set(['burst', 'hot', 'quiet']);

export function validateFlowerSkill(obj: unknown): string[] {
  const errs: string[] = [];
  const s = obj as Partial<FlowerSkillFile> | null;
  if (!s || typeof s !== 'object') return ['不是合法的 JSON 对象'];
  if (s.format !== FLOWER_SKILL_FORMAT) errs.push(`format 必须是 "${FLOWER_SKILL_FORMAT}"`);
  if (!s.name || !NAME_RE.test(s.name) || s.name.length > 64) errs.push('包名须为 kebab-case（[a-z0-9-]，≤64 字符）');
  if (!s.displayName?.trim()) errs.push('缺少展示名 displayName');
  if (!s.description?.trim()) errs.push('缺少 description（做什么 + 何时用 + 不适用）');
  if ((s.description ?? '').length > 1024) errs.push('description 超过 1024 字');
  if (s.coordinateSystem && s.coordinateSystem !== 'wgs84' && s.coordinateSystem !== 'gcj02') {
    errs.push('coordinateSystem 须为 wgs84/gcj02');
  }
  if (!Array.isArray(s.volumes) || s.volumes.length === 0) errs.push('volumes 至少要有一册花');
  const volIds = new Set<string>();
  for (const v of s.volumes ?? []) {
    const tag = v?.flower ? `「${v.flower}」册` : '某册';
    if (!v?.id || !v?.flower?.trim()) { errs.push(`${tag}缺少 id/flower`); continue; }
    volIds.add(v.id);
    if (!v.window || !MD_RE.test(v.window.start) || !MD_RE.test(v.window.end)) errs.push(`${tag}花期窗口须为 MM-DD 起止`);
    if (v.quote && !v.source) errs.push(`${tag}有诗引必须给出处（引文纪律）`);
    if (v.quote && v.quote.length > 64) errs.push(`${tag}诗引超过 64 字`);
  }
  if (!Array.isArray(s.spots) || s.spots.length === 0) errs.push('spots 至少要有一处赏花点');
  for (const p of s.spots ?? []) {
    const pt = p?.name ? `「${p.name}」` : '某点';
    if (!p?.id || !p?.name?.trim()) { errs.push(`${pt}缺少 id/name`); continue; }
    if (!volIds.has(p.volumeId)) errs.push(`${pt}volumeId 未指向任何花册`);
    if (!Number.isFinite(p?.lat) || p.lat < -90 || p.lat > 90) errs.push(`${pt}纬度非法`);
    if (!Number.isFinite(p?.lng) || p.lng < -180 || p.lng > 180) errs.push(`${pt}经度非法`);
    if (!MASSES.has(p?.mass as string)) errs.push(`${pt}mass 须为 sea/patch/tree`);
    if (!CROWDS.has(p?.crowd as string)) errs.push(`${pt}crowd 须为 burst/hot/quiet`);
    if (!p?.note?.trim()) errs.push(`${pt}缺少一句话小注 note`);
    if (p?.quote && !p?.source) errs.push(`${pt}有诗引必须给出处（引文纪律）`);
    if (p?.quote && p.quote.length > 64) errs.push(`${pt}诗引超过 64 字`);
    if (p?.window && (!MD_RE.test(p.window.start) || !MD_RE.test(p.window.end))) errs.push(`${pt}花期窗口须为 MM-DD 起止`);
  }
  return errs;
}
