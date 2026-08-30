# 台湾 Google Cloud 部署交接清单

交接目标：由台湾团队成员使用自己的 Google Cloud 账号部署正式 `main`，不共享 Google 密码、不传 service-account JSON key、不修改业务代码。默认选择 Cloud Run 与 Firestore 的 `asia-east1`（台湾）区域；Gemini 通过 Vertex AI `global` endpoint 调用。

唯一源码来源：[`https://github.com/narratorzhang0307/pocketbuddy`](https://github.com/narratorzhang0307/pocketbuddy) 的 `main`。不要从 `Pocket-Buddy`、`Pocket-Earth-Google` 或本机旧工作区复制文件；预检会验证正式 `main` 的 upstream。

## 当前落实状态

| 朋友建议 | 当前落实 | 她这次需要做什么 |
| --- | --- | --- |
| 前后端在同一仓库统一修改 | 已落实：React/iOS、`server.mjs`、`server/`、Docker、部署和文档都在正式仓库 | 只拉正式 `main`，不要另建后端仓库 |
| 后端直接上 GCP serverless | 已落实：单一 Cloud Run 容器和 Cloud Build | 用自己的 GCP 项目运行预检和部署脚本 |
| Prompt Harness 统一逻辑 | 已落实：服务端策略、profile、预算、JSON 校验、非敏感 provenance | 不从前端新增任意 system prompt；新任务必须同 PR 改 profile 与测试 |
| Firestore 结构化数据 | 已落实比赛运行证据；完整用户集合有合同但未启用 | 创建 Firestore Native；验证同 trace ID 证据 |
| GCS 二进制媒体 | 路径构造器和测试已落实；匿名媒体 API 未启用 | 本次不建桶、不授予 Storage role；等 Firebase 身份、同意和删除策略完成后另开 PR |
| TTS / STT / 通知改成 Google 服务 | 本次不迁移：已验证链路使用 iPhone 本地 ASR、现有语音与设备反馈 | 不增加新服务；先保证 Taskmaster + OJBadge 演示稳定 |
| 地图改 Google 服务 | 不采纳：大陆产品继续使用成熟的 AMap | 配置受最终域名限制的 AMap key |

这个边界不是少做：比赛主链需要证明 Cloud Run → Prompt Harness → Gemini → Taskmaster → Firestore。把尚无身份/同意/删除链路的原图、录音临时上传到 GCS，反而会扩大风险且不增加 Taskmaster 证明力。

## A. 先确认参赛身份

- 如果朋友参与部署、架构或代码修改，最稳妥的做法是把她添加为 Devpost Project Team 成员；官方规则要求所有团队成员都是 eligible individuals，并全部出现在 Devpost 项目中。
- 台湾参赛者须年满 20 岁。团队指定一名 Representative 负责提交和可能的奖金材料。
- 普通提交阶段不要求在仓库上传护照。若获奖，Google / Devpost 可能另行要求身份、资格、税务或付款资料；只通过官方渠道提交，绝不能进 Git。
- 确认团队拥有提交代码、图片、音乐、模型和演示数据的必要权利。参考仓库只用于架构研究，没有复制其代码。

## B. 她需要准备

1. Google Cloud 项目，已绑定 Billing Account。
2. 本机 Node.js 22+、Git、Google Cloud CLI。
3. 对项目具备启用 API、创建 Artifact Registry、Cloud Build、Cloud Run、service account、IAM 与 Firestore 的权限。若她是新项目 Owner，已具备；部署后运行身份只保留脚本授予的两个最小角色。
4. 正式 AMap Web JS key，限制到最终 `.run.app` / 自定义域名；优先准备 AMap service host，来不及才使用 security JSCODE。
5. Devpost、GitHub、YouTube 或 Vimeo 账号。

不要准备或传递：个人 Google 密码、OAuth refresh token、service-account JSON key、`.env.local`、护照扫描件、真实健康记录、家庭精确位置。

## C. 从正式源码开始

```sh
git clone https://github.com/narratorzhang0307/pocketbuddy.git
cd pocketbuddy
git checkout main
git pull --ff-only
git status --short
npm ci
```

`git status --short` 必须为空。记录部署提交：

```sh
git rev-parse HEAD
```

同时确认唯一 upstream：

```sh
git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}'
git remote get-url origin
```

应分别看到 `origin/main` 和 `https://github.com/narratorzhang0307/pocketbuddy.git`（SSH URL 也可以，但仓库 owner/name 必须相同）。

## D. 登录与环境变量

```sh
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

export GOOGLE_CLOUD_PROJECT='YOUR_PROJECT_ID'
export GOOGLE_CLOUD_REGION='asia-east1'
export GOOGLE_CLOUD_LOCATION='global'
export FROST_FIRESTORE_LOCATION='asia-east1'
export VITE_AMAP_KEY='YOUR_HOST_RESTRICTED_AMAP_WEB_KEY'
export VITE_AMAP_SERVICE_HOST='https://YOUR_FINAL_HOST/_AMapService'
```

如果暂时没有代理 host：

```sh
unset VITE_AMAP_SERVICE_HOST
export VITE_AMAP_SECURITY_JSCODE='YOUR_AMAP_SECURITY_JSCODE'
```

Firestore 的 location 创建后不能直接更换。预检会在已有数据库位置与请求位置不一致时停止。

## E. 五分钟只读预检

```sh
npm run agentic:preflight
```

它不会创建资源，且不会打印 key。必须看到 `"passed": true`。它检查：

- Node、正式 GitHub remote、干净提交和当前分支
- GCP 项目访问、active account、billing
- Cloud Run / Firestore 区域
- AMap key 与保护方式（只显示 configured）
- 所需 API；未启用只提示，因为部署脚本会启用
- 当前 `main` 的 upstream 确实是正式 `narratorzhang0307/pocketbuddy/main`

## F. 本地回归与部署

```sh
npm run typecheck
npm test -- --maxWorkers=2
npm run build
npm run agentic:check
npm run hardware:check
./deploy/all-things-agentic/deploy.sh
```

脚本会启用 API、创建 Artifact Registry、创建专用 `frost-agentic-run` service account、创建 Firestore Native database（不存在时）、Cloud Build 构建不可变 Git SHA image，并部署公开 Cloud Run 服务。运行账号只有：

- `roles/aiplatform.user`
- `roles/datastore.user`

生产环境设置 `FROST_FIRESTORE_REQUIRED=true`，因此 Firestore 证据写入失败会使 Agent 调用失败，不会假装证据已经保存。

## G. 部署后验收

保存脚本最后打印的 URL：

```sh
export FROST_CLOUD_RUN_URL='https://YOUR_SERVICE.run.app'
curl -fsS "$FROST_CLOUD_RUN_URL/healthz"
curl -fsS "$FROST_CLOUD_RUN_URL/api/agentic-readiness"
```

readiness 必须包含：Gemini 3.5 Flash、`@google/genai`、Cloud Run service/revision、Firestore enabled + required、Prompt Harness v1、`mapProvider: amap`。

然后在正式 UI 完成一次路线工作流：

1. 输入一个具体目标。
2. 看到 Taskmaster 选择、追问或调用真实 route Skill。
3. 看到 AMap 打开实际路线。
4. 记录响应的 `x-frost-trace-id` 或页面 trace ID。
5. Cloud Logging 找到同 ID 的 `frost.agent.completed`。
6. Firestore `frost_agent_runs/{traceId}` 找到同 ID 文档，确认没有 prompt、回复、健康内容或位置。

记录部署状态：

```sh
gcloud run services describe frost-taskmaster-agent \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --region "$GOOGLE_CLOUD_REGION" \
  --format='yaml(status.url,status.latestReadyRevisionName,spec.template.spec.serviceAccountName)'
```

## H. 交回给提交代表的材料

- Cloud Run URL、active revision、GCP project ID（不是密码）
- 部署 Git commit SHA、Artifact Registry image tag
- `/healthz` 与 `/api/agentic-readiness` 截图/JSON
- 一条 Cloud Logging trace 截图
- 同 traceId 的 Firestore 文档截图
- AMap 路线工作截图
- 本地 typecheck/test/build/agentic check 通过记录
- 她的 Devpost member 状态，以及是否由她担任 Representative

提交代表再完成：公开仓库链接、架构图、英文文案、公开 YouTube/Vimeo 视频、hosted URL、第三方数据源和既有代码披露。

Photos 的 Qwen + SAM 服务不是本次 Gemini/Cloud Run/Firestore 主链的部署前提。只有在 `/api/photos-harness/health` 为 ready、且一张真实餐食图完成识别和人工确认后，才把 Photos 放进比赛视频；否则主视频坚持路线 Taskmaster + OJBadge，不把示例预览当识别结果。

GCS 也不是本次部署前提。当前代码只提供经过测试的用户媒体和临时任务对象路径，不提供匿名 signed-upload API；她不应临时给公开 Cloud Run 运行账号增加 `roles/storage.admin` 或把 bucket 设为公开。

## I. 故障处理顺序

1. 预检 `billing disabled`：先在 Cloud Console 绑定 billing，不要绕过。
2. Firestore location mismatch：停止；不要删除现有数据库，先确认是否换新项目。
3. Vertex AI 403：核对 Cloud Run revision 的 service account 与 `roles/aiplatform.user`。
4. Firestore 403：核对 `roles/datastore.user`，不要改成 Owner 作为长期方案。
5. AMap 白屏：把最终 Cloud Run origin 加入 AMap key 限制，核对 service host / security code。
6. readiness 不显示 Cloud Run revision：确认访问的是新 `.run.app` URL，不是本地或旧主机。
7. 模型成功但证据失败：生产会返回错误；先修 Firestore，不要关闭 `FROST_FIRESTORE_REQUIRED` 录视频。
