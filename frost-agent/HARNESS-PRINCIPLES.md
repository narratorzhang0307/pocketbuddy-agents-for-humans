# Frost Harness 工程准则 · Qwen 决赛版

本文件把《Claude Code 实战：Harness 工程之道》的 Harness、Skill、Memory、边界与可观测性方法映射到 Pocket Earth。用户只和 Frost 主 Agent 对话；Pip、Puff、Mossback 是有明确领域边界的专家执行者，书籍、电影、音乐、旅行、看展与古典文化能力仍统一登记为可验证的 **Skills**。

## 1. Skill 是目录，不是一条长 Prompt

每个 Skill 按三层渐进披露：

1. `Manifest.description`：常驻目录，只回答 What、When、Not For。
2. Skill 工作流：选中后才加载步骤、权限和质量门。
3. `references/`、`scripts/`、`assets/`：执行到具体阶段时按需读取。

Frost 的常驻 Prompt 不能塞入模型权重、示例数据库、参考全文或完整工作流。`description` 是路由语义指纹；它写得不准，后续模型再强也会误派。

## 2. 一次请求只选真正必要的 Skill

- 一个 Skill 能完成就不拆分。例如“整理书单，然后落到地图”仍交给书籍 Skill 的内部流水线。
- 有数据依赖才使用 `sequence`。
- 子任务互不共享状态时才使用 `parallel`。
- 单次最多三个 Skill，避免计划膨胀和不可解释的递归委派。
- 普通知识问答、翻译、闲聊没有合适 Skill 时由 Frost 直接回答，不硬塞进目录。

## 3. 路由与执行分权

Frost 只做理解、选 Skill、列计划和交接，不直接写地图、生成 Data Pack 或覆盖用户数据。目标 Skill 仍须经过自己的 Validator、Quality Gate 和用户确认。

```text
用户目标
  → 本地高置信语义路由
  → 长尾任务可选 Qwen 严格 JSON 规划
  → Skill ID / 字段 / 数量白名单校验
  → 确定性专家委派（Pip / Puff / Mossback / Frost）
  → 展示计划、可用状态与权限
  → 用户点击运行
  → pocket-frost-task/v1 交接
  → 目标 Skill 的质量门与确认门
```

模型返回永远只是候选计划。不存在的 Skill、重复目标、未知字段、超过三步或未装备能力不得进入执行边界。

## 4. 最小权限是运行时边界

Manifest 的 `scopes` 与 `tools` 不是说明文字，而是运行时展示和确认依据：

- 读取目录、读取本地偏好与写入地图必须区分。
- `mark_place`、`data_pack`、`restore` 等副作用在目标 Skill 内再次确认。
- 未装备 Skill 只能引导安装，不能用共享 Qwen Base 冒充已经具备该能力。
- 命中证件、住址、病历等敏感原文时，路由器禁止把原文升级到云端。

## 5. Qwen、MNN 与确定性脚本各司其职

- 本地规则：明确意图、隐私门、字段校验、排序和状态机。
- Qwen/MNN：端侧理解、视觉/OCR、弱网与隐私场景。
- Qwen 云 API：只有长尾语义规划和允许出端的公共增强。
- 确定性脚本：Schema 校验、哈希、Data Pack、地图坐标和发布构建。

任何路径失败都必须显式回退或停止；不能把规则结果标成模型结果，也不能把网页预览标成手机 MNN 实测。

## 6. 交接使用固定契约

跨页面只传 `pocket-frost-task/v1`：计划/步骤/运行 ID、登记过的 Skill ID、目标入口、专家 ID、任务目标、受限长度的用户原文和时间戳。目标页只读取与自身入口匹配的交接，不能执行其他 Skill 的任务。

长任务若未来需要断点续跑，应把计划状态升级到 IndexedDB，并按步骤事务提交；在此之前不宣称 Frost 已经后台自治完成整条流水线。

## 7. 长期记忆是经过确认的事实，不是聊天堆积

- `sessionStorage` 只承载当前交接；目标 Skill 真正打开后才把交接升级为长期记忆。
- IndexedDB 分开保存 episodic 交接与反复验证后的 procedural 路由。
- 永久层不接收聊天原文、图片或 OCR 正文，只保存摘要、来源、专家、置信度和时间。
- 召回只响应明确的记忆请求，并支持用户修正、物理遗忘和 JSON 导出。
- IndexedDB 不可用时仅退化为进程内存，不改走云端。

## 8. Trace 是证据，不是思维链

可折叠 Trace 只展示：目录数量、路由来源、耗时、隐私门、JSON 契约、目标边界、装备状态和确认状态。不得展示隐藏推理或伪造模型耗时。

## 9. 新增 Skill 的最小验收

1. 唯一 `identity.id`、清楚的 What/When/Not For description。
2. 真实 `entry.target`，并已在页面路由注册。
3. 明确的 `scopes`、`tools` 与副作用确认门。
4. 至少 10 条应触发、10 条不应触发样例。
5. 严格拒绝未知字段、重复 ID、越权目标。
6. 网络、模型和 Adapter 不可用时有可解释回退。
7. 端侧、云端和网页预览在 Trace 中分别标记。

当前实现对应：`harness/skillRouter.ts`、`harness/expertRouter.ts`、`harness/taskHandoff.ts`、`harness/longTermMemory.ts`、`src/app/components/FrostBuddyPage.tsx`、`FrostMemoryPanel.tsx` 与 `FrostTaskHandoffFrame.tsx`。
