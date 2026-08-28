// 杭州博物馆地图 .skill · 共享类型
// 与 hangzhou-exhibitions 的 exhibition-skill/v1 互为姊妹格式、互补不重叠：
//   exhibition-skill/v1 钉的是「展讯」（时效性主体，闭幕就下图）；
//   museum-skill/v1     钉的是「场馆」（城市常驻底图：馆格 + 镇馆之宝 + 闭馆日，特展挂在馆上）。
// 解耦纪律：本目录自成一体，只 import lib/skills 共享工具，不 import roam/exhibition 模块，
// 也不 import hangzhou-exhibitions（姊妹包互不依赖，卸载任何一个另一个无感）。

export const MUSEUM_SKILL_FORMAT = 'museum-skill/v1';

/** 博物馆分级（收录规则的核心）：
 *  S = 镇馆级——来杭必去、藏品国宝级（良渚玉琮王、《富春山居图·剩山图》这个量级的馆）
 *  A = 高水准——值得专程去一趟的好馆
 *  B = 顺路可看——路过不亏，不必专程
 *  党建/成就宣传类场馆、没有像样藏品的挂牌馆：不收录（见 rules.excluded）。 */
export type MuseumTier = 'S' | 'A' | 'B';

export type MuseumConfidence = 'high' | 'medium' | 'low';

/** 馆内正在进行的特展（时效信息，挂在馆上；重磅特展让老馆临时「发光」） */
export interface MuseumShow {
  title: string;
  dateEnd?: string;         // YYYY-MM-DD；空 = 常设/未知
  note?: string;            // 一句话：明星展品/借展来源
  major?: boolean;          // 重磅特展（S/A 量级）——参与闭幕倒计时重点提醒
}

/** 一座博物馆（确定性数据：坐标直接给结构化字段，不让模型推算——书里的 skill 纪律） */
export interface MuseumEntry {
  id: string;                // kebab-case，如 liangzhu-museum
  name: string;              // 正名：良渚博物院
  aliases: string[];         // 匹配用别名：良渚博物馆…
  lng: number;               // WGS84（进入高德运行时后统一转换为 GCJ-02）
  lat: number;
  area?: string;             // 片区：良渚/孤山/之江/南山路/拱宸桥…
  tier: MuseumTier;
  tierReason?: string;       // 评级理由（审计留痕）
  blurb?: string;            // 一句话馆格
  treasures?: string[];      // 镇馆之宝/常设看点（具体展品名，2~4 个）
  ticket?: string;           // 免费预约 / ¥30…
  closedDay?: number;        // 每周闭馆日 0=周日…1=周一…6=周六；空 = 无固定闭馆日
  nowShowing?: MuseumShow[]; // 正在展出的特展（鲜度信息，updatedAt 之后自行核实）
  source: 'curated' | 'screenshot';
  confidence: MuseumConfidence;
  sourceNote?: string;       // 出处备注：官网 / 小红书截图…
  addedAt?: string;          // 导入时间（截图导入的才有）
}

/** .skill 文件本体（自包含 JSON——复制即安装，与 exhibition-skill/v1 同规范） */
export interface MuseumSkillFile {
  format: typeof MUSEUM_SKILL_FORMAT;
  name: string;              // kebab-case 包名，[a-z0-9-] ≤64
  displayName: string;       // 杭州博物馆地图
  description: string;       // 做什么 + 何时用 + 不适用，≤1024 字
  version: string;
  author?: string;
  updatedAt: string;         // nowShowing 有时效，包必须带鲜度戳
  rules: {
    tiers: Record<MuseumTier, string>;  // 分级口径（人话）
    urgentWithinDays: number;           // 馆内重磅特展闭幕倒计时窗口（天）
    excluded: string[];                 // 不收录规则（党建/挂牌馆…）
  };
  museums: Omit<MuseumEntry, 'source' | 'addedAt'>[];
}

// —— 纯函数（UI/marker/浏览页共用；today 可注入方便测试）——

const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 今天闭馆吗（白跑警示：周一去博物馆的老坑） */
export function isClosedToday(m: Pick<MuseumEntry, 'closedDay'>, today: Date = new Date()): boolean {
  return m.closedDay != null && today.getDay() === m.closedDay;
}

/** 闭馆日人话：「周一闭馆」；无固定闭馆日返回空串 */
export function closedDayLabel(m: Pick<MuseumEntry, 'closedDay'>): string {
  return m.closedDay == null ? '' : `${WEEKDAY[m.closedDay]}闭馆`;
}

function toDay(s: string): number { return Math.floor(new Date(`${s}T00:00:00`).getTime() / 86400000); }

/** 特展距闭幕天数：0=今天最后一天；负数=已闭幕；null=常设/未知 */
export function showDaysLeft(s: Pick<MuseumShow, 'dateEnd'>, today: Date = new Date()): number | null {
  if (!s.dateEnd) return null;
  const t = Math.floor(new Date(today.toDateString()).getTime() / 86400000);
  return toDay(s.dateEnd) - t;
}

/** 馆里还在展的特展（已闭幕的自动隐去——数据保留，不硬删） */
export function liveShows(m: Pick<MuseumEntry, 'nowShowing'>, today: Date = new Date()): MuseumShow[] {
  return (m.nowShowing ?? []).filter((s) => {
    const left = showDaysLeft(s, today);
    return left === null || left >= 0;
  });
}

/** 重点提醒：馆内有重磅特展进入闭幕倒计时窗口 → 返回最紧迫的剩余天数；否则 null */
export function urgentShowDays(m: Pick<MuseumEntry, 'nowShowing'>, urgentWithinDays: number, today: Date = new Date()): number | null {
  let min: number | null = null;
  for (const s of liveShows(m, today)) {
    if (!s.major) continue;
    const left = showDaysLeft(s, today);
    if (left === null || left > urgentWithinDays) continue;
    if (min === null || left < min) min = left;
  }
  return min;
}
