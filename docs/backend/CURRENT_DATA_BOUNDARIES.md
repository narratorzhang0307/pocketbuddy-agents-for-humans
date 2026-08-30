# Firestore 与 GCS 当前数据边界

版本：`pocket-buddy-cloud-data/v1`（2026-08-30）

机器可校验定义位于 [`server/cloud-data-contracts.mjs`](../../server/cloud-data-contracts.mjs)。本文件区分“已实现”与“已预留”，避免架构图或规划文档被误当成线上事实。

## 1. 数据库选型

| 数据 | 选型 | 结论 |
| --- | --- | --- |
| 结构化实体 | Firestore Native | 文档型数据契合现有嵌套 JSON；按 `users/{uid}` 隔离；比赛期不引入 Cloud SQL |
| 二进制媒体 | GCS | 不把 blob / dataURL 写入 Firestore；比赛版不上传用户原图、录音 |
| 运行证据 | Firestore `frost_agent_runs` | 当前唯一开启的云端业务写入 |
| OpenFoodFacts 缓存 | Firestore `cache_off`（预留） | 后续以 TTL 代替自建 Redis |
| BI | 不做 | 以后需要时再导出 BigQuery |

## 2. 当前已实现：比赛运行证据

路径：`frost_agent_runs/{traceId}`。

允许字段只有：协议、trace ID、状态、任务、提示词协议/版本/profile、provider/model/transport/framework、可选 session/run ID、开始/完成时间、延迟、输入/客户端说明/输出字符数，以及 Cloud Run service/revision/region。

明确禁止保存：

- prompt、客户端 system 文本、模型回复正文或思维过程
- 健康事实、诊断、长期记忆
- 精确位置、路线点、家庭地址
- 图片、音频、视频、文件内容
- API key、token、cookie、认证头

`assertAgentEvidenceDocument` 在 Firestore 写入前执行字段白名单；新增字段必须同时改代码、测试和本文档。

## 3. 已预留但比赛版未启用

```text
users/{uid}
users/{uid}/media/{mediaId}
users/{uid}/buddies/{buddyId}
users/{uid}/buddies/{buddyId}/memories/{memoryId}
users/{uid}/health_events/{eventId}
users/{uid}/run_sessions/{sessionId}
users/{uid}/motion_sessions/{sessionId}
users/{uid}/trees/{treeId}
users/{uid}/daily_summaries/{day}
pet_jobs/{jobId}
cache_off/{barcode}
idempotency/{key}
```

GCS 预留对象前缀：

```text
users/{uid}/media/{mediaId}.{ext}
tmp/pet-jobs/{uid}/{jobId}/...
```

这些路径落实了截图中的数据格式共识，但“预留”不等于线上已同步。启用前必须完成 Firebase Auth 或等价身份校验、本人 uid 强制覆盖、Firestore Rules / IAM、同意界面、删除与保留期、迁移测试。

## 4. 数据权威与确认

1. 模型生成内容默认是 proposal，不是确认事实。
2. 健康事件必须由用户确认或可信工具 receipt 产生。
3. `user_id` 永远来自认证上下文，不信任请求体。
4. 有副作用的 POST 使用 `Idempotency-Key`；客户端生成事件 ID 的同步写入必须检测同 ID 内容冲突。
5. 媒体默认私有，下载使用短期签名 URL；不要把永久公开 URL 存入用户资料。
6. 缓存、幂等记录和临时任务使用 TTL；用户数据保留与删除另行定义，不能把 TTL 兜底当成隐私承诺。

## 5. 为什么比赛版不把所有数据立即搬上云

比赛评分需要 Google Cloud 部署证据，不要求把所有敏感数据上传。保持本地优先可以减少账号、规则、迁移和删除链路的风险，同时 Firestore 运行证据足以证明 Cloud Run → Gemini → Firestore 的真实闭环。完整云同步应在身份、授权和删除语义都完成后作为独立迭代开启。
