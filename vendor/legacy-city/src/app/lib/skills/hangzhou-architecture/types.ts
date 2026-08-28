// 杭州古建筑地图 .skill · 共享类型
// 与 exhibition-skill/v1 / flower-skill/v1 姊妹格式：architecture-skill/v1 = 一部古志领读的古建筑点位表。
// 解耦纪律：本目录自成一体，只 import lib/skills 共享工具，绝不反向依赖 roam 模块。
// 数据即引文——每处古建筑的坐标 + 逐字核验的《武林梵志》引文 + 考据小注，都是确定性字段，不让模型推算。

export const ARCH_SKILL_FORMAT = 'architecture-skill/v1';

/** 建筑形制：一张地图上按类亮不同的标记 */
export type ArchKind = '塔' | '幢' | '寺' | '造像';
/** 诚实三态：尚存 / 重建 / 已无（本包古建筑多为 尚存·重建） */
export type ArchStatus = 'extant' | 'rebuilt' | 'gone';
export type ArchConfidence = 'high' | 'medium' | 'low';

/** 一处古建筑（确定性数据） */
export interface ArchSite {
  id: string;               // kebab-case
  name: string;
  modernName?: string;      // 今名/俗名
  kind: ArchKind;
  era: string;              // 始建年代（朝代），如「吴越·北宋」
  status: ArchStatus;
  confidence: ArchConfidence;
  quote?: string;           // 逐字核验的古志引文（≤60 字）
  chapter?: string;         // 引文出处（有 quote 必给）
  note: string;             // 考据小注
  lng: number;
  lat: number;
}

/** .skill 文件本体（自包含 JSON——复制即安装，与 map-skill/v1 同规范） */
export interface ArchSkillFile {
  format: typeof ARCH_SKILL_FORMAT;
  name: string;             // kebab-case 包名，[a-z0-9-] ≤64
  displayName: string;      // 杭州古建筑地图
  description: string;      // 做什么 + 何时用 + 不适用，≤1024 字
  version: string;
  author?: string;
  /** 内置目录 sites 的原始坐标系；业务域一律使用 WGS84。 */
  coordinateSystem?: 'wgs84' | 'gcj02';
  sourceBook: string;       // 引文来源古志（如「《武林梵志》· 明 吴之鲸」）
  sites: ArchSite[];
}

// —— 标记语言（marker / 图例 / 详情共用；纯常量，无副作用）——
export const KIND_MARK: Record<ArchKind, string> = { 塔: '塔', 幢: '幢', 寺: '寺', 造像: '像' };
export const KIND_COLOR: Record<ArchKind, string> = {
  塔: '#b5402f',    // 朱
  幢: '#a8842c',    // 金
  寺: '#4f6f75',    // 青
  造像: '#6a7a52',  // 竹
};
export const KIND_LABEL: Record<ArchKind, string> = { 塔: '塔', 幢: '经幢', 寺: '梵刹', 造像: '造像' };
export const STATUS_LABEL: Record<ArchStatus, string> = { extant: '尚存', rebuilt: '重建', gone: '遗迹' };

/** 图例四类分组顺序（浏览页/图例用） */
export const KIND_ORDER: ArchKind[] = ['塔', '幢', '寺', '造像'];
