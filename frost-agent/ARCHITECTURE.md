# Frost 软件架构 · 0827

## 职责与入口

```text
FrostBuddyPage（展示、用户手势、页面导航）
  └─ sendFrostAgentMessage（唯一对话入口）
      └─ FrostConversationModel + FrostAgentLoop（同一个主会话）
          ├─ 本地记忆 / 通用回答 / 有限 Goal Driver
          ├─ 健康意图 → 独立 Skill 子 Agent → Health Taskmaster → 真实 Skill 结果
          └─ 兼容 Skill Router → Taskmaster 委派 → 独立 Skill 子 Agent → 原页面

Skill Canvas → 编译任务图 → 预览 / 保存 → 用户启动 → 已绑定能力执行与证据
             （不是 Taskmaster；不会自动注册、授权或执行）
```

主 Agent 负责理解与选择，Taskmaster 管理执行边界。每个 `listRoutableSkills()` 中的 Skill 都有 `skill:<skill-id>` 子 Agent 身份；未登记、未装备的能力不能调用。页面的现有 Skill ID、安装状态、权限和能力实现保持不变。不恢复已经移除的旧项目，也不复制模型权重。

## 独立模型子 Agent

- `subagents/registry.ts`：从能力目录建立身份、职责与权限边界，而不是仅重命名 UI 的专家标签。
- `subagents/qwen.ts`：每个子 Agent 独立调用现有 `/api/frost-llm`，携带 `subagent:<skill-id>` 标识；文件名保留兼容，服务端决定实际 provider。
- `taskmaster/subagentDelegation.ts`：每次委派创建独立 Agent Loop、命名空间日志和固定工具注册表；记录真实模型名、调用次数与证据 ID。
- 子 Agent 只能读取自己的 Skill 说明、准备该 Skill 的交接或向用户追问；不能换目标、调用任意工具、直接写健康数据或继续派生 Agent。
- 追问在原子会话续接，不把主聊天、其他子 Agent 的对话或长期记忆整包发送给它。敏感身份/病历等明确标记阻断云端委派；这不是通用脱敏器，调用方仍不可传入未授权原始数据。
- 同一 run 的已有报告可重放，不重新付费调用模型。中断会话恢复时暂停等待用户，不重放副作用。

参赛 Cloud Run 部署将 `/api/frost-llm` 选择为 Gemini 3.5（官方 `@google/genai` SDK），而 Taskmaster 的确定性健康控制面保持不变。普通部署仍可选择 Qwen 兼容 provider；`QWEN_MODEL_SUBAGENT` 可以单独覆盖该路径。所有云端凭据只由服务端读取。

子 Agent 请求采用有限长度的结构化决策，服务器限制输出长度；不是无限上下文或无限推理配置。各 provider 的具体模型名、SDK、传输方式和运行证据由 `/api/agentic-readiness` 与服务端响应公开，而不是由前端声称。

## 预算与真实状态

| 层 | 限制 | 达到边界时 |
| --- | --- | --- |
| 主 Agent 每轮 | 12 步、12 次工具调用、5 分钟 | 停止并记录原因，不把失败当成功 |
| 一次页面计划 | 最多 3 个已登记子 Agent | 超限拒绝；无递归派生 |
| 子 Agent 每轮 | 3 次模型决策、2 次工具调用、45 秒 | 阻断/失败/等待用户，保留真实记录 |
| 健康 Taskmaster | 原有任务权限、确认、幂等与完成证据门 | 未接 provider 时等待真实结果 |
| 每日 Goal | 最多 30 轮，24 小时间隔 | 仅应用运行时检查到期；不是系统后台服务 |

会话计数用于累计审计与唯一 ID，调用额度按轮重新计算。即使模型忽略 AbortSignal，宿主循环也会在期限到达时结束等待。云端服务仍受现有服务端超时约束，客户端取消不等于供应商一定已停止计费。

`waiting_external` 表示子 Agent 已准备交接，**不表示完成了训练、采集、播放或写入**。需要摄像头、GPS、姿态模型、数据导入等真实能力的任务仍在原页面完成。页面交接附带可选 `subagentRunId`；原 `pocket-frost-task/v1` 协议与健康 `taskmasterTaskId` 保持兼容。通用页面尚未全部实现自动完成回调，不能把它们宣称为无人值守的端到端执行。

模型失败时，页面型能力保留手动入口并明确标记回退；健康流程保留现有确定性控制面与确认门。明确拒绝不会被识别为确认；切换话题后的“确认”不会确认较早的健康任务。

## Canvas 边界与兼容

编译、预览与草稿位于 `skill-canvas/`，真实执行位于 `skill-taskmaster/{contracts,runtime}.ts`，浏览器绑定在 `src/app/lib/skillTaskmasterRuntime.ts`。保持 `pocket.skill-canvas.v1` 存储键、`pocket-skill-graph/v1` 和已有卡片 ID；无需清空或迁移旧草稿。

预览保持 `mode: preview`，不执行外部能力。用户点击画布运行按钮后才创建 `mode: execute` 的运行：检查图、逐项授权、调用注册适配器、收集实际结果和证据。缺少适配器、权限拒绝、超时或主动停止会阻断后续步骤；编辑可执行内容后清除旧完成状态。

画布绑定八种能力：手动启动、定位、本机健康摘要、本机骨骼识别、Frost 服务端模型、安全门、系统语音和本机使用记录。`model.qwen` 作为已有图的兼容 ID 保留，实际 provider 由 `/api/frost-llm` 决定；健康摘要发送云端还要求已有健康设置允许云端建议。`model.pose` 由画布的可见相机预览注入，复用运动陪练的 MediaPipe 模型及完整人体检查，采集 30 帧连续骨骼点后释放相机；无人体、断流或取消均不能产生成功观测。编译器将姿态观测排在语义决策之前。相机授权仅允许本机采集，云端语义决策另行授权；原始画面不上传。只写 Skill 使用事实，不推断完成了运动；草稿、证据与运行均留在本机，不提供后台调度。详见 [使用和验收范围](../docs/development/SKILL-CANVAS-RUNTIME.md)。

## 手机与吧唧共用同一 Agent

吧唧是轻交互入口：BLE 传送录音到 iPhone，本机 ASR 生成文字草稿，用户核对后送入同一个 `sendFrostAgentMessage`。App 级 `FrostCompanion` 观察主会话并投射真实状态，跨 Skill 页面保留连接；它没有模型、执行权限或独立记忆。

触摸只记输入元数据，识别出的肯定词不能签发授权。所有 Skill 复用原登记、装备与权限；需要手机相机、定位、数据导入或连接器的能力仍由手机承担。完整的 16 项能力边界、结果回传限制和隐私说明见 [轻交互入口适配说明](../docs/technical/FROST-COMPANION-2026-08-27.md)。

## 验证

```sh
npm run typecheck
npm test -- --exclude 'scripts/health/*.live.test.ts' --reporter=dot
npm run build
# 显式联调，使用合成文本；不操作任何硬件：
FROST_SUBAGENT_LIVE=1 FROST_SUBAGENT_BASE_URL=http://127.0.0.1:5179 npm test -- scripts/health/qwen-subagent.live.test.ts
```

单测覆盖统一入口、专用能力路由、上下文隔离、追问恢复、调用额度、超时、否定确认、旧任务串线、Canvas 非执行边界与旧存储兼容。第二阶段增加手机侧 Companion/ASR；不修改固件或 `hardware/ojbadge-agent-link`。
