# 医院 Agent 接入记录

项目：桌面「谷歌大赛」；源码：`agents/hospital_agent_example`。

## 当前实现

- Agents → MY SKILLS 中，FITNESS AGENT 下方新增「医院 Agent」独立入口。
- 专页按需加载原示例的 `skills_index.json`，浏览 19 个科室、67 个疾病 Skill；未将完整治疗知识库放入首屏。
- 页面通过本项目的 `GET /api/hospital-agent/health` 检测指定医生服务，开发和生产共用同一个处理器。
- 未配置、认证失败、网络失败、异常响应均显示真实状态；没有假聊天、假评测或本地替代推理。
- 不自动上传病历、读取私人健康数据、运行训练、启动评测，也不部署或更改朋友的服务器。
- 暂未将医院诊疗注册为 Frost 可自动委派的能力；当前交付是独立入口、知识目录和服务连接检测。

## 核查结论（2026-08-27）

1. 原示例以 `hospital-agent-sdk==0.2.2` 的 `AgentBuilder(agent).start()` 启动。
2. SDK 实际提供 `GET /`（README）、`GET /health`（`{"status":"ok"}`）、`POST /test`（虚拟患者评测）；没有 `/chat`。
3. `/test` 不是问答接口：远端调用需要比赛授权，运行过程会获取虚拟患者、调用模型、提交结果并写日志。健康检查通过不能证明这些依赖可用。
4. 示例目录、根目录 `.env` / `.env.local` 与部署配置中均未发现朋友的医生 Agent 地址；本机 `127.0.0.1:7860` 未监听。
5. README 的 584 种标准疾病不等于已实现 584 个 Skill。Python 检索器实际加载 `data/skills/skills.json` 的 67 项，和页面索引一致。
6. SDK 的默认 `SERVICE_BASE_URL` 是比赛的患者/模型服务，不能当作朋友的医生 Agent 地址。

依据：[SDK 0.2.2 发布页](https://pypi.org/project/hospital-agent-sdk/0.2.2/)、对应 wheel 中的 `server.py` / `runtime.py` / `builder.py`，以及本地示例代码。

## 配置已有部署

先向部署者取得「医生 Agent」的根地址（可含反代路径前缀），以及部署网关是否需要 Bearer 认证。

在 Pocket Buddy 服务端配置：

```dotenv
HOSPITAL_AGENT_BASE_URL=
HOSPITAL_AGENT_API_TOKEN=
```

- 开发服务读取 `.env.local` / `.env`；生产 `server.mjs` 读取 `.env` 或进程环境。配置后重启对应服务。
- URL 不得包含用户名、密码、查询参数或片段。带令牌的远端连接必须使用 HTTPS。
- `HOSPITAL_AGENT_API_TOKEN` 仅用于部署网关认证，不是比赛的 `contestServiceToken`。如果没有网关认证则留空。
- 不加 `VITE_` 前缀；浏览器不能读取上游地址或凭据。用户输入不能更改代理目的地，代理不跟随重定向。
- 设置 `http://127.0.0.1:7860` 时指的是运行 Pocket Buddy Node 服务的主机，不是访问网页的手机。

配置后在页面点击「重新检测连接」，或访问本项目 `GET /api/hospital-agent/health`。
返回 `{"status":"reachable"}` 仅表示收到 SDK 约定的健康响应。

本次尚缺部署地址，因此未验证远端。若部署者另外实现了供用户对话的接口，还需要其接口文档、认证方式和会话协议，才能继续接入对话。不要把评测 `/test` 当成聊天接口。

## 验证命令

```bash
npm run typecheck
npm test -- server/hospital-agent.test.ts src/app/lib/health/hospitalAgent.test.ts src/app/components/HospitalAgentPage.test.ts
npm run build
```

本次结果：类型检查通过；59 项定向回归通过；排除模型 live 测试后，185 个测试文件 / 2088 项测试全部通过。
生产构建在 `/tmp/pocketbuddy-hospital-build-20260827` 隔离目录通过，未覆盖现有 `dist` 或 iOS 产物。
浏览器实测了入口、19 科室下拉切换、缺配置提示、连接重试、展开部署说明和返回 Agents，未发现控制台错误。
远端部署及真实评测尚未验证。
