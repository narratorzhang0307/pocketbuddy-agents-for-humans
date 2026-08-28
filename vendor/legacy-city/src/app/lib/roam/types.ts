// 城市漫游（roam）域类型：书 → agent 研究 → 地点建议 → 用户确认 → 上图。
// 两条正交输出：地点的「内容」（原文/考据/状态）与「落点」（geo）分开表达；
// geo 可为 null（云脑未接入时的本地候选），无坐标的建议不允许确认上图。

export type RoamPlaceStatus = 'extant' | 'rebuilt' | 'memory-only';   // 尚在 / 重建 / 已无（仅存记忆）
export type RoamConfidence = 'high' | 'medium' | 'low';
export type RoamSuggestState = 'suggested' | 'confirmed' | 'rejected';
export type RoamResearchState = 'idle' | 'running' | 'done' | 'failed';
export type RoamResearchVia = 'local-curated' | 'cloud' | 'none';

export interface RoamBook {
  id: string;
  title: string;
  author: string;
  era: string;                      // 时代：明末清初 / 宋末元初…
  city: string;                     // 漫游目标城市
  cityGeo?: { lat: number; lng: number };
  blurb?: string;
  source: 'builtin' | 'pasted' | 'skill';   // skill = 来自地图内容包（.skill）
  skillId?: string;                 // source==='skill' 时：所属内容包名（kebab-case）
  text?: string;                    // 粘贴书全文（内置书不存全文，走精编数据）
  research: RoamResearchState;
  researchVia?: RoamResearchVia;
  addedAt: string;                  // ISO
}

export interface RoamPlace {
  id: string;
  bookId: string;
  canonicalPlaceId?: string;
  name: string;                     // 书中地名
  ancientName?: string;
  modernName?: string;              // 今名（古今异名才填）
  status: RoamPlaceStatus;
  confidence: RoamConfidence;
  quote?: string;                   // 原文摘录：只放有把握的名句，绝不虚构
  chapter?: string;                 // 出处篇目
  note: string;                     // 古今考据一句话
  coordinateType?: string;
  coordinateAccuracy?: string;
  mapReady?: boolean;
  mapAdmissionReason?: string;
  evidenceRef?: string;
  route?: string;
  ancientSiteStatus?: string;
  modernCarrierStatus?: string;
  geo: { lat: number; lng: number; accuracy: 'approx' | 'exact' } | null;
  order: number;                    // 漫游顺序（1 起）
  suggest: RoamSuggestState;
  createdAt: string;
}

export type RoamPhaseStep = '读取全文' | '提取地名' | '古今考据' | '坐标解析' | '生成建议';
export interface RoamPhase { step: RoamPhaseStep; note?: string }

export const ROAM_STATUS_LABEL: Record<RoamPlaceStatus, string> = {
  extant: '尚在',
  rebuilt: '重建',
  'memory-only': '已无',
};
