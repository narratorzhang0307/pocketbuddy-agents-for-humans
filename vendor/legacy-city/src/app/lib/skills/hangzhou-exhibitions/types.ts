// 杭州展览地图 .skill · 共享类型
// 与 lib/roam/mapSkills.ts 的 map-skill/v1（书+地点）互为姊妹格式：
// exhibition-skill/v1 = 场馆表（确定性坐标） + 精选展讯（分级/展期/亮点） + 收录规则。
// 解耦纪律：本目录自成一体，只 import lib/skills 共享工具，绝不反向依赖 roam/exhibition 模块。

export const EXHIBITION_SKILL_FORMAT = 'exhibition-skill/v1';

/** 展览分级（收录规则的核心）：
 *  S = 殿堂级——重量级国际借展 / 国宝文物 / 顶级艺术家大型个展（如古希腊、一苇杭之）
 *  A = 高水准——值得专程去看
 *  B = 顺路可看（内置目录原则上不收 B 以下；截图导入的由用户定夺）
 *  党建/主旋律宣传展、注水商业展：不收录（见 EXCLUDE_RULES）。 */
export type ExTier = 'S' | 'A' | 'B';

export type ExConfidence = 'high' | 'medium' | 'low';

/** 场馆（确定性数据：坐标直接给结构化字段，不让模型推算——书里的 skill 纪律） */
export interface ExVenue {
  id: string;               // kebab-case，如 zhejiang-museum-zhijiang
  name: string;             // 正名：浙江省博物馆之江馆区
  aliases: string[];        // 匹配用别名：浙博、之江馆…
  lng: number;              // WGS84（高德运行时边界才转换为 GCJ-02）
  lat: number;
  area?: string;            // 城区/商圈，如 之江/西湖/良渚
  blurb?: string;           // 一句话馆格
}

/** 一条展讯 */
export interface ExhibitionEntry {
  id: string;
  title: string;
  venueId?: string;          // 命中场馆表时回填
  venueName: string;         // 展示场馆名（命中表则为正名）
  lng: number;
  lat: number;
  dateStart?: string;        // YYYY-MM-DD；空 = 未知
  dateEnd?: string;          // YYYY-MM-DD；空 = 常设/未知
  ticket?: string;           // 票价（免费 / ¥68…）
  highlight?: string;        // 一句话亮点：明星展品/借展来源/策展人
  tier: ExTier;
  tierReason?: string;       // 评级理由（审计留痕）
  source: 'curated' | 'screenshot';
  confidence: ExConfidence;  // 信息核实可信度
  sourceNote?: string;       // 出处备注：官方公号 / 小红书截图…
  addedAt?: string;          // 导入时间（截图导入的才有）
}

/** .skill 文件本体（自包含 JSON——复制即安装，与 map-skill/v1 同规范） */
export interface ExhibitionSkillFile {
  format: typeof EXHIBITION_SKILL_FORMAT;
  name: string;              // kebab-case 包名，[a-z0-9-] ≤64
  displayName: string;       // 杭州展览地图
  description: string;       // 做什么 + 何时用 + 不适用，≤1024 字
  version: string;
  author?: string;
  updatedAt: string;         // 展讯有时效，包必须带鲜度戳
  rules: {
    tiers: Record<ExTier, string>;   // 分级口径（人话）
    urgentWithinDays: number;        // 闭幕倒计时提醒窗口（天）
    excluded: string[];              // 不收录规则（党建/注水…）
  };
  venues: ExVenue[];
  exhibitions: Omit<ExhibitionEntry, 'source' | 'addedAt'>[];
}

// —— 展期计算（纯函数，UI/marker/浏览页共用；today 可注入方便测试）——

export type ExStatus = 'upcoming' | 'ongoing' | 'closing' | 'ended' | 'unknown';

function toDay(s: string): number { return Math.floor(new Date(`${s}T00:00:00`).getTime() / 86400000); }

/** 距闭幕天数：0=今天最后一天；负数=已闭幕；null=展期未知/常设 */
export function daysLeft(e: Pick<ExhibitionEntry, 'dateEnd'>, today: Date = new Date()): number | null {
  if (!e.dateEnd) return null;
  const t = Math.floor(new Date(today.toDateString()).getTime() / 86400000);
  return toDay(e.dateEnd) - t;
}

export function exStatus(
  e: Pick<ExhibitionEntry, 'dateStart' | 'dateEnd'>,
  urgentWithinDays: number,
  today: Date = new Date(),
): ExStatus {
  const t = Math.floor(new Date(today.toDateString()).getTime() / 86400000);
  if (e.dateStart && toDay(e.dateStart) > t) return 'upcoming';
  const left = daysLeft(e, today);
  if (left === null) return e.dateStart ? 'ongoing' : 'unknown';
  if (left < 0) return 'ended';
  if (left <= urgentWithinDays) return 'closing';
  return 'ongoing';
}

/** 重点提醒：高质量（S/A）且进入闭幕倒计时窗口 */
export function isUrgent(e: ExhibitionEntry, urgentWithinDays: number, today: Date = new Date()): boolean {
  if (e.tier === 'B') return false;
  return exStatus(e, urgentWithinDays, today) === 'closing';
}
