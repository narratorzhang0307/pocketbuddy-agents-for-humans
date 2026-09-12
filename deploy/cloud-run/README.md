# Google Cloud Run 综合部署：技能画布 + 五项运动

把比赛仓库 [`narratorzhang0307/pocketbuddy-agents-for-humans`](https://github.com/narratorzhang0307/pocketbuddy-agents-for-humans) 的最新 `main` **整包重新构建并更新同一个 Google Cloud Run 服务**。推送 GitHub 本身不会更新线上服务。使用仓库根目录 `Dockerfile`；无需为画布另建服务，也不要用运动目录的独立 Python Dockerfile 替代整个应用。

## 整包范围

| 部分 | 发布内容 | 运行位置 |
| --- | --- | --- |
| 主应用与 Frost | 页面、Skill 名称和头像、运动启动和结果回传、`server.mjs`、`/api/frost-llm` | 浏览器 + Cloud Run |
| 技能画布 | 线稿界面、八种能力、编译/运行/停止、相机骨骼观察、模型建议、系统语音、草稿和证据 | 设备操作在浏览器，复用 Frost 模型接口 |
| 新增五项运动 | Badminton、Basketball、Football、Volleyball、Jump Rope，共 23 个可选动作及英文反馈 | 浏览器 MediaPipe → 同源 Node API → Python 规则 |
| 运动依赖 | Python 虚拟环境、NumPy、PyYAML、五套规则、YAML 配置、英文映射 | 全部装入同一个运行镜像 |
| 原有陪练页面 | 从当前源码重建 Her Motion 和“练了吗”，保留入口 | 页面随镜像；旧模型服务沿用原部署，见下文 |

新增运动接口只接收 COCO-17 坐标、尺寸和时间戳，原始视频留在浏览器。画布只有在用户允许模型处理后才把简短观察交给 Frost。选定动作的规则反馈不等同于任意动作自动分类。

## 已有 Cloud Run 服务：直接更新

部署者需要 Git、Node.js 22+、已登录的 Google Cloud CLI，以及现有项目的 Cloud Build、Artifact Registry、Cloud Run 和运行身份使用权限。使用朋友正在维护的项目、区域、服务名和镜像仓库，保留正式域名。

```bash
git clone https://github.com/narratorzhang0307/pocketbuddy-agents-for-humans.git
cd pocketbuddy-agents-for-humans
git switch main
git pull --ff-only origin main
npm ci
gcloud auth login

# 将所有占位值替换为朋友正在使用的实际配置。
export GOOGLE_CLOUD_PROJECT='现有项目ID'
export GOOGLE_CLOUD_REGION='asia-east1'
export FROST_CLOUD_RUN_SERVICE='现有Cloud Run服务名'
export FROST_ARTIFACT_REPOSITORY='现有镜像仓库名'
export VITE_AMAP_KEY='限制到正式域名的高德Web JS key'
export VITE_AMAP_SERVICE_HOST='已配置的高德代理地址'
# 没有代理时改用 VITE_AMAP_SECURITY_JSCODE，不要保留示例代理地址。

bash deploy/cloud-run/update.sh
```

脚本确认干净的 `main` 与 GitHub 最新提交一致，以完整 commit SHA 标记镜像，在 Cloud Build 中执行 `npm run build:web`，然后更新已有服务。保留原模型选择、模型密钥绑定、运行 service account、Firestore、访问权限及扩缩容设置。容器规格更新为 **2 CPU / 2 GiB / 并发 8 / 请求超时 300 秒 / 端口 8080**，后续按负载调整。每实例最多同时执行两个运动规则请求，忙时返回 429，不表示动作已完成。

容器变量明确设置 `SPORTS_COACH_PYTHON=/opt/sports-venv/bin/python`、`API_HOST=0.0.0.0`、`API_PORT=8080`、`TRUST_PROXY=true`、`FROST_PET_API_ENABLED=false` 和 `HEALTH_SKILL_LOCAL_BRIDGE=false`，与轻量云端运行包一致；宠物 API 和桌面健康桥接不属于此服务范围。

启动探针访问 `/api/sports-coach/health`，实际加载 Python 和规则；Docker 的 `HEALTHCHECK` 不能代替 Cloud Run 探针配置。更新使用 `--update-env-vars`，保留其他变量及 Secret Manager 绑定。[Google 环境变量文档](https://docs.cloud.google.com/run/docs/configuring/services/environment-variables)、[启动探针文档](https://docs.cloud.google.com/run/docs/configuring/healthchecks)。

## 首次部署

仍从上面的比赛仓库 `main` 开始。填写真实配置后，可使用现有 [Google 初始化部署说明](../all-things-agentic/README.md)：

```bash
export GOOGLE_CLOUD_LOCATION='global'
export FROST_FIRESTORE_LOCATION="$GOOGLE_CLOUD_REGION"
bash deploy/all-things-agentic/deploy.sh
```

初始化脚本创建公开 Cloud Run 服务、Artifact Registry、运行身份及缺失的 Firestore Native 数据库，配置 Gemini / Vertex AI 和 Firestore 运行证据。项目须启用结算，部署者须有启用 API、创建资源和授权的权限。Firestore 位置创建后不能直接更换，已有数据库必须填写实际位置。已有服务之后只用 `update.sh`，不要用初始化脚本重设已有的 Qwen 或其他模型配置。

## 模型、设备和数据配置

- **画布与 Frost 共用模型**：`/api/frost-llm` 必须能真实返回。已有 Qwen 就保留 `FROST_AGENT_PROVIDER=qwen`、Secret Manager 中的 `DASHSCOPE_API_KEY`、匹配 key 区域的 `DASHSCOPE_BASE_URL` 和 `QWEN_MODEL`；已有 Gemini 就保留相应 Gemini / Vertex AI 配置和运行身份。部署到 Cloud Run 不要求此次切换模型。
- **密钥只在服务端**：Vertex AI 使用运行身份；API key 使用 Cloud Run 的 Secret Manager 绑定。不要传给 `VITE_*`、Docker build args 或提交 `.env.local`；本机 `.env.local` 不进入构建上传包。
- **地图配置在构建时生效**：重建需提供现有高德 Web key 和代理/security code，并把正式访问域名加入限制。它属于浏览器配置，不能与服务端模型密钥混用。
- **草稿和记录在当前浏览器**：画布使用 localStorage / IndexedDB，换域名或设备不会自动同步。健康摘要与模型组合还需开启已有“云端建议”许可。Cloud Run 的 Firestore 模型运行元数据是另一条记录链路。
- **摄像头在访问者设备上**：必须用 HTTPS，首次仍需系统授权；后续启动遵循用户选择的复用许可及浏览器限制。停止、离开页面、画布观察结束会关闭相机。系统语音可能要求一次用户交互。

### 原有瑜伽与“练了吗”的边界

本次补齐两个子页面的源码构建；**旧分类模型服务没有被新增五运动规则替代**。Her Motion 旧分类接口当前转发到 `127.0.0.1:8765`；“练了吗”使用独立模型 API。仅启动本次容器不能证明这两个旧模型服务可用，原部署见 [deploy/pocketbuddy](../pocketbuddy/README.md)。

`POCKET_BUDDY_PUBLIC_ORIGIN` 是“练了吗”现有 HTTPS 模型网关来源，其 API 位于该来源的 `/lianlema/api/`，默认沿用代码原有的 `https://pocketbuddy.throughtheglass.art`。如果朋友维护了其他网关，更新前导出该变量；跨域时网关也要允许新前端来源。不要填尚未提供这套旧 API 的 Cloud Run 域名。这不影响技能画布和五项新增运动的同源链路。

## 发布后验收

核对脚本输出的 `latestReadyRevisionName` 和 `status.traffic`。如果流量固定到旧 revision，确认新 revision 就绪后切到它：

```bash
gcloud run services update-traffic "$FROST_CLOUD_RUN_SERVICE" \
  --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --to-latest

export FROST_CLOUD_RUN_URL="$(gcloud run services describe "$FROST_CLOUD_RUN_SERVICE" \
  --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format='value(status.url)')"
node deploy/cloud-run/verify.mjs --url "$FROST_CLOUD_RUN_URL" --model

python3 -m venv /tmp/pocketbuddy-cloud-verify
/tmp/pocketbuddy-cloud-verify/bin/pip install -r vendor/sports-coach/deployment/requirements.txt
/tmp/pocketbuddy-cloud-verify/bin/python vendor/sports-coach/deployment/verify_app.py --url "$FROST_CLOUD_RUN_URL"
```

第一个检查线上画布源码指纹、实际 JS/素材哈希、MediaPipe 模型与两套 WASM、主服务、运动 Python、两个旧子页面，以及 **一次真实模型请求**（使用模型额度；开启 Firestore 时也要求证据实际写入）。第二个用合成坐标检查全部 23 个动作的英文响应和人体缺失拦截。HTTP 200 的静态页面不能代替正确 API JSON 或画布分包。

服务若限制 IAM 访问，保留权限；可运行 `gcloud run services proxy "$FROST_CLOUD_RUN_SERVICE" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --port 8090`，另开终端把检查 URL 改为 `http://127.0.0.1:8090`。浏览器交互仍需在实际可访问的 HTTPS 域名验收。

浏览器还需验证：

1. Agents → Skill Canvas，选择“骨骼识别 → Frost 建议 → 语音 → 证据”模板，编译执行。授权后保持全身可见，确认真实观察、Frost 回答、播报与完成记录；保存并刷新后草稿仍在。
2. 拒绝相机、画面没有完整人体、停止或退出画布时，不得继续显示成功或写完成记录，相机应关闭。包含健康摘要的流程另查云端建议许可。
3. 五种新增运动各选一个动作，确认骨骼显示、正式域名的模型/WASM 加载、分析 API、英文反馈，以及向主体 Frost 回传结果。
4. 从主体 Frost 发起运动，核对首次授权、用户允许后的再次启动、停止与相机释放。系统撤销权限后仍应重新提示。

运动 503 查 Python 路径/依赖/规则；模型 503 查 provider 和凭据，403 查身份权限，429 查额度或并发；白屏或旧画布查 revision 流量、构建提交和缓存。

## 回滚与交回材料

更新脚本先打印原有流量分配。需要回滚时恢复之前记录的 revision；原来分流则恢复原比例：

```bash
gcloud run services update-traffic "$FROST_CLOUD_RUN_SERVICE" \
  --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" \
  --to-revisions '此前确认可用的REVISION=100'
```

交回：正式 URL、Git commit SHA、Cloud Run revision、两份自动验收结果、相机/停止/保存的浏览器验收结果。**完成线上步骤才算部署验收通过；本仓库的配置和本地测试不表示朋友的项目已自动更新。**

## 本次本地验证（2026-09-12）

完整 `npm run build:web`、TypeScript、识鸟/画布/Frost Skills 构建校验通过。画布、运动接口与部署脚本相关 58 项测试通过；Python 适配器 10 项测试通过。针对生产模式 Node 服务，已实际检查 65 个 JS 分包、16 个画布素材、MediaPipe 模型/WASM、两个旧子页面，成功调用 Qwen，并通过全部 23 个动作的合成坐标 API 检查及人体缺失拦截。部署脚本测试使用假的 Git/gcloud 执行器，不会操作云项目。

本机没有可运行的 Docker / Google Cloud CLI，因此没有在本机完成 Linux 镜像构建或朋友项目的线上部署。Cloud Build 会执行根 Dockerfile，并在运行镜像中再次运行 Python 适配器测试；最终仍以部署者交回的云端结果为准。上述检查也不替代真实摄像头、旧瑜伽/练了吗模型服务或 iOS 的单独验收。
