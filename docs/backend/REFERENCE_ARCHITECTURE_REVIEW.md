# 朋友建议与 Smart LTC 参考架构复核

复核日期：2026-08-31
正式项目：[`narratorzhang0307/pocketbuddy`](https://github.com/narratorzhang0307/pocketbuddy)
只读参考：[`jessie0215/Smart_LTC_System`](https://github.com/jessie0215/Smart_LTC_System)，复核提交 `81ceb7449806669cc71dc6f5b527b6dea54d64b6`

## 1. 参考原则，不复制 AWS 实现

Smart LTC 的价值不在于服务数量，而在于以下工程纪律：前端、后端、基础设施与文档同仓；API contract-first；模型 Prompt 分层并限制上下文；数据库只存结构化记录、对象存储放媒体；身份与授权在服务端；AI 建议和确认事实分开；部署后有可复验的日志和检查脚本。参考仓库只读复核，未复制其代码、AWS 模板或素材。

Pocket Buddy 采用这些原则，但将 AWS 组件映射到比赛需要的最小 GCP 闭环：

| 参考模式 | Pocket Buddy 采用方式 | 当前状态 |
| --- | --- | --- |
| API Gateway / Lambda 或容器后端 | 单一 Cloud Run `server.mjs` API，减少跨服务交接面 | 已实现 |
| Bedrock 模型与 provider 隔离 | `@google/genai` + Gemini 3.5，封装在 `google-agent-provider.mjs` | 已实现 |
| 分层 Prompt Builder 与 context budget | `agent-prompt-harness.mjs` 的 server policy、profile、预算和 JSON gate | 已实现并测试 |
| DynamoDB 结构化实体 | Firestore Native；比赛只写 `frost_agent_runs` | 已实现最小范围 |
| S3 私有媒体对象 | GCS 用户媒体/临时任务路径合同 | 路径已实现；上传未启用 |
| CloudWatch provenance | Cloud Logging 结构化事件 + Firestore 同 trace ID 证据 | 已实现 |
| IaC / deploy / verify | Dockerfile、Cloud Build、GCP 预检、部署与 `agentic:check` | 已实现 |
| 客户端与后端同一平台协作 | Web/iOS、Agent runtime、服务端、部署、数据和交接同一 GitHub 仓库 | 已实现 |
| AI proposal 与确认事实分开 | Gemini 只提出下一步；Taskmaster 的工具 receipt、确认门和完成证据决定是否完成 | 已实现 |

## 2. 截图建议逐项结论

### 前后端不要分开写

采纳。当前产品页面、iOS 原生桥、Agent runtime、服务端 provider、数据合同、Docker 和文档都由同一提交版本控制。部署使用 Git SHA 构建不可变镜像，避免“新前端配旧后端”。

### 后端直接使用 GCP

采纳。Google 比赛主链以 Cloud Run、Vertex AI Gemini、Firestore、Artifact Registry、Cloud Build 和专用 service account 组成。AMap 仍是披露的地图 provider，不冒充 Google 服务。

### 统一 Prompt Harness

采纳。客户端 `system` 不能成为最高权威；任务只映射到固定 profile。新增任务应先复用或扩展 `PROFILES`，同时更新测试和 [`PROMPT_HARNESS.md`](PROMPT_HARNESS.md)。预算 provenance 只含字符数与截断状态，不记录 prompt 正文。

### Firestore 与 GCS 数据模型

方向采纳，部署范围分两层：

1. 比赛已实现层：Firestore `frost_agent_runs/{traceId}`，只含运行证据元数据。
2. 经授权同步层：`users/{uid}/...` Firestore 路径和 `users/{uid}/media/...`、`tmp/pet-jobs/...` GCS 路径已有严格构造器与测试，但未公开写接口。

在 Firebase Auth 或等价身份、uid 强制覆盖、对象私有访问、用户同意、删除和保留期没有完成前，不将第二层标成“已上线”。

### TTS、STT、通知和位置全部迁移云原生

只采纳“统一 provider 边界”的原则，不在比赛截止前替换已经验证的端侧/产品链路。Pocket Buddy 的徽章语音经 iPhone 本地 ASR，地图使用 AMap，现有 TTS 另有服务端授权边界。临时增加 Google Speech、TTS、推送或位置服务会扩大 IAM、费用、隐私和验收面，不是 Taskmaster 主链的必要条件。具体状态与未来替换门见 [`GOOGLE_SERVICE_BOUNDARIES.md`](GOOGLE_SERVICE_BOUNDARIES.md)。

## 3. 继续开发的强制顺序

1. 从正式 `pocketbuddy/main` 建分支；禁止从其他仓库复制一份后端。
2. 先更新当前 API/data/prompt contract，标明已实现或预留。
3. 再修改服务端 adapter 与前端调用，保持同一 PR/commit 系列。
4. 新增用户云数据前先实现认证、授权、同意、删除和保留策略。
5. 运行类型检查、测试、构建、Agentic、硬件与秘密扫描。
6. 用 Cloud Run revision、同 trace ID 日志与 Firestore 文档验收，不用架构图替代运行证据。

## 4. 本轮可交接结论

当前代码已经符合朋友建议的核心工程方向：一个正式仓库、一个 server-owned Prompt Harness、一个 Cloud Run 部署入口、明确的 Firestore/GCS 数据边界和可复验交接流程。GCS 完整媒体服务、Firebase 用户同步以及 Google STT/TTS 不属于当前已完成比赛范围；文档和 readiness 不会把它们冒充成已部署能力。
