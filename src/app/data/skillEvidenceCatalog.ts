export type SkillEvidenceVerdict = 'proven' | 'conditional' | 'protocol' | 'pending-device';

export interface SkillEvidenceArtifact {
  label: string;
  detail: string;
  source: string;
}

export interface SkillEvidenceRecord {
  skillId: string;
  title: string;
  kind: 'Mapping' | 'LoRA' | 'Hybrid';
  group: 'model' | 'content';
  verdict: SkillEvidenceVerdict;
  verdictLabel: string;
  summary: string;
  claimBoundary: string;
  metrics: Array<{ label: string; value: string; tone?: 'positive' | 'warning' | 'neutral' }>;
  artifacts: SkillEvidenceArtifact[];
  image?: string;
  needsPhone?: boolean;
}

/**
 * 决赛证据目录只记录已经有原始文件支撑的结论。
 * “LoRA”不自动等于“胜出”：原始适配器、质量门控系统与 MNN 真机性能分开陈述。
 */
export const SKILL_EVIDENCE_CATALOG: SkillEvidenceRecord[] = [
  {
    skillId: 'pocket.book-to-earth', title: 'BOOK-TO-EARTH', kind: 'Hybrid', group: 'model', verdict: 'proven', verdictLabel: '闭环已验证',
    summary: '四册古籍 Mapping 可预览、安装、落位 Mapbox 与卸载；地点必须保留原文证据并经人工确址。',
    claimBoundary: 'Mapping 本身不宣称 LoRA 胜出；OCR 组件的 Base/LoRA 证据单列在古籍识读。',
    metrics: [{ label: '示例资料', value: '4 册', tone: 'positive' }, { label: '确认地点', value: '68', tone: 'positive' }, { label: '地图闭环', value: '加载 / 卸载', tone: 'positive' }],
    artifacts: [
      { label: '真实 UI 回归', detail: 'Plaza → 预览 → OSS 装载 → Mapbox 68 点 → 卸载', source: 'docs/evidence/skills-heritage-final-audit-20260812.md' },
      { label: '协议与提取测试', detail: '原文指纹、逐字引文、人工确认地点与去重均有自动测试', source: 'src/app/lib/mapping/forge.test.ts · src/app/lib/mapping/gujiDemo.test.ts' },
    ],
  },
  {
    skillId: 'pocket.reading-jot', title: 'READING-JOT', kind: 'Hybrid', group: 'model', verdict: 'protocol', verdictLabel: '基座能力组合',
    summary: '共享 PP-OCRv6 同时输出选区转录和整页文字框；端侧 2B 只整理确认文字，云端旗舰只在用户主动点击后精读选区小图。',
    claimBoundary: 'OCR、端侧 Qwen 与云端 Qwen 的结果均是可核对候选；画线范围由几何规则决定，任何模型都不得自动覆盖确认原文。',
    metrics: [{ label: 'OCR 基座', value: 'PP-OCRv6 Small', tone: 'positive' }, { label: '范围证据', value: '选区 + 整页框', tone: 'positive' }, { label: '云端上传', value: '主动 / 仅选区', tone: 'neutral' }],
    artifacts: [
      { label: '选区与质量门', detail: '红线、双竖线、文字框匹配与双证据一致性由自动测试覆盖', source: 'src/app/lib/readingJot.test.ts' },
      { label: '能力组合协议', detail: 'PP-OCR、端侧 2B 与云端旗舰的权限边界写入可校验 Skill Manifest', source: 'src/app/lib/skill/protocol.test.ts' },
    ],
  },
  {
    skillId: 'pocket.travel', title: 'TRAVEL', kind: 'LoRA', group: 'model', verdict: 'conditional', verdictLabel: '云端胜出 / MNN 门控',
    summary: '语言 LoRA 只理解目的地、日期、偏好与硬约束；城市事实和路线由可替换数据包与确定性工具提供。',
    claimBoundary: '64 条云端盲测证明训练检查点明显优于 Base；当前 8 条 MNN 对照未证明广泛胜出，产品必须保留 Base 回退并等待手机扩样。',
    metrics: [{ label: '云端盲测', value: '64 条', tone: 'positive' }, { label: '槽位准确', value: '21.3% → 98.2%', tone: 'positive' }, { label: 'MNN 小样本', value: '未广泛胜出', tone: 'warning' }],
    artifacts: [
      { label: '云端 Base / LoRA', detail: '同基座、同提示词、同盲测集；精确匹配 0% → 37.5%', source: 'docs/evidence/skills/raw/travel-cloud-base-lora-64.json' },
      { label: 'MNN 协议门控', detail: '8 条端侧对照显示 Base 更稳；明确记录 honest_claim', source: 'docs/evidence/skills/raw/travel-mnn-base-lora-8.json' },
      { label: '真实 MNN 链路', detail: 'Qwen3-VL-2B + travel-planner-lora.mnn + JSON gate，单次烟测 14.049s', source: '/Users/zhangcheng/Documents/上街去/travel planner/deliverables/TravelPlanner_UI_真实运行证据/真实MNN_LoRA运行记录.json' },
    ],
    image: '/assets/skill-evidence/travel-lora-blind-summary.png', needsPhone: true,
  },
  {
    skillId: 'pocket.exhibition', title: 'EXHIBITION', kind: 'Hybrid', group: 'model', verdict: 'conditional', verdictLabel: '专项模型已验证',
    summary: '六张主体完整的真实馆藏角度经同一 MNN、结构守卫、相对深度与 2.5D Builder 形成可旋转资产；源图、原始 MNN Alpha、最终 Alpha 与门禁逐张保留。',
    claimBoundary: '西周青铜鬲六视角最终门禁 6/6；结构守卫只在 MNN 支持范围内清理灰雾，不补造主体。完整 3D 仍是云端 GPU 链路，不能把 2.5D 观察卡宣称成生成了不可见背面。',
    metrics: [{ label: '完整角度门禁', value: '6 / 6', tone: 'positive' }, { label: '角度最大空档', value: '60°', tone: 'positive' }, { label: 'MNN / 张', value: '1.3–3.2s', tone: 'neutral' }],
    artifacts: [
      { label: 'MNN 主机基准', detail: '最终 FP16 图在 ARM64 Mac CPU 加载并执行', source: 'docs/evidence/skills/raw/exhibition-mnn-host-benchmark.json' },
      { label: '图像一致性', detail: 'PyTorch 与 MNN FP16 meanAbsError 0.002286，质量门通过', source: 'docs/evidence/skills/raw/exhibition-mnn-image-parity.json' },
      { label: '完整馆藏六视角', detail: '六张均保留完整器物；同一 MNN 原始输出、结构守卫、最终 Alpha、深度、对照和 6/6 整组门禁均可复核', source: 'public/assets/exhibit-2_5d/harvard-200497-li-complete-mnn/exhibit.json' },
    ],
    image: '/assets/skill-evidence/exhibition-2_5d-evidence.png', needsPhone: true,
  },
  {
    skillId: 'pocket.guji-reading', title: '古籍识读修复', kind: 'LoRA', group: 'model', verdict: 'proven', verdictLabel: '门控系统胜出',
    summary: '同一 Qwen3-VL-2B 基座加载古籍视觉 LoRA；低质量、重复或退化输出自动回退 Base。',
    claimBoundary: '原始 LoRA CER 75.64%，差于 Base 62.18%；可发布能力是“LoRA + 质量门控 + Base 回退”系统，其 CER 为 54.30%。',
    metrics: [{ label: '盲测', value: '16 页 / 5304 字', tone: 'neutral' }, { label: 'Base CER', value: '62.18%', tone: 'warning' }, { label: '门控后 CER', value: '54.30%', tone: 'positive' }],
    artifacts: [
      { label: '独立盲测', detail: 'LoRA 胜 8、Base 胜 6、平 2；3/16 页触发回退', source: 'docs/evidence/skills/raw/guji-base-lora-gated-16.json' },
      { label: '端侧资产', detail: 'visual-lora.mnn、基座 revision、SHA256 与 MNN runtime 已固定', source: 'deploy/edge-runtime/assets/heritage/guji-v2/skill-manifest.json' },
    ],
    image: '/assets/skill-evidence/guji-lora-blind-summary.png', needsPhone: true,
  },
  {
    skillId: 'pocket.rubbing', title: '碑拓识读修复', kind: 'LoRA', group: 'model', verdict: 'conditional', verdictLabel: '压力集胜出',
    summary: '同基座、同提示词对比 Base 与碑拓视觉 LoRA；重复退化和强分歧由质量门控与人工校订兜底。',
    claimBoundary: '清晰集相对改善 7.55%，低于 10% 发布门槛；压力集改善 16.17%，但样本仅 12，仍保留门控而不宣称全面升级。',
    metrics: [{ label: '清晰集', value: '24 页 / +7.55%', tone: 'neutral' }, { label: '压力集', value: '12 页 / +16.17%', tone: 'positive' }, { label: '严格门槛', value: '未完全通过', tone: 'warning' }],
    artifacts: [
      { label: '清晰集 A/B', detail: 'Base CER 173.75% → LoRA 160.63%', source: 'docs/evidence/skills/raw/rubbing-base-lora-clean-24.json' },
      { label: '压力集 A/B', detail: 'Base CER 219.66% → LoRA 184.15%', source: 'docs/evidence/skills/raw/rubbing-base-lora-stress-12.json' },
    ],
    image: '/assets/skill-evidence/rubbing-lora-blind-summary.png', needsPhone: true,
  },
  {
    skillId: 'pocket.digital-conservation', title: '数字化补全', kind: 'Hybrid', group: 'model', verdict: 'proven', verdictLabel: 'MNN 盲测通过',
    summary: 'OCR 保留可见字，端侧 2B / 云端 Qwen 给出缺字候选与依据；用户确认后，独立 U-Net MNN 只修改精确损坏蒙版。',
    claimBoundary: '当前稳定发布链不加载视觉 LoRA；质量用损坏区 MAE、蒙版外不变性与冻结盲测改善率验证。不可见原文仍不得确定生成。',
    metrics: [{ label: 'MNN 盲测', value: '12 / 12 改善', tone: 'positive' }, { label: '损坏区 MAE', value: '70.50 → 39.86', tone: 'positive' }, { label: '蒙版外变化', value: '0', tone: 'positive' }],
    artifacts: [
      { label: '12 张独立盲测', detail: '平均相对 MAE 下降 34.56%，每张保存种子与裁切坐标', source: 'docs/evidence/skills/raw/restoration-mnn-blind-12.json' },
      { label: '模型边界', detail: '适合划痕、污损和局部缺口；不可见原文交给候选与人工确认', source: '/Users/zhangcheng/Documents/上街去/app/deliverables/heritage-evidence/README.md' },
    ],
    image: '/assets/skill-evidence/restoration-mnn-blind-comparison.png', needsPhone: true,
  },
  {
    skillId: 'pocket.photos-curator', title: 'PHOTO CURATOR', kind: 'LoRA', group: 'model', verdict: 'conditional', verdictLabel: '研究候选',
    summary: '先以清晰度、曝光和重复度作技术硬门，再对同图运行 Qwen Base 与审美 LoRA；个人偏好权重只参与最终排序，不改写模型原始判断。',
    claimBoundary: 'v3 冻结集上 LoRA 有方向性提升，但置信区间下界仍为 0、p=0.098，尚不足以替代 Base；当前发布默认 Base，LoRA 仅作为可插拔研究候选与同图 A/B。',
    metrics: [{ label: '冻结对照', value: '174 对', tone: 'neutral' }, { label: 'Pair 对称准确率', value: '42.53% → 52.30%', tone: 'positive' }, { label: '统计门', value: 'p=0.098', tone: 'warning' }],
    artifacts: [
      { label: '五轮冻结评估', detail: '348 行双向选择；Base 与 LoRA 使用同底座、同输入和同协议', source: 'docs/evidence/photos/Photos-Tab-五轮迭代与验收报告-2026-08-12.md' },
      { label: '真机产品边界', detail: '技术质量硬门、Base/LoRA 原始输出、偏好权重和最终选择分别记账', source: 'src/app/lib/photo/curationLedger.test.ts · src/app/lib/photo/aestheticPair.test.ts' },
    ],
    needsPhone: true,
  },
  {
    skillId: 'pocket.earth-answer', title: 'EARTH ANSWER', kind: 'Mapping', group: 'content', verdict: 'protocol', verdictLabel: '规则证据',
    summary: '每日只解锁一条行动原文；历史可回看、未来不可偷看，内容与 Skill 逻辑分离。',
    claimBoundary: '纯规则 / 内容 Skill，不训练 LoRA；验证重点是日期状态机、内容包与 Frost 路由。',
    metrics: [{ label: '模型训练', value: '不需要', tone: 'neutral' }, { label: '内容层', value: '可替换', tone: 'positive' }, { label: '路由', value: '本地命中', tone: 'positive' }],
    artifacts: [{ label: 'Frost 路由测试', detail: '“今天的地球答案行动”稳定路由到 pocket.earth-answer', source: 'frost-agent/harness/skillRouter.test.ts' }],
  },
  {
    skillId: 'pocket.music', title: 'MUSIC', kind: 'Mapping', group: 'content', verdict: 'protocol', verdictLabel: '协议证据',
    summary: '音乐 Skill 与 96 个城市电台记录解耦；YouTube、OSS、外链和无播放源遵循不同字段约束。',
    claimBoundary: '不训练 LoRA；验证 Data Pack、播放引用与地图加载，不把远程音频打进 APK。',
    metrics: [{ label: '示例记录', value: '96', tone: 'positive' }, { label: '协议', value: 'pocket.music/v1', tone: 'neutral' }, { label: '音频内置', value: '0', tone: 'positive' }],
    artifacts: [
      { label: '播放语义测试', detail: 'YouTube sourceId/sourceUrl、OSS HTTPS 与 none 均有严格条件', source: 'src/app/lib/dataPack/protocol.test.ts · src/app/lib/music/playback.test.ts' },
      { label: 'OSS 分块', detail: '2.6MB 数据分块以 SHA256 固定，App 按需缓存', source: 'public/data-packs/pocket-earth-music/1.0.0/manifest.json' },
    ],
  },
  {
    skillId: 'pocket.books', title: 'BOOKS', kind: 'Mapping', group: 'content', verdict: 'protocol', verdictLabel: '协议证据',
    summary: '书籍能力与 1055 条示例记录解耦；任何 AI 都可按 pocket-data/v1 生成同构数据包。',
    claimBoundary: '不训练 LoRA；证据是 Schema 严格校验、未知字段拒绝、加载/卸载与地图层同步。',
    metrics: [{ label: '示例记录', value: '1055', tone: 'positive' }, { label: '协议', value: 'pocket.books/v1', tone: 'neutral' }, { label: '数据层', value: '可卸载', tone: 'positive' }],
    artifacts: [{ label: '协议测试', detail: '身份、版本、来源、隐私、分发、记录与未知字段均校验', source: 'src/app/lib/dataPack/protocol.test.ts' }, { label: '示例库清单', detail: '记录数、分块大小与 SHA256 可复核', source: 'public/data-packs/pocket-earth-books/1.0.0/manifest.json' }],
  },
  {
    skillId: 'pocket.movies', title: 'MOVIES', kind: 'Mapping', group: 'content', verdict: 'protocol', verdictLabel: '协议证据',
    summary: '电影能力与 2124 条示例记录解耦；加载后参与检索和地图落位，卸载后数据层消失。',
    claimBoundary: '不训练 LoRA；验证重点是 pocket.movies/v1、数据生命周期和地图同步。',
    metrics: [{ label: '示例记录', value: '2124', tone: 'positive' }, { label: '协议', value: 'pocket.movies/v1', tone: 'neutral' }, { label: '数据层', value: '可卸载', tone: 'positive' }],
    artifacts: [{ label: '协议与生命周期', detail: '跨 Skill 错配、重复 ID、不安全路径和分块来源均会拒绝', source: 'src/app/lib/dataPack/protocol.test.ts · src/app/lib/dataPack/registry.test.ts' }, { label: '示例库清单', detail: '记录数、分块大小与 SHA256 可复核', source: 'public/data-packs/pocket-earth-movies/1.0.0/manifest.json' }],
  },
  {
    skillId: 'pocket.council', title: 'COUNCIL', kind: 'Mapping', group: 'content', verdict: 'protocol', verdictLabel: '编排证据',
    summary: 'Frost 把比较与权衡任务路由到多个专业视角，再形成可追溯综合判断。',
    claimBoundary: '这是 Markdown / 工作流 Skill；不应为固定角色提示词训练 LoRA。云端写作只能走 Qwen，敏感文本禁止静默上传。',
    metrics: [{ label: '模型资产', value: '无需 LoRA', tone: 'neutral' }, { label: '云端模型', value: 'Qwen', tone: 'positive' }, { label: '隐私门', value: '本地拦截', tone: 'positive' }],
    artifacts: [{ label: '路由与模型测试', detail: 'Council 路由、未知 Skill 拒绝、Qwen 模型标签和隐私云门均有测试', source: 'frost-agent/harness/skillRouter.test.ts · frost-agent/harness/taskModels.test.ts · frost-agent/harness/router.privacy.test.ts' }],
  },
];

export const MODEL_SKILL_EVIDENCE = SKILL_EVIDENCE_CATALOG.filter((item) => item.group === 'model');
export const CONTENT_SKILL_EVIDENCE = SKILL_EVIDENCE_CATALOG.filter((item) => item.group === 'content');
