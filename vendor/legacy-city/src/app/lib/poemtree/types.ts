// 诗歌树 agent · 共享类型（解耦自「把所有的诗都种回到地球上」，仿 lib/exhibition 自成一体）。
// 核心闭环：诗句 → 四维属性(GMI 判) → 生成「诗歌植物」(Canvas 四维驱动) → 种回地球坐标。
// 命脉是四维属性 LUX/TEMP/FLUX/GRAV —— 诗的「结构」而非字面语义，四维等权各 25%。

// 四维属性（各 0–100 整数）。原项目由 qwen 判、迁到我们 GMI 云脑；兜底默认 {70,40,85,60}。
export interface PoemAttributes {
  lux: number;   // 光照 / 可见度：越高越明说，越低越含混
  temp: number;  // 温度 / 情绪热度：越高越炽热，越低越冷静
  flux: number;  // 通量 / 流速：越高变化越迅疾，越低越像长镜头
  grav: number;  // 重力 / 意象重量：越高越下坠，越低越轻盈
}

export const DEFAULT_ATTRIBUTES: PoemAttributes = { lux: 70, temp: 40, flux: 85, grav: 60 };

// 一首诗（用户输入或案例种子）
export interface Poem {
  title?: string;       // 篇名（可选，如《悉达多》）
  poet?: string;        // 作者（可选）
  lines: string[];      // 诗句逐行
  excerpt?: string;     // 摘句（列表展示用）
}

// 诗被种下的地点（地球坐标 = 「我在哪种的诗」）
export interface PoemSpot {
  place: string;        // 地名（如「西湖 · 断桥」「Granada」）
  lng: number;
  lat: number;
  kind: 'here' | 'city' | 'named';   // here=当前定位 / city=城市级 / named=具体地标
}

// 一棵诗歌树 = 内容资产（诗 + 四维 + 生成产物 + 地点）
export interface PoemTree {
  id: string;                       // 归一主键（诗名/首句 + 地点）
  poem: Poem;
  attributes: PoemAttributes;
  spot: PoemSpot | null;            // 未种下时为 null（needPlace）
  // 生成产物（二选一优先级：本地 Canvas 实时生成 > 预渲染视频）
  seed: number;                     // Canvas 生成艺术的确定性种子（同诗同树，可复现）
  videoUrl?: string;                // 诗歌视频直链（树页影像位，用户自制 OSS）
  coverUrl?: string;                // 封面图（列表缩略，防视频闪）
  arVideoUrl?: string;              // AR 动态视频（processing 树，相机叠加位；无则用 Canvas 树）
  source: 'seed' | 'user' | 'llm';  // seed=内置案例 / user=手填四维 / llm=GMI 判的
  treeVoice?: string;               // GMI 生成的「树语」：诗意解读这棵树为何这样长（processing 解释层）
  createdAt: number;
}

// 种诗流程阶段（供 UI 进度回调）
export type PoemTreePhase =
  | { step: '感知诗'; note?: string }
  | { step: 'GMI 判四维'; note?: string }
  | { step: '生成诗歌植物'; note?: string }
  | { step: '定位'; note?: string }
  | { step: '完成'; note?: string };
export type OnPoemTreePhase = (p: PoemTreePhase) => void;

export interface PoemTreeInput {
  kind: 'text' | 'seed';
  text?: string;                    // 用户输入的诗句（多行以 \n 分隔）
  poet?: string;
  manualAttrs?: PoemAttributes;     // 用户手动微调四维（跳过 GMI）
}
