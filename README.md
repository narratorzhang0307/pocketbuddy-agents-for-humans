# Pocket Buddy

> 一个认识你的运动健康伙伴：记住今天，理解目标，把下一步交给合适的 Skill。

**稳定节点：[0828最终版](docs/technical/0828-FINAL-MILESTONE.md)** · 标签 [`v2026.08.28-final`](https://github.com/narratorzhang0307/pocketbuddy/tree/v2026.08.28-final) · 对应 TestFlight `0.1.0 (2026082828)`。用户已反馈真机实测满意；源码范围、校验记录与安全回退步骤见节点说明。

## All Things Agentic Hackathon 2026

本分支把 Frost Taskmaster 作为 **The Taskmaster** 赛道作品提交：`@google/genai` 驱动的 Gemini 3.5 负责受限任务决策，Cloud Run 承载 Agent API，Firestore 仅保存不含提示词和健康内容的运行证据元数据。设备端确定性控制面、确认门、超时和真实完成证据仍是最终执行边界。

地图层继续使用高德地图（AMap），因为它是产品在中国大陆场景中的成熟地图与路线展示能力；Google 技术栈负责 Agent 推理、云端运行与可审计证据，两者职责清晰、不相互冒充。

- [English submission overview](docs/competitions/all-things-agentic-2026/README.md)
- [Devpost submission copy](docs/competitions/all-things-agentic-2026/DEVPOST_SUBMISSION.md)
- [Cloud Run deployment](deploy/all-things-agentic/README.md)
- [当前统一后端与台湾部署交接入口](docs/backend/README.md)
- [Judge-facing demo page](public/agentic-demo.html)

Pocket Buddy 把餐食记录、运动训练、路线、自然观察和日常问答放进同一个长期陪伴角色 **Frost**。你可以在手机里打字，也可以通过电子吧唧说话；Frost 结合已授权的记忆理解目标，选择能力，把真实结果带回同一个会话。

个性化不只是换一份训练计划：不同用户可以装备不同 Skill，保留自己的目标、偏好和使用记录。模型负责理解与建议，Taskmaster 负责执行边界，手机和硬件承担真实的采集与交互。

本仓库是 **Pocket Buddy 当前产品工程**。根目录说明以这里为准；已有产品设计、当前实现和仍待验证的能力分别列出，不能把设计稿、页面跳转或编译成功当作真实任务完成。

## 阅读入口

- [产品文档与历史基线](docs/product/README.md)：找回的完整 Pocket Buddy 说明、原版产品文档与设计图。
- [当前系统架构](ARCHITECTURE.md)：Frost、Taskmaster、记忆、手机和硬件如何协作。
- [Frost Agent 技术说明](frost-agent/README.md)：统一对话入口、子 Agent、预算与安全边界。
- [Web 部署说明](deploy/pocketbuddy/README.md)：Pocket Buddy 独立构建和发布流程。
- [硬件工程](hardware/ojbadge-agent-link/README-OJBADGE.md) · [硬件专用分支](https://github.com/narratorzhang0307/pocketbuddy/tree/hardware/20260828)。

## 一天的使用体验

1. **记录今天**：在 Photos 选择餐食照片，观察菜品与热量估算；只有确认确实吃过，才写入今天的记忆。
2. **补全背景**：保存长期目标、偏好和健康限制；授权后读取手机今日步数，缺失信息保持“未知”。
3. **提出目标**：对 Frost 说“今天接下来适合吃什么？”或“今天还适合做什么运动？”。
4. **解释建议**：云端模型依据本次授权的摘要、事实来源和限制返回建议；参赛部署使用 Gemini 3.5，建议本身不代表训练已开始。
5. **调用能力**：明确要求“调用健身 Agent”或“调用女性运动 Agent”，进入相应训练入口，继续遵守相机权限和会话校验。
6. **回到同一份记忆**：已接通的餐食确认、训练完成和步数事件进入健康事实记录；下次建议使用更新后的状态。

这是产品闭环与当前源码的组织方式。首次系统授权、外部服务、真实设备连接及逐项验收仍是必要条件；不是所有第三方 Skill 都已接入账户或完成结果回传。

## 核心体验

### Photos：先观察，再确认记餐

左侧 Photos 的实际入口是 [FoodPhotosTab](src/app/components/FoodPhotosTab.tsx)。餐食观察通过服务端 Qwen 视觉、SAM 分割和质量校验形成候选；低置信度或分割失败会保留待复核状态，不把图片自动当成摄入事实。

菜名、份量和热量可以核对；热量是估算范围，不是称重结果。确认和撤回走健康事实边界。SAM 的权重、Python 环境与推理服务需要独立准备，见 [Photos Harness 部署](deploy/pocketbuddy/PHOTOS-HARNESS.md)。

### Frost：文字与硬件语音共用一个 Agent

手机对话与吧唧转写后的文字进入同一个 `sendFrostAgentMessage`，共用 Skill 选择、任务交接、回复和记忆，不是两套互不相通的聊天系统。

OJBadge 的 ESP32-S3 固件、iOS BLE 桥与 AgentLink 协议都在当前仓库。已经留存的真机证据包括实体键采音到手机的完整 PCM（39,360 采样、78,720 字节、2.46 秒、设备入队丢包 0）、触摸坐标、电量、屏幕头像和扬声器下行；当前源码的帧重组、ACK、上传 CRC、PTT 隐私门与 30 秒音频缓冲可用 `npm run hardware:check` 重验。详见 [OJBadge 当前真机记录](hardware/ojbadge-agent-link/README-OJBADGE.md)。

- 只读查询可以直接在会话回答，例如天气、食品参考、已记录的睡眠或训练摘要。
- 明确的能力调用可以自动交接到对应页面，手动“运行”保留为可见入口和回退。
- 多步骤、缺信息、敏感操作或未授权能力仍会询问、等待或停止，不无限自动执行。
- 模型返回的内容需要校验；生成了计划、进入 `waiting_external` 或出现硬件回执，都不等于任务完成。

### 练了吗与 Her Motion：两种运动能力

- **练了吗**：动作识别、训练计数和纠正，包含摄像头与上传视频入口；子应用位于 [lianlema-portable](lianlema-portable/app_project/README.md)。
- **Her Motion / 女性运动**：热身与动作观察；通过校验的新鲜 Frost 交接可以发起相机流程，首次系统权限仍由用户授予。
- 相机依赖前台、权限、设备和模型条件；普通页面访问、过期交接或拒绝授权不能静默启动采集。
- 两者的源码入口与自动化测试不代替真机摄像头、真实动作准确率或硬件播报验收。

### 今日记忆与长期信息

[今天记忆面板](src/app/components/HealthMemoryPanel.tsx) 展示当日已确认餐食、运动和手机步数，并允许撤回错误记录。

- 按用户所在时区汇总今天，保留事实来源、时间、估算标记和未知项。
- 建议上下文包含今日摘要、最近 28 天有记录的摘要及用户确认的长期目标、偏好、限制。
- 手机累计步数保留读取时间，不把未读取当成零，也不与跑步记录重复累加。
- 云端建议绑定记忆版本；记录变更后，旧建议不能直接当作新状态下的执行授权。
- 云端分析与硬件摘要显示有独立授权；不默认发送原图或完整医疗对话。

### Action Map 与自然观察

地图承载路线、位置、活动和自然时刻。识鸟、植物观察与虚拟种树是实际行动中的陪伴能力，不把模型猜测写成确定事实，也不把虚拟树宣称为现实植树。

GPS、麦克风、物种识别和各自的数据源都需要独立权限与验证；低置信度应返回未知或请求复核。

### 电子吧唧：轻交互入口

吧唧承担录音、屏幕角色、状态和声音交互；手机承担蓝牙桥接、本机转写、模型请求及需要相机的能力。硬件固件、iOS 桥接、App 适配和资源都在本仓库。

常规语音链路是：**按键录音 → BLE → iPhone 本机 ASR → Frost → 服务端选定模型 / 对应 Skill → 文字回复 → 按授权合成并播放语音**。MiniMax 用于已接入的语音回复路径，不代表全部提示音都要调用云 API。

**手机黑屏、后台持续会话和锁屏出声不能仅凭代码存在而承诺可用。** 应以对应安装包、系统状态和真实设备测试为准；本次文档恢复没有安装手机或刷写固件。

## Frost、Taskmaster 与 Skill Canvas

历史产品基线用“双 Taskmaster”区分目标调度和 Skill 图执行。这个设计完整保留在 [历史产品说明](docs/product/POCKET-BUDDY-OVERVIEW-2026-08-24.md)，但当前代码已经调整，不能把旧稿的全部运行时描述直接当成现状。

| 当前组件 | 职责 | 边界 |
| --- | --- | --- |
| Frost Agent / Harness | 理解目标、维持会话、处理追问、中断、等待与有限续行 | 模型提出候选，不直接写健康事实 |
| Taskmaster | 监督任务、子 Agent 委派、权限、确认、超时与结果 | 只使用登记的能力和固定工具 |
| Skill 子 Agent | 在独立任务上下文中准备交接或提出领域追问 | 不能任意换目标、派生无限 Agent 或直接控制设备 |
| Health Fact & Effect Boundary | 校验并幂等提交健康事实、事件和副作用 | 没有真实完成证据不能伪造完成记录 |
| Skill Canvas | 编排能力卡、编译、结构预览和保存 | 当前是创作/预览入口，不是自动执行引擎 |

当前 `frost-agent/skill-taskmaster/` 是兼容转发目录；Canvas 实现位于 `frost-agent/skill-canvas/`。详细执行状态与源码锚点见 [Frost 架构](frost-agent/ARCHITECTURE.md)。

### Skill 是能力合同，不只是一个按钮

Skill 描述身份、版本、输入输出、权限、数据范围、运行方式、错误和证据要求。设备型 Skill 可以调用可信原生能力；声明式流程描述能力组合；第三方 Web 沙箱是需要额外隔离和权限设计的产品方向，不能据此宣称已有完整 Skill 市场。

用户不需要理解内部模块名；Frost 应把“正在做什么、等什么、是否完成、能否停止”解释清楚。

## 技术组成与代码位置

| 部分 | 当前入口 |
| --- | --- |
| App 与三个主入口 | [src/app/App.tsx](src/app/App.tsx)、React / Vite |
| Frost 统一会话 | [frostAgentRuntime.ts](src/app/lib/frostAgentRuntime.ts)、[frostConversation.ts](src/app/lib/frostConversation.ts) |
| Agent 循环与子 Agent | [runtime](frost-agent/runtime/)、[subagents](frost-agent/subagents/)、[taskmaster](frost-agent/taskmaster/) |
| 今日记忆与健康事实 | [frostHealthMemory.ts](src/app/lib/frostHealthMemory.ts)、[Health Taskmaster](frost-agent/taskmaster/README.md) |
| Gemini Agent、Qwen 兼容能力、健康建议、语音与 Photos | [server](server/)、[server.mjs](server.mjs) |
| iOS 蓝牙与健康桥接 | [native/frost-badge](native/frost-badge/)、[native/frost-health](native/frost-health/) |
| OJBadge 固件 | [hardware/ojbadge-agent-link](hardware/ojbadge-agent-link/) |
| 训练子应用 | [lianlema-portable](lianlema-portable/)、[vendor/her-motion](vendor/her-motion/) |

Gemini、Qwen、SAM、MiniMax、地图和健康连接器各有配置与授权要求。仓库中保留的其他模型适配代码不等于当前手机已具备完整离线推理，也不改变 Pocket Buddy 的产品定位。

## 本地运行

建议使用 **Node.js 22+**；当前 iOS 准备脚本明确要求这一版本。先准备根目录依赖和本机配置：

```sh
cp .env.example .env.local
npm ci
npm run dev -- --host 127.0.0.1 --port 5174
```

打开 `http://127.0.0.1:5174/`。没有模型 Key 或某个外部服务时，相应功能会报缺配置或等待真实服务，不应使用模拟输出假装已接通。

- 地图前端配置按 [.env.example](.env.example) 设置，并限制域名与额度。
- Gemini / Qwen / MiniMax 的密钥只放服务端，不能加 `VITE_` 前缀进入浏览器包；Cloud Run 推荐使用服务账号连接 Vertex AI 与 Firestore。
- Python 服务、模型权重、健康连接器和原始音频不随源码自动安装。
- 练了吗源码引用的离线教练 MP3 已纳入该子应用的 `assets/audio/`；完整构建步骤见 [当前源码构建说明](docs/development/CURRENT-SOURCE-BUILD.md)。

### 构建与验证

```sh
npm run typecheck
npm test -- --maxWorkers=2
npm run build
npm run hardware:check
```

最后一条只构建主 Web 应用。需要完整训练页面时，先按 [部署说明](deploy/pocketbuddy/README.md) 安装练了吗子项目依赖、准备外部资源并重建子应用，再构建主包；不要把缺失的子应用或旧构建目录当成当前版本。

iOS 使用 `npm run ios:prepare`、`npm run ios:check` 和 `npm run ios:open`。准备脚本重建训练页并同步资源，签名和真机安装是后续步骤，不自动代表设备验收通过。

Web 发布只使用 [deploy/pocketbuddy](deploy/pocketbuddy/README.md) 的独立流程。构建成功、服务健康检查、手机安装、相机测试和锁屏语音是不同的验收层级。

## 隐私、健康与真实完成度

- 运动健康与“医院 Agent”入口提供辅助信息，不替代诊断、治疗或紧急服务。
- 健康记录保留来源和不确定性；未知不是零，建议不是事实，模型回复不是完成证据。
- 原图、录音、健康信息与精确位置按能力最小授权处理，敏感数据不会因为调用了 Skill 就自动获得公开发布权限。
- API 密钥、签名材料、依赖目录、模型权重、个人媒体与构建缓存不提交 Git。
- 第三方代码和模型按各自许可证使用；仓库快照不授予额外再分发权。
- 本 README 描述源码与产品边界，不为所有设备、账户连接器或无人值守后台运行作完成承诺。
