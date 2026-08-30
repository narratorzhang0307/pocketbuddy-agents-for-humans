# 当前后端入口

本页是唯一正式仓库 [`narratorzhang0307/pocketbuddy`](https://github.com/narratorzhang0307/pocketbuddy) 当前 `main` 后端的阅读入口。部署和交接不得从其他仓库或其他 `main` 复制代码。`BACKEND_SPEC.md`、`API_REFERENCE.md`、`DATA_SCHEMA.md` 是 2026-08-21 的完整云化规划，保留用于后续演进；它们不是本次比赛已经部署的事实。

## 当前实际实现

| 能力 | 当前状态 | 源码 / 文档 |
| --- | --- | --- |
| Agent HTTP API | 已实现：`POST /api/frost-llm` 与流式端点 | [`server.mjs`](../../server.mjs) |
| 当前 HTTP 契约 | 已实现端点、错误、限流和未启用边界 | [`CURRENT_API_CONTRACT.md`](CURRENT_API_CONTRACT.md) |
| 服务端提示词策略 | 已实现：客户端任务说明不能覆盖服务端策略 | [`agent-prompt-harness.mjs`](../../server/agent-prompt-harness.mjs)、[`PROMPT_HARNESS.md`](PROMPT_HARNESS.md) |
| Gemini | 已实现：Gemini 3.5 Flash + `@google/genai` | [`google-agent-provider.mjs`](../../server/google-agent-provider.mjs) |
| Cloud Run | 已实现部署脚本与容器 | [`deploy/all-things-agentic`](../../deploy/all-things-agentic/README.md) |
| Firestore | 已实现：只写运行证据元数据 | [`agent-evidence-store.mjs`](../../server/agent-evidence-store.mjs) |
| Firestore 完整用户数据 | 已保留路径与契约，比赛版未启用 | [`CURRENT_DATA_BOUNDARIES.md`](CURRENT_DATA_BOUNDARIES.md) |
| GCS 媒体 | 已保留对象路径，比赛版未上传用户媒体 | [`CURRENT_DATA_BOUNDARIES.md`](CURRENT_DATA_BOUNDARIES.md) |
| Google / 端侧 / 第三方服务边界 | 已逐项标明“已实现、预留、保留”，不把计划冒充上线能力 | [`GOOGLE_SERVICE_BOUNDARIES.md`](GOOGLE_SERVICE_BOUNDARIES.md) |
| 地图 | 保留高德地图，不迁移 | [当前架构](CURRENT_GCP_ARCHITECTURE.md) |
| 台湾 GCP 交接 | 已实现只读预检、部署步骤和证据清单 | [`TAIWAN_GCP_HANDOFF.md`](TAIWAN_GCP_HANDOFF.md) |
| 参考架构取舍 | 已逐项映射朋友截图与 Smart LTC 参考仓库 | [`REFERENCE_ARCHITECTURE_REVIEW.md`](REFERENCE_ARCHITECTURE_REVIEW.md) |

## 修改规则

1. 前端和后端留在同一个仓库、同一个 PR 修改；不再生成互不匹配的第二套后端。
2. 新模型任务必须先在 `agent-prompt-harness.mjs` 增加或复用 profile，并补测试。
3. 新增云端字段或集合，先修改 `CURRENT_DATA_BOUNDARIES.md` 和 `cloud-data-contracts.mjs`，再写读写代码。
4. 用户健康、精确位置、原图、录音和长期记忆默认留在端侧；上云必须有明确产品授权和访问控制。
5. 部署只使用 Cloud Run 服务账号访问 Vertex AI / Firestore；密钥不能进入 `VITE_*`、Git 或视频画面。
6. 正式部署前必须在 `main` 运行 `npm run agentic:preflight`；预检会确认 `main` 的 upstream 确实属于 `narratorzhang0307/pocketbuddy`。
7. STT、TTS、通知、媒体或地图 provider 的状态只能在真实 adapter、测试、readiness 和部署证据同时存在后改为“已实现”。
