# 改了代码之后：如何测试并重新部署

适用范围：正式仓库 [`narratorzhang0307/pocketbuddy`](https://github.com/narratorzhang0307/pocketbuddy) 的 `main`，部署目标是 Cloud Run `frost-taskmaster-agent`（`asia-east1`）+ Firestore Native（`asia-east1`）+ Vertex AI Gemini（`global`）。

本页只讲“改完代码怎么验证、怎么发上去、发错了怎么退回”。首次交接、账号准备和参赛身份仍以 [`TAIWAN_GCP_HANDOFF.md`](TAIWAN_GCP_HANDOFF.md) 为准；服务边界以 [`GOOGLE_SERVICE_BOUNDARIES.md`](GOOGLE_SERVICE_BOUNDARIES.md) 为准。

## 0. 一次性准备（每台机器只做一次）

```sh
node --version          # 必须 22+
gcloud --version        # 没有就装 Google Cloud CLI
gcloud auth login
gcloud config set project pocketbuddy-01
```

## 1. 改代码的规则（这几条会被预检或 review 挡住）

1. 前端和后端在同一个仓库、同一个 PR 改。不要新建第二套后端，也不要用旧 `dist` 覆盖源码构建。
2. 新的模型任务：先在 `server/agent-prompt-harness.mjs` 增加或复用 profile，并在 `server/agent-prompt-harness.test.ts` 补测试。不要从前端塞任意 system prompt——客户端的 `system` 字段是不可信、低权威输入，覆盖不了服务端策略。
3. 新增云端字段或集合：先改 `CURRENT_DATA_BOUNDARIES.md` 和 `server/cloud-data-contracts.mjs`，再写读写代码。API 请求/响应字段同时更新 `CURRENT_API_CONTRACT.md`。
4. 用户健康数据、精确位置、原图、录音、长期记忆默认留在端侧。上云必须有明确产品授权和访问控制。
5. 密钥不进 `VITE_*`、不进 Git、不进视频画面。Cloud Run 只用服务账号访问 Vertex AI / Firestore。
6. 不要在部署机器上直接改 `main`。从当前 `main` 的 SHA 开 feature branch，合并后再从新的 `main` SHA 部署。

### 改 UI 文案时额外注意

- 界面文案是英文的（评审读英文）。改文案要同步改断言到它的测试文件，`npm test` 会立刻告诉你漏了哪个。
- 匹配**用户输入**的正则（中文意图识别、语音口令）要保持中文分支可用，新增英文时用“并列增加”而不是替换。跑步路线一条链的中英文解析都有测试覆盖，别只改一边。
- 匹配**高德返回数据**的正则（POI 类型、路口/转向文本）必须保持中文——那是高德的数据，不是用户输入。

## 2. 本地验证（每次改完都要全跑一遍）

```sh
npm ci
npm run typecheck
npm test -- --maxWorkers=2
npm run build
npm run agentic:check
npm run hardware:check
```

六个全绿才继续。`npm run agentic:check` 输出的 JSON 末尾必须是 `"passed": true`。

只想快速看某一块，可以先跑单个文件再跑全量，但**不要用单文件通过代替全量通过**——文案改动经常打断看起来无关的测试：

```sh
npx vitest run src/app/lib/runRouteSkill.test.ts
```

## 3. 只读云端预检

```sh
export GOOGLE_CLOUD_PROJECT='pocketbuddy-01'
export GOOGLE_CLOUD_REGION='asia-east1'
export GOOGLE_CLOUD_LOCATION='global'
export FROST_FIRESTORE_LOCATION='asia-east1'
export VITE_AMAP_KEY='你的高德 Web JS key'
export VITE_AMAP_SECURITY_JSCODE='你的高德安全密钥'   # 或改用 VITE_AMAP_SERVICE_HOST

npm run agentic:preflight
```

必须看到 `"passed": true`。它不创建资源、不打印 key。两个常见提示不算失败：

- `Required Google APIs` 显示 `warn`：部署脚本会自己启用。
- `Firestore permanent location` 显示 `warn` 且写着 database absent：部署脚本会创建。**如果它显示 `fail` 且提示 location 不一致，停下来**——Firestore 的 location 建库后不能改，先确认是不是换错了项目。

在 feature branch 上跑，`Deployment branch` 和 `Canonical main upstream` 会是 `warn`，不阻塞；正式部署要在合并后的 `main` 上跑，那时它们必须 `pass`。

## 4. 部署

```sh
./deploy/all-things-agentic/deploy.sh
```

脚本按顺序做：预检 → 启用 API → 建 Artifact Registry → 建 `frost-agentic-run` 服务账号并只授予 `roles/aiplatform.user` + `roles/datastore.user` → 缺失时建 Firestore Native → Cloud Build 构建带 commit SHA 的不可变镜像 → 部署 Cloud Run → 打印 URL。

镜像 tag 是 `git rev-parse --short=12 HEAD`。**没提交的改动不会进镜像**，构建的是当前 commit。部署前先确认 `git status --short` 是空的。

想只看构建日志：

```sh
gcloud builds list --project pocketbuddy-01 --limit 5 \
  --format='table(id,status,createTime,substitutions._IMAGE)'
gcloud builds log <BUILD_ID> --project pocketbuddy-01
```

## 5. 部署后验收（六项，缺一不可）

```sh
export FROST_CLOUD_RUN_URL='https://frost-taskmaster-agent-1000610846732.asia-east1.run.app'
curl -fsS "$FROST_CLOUD_RUN_URL/api/agentic-readiness"
```

1. **readiness**：`ok:true`、`ready:true`，`agent` 为 `gemini-3.5-flash` / `vertex-ai` / `@google/genai`，`cloudRun.revision` 是你刚部署的那个，`firestore` 为 `enabled:true, required:true`，`promptHarness` 为 v1 且 `serverOwned:true`，`mapProvider:"amap"`，`services.protocol` 为 `pocket-buddy-google-service-boundaries/v1`，`services.reserved` 全部保持 `status:"not-enabled"`。
2. **真实一次 Agent 调用**，拿到 traceId：

```sh
curl -sS -X POST "$FROST_CLOUD_RUN_URL/api/frost-llm" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Plan a 5 km running route, scenic, few crossings","task":"taskmaster"}' \
  -D - | tail -20
```

回复必须是英文，`evidence.status` 必须是 `stored`，响应头 `x-frost-trace-id` 和 body 的 `traceId` 必须一致。

3. **Cloud Logging 同一个 traceId**：

服务端用 `console.log(JSON.stringify(...))` 输出，Cloud Run 会把它解析成结构化日志，所以它在 `jsonPayload` 里，**不在 `textPayload`**。按字段查，不要 grep 文本：

```sh
gcloud logging read \
  'resource.labels.service_name="frost-taskmaster-agent" AND jsonPayload.event="frost.agent.completed"' \
  --project pocketbuddy-01 --limit 5 \
  --format='value(jsonPayload.traceId,jsonPayload.evidence,jsonPayload.model,jsonPayload.latencyMs)'
```

`evidence` 必须是 `stored`，`traceId` 必须和上一步一致。（用 `--format='value(textPayload)'` 只会得到空行——那是请求日志，不是应用日志。）

4. **Firestore 同一个 traceId 的文档**，并确认里面只有执行元数据、没有 prompt、回复、健康内容或位置：

```sh
TOK=$(gcloud auth print-access-token)
curl -sS -H "Authorization: Bearer $TOK" \
  "https://firestore.googleapis.com/v1/projects/pocketbuddy-01/databases/(default)/documents/frost_agent_runs/<traceId>"
```

5. **正式 UI 走一次路线工作流**：打开 Cloud Run URL → 输入 `Plan a running route around West Lake` 或 `Plan a 5 km running route, scenic, few crossings` → 看到 Taskmaster 追问或选择路线 Skill → 高德打开实际路线 → 记录页面 trace ID。
6. **记录部署状态**：

```sh
gcloud run services describe frost-taskmaster-agent \
  --project pocketbuddy-01 --region asia-east1 \
  --format='yaml(status.url,status.latestReadyRevisionName,spec.template.spec.serviceAccountName)'
```

`serviceAccountName` 必须是 `frost-agentic-run@pocketbuddy-01.iam.gserviceaccount.com`，不能是默认 Compute 服务账号。

## 6. 回滚

Cloud Run 保留所有 revision，回滚不需要重新构建：

```sh
gcloud run revisions list --service frost-taskmaster-agent \
  --project pocketbuddy-01 --region asia-east1 \
  --format='table(name,status.conditions[0].status,creationTimestamp)'

gcloud run services update-traffic frost-taskmaster-agent \
  --project pocketbuddy-01 --region asia-east1 \
  --to-revisions <上一个正常的 REVISION>=100
```

回滚后重新跑第 5 节的验收。确认稳定再修代码；**不要为了录视频关掉 `FROST_FIRESTORE_REQUIRED`**——那样模型成功、证据失败也会被当成成功，正好破坏这次比赛要证明的东西。

## 7. 故障处理顺序

| 现象 | 先做什么 |
| --- | --- |
| 预检 `billing disabled` | 去 Cloud Console 绑定 billing，不要绕过 |
| 预检 Firestore location mismatch | 停止。不要删库，先确认是不是换了项目 |
| Cloud Build 报 `Could not resolve ./scripts/...` 或 `ENOENT ... native/frost-badge/ios/...` | `.gcloudignore` / `.dockerignore` 里有人加了不带前导斜杠的目录名（`ios`、`hardware`、`android`、`dist`…），它会匹配任意层级并吃掉构建输入。改成 `/ios/` 这种锚定写法 |
| Cloud Build 报 gzip CRC / `Unexpected EOF in archive` | 源码包上传坏了，重新 `gcloud builds submit` |
| Vertex AI 403 | 核对 revision 的服务账号有 `roles/aiplatform.user` |
| Firestore 403 | 核对 `roles/datastore.user`。不要改成 Owner 当长期方案 |
| 模型成功但 `evidence` 不是 `stored` | 生产会直接返回错误。先修 Firestore，不要关掉 required |
| readiness 里 revision 不是新的 | 确认访问的是新 `.run.app` URL，不是本地或旧主机 |
| 高德白屏 | 把最终 Cloud Run origin 加进高德 key 的域名限制，核对 service host / security code |
| Agent 回复语言不对 | 语言由服务端 `agent-prompt-harness.mjs` 决定，默认 `en`；客户端 `locale` 只接受 `en` / `zh-CN` / `zh-TW`，其他值一律回落 `en` |

## 8. 已知平台行为（不是 bug，别去修）

在 `*.run.app` 默认域名上，精确路径 `/healthz` 会被 Google Frontend 拦截并返回 Google 自己的 404 页面，请求根本到不了容器。容器内的 `HEALTHCHECK` 走 `localhost`，不受影响。**验收请用 `/api/agentic-readiness`**，不要因为这个 404 去改健康检查代码。绑定自定义域名后 `/healthz` 可正常访问。
