# PocketBuddy API

Skill Taskmaster 的云端边界。当前只实现既有后端规范中的两个端点：

- `POST /v1/llm/generate`：经服务端调用 Gemma，客户端不持有模型密钥。
- `POST /v1/health-events:batchSync`：同步允许上云的 `skill_completed` 事实；Graph、Trace 和 Evidence 正文仍留在端侧。

## 本地联调

从仓库根目录执行：

```bash
npm install
npm --prefix backend install
PORT=4175 npm run dev
```

根脚本会同时启动：

- Web：`http://127.0.0.1:4175`
- API：`http://127.0.0.1:8787`

本地脚本显式开启 `ALLOW_DEV_AUTH=true`、内存事件仓库和确定性模型适配器。这三个开关都只允许在非生产环境使用；生产环境必须使用 Firebase ID Token、Firestore 和 Gemma 服务配置。

## 生产环境变量

| 变量 | 用途 |
|---|---|
| `NODE_ENV=production` | 强制生产认证和持久化路径 |
| `GEMMA_BASE_URL` | OpenAI-compatible Gemma 服务根地址 |
| `GEMMA_API_TOKEN` | 仅由 Cloud Run 读取的服务端密钥 |
| `GEMMA_MODEL` | 模型名，缺省为 `gemma-3-4b-pocketbuddy` |

Cloud Run 使用 Application Default Credentials 校验 Firebase Auth，并按用户 uid 写入 Firestore。`cloudbuild.yaml` 从 Secret Manager 注入 `GEMMA_API_TOKEN` 和 `GEMMA_BASE_URL`；不要把它们放入构建参数、Git 或前端环境变量。

## 质量门

```bash
npm --prefix backend run typecheck
npm --prefix backend test
npm --prefix backend run build
```

根目录的 `npm test`、`npm run typecheck` 和 `npm run build` 已包含后端校验。
