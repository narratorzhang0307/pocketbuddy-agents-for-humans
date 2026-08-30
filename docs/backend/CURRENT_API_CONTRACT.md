# 当前 Cloud Run API 契约

版本：`pocket-buddy-agent-api/v1`（2026-08-30）

本文件只描述当前 `main` 已实现并由 [`server.mjs`](../../server.mjs) 提供的 Google 比赛接口。历史规划文件 [`API_REFERENCE.md`](API_REFERENCE.md) 中的 `/v1/*`、Firebase Auth、媒体上传与完整用户同步尚未启用，不能拿来调用当前部署。

## 1. 当前端点

| 方法与路径 | 认证 | 当前用途 |
| --- | --- | --- |
| `GET /healthz` | 无 | 容器存活检查，不返回凭据 |
| `GET /api/agentic-readiness` | 无 | 返回 Gemini、Cloud Run revision、Firestore、Prompt Harness、地图 provider 与服务边界的非敏感就绪状态 |
| `POST /api/frost-llm` | 公开演示入口，按来源限流 | 经服务端 Prompt Harness 调用 Gemini/Qwen，并返回完成证据 |
| `POST /api/frost-llm-stream` | 公开演示入口，按来源限流 | 同一策略的 SSE 流式输出 |

Cloud Run 比赛服务设置 `FROST_AGENT_PROVIDER=gemini`，因此正式演示主链为 `/api/frost-llm → Prompt Harness → @google/genai → Gemini → Firestore evidence`。未配置的 Qwen、Photos、宠物抠图和健康连接器不是这条主链的依赖。

## 2. 非流式请求

```json
{
  "prompt": "string, required, accepted max 24000 chars",
  "system": "legacy client task instruction, optional, accepted max 5000 chars",
  "json": true,
  "task": "taskmaster",
  "session_id": "optional public correlation id",
  "run_id": "optional public correlation id"
}
```

`system` 只是兼容字段，会作为不可信、低权威的客户端任务说明放入 user content；它不能覆盖服务端策略。`task` 只允许规范化名称并映射到固定 profile。请求先受 Cloud Run 入口限流，再受确定性字符预算和结构化输出校验。

成功响应保留现有客户端字段，并额外暴露非敏感执行信息：

```json
{
  "text": "model output",
  "model": "gemini-3.5-flash",
  "provider": "Google Gemini",
  "traceId": "frost_...",
  "evidence": { "status": "stored" },
  "promptHarness": {
    "protocol": "frost-agent-prompt-harness/v1",
    "version": "1.0.0",
    "profile": "taskmaster",
    "budget": {
      "prompt": { "limitChars": 24000, "receivedChars": 100, "acceptedChars": 100, "truncated": false },
      "clientInstruction": { "limitChars": 5000, "receivedChars": 0, "acceptedChars": 0, "truncated": false }
    }
  }
}
```

响应头 `x-frost-trace-id` 与响应 `traceId`、Cloud Logging 事件和 Firestore `frost_agent_runs/{traceId}` 必须一致。

readiness 的 `services.protocol` 必须为 `pocket-buddy-google-service-boundaries/v1`。其中 `implemented` 只包含当前 Google 比赛闭环；AMap 与端侧语音在 `retained`；尚无 adapter/身份/治理链路的 GCS、Google STT/TTS、FCM 与 Firebase Auth 在 `reserved` 且 `enabled:false`。

## 3. 流式请求

请求字段与非流式端点相同，响应类型为 `text/event-stream`：

```text
data: {"token":"..."}
data: {"done":true,"traceId":"frost_...","evidence":{"status":"stored"},"promptHarness":{...}}
```

只有带 `done:true` 且证据满足当前生产策略时，客户端才能把一次模型调用视为完成。连接中断、超时、等待外部工具或只收到 token 都不等于任务完成。

## 4. 错误与兼容边界

现有 Web/iOS 客户端依赖顶层字符串 `error`，所以当前接口保持：

```json
{ "text": "", "error": "stable_machine_code", "traceId": "frost_..." }
```

常见 HTTP 状态：`400` 输入无效、`429` 限流、`502` 上游或输出校验失败、`503` provider 未配置。错误不得包含 stack、prompt、token、健康内容、位置或内部凭据。

## 5. 尚未启用的接口

- 没有 `/v1/media/uploads`、GCS signed upload 或用户媒体读取端点。
- 没有完整 Firestore 用户、Buddy、健康事件或 Session 同步端点。
- 没有 Firebase Auth 身份边界，因此禁止把预留 GCS/Firestore 用户路径公开成匿名写接口。
- 这些能力启用时，必须在同一 PR 修改当前契约、数据边界、身份校验、保留/删除策略、服务代码、前端调用和测试。

这样保留了你朋友建议的统一 API 与 GCP 数据方向，同时避免把设计文档误报成已经上线的后端。
