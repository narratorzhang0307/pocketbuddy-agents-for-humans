# Google 服务边界

版本：`pocket-buddy-google-service-boundaries/v1`（2026-08-31）

本文件回答一个交接时容易混淆的问题：哪些 Google 服务已经是比赛运行链路，哪些只是后续可替换的 provider，哪些产品能力继续保留现有实现。状态必须与 [`server/google-cloud-service-contracts.mjs`](../../server/google-cloud-service-contracts.mjs) 和 `/api/agentic-readiness` 一致；架构图不能把“计划”画成“已部署”。

## 当前比赛运行链路

| 能力 | 当前 provider | 状态 | 台湾部署人需要做什么 |
| --- | --- | --- | --- |
| Agent 决策模型 | Vertex AI Gemini 3.5 Flash，经 `@google/genai` | 已实现，比赛必需 | 启用 Vertex AI；Cloud Run 身份授予 `roles/aiplatform.user` |
| Web/API 运行 | Cloud Run | 已实现，比赛必需 | 部署 Git SHA 镜像并保留 `.run.app` URL 与 revision |
| 非敏感运行证据 | Firestore Native `frost_agent_runs` | 已实现，比赛必需 | 在 `asia-east1` 创建数据库；运行身份授予 `roles/datastore.user` |
| 构建与镜像 | Cloud Build + Artifact Registry | 已实现，部署必需 | 运行仓库脚本；不手工复制旧 `dist` 或容器 |

这四项构成可演示闭环：`Cloud Run → Prompt Harness → Gemini → Taskmaster/Skill → Cloud Logging + Firestore evidence`。

## 已定义边界、但比赛版不启用

| 能力 | 目标边界 | 当前结论 |
| --- | --- | --- |
| 用户图片、音频和任务产物 | 私有 GCS 对象；Firestore 只保存元数据和对象引用 | 路径构造器已测试；未提供匿名上传接口，也不授予 Storage Admin |
| Google Speech-to-Text | 将来只能放在服务端 adapter 后，并先完成同意、保留和删除策略 | 当前未启用；OJBadge 语音入口继续使用 iPhone 本地识别 |
| Google Cloud Text-to-Speech | 将来只能放在统一语音 adapter 后 | 当前未启用；不为了架构图替换已验证的手机/徽章反馈链路 |
| Firebase Cloud Messaging | 将来用于推送，不等同于通用短信服务 | 当前未启用；比赛 Taskmaster 主链不依赖通知 |
| Firebase Auth | 将来为用户云同步提供身份和 uid 边界 | 当前未启用，因此预留用户/GCS 路径不能公开写入 |

Google Cloud 没有一个可直接替代任意业务短信的通用 SMS 产品。Firebase Auth 的短信是登录验证，FCM 是 App 推送；两者都不能在文档或视频里描述成“Google 原生短信通知已完成”。

## 明确保留的产品能力

| 能力 | 当前 provider | 原因 |
| --- | --- | --- |
| 中国大陆地图、路线和真实 GPS 展示 | AMap Web JS API | 当前 iOS/Web 路线闭环已经验证；临近提交替换会破坏大陆可用性 |
| OJBadge 采音与反馈 | ESP32-S3 + iOS BLE bridge | 它是 Taskmaster 的输入/反馈设备，不是第二个自主控制器 |
| Photos、Her Motion、识鸟本地模型资产 | 浏览器/iOS 本地运行资产 | 它们是当前产品可复现构建的一部分，不因服务器已有副本就从源码仓库删除 |

AMap 是公开披露的第三方 provider，不冒充 Google Cloud。正式部署必须使用受最终域名限制的 Web key，并配置 service host 或 security code。

## 同仓修改门

新增或替换服务时必须在同一个分支/PR同时完成：

1. 更新本文件、当前 API 契约和数据边界；
2. 增加服务端 adapter，不允许前端直接携带云端密钥；
3. 更新 Prompt Harness profile、权限/同意/保留规则（适用时）；
4. 增加单元测试、readiness 状态和部署预检；
5. 用真实 Cloud Run revision、日志和数据证据验收后，才能把状态改成“已实现”。

任何缺少上述证据的能力都只能写“预留”或“未启用”。
