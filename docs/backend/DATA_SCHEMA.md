> **历史规划资料（2026-08-21 至 2026-08-23）**：从此前 main `eaffa7ff` 恢复，保留正文用于追溯。下面的“唯一权威”“强制”“当前已具备”等表述只属于当时方案，不是当前工程指令或部署事实；不覆盖当前 `server.mjs`、`server/` 和 Frost 实现。最新入口见 [产品文档索引](../product/README.md) 与 [当前系统架构](../../ARCHITECTURE.md)。

# Pocket Buddy 数据存储格式（DATA_SCHEMA）

> **版本**：v1.0 · 2026-08-21 · 配合 `BACKEND_SPEC.md` 与 `API_REFERENCE.md` 使用。
> 本文件定义每类数据**存在 GCP 哪个数据库、什么格式**。字段名沿用前端既有契约（`src/app/lib/**` 与 `frost-agent/**` 的 TypeScript 类型），是前后端与 zod schema 的唯一事实来源。

---

## 1. 数据库选型结论

| 数据类别 | 存储 | 理由 |
|---|---|---|
| 所有结构化实体（用户、Buddy、健康事件、Session、树、总结、任务/缓存） | **Firestore（Native mode）** | 前端实体全是嵌套 JSON 文档且 schema 会持续演进，文档型天然契合；按 `users/{uid}/...` 分层天然隔离多租户；免费额度足够 hackathon；无需运维。**不用 Cloud SQL**：无强关系查询需求，建表/迁移拖慢并行开发 |
| 二进制文件（立绘、照片、抠图产物） | **Cloud Storage (GCS)** | Firestore 单文档上限 1MB，不能放 blob；前端现在把 webp dataURL 内嵌 localStorage 会爆配额，上云后一律改成 GCS 对象 + 下载 URL 引用 |
| OpenFoodFacts 查询缓存 | Firestore `cache_off/` 集合（TTL） | 免去 Redis 运维 |
| 分析/BI | 本期不做 | 未来可开 Firestore → BigQuery 导出，不影响现有设计 |

**通用约定**

- 文档 ID：客户端生成的沿用其既有格式（如 `run-route:{ts36}:{uuid}`）；服务端生成的用 `crypto.randomUUID()` 加语义前缀（如 `tree_`、`pet-`）。
- 所有 `user_id` 字段 = Firebase Auth `uid`。
- 所有时间字段为 ISO 8601 UTC 字符串（与前端一致，不用 Firestore Timestamp 类型，避免序列化差异）。
- 每个文档带 `schema_version: number`（本版全部为 `1`），供未来迁移。
- `sync` 字段（`{ state, revision }`）由服务端写入时置 `{ state: "synced", revision: <递增> }`。

## 2. Firestore 集合总览

```
users/{uid}                                # 用户档案
users/{uid}/media/{media_id}               # 媒体元数据（purpose、状态；对象本体在 GCS）
users/{uid}/buddies/{buddyId}              # Buddy 本体（persona、visual、skills、bonds）
users/{uid}/buddies/{buddyId}/memories/{memoryId}   # Buddy 记忆（≤120 条/只）
users/{uid}/health_events/{event_id}       # 健康事件（餐食/运动/自然/skill）
users/{uid}/run_sessions/{session_id}      # 跑步路线 Session
users/{uid}/motion_sessions/{sessionId}    # Her Motion 相机 Session
users/{uid}/trees/{tree_id}                # 虚拟树
users/{uid}/daily_summaries/{YYYY-MM-DD}   # 每日总结
pet_jobs/{jobId}                           # 宠物抠图任务（顶层，含 uid 字段）
cache_off/{barcode}                        # OpenFoodFacts 缓存（TTL 7 天）
idempotency/{key}                          # Idempotency-Key 记录（TTL 24h）
```

**需要建立的复合索引**：
- `health_events`: (`domain` ASC, `occurred_at` DESC)、(`type` ASC, `occurred_at` DESC)、(`occurred_at` DESC)
- `run_sessions`: (`status` ASC, `updated_at` DESC)
- `pet_jobs`: (`uid` ASC, `created_at` DESC)

**TTL 策略**（Firestore TTL policy，字段名 `expire_at`）：`cache_off`、`idempotency`、`pet_jobs`（完成后 24h）。

---

## 3. 实体定义

### 3.1 `users/{uid}` — UserProfile

```jsonc
{
  "schema_version": 1,
  "uid": "string",                 // = Firebase uid
  "display_name": "string|null",
  "photo_url": "string|null",
  "locale": "zh-CN",
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "settings": { "privacy_default": "private" }   // 预留
}
```

### 3.2 `users/{uid}/buddies/{buddyId}` — PocketBuddy

来源：`src/app/lib/pocket-buddy/types.ts`。**改动点**：`visual.thumbnailUrl` 不再是 dataURL，改为 GCS 媒体 URL；新增 `visual.portrait_media_id` 取代 IndexedDB blob 引用；`memories` 拆到子集合。每用户上限 **16 只**（服务端校验）。

```jsonc
{
  "schemaVersion": 1,                      // 沿用前端既有字段名（此实体不用 schema_version）
  "id": "string",
  "name": "string",                        // ≤24 字符
  "category": "animal|object|device|fantasy",
  "visual": {
    "kind": "local-cutout|mascot|preset",
    "catalogId": "string?",
    "portrait_media_id": "string?",        // 新增：→ media 对象（§3.12/§5），取代原 portraitBlobId
    "thumbnailUrl": "string",              // GCS 下载 URL（180x180 webp），不再是 dataURL
    "sourceFileName": "string?",
    "backgroundRemoval": "local|service|preset",
    "promptVersion": "string?"
  },
  "persona": {
    "role": "string", "personality": "string?", "voice": "string",
    "goal": "string", "ability": "string?", "fear": "string?", "rule": "string",
    "traits": ["string"],                  // ≤3
    "agency": 0, "empathy": 0, "curiosity": 0,   // 0-100
    "sheet": {                             // CityCharacterSheet，可选
      "version": 1,
      "stats": { "stamina": 6, "agility": 6, "intellect": 6, "perception": 6, "charm": 6, "will": 6 },  // 6..16
      "skills": ["wayfinding|tracking|delivery|negotiation|plant-care|guarding|finding|endurance"],  // 枚举 CityCharacterSkillId，≤3
      "habit": "string", "weakness": "string"
    }
  },
  "memoryDigest": "string",                // ≤160
  "skills": [{                             // PocketBuddySkillBinding
    "skillId": "string", "skillVersion": "string",
    "state": "interested|learning|mastered|paused",
    "proficiency": 0, "confidence": 0,     // 0-100
    "learnedFromBuddyId": "string?",
    "permission": { "share": "private|friends|public", "tools": ["string"] },   // share 是可见性枚举，不是 boolean
    "evidenceRefs": ["string"],            // ≤40，存 health_event id
    "loadedAt": "ISO8601", "updatedAt": "ISO8601"
  }],
  "bonds": [{ "buddyId": "string", "strength": 0, "sharedMemoryIds": ["string"], "updatedAt": "ISO8601" }],  // sharedMemoryIds ≤40
  "status": "in-pocket|resident|visiting|resting",
  "privacy": "private|friends|public",
  "homeBloomId": "string?",
  "createdAt": "ISO8601", "updatedAt": "ISO8601"
}
```

### 3.3 `users/{uid}/buddies/{buddyId}/memories/{memoryId}` — PocketBuddyMemory

每只 Buddy 上限 **120 条**，超出时服务端按 `createdAt` 淘汰最旧的非 `origin` 记忆。

```jsonc
{
  "schema_version": 1,
  "id": "string",
  "kind": "origin|chat|camera|diary|city|skill|reflection",
  "speaker": "user|buddy|system",
  "content": "string",                     // ≤1200
  "visibility": "private|friends|public",
  "eventRefs": ["string"],                 // ≤16，health_event id
  "createdAt": "ISO8601"
}
```

### 3.4 `users/{uid}/health_events/{event_id}` — HealthEvent

来源：`frost-agent/taskmaster/contracts.ts`，字段原样保留（前端已定义完整，含幂等与同步语意）。

```jsonc
{
  "schema_version": 1,
  "protocol": "health_event/v1",
  "event_id": "string",                    // 客户端生成，幂等键
  "user_id": "string",                     // = uid，服务端强制覆盖
  "occurred_at": "ISO8601",
  "domain": "meal|workout|nature|skill|device",
  "type": "meal_confirmed|run_completed|nature_captured|skill_completed|device_state_changed",
  "source": { "device_id": "string", "provider": "string" },
  "facts": {},                             // 按 domain 的约定见下表
  "confidence": 0.0,                       // 0..1
  "provenance": { "model_version": "string", "tool_version": "string", "input_hash": "string" },
  "visibility": "private|friends|public",
  "media_ids": ["string"],                 // 新增：关联照片（§5），可空
  "sync": { "state": "synced", "revision": 1 },
  "supersedes_event_id": "string?"
}
```

**`facts` 按 domain 的必备字段**：

| domain/type | facts 关键字段 |
|---|---|
| meal / meal_confirmed | `calories_kcal, protein_g, carbs_g, fat_g, confirmed: boolean` |
| workout / run_completed | `distance_m, duration_s, steps?, route_points: [{latitude, longitude}]` |
| nature / nature_captured | `label: string`（confidence < 0.7 必须为 `"unknown"`；前端展示时可将 unknown 本地化为「待确认的自然时刻」等文案，存储值不变）、`candidates: [{label, confidence}]?` |
| skill / skill_completed | `session_id, skill_id, pose_confirmed?, duration_sec?, domain?, exercise_id?, exercise_name?, plan_id?, step_id?` |

### 3.5 `users/{uid}/run_sessions/{session_id}` — RunRouteSession

来源：`src/app/lib/runRouteSkill.ts`。**改动点**：新增 `schema_version` / `user_id` / `sync` 三个云端字段，其余原样保留。`session_id` 格式 `run-route:{ts36}:{uuid}`，客户端生成，PUT upsert。以下带 `?` 注记的字段与 TS 类型一致为可选：`start? start_source? destination? destination_label? error?` 及 `metrics` 中 `target_distance_m? pace_min_per_km? deviation_m?`。

```jsonc
{
  "schema_version": 1,
  "protocol": "pocket-run-route-session/v1",
  "session_id": "string",
  "user_id": "string",
  "input": {
    "activity": "running|walking",
    "start": "current_location",
    "goal": { "type": "distance", "distance_m": 0 },   // 或 duration / destination 变体
    "shape": "loop|one_way|out_and_back",
    "preferences": ["scenic|flat|low_crossings|lakeside|quiet"],
    "source": "user|agent|taskmaster",
    "source_task_id": "string?", "request_text": "string?"   // ≤240
  },
  "status": "created|locating|planning|ready|navigating|paused|off_route|completed|failed",
  "provider": "amap-jsapi-v2",
  "start": [116.4, 39.9], "start_source": "gps|sample",
  "destination": [116.4, 39.9], "destination_label": "string?",
  "planned_path": [[116.4, 39.9]],
  "actual_track": [{ "position": [116.4, 39.9], "accuracy_m": 10, "recorded_at": "ISO8601" }],  // ≤4999
  "metrics": { "target_distance_m": 0, "planned_distance_m": 0, "actual_distance_m": 0,
               "elapsed_s": 0, "pace_min_per_km": 0, "deviation_m": 0 },
  "warnings": ["string"], "error": "string?",
  "created_at": "ISO8601", "updated_at": "ISO8601",
  "sync": { "state": "synced", "revision": 1 }
}
```

> 注意文档大小：4999 个轨迹点 ≈ 400KB，在 1MB 限制内，可整篇存单文档，不拆分。

### 3.6 `users/{uid}/motion_sessions/{sessionId}` — HerMotionSkillSession

来源：`src/app/lib/health/herMotionSession.ts`（camelCase 是既有契约）。**改动点**：新增 `schema_version` / `user_id` / `sync` 三个云端字段。TS 中 `durationSec? confidence? domain? exerciseId? exerciseName? stopReason? healthEventId?` 皆可选，仅 `poseConfirmed` 必填。
**关于 `privacy: 'private-local'`**：该标注指摄像头画面与姿态帧永不离开设备——本实体只含会话元数据（时长、确认结果），允许上云；禁止上云的是长期记忆（见 §4）。

```jsonc
{
  "schema_version": 1,
  "protocol": "pocket-skill-session/v1",
  "sessionId": "string",
  "user_id": "string",
  "skillId": "pocket.her-motion", "skillName": "Her Motion",
  "status": "running|completed|cancelled",
  "startedAt": "ISO8601", "updatedAt": "ISO8601", "completedAt": "ISO8601?",
  "durationSec": 0, "domain": "string?",
  "exerciseId": "string?", "exerciseName": "string?",
  "poseConfirmed": false, "confidence": 0.0,
  "stopReason": "string?", "healthEventId": "string?",
  "source": "her-motion-local-vision", "privacy": "private-local",
  "planId": "string?", "stepId": "string?", "taskmasterTaskId": "string?",
  "events": [{ "type": "launched|opened|workout-started|pose-confirmed|completed|cancelled",
               "at": "ISO8601", "detail": "string" }],   // ≤30
  "sync": { "state": "synced", "revision": 1 }
}
```

### 3.7 `users/{uid}/trees/{tree_id}` — VirtualTree（新实体）

前端目前只有 tool 返回值没有存储，本版正式定义。虚拟树**必须**绑定真实运动证据，不代表现实植树。

```jsonc
{
  "schema_version": 1,
  "protocol": "pocket-virtual-tree/v1",
  "tree_id": "string",                     // 服务端生成 "tree_{uuid}"
  "user_id": "string",
  "species_label": "string",               // 展示用树种名，可为 "unknown"
  "source_event_ids": ["string"],          // ≥1，必须指向本人 run_completed / nature_captured 事件
  "planted_at": "ISO8601",
  "location": { "latitude": 0, "longitude": 0 },   // 可选，取运动终点
  "visibility": "private|friends|public",
  "note": "string?",                       // ≤240
  "created_at": "ISO8601"
}
```

### 3.8 `users/{uid}/daily_summaries/{YYYY-MM-DD}` — DailySummary

来源：`frost-agent/taskmaster/summary.ts` 的 `frost-daily-summary/v1`，原样保留。

```jsonc
{
  "schema_version": 1,
  "protocol": "frost-daily-summary/v1",
  "user_id": "string",
  "day": "YYYY-MM-DD",
  "meals": { "count": 0, "calories_kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0 },
  "workout": { "sessions": 0, "distance_m": 0, "duration_s": 0, "steps": 0 },
  "nature": [{ "label": "string", "confidence": 0.0, "event_id": "string" }],
  "next_action": "string",
  "source_event_ids": ["string"],
  "disclaimer": "string",
  "generated_at": "ISO8601"
}
```

### 3.9 `pet_jobs/{jobId}` — PetCutoutJob

来源：`src/app/lib/agent3d/petCutoutApi.ts`，契约保留，新增 `uid` 与 GCS 路径。产物为**临时私有**（30 分钟语意，实际由 TTL + tmp 桶 1 天生命周期兜底）。

```jsonc
{
  "schema_version": 1,
  "id": "pet-{uuid}",
  "uid": "string",
  "name": "string", "mode": "direct|mascot", "templateId": "string",
  "rig": {},                               // PetRigContract，透传
  "status": "queued|processing|ready|failed",
  "stage": "upload|stylize|remove-background|localize|complete|failed",
  "progress": 0,                           // 0-100
  "error": "string?",
  "files": { "source": "gs://...", "clean": "gs://...", "final": "gs://..." },  // 服务端内部用
  "asset": {                               // ready 时返回给前端（URL 为签名 URL）
    "id": "string", "name": "string", "mode": "direct|mascot", "templateId": "string", "rig": {},
    "sourceUrl": "string", "cleanUrl": "string", "finalUrl": "string",
    "stylizeProvider": "string", "removeBackgroundProvider": "string",
    "promptVersion": "string", "createdAt": "ISO8601"
  },
  "created_at": "ISO8601", "updated_at": "ISO8601",
  "expire_at": "ISO8601"                   // TTL：完成后 +24h（Firestore TTL 兜底）
}
```

> 与旧契约差异：**移除 `accessToken`**，改用 Firebase Auth 保护（job 只有 `uid` 本人可读）。
> **保留期语意**：对外承诺 `retentionMinutes: 30` = 产物签名 URL 30 分钟失效，且每小时清理任务删除完成超 30 分钟的 job 文件；`expire_at` +24h 与 tmp 桶 1 天生命周期仅为兜底，不是承诺值。

### 3.10 `cache_off/{barcode}` — OpenFoodFacts 缓存

```jsonc
{ "barcode": "string", "payload": { /* OpenFoodFactsProduct，见 API 文件 */ },
  "fetched_at": "ISO8601", "expire_at": "ISO8601" }   // TTL 7 天
```

### 3.11 `idempotency/{key}`

```jsonc
{ "key": "string", "uid": "string", "endpoint": "string",
  "response_status": 200, "response_body": {}, "created_at": "ISO8601", "expire_at": "ISO8601" }
```

### 3.12 `users/{uid}/media/{media_id}` — MediaObject（新实体）

记录上传状态与归属（对象本体在 GCS，见 §5）。`status: "pending"` 超过 24h 未 confirm 由 TTL 清除并删 GCS 对象。

```jsonc
{
  "schema_version": 1,
  "media_id": "m_{uuid}",
  "purpose": "buddy-portrait|meal-photo|nature-photo",
  "content_type": "image/jpeg|image/png|image/webp",
  "bytes": 0,                              // ≤ 12582912
  "status": "pending|confirmed",
  "gcs_path": "users/{uid}/{media_id}.{ext}",
  "thumbnail_path": "string?",             // 仅 buddy-portrait
  "created_at": "ISO8601", "confirmed_at": "ISO8601?",
  "expire_at": "ISO8601?"                  // 仅 pending 状态设置（+24h）
}
```

---

## 4. 明确不上云的数据（留在端侧）

| 数据 | 现状 | 原因 |
|---|---|---|
| FrostLongTermMemory 长期记忆 | IndexedDB `pe-frost-harness` | 标注 `privacy: 'private-local'`，产品约束禁止上云 |
| Profile 口味画像 / heartbeat / 睡眠日志 | localStorage | 敏感偏好，本期不同步 |
| Agent Session Log / Goal / Inbox / Approval | IndexedDB/内存 | 云端续跑不在本期范围 |
| Skill 注册表 / 设备自检 / 设备性能证据 | localStorage/IndexedDB | per-device 数据，无云端价值 |
| Plaza 世界草稿与硬编码目录 | localStorage/bundle | 社群功能不在本期范围 |

## 5. Cloud Storage 桶与路径

| 桶 | 用途 | 访问 | 生命周期 |
|---|---|---|---|
| `{project}-pb-media` | 用户长期媒体：Buddy 立绘/缩略图、餐食/自然照片 | 私有；一律经 `pocketbuddy-api` 签名 URL（读 15 分钟有效） | 永久 |
| `{project}-pb-tmp` | 抠图 pipeline 中间产物 | 私有 | 1 天自动删除 |
| `{project}-pb-models` | Gemma 微调权重 | 仅 LLM 服务 SA 可读 | 永久 |

**媒体对象路径约定**：`users/{uid}/{media_id}.{ext}`，`media_id = "m_{uuid}"`。上传经 `POST /v1/media/uploads` 换取签名上传 URL（见 API 文件）；上传状态与归属记录在 `users/{uid}/media/{media_id}`（§3.12），业务实体（buddy.visual、health_event.media_ids）只嵌 `media_id` 引用。

**缩略图**：Buddy 缩略图由后端在立绘上传确认时生成（sharp，180×180 webp q=0.82），路径 `users/{uid}/{media_id}_thumb.webp`。
