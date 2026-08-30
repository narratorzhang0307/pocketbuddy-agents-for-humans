# 当前 GCP 架构

版本：`pocket-buddy-gcp-architecture/v1`（2026-08-31）

## 目标

比赛版只云化能够证明 Agent 工作流且不会扩大隐私风险的最小闭环。产品前端、Taskmaster、模型适配器、部署文件和文档在同一仓库；台湾部署人不需要复制或重写一套后端。

```mermaid
flowchart LR
  U[用户 / Frost Badge] --> APP[React + Capacitor<br/>Pocket Buddy]
  APP -->|目标、任务类型、可选客户端任务说明| API[Cloud Run<br/>server.mjs]
  API --> PH[Server-owned Prompt Harness<br/>版本 / 权威 / 预算 / JSON 校验]
  PH --> SDK[@google/genai]
  SDK --> GEM[Gemini 3.5 Flash<br/>Vertex AI]
  GEM --> PH
  PH --> TM[Deterministic Frost Runtime<br/>工具 / 权限 / 超时 / 证据门]
  API -->|仅执行证据元数据| FS[(Firestore Native<br/>frost_agent_runs)]
  APP -->|地图与路线展示| AMAP[AMap Web JS API]
  GCS[(Cloud Storage<br/>显式授权媒体，预留)] -. 当前比赛不写入 .-> API
```

## 职责边界

- Gemini 负责提出结构化下一步，不直接执行设备副作用，也不能把文本当成健康事实。
- Prompt Harness 是所有 Gemini / Qwen 文本请求的服务端入口，控制系统策略、上下文长度、温度、输出预算和 JSON 格式。
- Frost Runtime 负责真实状态、工具白名单、审批、取消、重试和完成证据。
- Firestore 当前只写 `frost_agent_runs/{traceId}`，用于把模型调用、Cloud Run revision 和演示证据关联起来。
- AMap 继续负责中国大陆场景的地图与路线体验。它是披露的第三方数据源，不冒充 Google Cloud 服务。
- GCS 是未来经过用户明确授权后的二进制媒体存储；比赛提交不需要为了“云原生”上传原图或录音。
- STT、TTS、推送、用户身份与地图的真实采用状态集中维护在 [`GOOGLE_SERVICE_BOUNDARIES.md`](GOOGLE_SERVICE_BOUNDARIES.md)，避免多个文档各说一套。

## Google 比赛技术映射

| 官方要求 | 当前实现 |
| --- | --- |
| Gemini 3.5 或更新 | `gemini-3.5-flash` |
| Google Agent Framework | 官方 `@google/genai` SDK |
| Google Cloud 基础设施 | Cloud Run + Firestore Native |
| 自主工作流而非普通聊天 | Gemini 决策 + 确定性 Taskmaster + 注册工具 + 证据门 |
| Google Cloud 部署证明 | readiness、Cloud Run revision、结构化日志、同 traceId Firestore 文档 |

## 参考仓库取舍

参考 [`jessie0215/Smart_LTC_System`](https://github.com/jessie0215/Smart_LTC_System) 的 `81ceb7449806669cc71dc6f5b527b6dea54d64b6` 后采用了：单一技术栈说明、分层提示词、上下文预算、provider 隔离、数据最小化、部署/验证脚本，以及“AI 建议不能未经证据门直接成为事实”。没有照搬其 AWS Lambda/ECS/Cognito/DynamoDB 服务数量或代码，因为 Pocket Buddy 的比赛闭环用一个 Cloud Run 服务即可，过度拆分会增加交接和失败面。逐项取舍见 [`REFERENCE_ARCHITECTURE_REVIEW.md`](REFERENCE_ARCHITECTURE_REVIEW.md)。
