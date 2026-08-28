> **历史规划资料（2026-08-21 至 2026-08-23）**：从此前 main `eaffa7ff` 恢复，保留正文用于追溯。下面的“唯一权威”“强制”“当前已具备”等表述只属于当时方案，不是当前工程指令或部署事实；不覆盖当前 `server.mjs`、`server/` 和 Frost 实现。最新入口见 [产品文档索引](../product/README.md) 与 [当前系统架构](../../ARCHITECTURE.md)。

# Pocket Buddy API 文件（API_REFERENCE）

> **版本**：v1.1 · 2026-08-23 · Base URL：`https://api.<domain>`（本地 `http://localhost:8080`）
> 通用规范（认证、错误格式、分页、幂等）见 `BACKEND_SPEC.md` §6；实体字段定义见 `DATA_SCHEMA.md`，本文不重复完整 schema，只标注差异与必填项。
>
> 除 `GET /v1/healthz` 外，所有端点要求 `Authorization: Bearer <Firebase ID Token>`。

## 目录

1. [系统](#1-系统) 2. [用户](#2-用户) 3. [媒体上传](#3-媒体上传) 4. [Buddy](#4-buddy)
5. [健康事件](#5-健康事件) 6. [跑步 Session](#6-跑步-session) 7. [Her Motion Session](#7-her-motion-session)
8. [自然时刻与虚拟树](#8-自然时刻与虚拟树) 9. [营养](#9-营养) 10. [LLM 代理](#10-llm-代理)
11. [宠物抠图](#11-宠物抠图) 12. [每日总结](#12-每日总结)

---

## 1. 系统

### `GET /v1/healthz`
无需认证。返回服务存活与非敏感能力就绪状态，供 Skill Taskmaster 在运行前阻断未配置 Provider；不回传密钥、URL 或凭据。

```json
{
  "ok": true,
  "service": "pocketbuddy-api",
  "version": "0.1.0",
  "capabilities": {
    "llm_generate": { "ready": true, "provider": "gemma-openai-compatible" },
    "health_event_sync": { "ready": true, "provider": "repository" }
  }
}
```

## 2. 用户

### `GET /v1/me`
返回 UserProfile（DATA_SCHEMA §3.1）。首次调用自动创建文档。

### `PATCH /v1/me`
Body（均可选）：`{ "display_name"?, "photo_url"?, "locale"?, "settings"? }` → `200` 更新后的 UserProfile。

## 3. 媒体上传

两步：先取签名上传 URL，客户端直传 GCS，再 confirm。

### `POST /v1/media/uploads`
Body：`{ "content_type": "image/jpeg|image/png|image/webp", "bytes": 123456, "purpose": "buddy-portrait|meal-photo|nature-photo" }`
限制：`bytes ≤ 12582912`（12MB）。
→ `201 { "media_id": "m_xxx", "upload_url": "https://storage.googleapis.com/...", "expires_at": "ISO8601" }`
客户端对 `upload_url` 发 `PUT`（header `Content-Type` 必须与申请一致）。

### `POST /v1/media/{media_id}/confirm`
校验对象存在与 magic bytes；`purpose=buddy-portrait` 时同步生成缩略图。
→ `200 { "media_id", "download_url", "thumbnail_url"? }`（签名读 URL，15 分钟有效）

### `GET /v1/media/{media_id}`
→ `200 { "media_id", "download_url", "thumbnail_url"? }`（重新签发 URL；只能取本人媒体）

## 4. Buddy

### `GET /v1/buddies`
→ `200 { "buddies": [PocketBuddy] }`（≤16 只，不分页；`visual.thumbnailUrl` 为已签名 URL）

### `POST /v1/buddies`
Body：PocketBuddy（不含 `id/createdAt/updatedAt`，服务端生成）。第 17 只 → `409 conflict`。
→ `201` PocketBuddy

### `GET /v1/buddies/{buddyId}` → `200` PocketBuddy
### `PATCH /v1/buddies/{buddyId}`
Body：PocketBuddy 任意可变子集（`name/persona/visual/skills/bonds/status/privacy/memoryDigest`）。→ `200` 更新后实体。
### `DELETE /v1/buddies/{buddyId}` → `204`（连带删除 memories 子集合与立绘媒体）

### `GET /v1/buddies/{buddyId}/memories?limit=&page_token=`
→ `200 { "memories": [PocketBuddyMemory], "next_page_token"? }`（按 `createdAt` 降序）

### `POST /v1/buddies/{buddyId}/memories`
Body：PocketBuddyMemory（不含 `id/createdAt`）。超过 120 条时服务端淘汰最旧非 `origin` 记忆。→ `201` PocketBuddyMemory

## 5. 健康事件

### `POST /v1/health-events:batchSync`
前端 offline-first 的主同步入口。Body：

```jsonc
{ "events": [ HealthEvent ] }   // ≤100 条/批；user_id 由服务端以 uid 覆盖
```

幂等规则见 BACKEND_SPEC §6.4。→ `200`：

```jsonc
{ "results": [ { "event_id": "string", "status": "synced|duplicate|conflict|invalid", "revision": 1, "error"?: "string" } ] }
// revision = 服务端写入后的 sync.revision 值
```

前端据此把本地 `sync.state` 从 `pending` 推进到 `synced`（或 `failed`）。

### `GET /v1/health-events?domain=&type=&from=&to=&limit=&page_token=`
`from/to` 过滤 `occurred_at`。→ `200 { "events": [HealthEvent], "next_page_token"? }`（`occurred_at` 降序）

### `GET /v1/health-events/{event_id}` → `200` HealthEvent

## 6. 跑步 Session

`session_id` 客户端生成（`run-route:{ts36}:{uuid}`），全程 upsert。

### `PUT /v1/run-sessions/{session_id}`
Body：完整 RunRouteSession（DATA_SCHEMA §3.5）。规则：请求中 `sync.revision` 必须 ≥ 服务端现存值，否则 `409 conflict`（前端重拉后重试）。
→ `200 { "session": RunRouteSession }`（`sync.state="synced"`，`sync.revision` 服务端递增）

### `GET /v1/run-sessions?status=&limit=&page_token=` → `200 { "sessions": [...], "next_page_token"? }`
### `GET /v1/run-sessions/{session_id}` → `200` RunRouteSession
### `DELETE /v1/run-sessions/{session_id}` → `204`

> 完成跑步时前端**另行**通过 `POST /v1/health-events:batchSync` 提交 `run_completed` 事件；Session 与事件是两份数据（轨迹全量 vs 事实摘要）。

## 7. Her Motion Session

与跑步 Session 同模式：客户端生成 `sessionId`，PUT upsert。

### `PUT /v1/motion-sessions/{sessionId}` — Body：HerMotionSkillSession（§3.6）→ `200 { "session": ... }`
### `GET /v1/motion-sessions?limit=&page_token=` → `200 { "sessions": [...], "next_page_token"? }`
### `GET /v1/motion-sessions/{sessionId}` → `200`

## 8. 自然时刻与虚拟树

### `POST /v1/nature/observations`
运动途中拍摄动物/植物/鸟。Body：

```jsonc
{ "media_id": "m_xxx",              // 已 confirm 的 nature-photo
  "kind": "animal|plant|bird",
  "geo": { "latitude": 0, "longitude": 0, "accuracy_m": 10 },  // 可选
  "captured_at": "ISO8601",
  "source_session_id": "string?" }   // 关联的 run-session
```

服务端调用 LLM 视觉识别。→ `200`：

```jsonc
{ "observation": {
    "label": "string",               // 最优候选；总体 confidence<0.7 时为 "unknown"
    "confidence": 0.0,
    "candidates": [ { "label": "string", "confidence": 0.0 } ],   // ≤5
    "model_version": "string", "input_hash": "string"
  },
  "health_event": HealthEvent }      // 服务端已代写入的 nature_captured 事件
```

产品红线：低置信度必须返回 `unknown`；植物不返回可食/药用/毒性判断；动物/鸟的 `geo` 写入事件前模糊到 3 位小数。

### `POST /v1/trees`
Body：`{ "species_label"?, "source_event_ids": ["..."], "location"?, "note"?, "visibility"? }`
校验：`source_event_ids` 非空且全部属于本人、类型为 `run_completed|nature_captured`，否则 `400`。
→ `201` VirtualTree（§3.7）

### `GET /v1/trees?limit=&page_token=` → `200 { "trees": [...], "next_page_token"? }`

## 9. 营养

### `GET /v1/food/products?barcode=` 或 `?query=`
OpenFoodFacts 代理（barcode 判定 `/^\d{8,14}$/`；带 Firestore 7 天缓存）。→ `200`：

```jsonc
{ "products": [ { "barcode": "string", "name": "string", "brands": "string", "quantity": "string",
    "servingSize": "string", "nutritionGrade": "string",
    "nutritionPer100g": { "energy_kcal": 0, "protein_g": 0 },   // 值可为 null
    "missing": ["string"], "source": "Open Food Facts" } ],
  "count": 0, "retrievedAt": "ISO8601" }
```

### `POST /v1/food/meal-analyses`
餐食照片 → 营养估计。Body：`{ "media_id": "m_xxx", "note"?: "string" }`
→ `200`：

```jsonc
{ "items": [ { "name": "string", "detail": "string", "grams": [80, 120], "kcal": [90, 140],
               "confidence": 0.0, "box": [0.1, 0.2, 0.5, 0.6] } ],   // box 归一化 [x,y,w,h]，可选
  "totals": { "calories_kcal": [0,0], "protein_g": [0,0], "carbs_g": [0,0], "fat_g": [0,0] },
  "model_version": "string" }
```

前端用户确认后自行提交 `meal_confirmed` 健康事件（`facts.confirmed=true`，取区间中值）。

## 10. LLM 代理

### `POST /v1/llm/generate`
取代旧 `/api/frost-llm`，请求/响应形状**完全保留**以最小化前端改动：
Body：`{ "prompt": "string", "system"?: "string", "json"?: boolean, "task"?: "string" }`
→ `200 { "text": "string" }`
约束：`json:true` 时服务端负责校验输出为合法 JSON（失败重试 1 次，仍失败 → `502 { error.code: "bad_model_output" }`）；单用户限流 30 req/min（超出 `429`）；超时 60s。
前端保持既有行为：非 200 时走本地 fallback，不报错。

## 11. 宠物抠图

沿用旧 `/api/pets` 契约，路径迁移到 `/v1/pets`，**移除 accessToken**（改 Firebase Auth，job 仅本人可见）。

### `GET /v1/pets/health`
→ `200 PetCutoutHealth { ok, configured, provider, backgroundRemoval, privacy: "temporary-private", retentionMinutes: 30, modes: ["direct","mascot"], rigSelection }`（静态配置响应，无对应存储实体；retentionMinutes 语意见 DATA_SCHEMA §3.9）

### `POST /v1/pets`
Body：原始图片 bytes。Headers：`Content-Type: image/*`、`X-File-Name`、`X-Pet-Name`、`X-Forge-Mode: direct|mascot`、`X-Rig-Template`（URL-encoded）。
→ `202` PetCutoutJob（§3.9 的 `asset` 之外字段；服务端经 Cloud Tasks 异步跑 stylize → remove-background → localize）

### `GET /v1/pets/{jobId}` → `200` PetCutoutJob（前端轮询）
### `POST /v1/pets/{jobId}/retry` → `202` PetCutoutJob
### `DELETE /v1/pets/{jobId}` → `200 { "ok": true }`（删除 job 与临时文件）
### `GET /v1/pets/{jobId}/files/{source|clean|final}` → `200` binary（`final` 为透明 PNG）

## 12. 每日总结

### `GET /v1/summaries/daily/{day}`（`day = YYYY-MM-DD`，用户本地日）
存在则直接返回；不存在且 `?generate=true` 则实时聚合当日 `health_events` + LLM 生成 `next_action` 后落库返回。
→ `200` DailySummary（§3.8）；无数据 → `404`。

> Cloud Scheduler 每日 00:30 UTC 调内部端点 `POST /internal/summaries/rollup`（OIDC 服务间认证，前端不可见）为前一日有事件的用户批量生成。

---

## 附：错误响应示例

```jsonc
// 409 批量同步内容冲突
{ "error": { "code": "conflict", "message": "event_id exists with different content",
             "details": { "event_id": "evt_123" } } }
```

变更流程：任何端点/字段变更须先修改本文件与 `DATA_SCHEMA.md`，随代码同 PR 提交。
