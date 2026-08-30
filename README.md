# 项目体验地址

## [https://pocket-buddy.throughtheglass.art/](https://pocket-buddy.throughtheglass.art/)

> Pocket Buddy 浏览器 Demo。首次加载地图和 3D 素材可能稍慢；定位、摄像头按需授权。原生能力与实体徽章体验需要对应设备。

---

# Pocket Buddy · She Nicest Fission

> 把陪伴装进口袋，让每一步都有回应。

本仓库是 **2026 烈变黑客松的独立源码交付仓库**：[`narratorzhang0307/Pocket-Buddy`](https://github.com/narratorzhang0307/Pocket-Buddy)，Topic 为 `shenicest-fission`。它与不带短横线的旧仓库 `pocketbuddy` 相互独立。

- **[参赛项目文档](docs/competitions/shenicest-2026/PROJECT.md)**：项目背景、目标用户、作品与玩法、技术栈、创新点、开发过程、后续计划；团队分工留空。
- **[源码交付与验证记录](docs/competitions/shenicest-2026/VERIFICATION.md)**：本次快照范围、排除项和实际验证结果。
- **[从当前源码构建](docs/development/CURRENT-SOURCE-BUILD.md)**：主应用、练了吗和 Her Motion 的构建步骤。

本次保留现有产品与有效文档，从当前工作区创建新的源码快照，不导入旧 Git 历史。项目已有赛前基础；新仓库的创建时间不代表全部功能均在赛期内开发。赛道、命题、赛期增量和二次开发申报须以团队正式确认为准。

Pocket Buddy 是一个把 AI 伙伴、城市探索、轻量养成和运动健康连接起来的随身陪伴应用。Photos 记录饮食，Earth 承载城市探索与伙伴养成，Agents 提供 Frost 与专业 Skill；可选的电子徽章让同一个伙伴通过按键、圆屏和声音陪伴用户。

<p align="center">
  <img src="docs/assets/readme/pocket-buddy-presentation/physical-agent-overview.jpg" alt="Pocket Buddy 实体 Agent 总览：圆屏、麦克风、扬声器、按键、触摸与 BLE" width="100%">
</p>

> README 中的产品图选自《口袋搭子 · Pocket Buddy》演示稿；当前功能完成度与验证边界仍以本文和源码记录为准。

## 1. 项目背景

日常生活中，运动、饮食记录、路线规划和兴趣探索往往分散在不同应用里。用户需要反复解释自己的目标，也需要靠意志力不断回到枯燥的记录页面。另一类 AI 应用能给出很多建议，却不一定能把建议接到一个具体、可执行的动作上。

Pocket Buddy 从两个问题出发：

1. 能否用一个持续陪伴的角色，把“记录—理解—行动—反馈”连接起来？
2. 能否让一段普通的散步，变成和伙伴一起探索、收集与留下记忆的过程？

我们的设计选择是：由 Frost 承接交流和上下文，由地图与专业 Skill 承接行动，由明确的事件与用户确认记录结果。可爱的角色负责降低开始行动的门槛，真实的数据边界负责避免过度承诺。

## 2. 目标用户

以下是产品定位与待验证的用户假设，不代表已经完成大规模用户调研。

| 目标用户 | 典型需求 | Pocket Buddy 的对应体验 |
| --- | --- | --- |
| 久坐、想增加日常活动的城市用户 | 很难开始复杂训练，希望先动起来 | 带伙伴散步、地图探索、虚拟种植和轻量反馈 |
| 独自运动、需要鼓励与记录的人 | 希望有人理解目标，并把建议变成行动 | Frost 对话、健康记忆、训练与路线 Skill |
| 喜欢宠物、自然和轻量养成的用户 | 希望日常路线有更多发现与情感联系 | 3D 同行伙伴、种子与植物收藏、自然观察入口 |
| 想减少运动中操作手机的人 | 希望通过简单语音获得回应 | 可选的电子徽章按键输入和状态反馈 |

典型场景是下班后的一次短途散步：用户打开 Earth，选择同行角色，开始地图探索，在喜欢的位置种下一株虚拟植物；结束后再与 Frost 交流今天的运动或饮食。具备相应权限、设备与服务时，也可以从对话进入训练页面，或通过徽章发起语音交互。

![跟着 Frost 过一天：早餐、训练、跑步、识鸟与回顾](docs/assets/readme/pocket-buddy-presentation/a-day-with-frost.jpg)

## 3. 技术栈

| 层次 | 主要技术 | 在作品中的职责 |
| --- | --- | --- |
| 主应用 | React 18、TypeScript、Vite 6、Tailwind CSS | 三个主要入口、伙伴界面、状态与交互 |
| 地图与角色 | 地图适配层、Mapbox GL / 高德接入、Three.js、GLB | 城市地图、角色动画、行走与虚拟种植 |
| 原生能力 | Capacitor 8、Swift、CoreBluetooth 等 iOS 能力 | 原生桥接、权限、徽章通信与手机侧能力 |
| 对话与任务 | Frost Agent Runtime、工具注册表、Taskmaster、隔离的 Skill 执行上下文 | 连续对话、任务交接、取消、审批、结果追踪 |
| 服务端 | Node.js 服务与代理、Qwen / DashScope、MiniMax 语音接口 | 云端推理、图像理解和语音生成，密钥保留在服务端 |
| 训练子应用 | React Native / Expo、Her Motion、MediaPipe | 训练页面、相机交互、姿态相关能力 |
| 独立分析服务 | Python / FastAPI、姿态与动作分析模型、SAM 相关服务 | 为配置完备的图像和运动链路提供实际推理 |
| 数据与记忆 | IndexedDB、localStorage、健康事件与幂等提交 | 会话、本机种植记录、已确认的餐食与运动事实 |
| 徽章固件 | ESP-IDF、C/C++、LVGL、BLE | 圆屏显示、实体按键、音频与状态通信 |
| 验证 | TypeScript 检查、Vitest、Node 测试、资源与原生打包校验脚本 | 检查逻辑、素材一致性和构建边界 |

系统的核心关系是：**用户提出请求 → Frost 读取被授权的上下文 → 运行时选择已注册能力 → 页面、服务或设备产生结果 → 结果经过校验或用户确认 → 更新记忆与界面。**

Skill Canvas 已有画布编辑、校验、编译预览和本机草稿能力，但完整的自定义流程执行尚不能作为本次已完成功能。历史文档中的旧后端或完整双层任务图设计，不自动等于当前版本已经运行。

## 4. 创新点

### 4.1 把陪伴接到具体行动上

Frost 不只回答问题，还能把明确请求交给地图、训练和饮食等入口。陪伴角色、动作入口与结果记录使用一套连续的交互逻辑，减少用户在不同页面重复解释自己的成本。

### 4.2 用城市探索承接日常习惯

地图是可以和伙伴一起活动的空间。种子、植物、角色动画和地点记忆把重复路线变成可回访的轻量游戏内容，让“出门走一走”获得更直接的视觉与情感反馈。

### 4.3 手机与小型硬件共享同一个角色

电子徽章不是另开一个聊天入口，而是把同一 Frost 会话延伸到实体按键、圆屏和声音。它探索了运动、散步等不方便持续触屏的场景，也保留了明确的开始、停止和权限边界。

![同一枚 Pocket Buddy 徽章组合动作训练、女性运动、自然发现与 Skill Canvas](docs/assets/readme/pocket-buddy-presentation/one-badge-multiple-skills.jpg)

### 4.4 将“模型建议”与“真实发生”分开

项目显式区分候选识别、用户确认、页面打开、任务执行和实际完成：餐食候选需要确认，地图就绪不等于 GPS 就绪，蓝牙 ACK 不等于真人听到声音。这种设计让 AI 陪伴能够保持亲切，同时对行动结果负责。

以上是本作品的设计组合与工程特点，不作“全球首创”或未经对比验证的性能领先声明。

## 5. 团队分工

| 成员 | 负责内容 | 具体贡献 |
| --- | --- | --- |
|  |  |  |
|  |  |  |
|  |  |  |

## 6. 开发过程

本节按当前代码与现有开发记录梳理实现过程，不把整个项目描述为从比赛开始后才开发。

1. **建立城市探索基础。** 实现地图、角色配置与加载、同行动画、种子进度、种植和本机持久化，为中间 Earth 页面建立可交互的空间。
2. **形成统一伙伴入口。** 将文字对话、任务运行、Skill 注册、等待与取消、结果消息整合进 Frost；把页面和设备回执接入同一会话边界。
3. **连接运动健康场景。** 将 Photos 收敛到餐食记录，引入用户确认和份量修改；整合练了吗与 Her Motion，建立当天记录、长期目标和健康上下文之间的联系。
4. **扩展到手机与徽章。** 加入 Capacitor 原生桥接、实体按键音频链路、角色显示、语音反馈和真实定位语音交互；对断连、重复输入和取消作单独处理。
5. **收敛素材与发布流程。** 统一鸟类素材清单、保留已确认的画布样式和品牌图标，增加资源指纹、打包内容和源码一致性检查，避免新源码配旧资源。
6. **整理本次参赛交付。** 从当前工作区建立独立源码快照，撰写本文件，排除私人记录与凭据；初始源码快照的测试和构建结果见[验证记录](docs/competitions/shenicest-2026/VERIFICATION.md)，不沿用历史结果冒充本次验证。

### 赛前基础与赛期新增的说明

Pocket Buddy 已有比赛前的产品、源码和开发记录。新的 GitHub 仓库以及本次初始提交时间，不代表其中所有代码的最初创作时间。

正式提交前，团队应按赛事要求列明已有模块、赛期新增功能、改动文件或提交，以及第三方素材与开源组件来源；如需二次开发申报，应据实填写。本文不代填尚未确认的赛期增量，不把已有项目包装成全新开发。

## 7. 后续计划

以下是计划，不属于本次已实现能力。

| 阶段 | 计划 | 完成判断 |
| --- | --- | --- |
| 近期：完成可复验的参赛演示 | 固定演示设备与流程；补齐图片、视频、命题选择、二次开发说明和真机记录；明确演示数值 | 评审能沿同一操作顺序复现，失败或权限拒绝时也有清楚反馈 |
| 下一阶段：强化真实行动闭环 | 分离游戏演示进度与实测运动数据；完善定位漂移处理、数据来源展示和重复事件处理 | 每条运动或种植记录能说明来源、时间与是否为演示数据 |
| 下一阶段：完善硬件体验 | 设备配对与归属校验、访问控制、断连恢复、长时间音频和后台稳定性测试 | 指定硬件和手机组合通过逐项验收，而不只依赖编译成功 |
| 后续：开放可组合能力 | 在已有画布编辑基础上接入受控的真实 Skill Graph 执行；完善执行证据与停止机制 | 自定义流程能明确完成、等待、失败或取消，不把预览当作运行 |
| 后续：验证用户价值 | 小范围邀请目标用户体验，观察开始活动、持续使用、理解数据与权限的情况 | 获得真实用户反馈后再调整玩法强度、内容节奏和陪伴方式 |
| 后续：探索共享与创作 | 在授权和内容治理前提下，评估跨设备同步、可分享的地点记忆与角色制作流程 | 隐私、素材权利和账号边界明确后再开放，不直接公开现有本机记录 |

## 工程与使用说明

<details>
<summary>展开查看功能细节、代码导航、运行方式与隐私说明</summary>

## 当前产品说明

> 一个认识你的运动健康伙伴：记住今天，理解目标，把下一步交给合适的 Skill。

**既有产品的历史稳定节点：[0828最终版](docs/technical/0828-FINAL-MILESTONE.md)** · 旧仓库标签 [`v2026.08.28-final`](https://github.com/narratorzhang0307/pocketbuddy/tree/v2026.08.28-final) · 记录中的 TestFlight 为 `0.1.0 (2026082828)`。该记录不是本次新仓库提交的重新装机验收；本次检查见上方验证记录。

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

![AgentLink 将按键、触摸、麦克风、圆屏、扬声器和电量能力交给 Agent](docs/assets/readme/pocket-buddy-presentation/agentlink-hardware-capabilities.jpg)

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

</details>
