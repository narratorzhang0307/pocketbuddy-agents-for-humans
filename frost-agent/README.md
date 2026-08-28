# Frost Agent Harness · Qwen 决赛版

> 软件架构已收口为一个 Frost 主 Agent、受预算约束的 Taskmaster、以及每个已登记 Skill 的独立 Qwen 子 Agent。完整职责、入口和兼容边界见 [ARCHITECTURE.md](./ARCHITECTURE.md)。硬件接入不在本阶段改动范围内。

Frost 是用户长期拥有的主 Agent。Skills 保留原有能力与页面；每个已登记 Skill 同时拥有独立子 Agent 身份、任务上下文、Qwen 请求和事件日志。用户仍从同一个 Frost 入口发起任务。

## 当前推理路线

- 端侧：`edge/capacitorMnnEdge.ts` → Android Capacitor Plugin → `libpocket_mnn_jni.so` → Alibaba MNN。
- 模型：Qwen3 / Qwen3-VL Base；Travel、古籍、碑拓等能力按需加载 MNN Adapter 或专用模型。
- 加速：同一 arm64 APK 运行时检测 SME2；target 2 是 I8MM/NEON 基线，target 3 是 SME2 实验组。
- 云端：`harness/httpBrain.ts` → `/api/frost-llm` → DashScope Qwen。密钥只保存在服务端。
- 回退：模型或网络不可用时返回明确空值/错误，由业务进入确定性规则或手填，不伪装成模型结果。

## 可信执行链

```text
用户意图
  → sendFrostAgentMessage → Frost Agent Loop（同一会话）
  → Taskmaster 委派已登记 Skill 子 Agent → 独立 Qwen API 调用
  → 结构校验 / 固定工具 / 预算与超时
  → 健康 Taskmaster 或原 Skill 页面（授权、真实数据与质量门）
  → 用户确认 → 校验后的事实与事件日志
```

`src/app/lib/frostConversation.ts` 统一处理健康目标、普通对话、记忆、调度和子 Agent 追问。`harness/skillRouter.ts` 只作为兼容的能力发现/页面计划适配器，不再由 UI 与 Agent Loop 二选一。计划通过 Registry 白名单与子 Agent 准备后，仍以 `pocket-frost-task/v1` 交给原 Skill，不绕过其 Adapter、质量门和确认门。

## 目录

- `agents/`：历史领域契约与兼容实现；产品层统一呈现为 Skills。
- `subagents/`：从已登记 Skill 生成独立子 Agent 身份、职责和 Qwen 调用。
- `runtime/`：主/子 Agent 共用的有限循环、收件箱、审批、事件日志与 Goal Driver。
- `taskmaster/`：健康任务执行与子 Agent 委派监督；不负责 Canvas 编辑。
- `skill-canvas/`：能力卡编译与结构预览，不执行模型或真实任务。
- `skill-taskmaster/`：旧导入路径兼容转发，无独立执行器。
- `harness/`：路由、记忆、事件、校验与云端 Brain。
- `edge/`：Qwen/MNN 端侧统一契约、Android 桥和开发期 sidecar。
- `provider-compat/`：DashScope Qwen、MNN 与兼容请求适配。
- `memory/`：会话记忆和本地长期画像。

## 安全口径

- 前端与 APK 不保存 DashScope API Key。
- 用户选择端侧时不静默升级云端；私人原图默认不离设备。
- Adapter 未安装时明确阻断，不能用共享 Base 冒充 Skill。
- 所有写入先建议、再校验、最后由用户确认。
- RunTrace 与真机验收账本只展示真实执行路径和原始指标。
