# OJBadge 实体键 → iPhone → Frost：真人语音验收

## 23:20 删除三种律动、默认松手自动发送：Web 构建完成，待安装手机

- 用户最新截图明确显示“自动发送未开启”，录音 56,320 字节已完整收到。此截图能确认该次没有启用自动识别发送，不能据此说麦克风或蓝牙没有收到录音。
- 按用户要求删除三种律动的面板、自动协调器、下载/传输模块及 iOS 下载扩展；解除教练音频对律动暂停器的依赖，保留练了吗原始教练 PCM、女性运动系统语音和原录音链。没有删除远端 OSS 资源或刷写固件。兼容旧固件：连接后收到 motion 能力时仅发送一次停止命令，不上传、不播放、不自动重试；停止失败不切断录音或 ASR。
- 自动识别发送现在是默认开启的持久偏好，界面绑定偏好而非瞬时连接状态。手动关闭会记住；后台/断连只暂停处理，前台连接恢复后重新待命，无需重勾。仍仅处理实际观察到新按键开始、完整传输、无丢包且非静音的录音。
- 不重发启动前、断连前、后台中或中途开启时的旧录音，不重放延迟 ASR 结果。ASR 仍由 iPhone 本机完成，文字仍经同一 `sendFrostAgentMessage`；没有新增服务器、模型调用或应用内权限确认。
- 28 文件 355 项离线回归及 TypeScript 通过，包括既有全部 Skill 导航。实际浏览器挂载原 FrostBadgePanel：默认勾选、关闭后刷新保留、再开启后刷新保留，律动区域不存在。浏览器无硬件；所有模型/语音测试使用替身，付费 API 调用 0。
- 独立 iOS Web 构建成功，1,682 个输入构建前后哈希未变，984 个公共资源与源码一致。产物：`~/.local/share/pocketbuddy-esp/voice-default-no-motion-20260827/web/`；入口 SHA-256 `c471827f514f29ae0da96a92f2ec489702ee870f5c30028c35eff1a02d0e99c7`。构建包中已无律动下载/同步代码和文案。
- **尚未安装到手机、没有部署服务器、没有刷写吧唧。** `/Volumes` 仅 Macintosh HD，外接 Extreme SSD/PocketBuddy-iOS-Dev 未挂载，Xcode/devicectl 不可用。Xcode 工程 plist 检查通过；CLT Swift 解析受环境的 SwiftBridging 重复模块错误阻断，完整原生构建待 Xcode 恢复。不能把 Web 构建或离线测试描述为手机已更新、真实语音已验收。

## 22:55 全部 Skill 页面路由修复：电脑构建完成，尚未安装手机

- 按用户扩大范围的要求，检查全部 16 个内置 Skill，而非只测试女性运动与练了吗。自动前置与手动打开现在共用 `skillRoutes.ts` 的真实页面表，不再另维护只有五项的自动跳转名单。补回跑步决策教练、耐力校验、Garmin、Strava 四个已有运行页的入口；不新增或冒充连接器服务。
- 明确的“打开 / 调用 / 调取 / 进入某 Skill”经同一 Frost 会话与原目录生成页面交接，不再为打开页面额外调用云端子 Agent。补齐健康同步、中国健康库、动作信号等界面名称；输入原文不改写。具体任务、追问、复合请求及权限门保持原流程。
- 内置 Skill 若在手机持久目录保留旧版 `earth` 地址，路由读取当前包的内置页面地址；不清除数据、不更改已安装权限、不重启用停用项，也不改第三方显式安装的入口。未知入口或未装备能力会明确显示原因，不再静默消费并退回主页。
- 动作信号继续复用真实 Her Motion 运行页，并保留 `frost-motion-vision` 原始交接。跑步路线的“打开页面”先进入规划表单；用户随后主动开始路线时仍使用原行动地图，不删除正常导航功能。
- 26 文件、320 项相关离线测试及 TypeScript 通过。覆盖全部 16 Skill 的手机文字/吧唧文字两种入口、UI 名称、旧地址兼容、停用状态、未知入口，以及原语音/音频与 iOS 启动回归。所有模型与语音测试均用替身，没有付费 API 调用。
- 独立本机浏览器实际挂载 Plaza→MusicAgentsTab→各功能页，逐项核对 16 个入口；额外在原 Frost 输入框真实键入“打开健康同步”并发送，确认进入 Apple Health 页面。未知入口显示错误及返回 Frost 按钮。练了吗外层是真实组件，内层用无相机 fixture 验证 `frostAutoStart=1`；Her Motion 显示真实动作页面，未开启电脑摄像头。这些不是手机物理语音验收，也不代表连接器后端已配置。
- 独立 iOS Web 构建成功，构建前后 1,684 个输入哈希一致。资源冻结在 `~/.local/share/pocketbuddy-esp/all-skill-routing-20260827/web/`。本阶段**没有安装手机、没有发布服务器、没有刷写吧唧**；不能说用户手机已获得本节修复。
- 用户随后反馈刚才语音能打开运动页面，现在又不行。已暂停生产源码修改和设备升级，保留现有手机版本。只读 USB 仍看到 iPhone，但 Extreme SSD / PocketBuddy-iOS-Dev 卷不在，`xcrun devicectl` 无法使用，因此未取得当前版本/连接/录音/ASR 的新设备证据。已请求本次失败后展开吧唧面板的截图。现有实现退后台或断连会关闭自动发送，这是待核实的可能原因，不是已确认根因。

## 21:35 v13 已实装：明确健身打开指令直接进入训练页

- 用户 21:23 截图仍停在 MY SKILLS，因此 v12 未通过自动打开训练页验收。读取手机实际事件：21:22:38 主 Frost 已收到新的 `badge_voice` 文本，选中 `lianlema-coach`，但云端子 Agent 准备约 45 秒后失败；第二次输入得到追问。不能把这两次描述成蓝牙录音未送达。
- 修复了真实 UI 路由缺项：`resolveSkillRunTarget('frost')` 原返回 null，导致前置对话的请求被消费后只显示 Skills 列表。现在它可进入原 Frost 对话。
- 根据用户随后明确要求，打开已装备健身工作区的指令不再先展示列表或对话。手机打字与 ASR 仍共用 `sendFrostAgentMessage` 和原 Skill 目录；支持“调用下”等口语及句首语气词，不依赖英文 Agent 后缀识别准确。主 Frost 直接返回页面交接，不多调用一次云端子 Agent 准备；收到真实计划后自动进入训练页，沿用已有相机同意和系统授权。否定、疑问、复合任务及指定训练量仍走原任务流程，不自动扩大权限。
- 新的明确打开指令不再被当作旧子 Agent 追问的答案。原转录保留，不重放旧录音，不确认旧 Taskmaster 任务；页面打开不伪装成动作训练已完成。
- 16 文件、197 项离线回归及 TypeScript 通过；新增用例先在旧代码失败。独立浏览器测试实际挂载 PlazaTab→MusicAgentsTab→页面组件，确认 Frost 路由能显示对话；明确健身指令的导航记录只有 `lianlema-coach`，训练 iframe 收到 `frostAutoStart=1`。浏览器使用离线训练页握手 fixture，禁止全部 POST，**没有使用相机，不是硬件端到端验收**。
- Web 构建前后 653 个源码输入哈希一致。只更新已冻结 v12 副本的 Web 资源与版本号，沿用既有原生二进制、签名身份和权限；12 个真实 GLB、64 段原始教练 PCM 保留，严格签名验证通过，没有刷写吧唧或发布服务器。
- `PocketBuddy-VoiceDirect-20260827-v13.app` 安装命令成功，随后实际手机查询确认 Build 13、PID 2892，进程路径与本一致；已收到插件注册与 WebView 加载。入口 SHA-256：`6a7b5c2732724383ccb4fd24235e642d68b1f5fc982f054ad4625c8c835dc809`。安装后外接 Extreme SSD 断开，`/Volumes/PocketBuddy-iOS-Dev` 不再可访问，不能重新读取其安装 JSON；本自有盘上的安装后设备信息与进程查询仍保存于私有证据目录。
- 当前服务器训练页 HTML 与本源码一致，SHA-256 为 `47b8f30515d5ce7394b4cedf986f1840acbce5866500d5331f90c2ac44715744`，引用 `index-64d8d7cc1f4c0a7671f9bf088952e066.js`，本地对应脚本保留自动启动与页面握手。首次远端 JS 下载发生网络超时，未把半份脚本算作校验成功。**新版真人语音→训练页→相机/首帧仍待验收。**
- 本轮付费 API 测试 0 次。私有阶段记录、安装后查询与验证结果：`~/.local/share/pocketbuddy-esp/voice-direct-20260827/`。继续实时调试需重新接回存放 Xcode 的外接盘；手机已安装的 App 不依赖该盘运行。

## 21:16 v12 已安装：读取实际执行记录后区分路由错误与蓝牙错误

- 手机重新连接后，只读复制原 Frost IndexedDB；按 WebKit v15 格式完整解码 336 条记录，无解码失败。仅将该轮阶段、工具与状态写入私有诊断摘要，没有重发旧语音或调用模型。
- 主会话 20:50:26 的事件 183 确认为 `user.message`、`input_channel=badge_voice`；随后调用 `frost.task_delegate`，子 Agent 返回 `waiting_external`。但宿主把该输入路由成 `start_workout` / 热身 600 秒，20:50:37 又调用 `taskmaster.start_intent`，返回 `taskmaster_waiting_confirmation`，最终事件 195 为 `waiting_user`。因此原问题不是“音频没有到手机”或“文字未进 Frost”，而是打开页面的请求进入了训练任务确认流程；不能用之前的控制回执超时解释它。
- 已核对并保留现有页面打开修复；本窗口新增的控制回执分类、采音期间避免额外状态同步，以及新硬件输入自动显示原 Frost 对话，也均包含在签名 v12 中。原文本保留在同一 Frost 输入事件中，不创建另一套语音 Agent、不自动重放旧任务。App 前台收到新输入后先显示 Frost；只有真实返回的可导航计划才打开对应能力。
- `PocketBuddy-HerMotion-20260827-v12.app` 严格签名校验通过；相关七个编译模块与本轮独立测试构建在去除依赖文件名哈希后完全一致。原 12 个真实 GLB、64 段教练 PCM 保留，主 API 仍为 `https://pocketbuddy.throughtheglass.art`。没有重写或重新部署后端，也没有刷写硬件。
- 21:16 覆盖安装成功，随后实际读取手机安装信息为 Build 12；运行进程 PID 2734 的路径与安装回执一致，启动实收 `FrostBadge registered: true` 和 `WebView loaded`。入口 SHA-256：`1ef4bd6bab00d24f90d57abd52e439b4877edc4d204d3d36f7388d67638ec508`。安装记录：`/Volumes/PocketBuddy-iOS-Dev/DeviceInstall-VoiceCommandDiagnostic-20260827-v12.json`。
- 本轮重跑 7 文件 100 项离线测试通过。**新版本的真人按键→ASR→Frost→自动打开训练页仍待用户操作验证**；安装和启动不算该链路验收。调试不调用 MiniMax、云 ASR 或收费模型，不修改旧确认状态。私有元数据：`~/.local/share/pocketbuddy-esp/voice-command-diagnostic-20260827/`。

## 20:45–20:50 现场反馈：控制回执与 Agent 执行须分开

- 20:45 用户截图：129,280 字节、约 4 秒、丢包 0、完整性校验通过；自动语音关闭。这只确认采音传输，不确认 ASR 或 Agent 已执行。
- 20:50 新截图：自动语音已开，收到另一段 100,480 字节、约 3.1 秒、校验通过；已显示本机转录和「Frost 正在处理」，主会话为 `running`。因此本次已经进入主 Frost 输入流程，不能继续解释成未勾选开关。具体转录原文只在用户截图及手机中核对，不写入本记录。
- 旧「吧唧命令响应超时」来自手机 `FrostBadgeClient.command` 等待硬件控制回执的 8 秒计时器，不是 Frost HTTP 超时。它没有记录操作名称，不能只凭该红字断言当时究竟是哪条控制指令丢失。固件控制回执发送未做拥塞重试，录音同时的额外画面同步是需要规避的干扰源；尚无本次串口证据证明具体丢失原因。
- 只读服务器访问日志：20:50:32 与 20:50:36 的 `/api/frost-llm` 返回 HTTP 200，20:50:37 的 `/api/edge` 返回 200。未发起新的推理/语音请求。访问日志无该录音的关联 ID，也不包含模型响应体，不能据此宣布任务完成。
- 本轮源码修复（**尚未安装手机**）：控制超时注明实际操作和手机→硬件方向；画面同步错误独立呈现、不覆盖主 Agent 错误，成功同步清除对应旧提示；录音及尾包接收期间不发额外画面状态同步；自动发送关闭时明确提示下一段才生效。保持录音、ASR 和原 Frost 入口不变，不自动重放旧输入。
- 主 Frost 收到新的 `badge_voice` 用户输入事件后自动显示原 Frost 对话，之后只依据真实 Agent 返回的计划进入子 Agent；这一界面步骤不解析关键词、不替换转录、不再调用一次模型。保留前台限制、事件去重及原任务权限流程。
- 7 文件、100 项离线回归与 TypeScript 通过；包括控制回执失败不丢录音、自动语音仍进同一 Frost、录音/尾包不抢发状态、先显示 Frost 再打开实际返回的能力。没有现场真人语音与自动导航的新验收结果。
- 读取手机 Frost 执行日志时设备连接中断，CoreDevice 返回 1011 / unavailable；未重启、重装、刷写或占用 BLE。必须在接回手机后读取该轮记录，区分模型追问、任务等待、错误与导航问题，不能仅靠离线用例宣称已定位所有原因。

## 自动进入训练与记住同意：v10 实装后核对当前 v11（20:43）

- 20:37 已覆盖安装 `PocketBuddy-FitnessAutoStart-20260827-v10.app`，安装 JSON outcome 为 success；随后设备被另一安装覆盖为 `PocketBuddy-HerMotion-20260827-v11.app`（Build 11）。最终读取手机安装信息及进程，确认当前运行 v11，而非把启动日志误认为 v10。没有反复覆盖安装，没有刷写吧唧。
- 已核对 v11 签名、实际安装记录和冻结包：LianlemaSkillPage、frostBadge、frostCompanion、frostAgentNavigation、frostAgentRuntime、frostAgentPresentation 六个模块，去掉依赖文件名哈希差异后与本轮测试的 v10 相同；训练页与本轮线上发布的 HTML 一致，64 段 PCM 未变。v11 没有显式注入 API 环境变量，但内置默认值仍是 `https://pocketbuddy.throughtheglass.art`；保留全 App 前台的吧唧语音导航及伴随运行时。没有联系其他 Codex 任务。
- 新鲜的明确 Frost 健身交接带 `frostAutoStart=1`，模型服务就绪后跳过 GO；普通菜单访问、旧任务、页面刷新不会自动重复启动同一相机任务。
- 首次明确同意当前分析服务器并获得相机权限后，本机记住该同意与训练动作；后续调用默认沿用上次动作，明确指定动作则按指令选择。旧版本没有保存此记录，因此升级后可能仍需再同意一次。OS 权限撤销、存储不可用或更换分析端点时不会假定已经获准。
- 暂停、结束、退到后台和退出训练停止摄像头及发送；前台恢复不自动恢复拍摄。未完成的旧开场或旧帧响应不能在新一轮训练里重放。页面保留清除已记住授权的入口。
- 保留 v9 的 64 段教练原声和吧唧专用播放通道，不调用付费语音 API，不改原服务器动作模型。服务器只发布训练页静态补丁；补丁与回滚备份在 `/root/pocketbuddy/shared/static-patches/20260827-fitness-autostart-v1/`。
- 18 文件、201 项离线测试及两端 TypeScript、Expo 导出、签名构建通过；第二次构建期间 841 个输入哈希一致，原 12 个 GLB 和 64 段 PCM 保留。第一次候选因构建期间输入变化而弃用，没有安装。
- 当前 v11 App 入口 SHA-256：`f4bb6c0190f0b1c66e1f99c3cc421a0e01a76970356968fe6930ccd2382f47fb`（v10 为 `9b991dd1f8fa3994472b94ee84c17dc63e6de51c943996aed724e5fe87c271d0`）；线上训练页 HTML：`79e23d3651e10233950dcecc50aea3a8169d3836e754b07553c4da240caa5b78`，JS：`1762d400661428f2e2f4cdb70fc76be7b1b0a6385ed6cd2d10daae2c160604fe`，均已回读校验。
- **仍待用户现场测试**：按实体键说「调用健身agent」→完整录音→本机 ASR→同一 Frost→训练页→实际相机 ready/首帧分析，以及第二次打开无需再次点击应用内授权。未用注入文字或合成数据冒充硬件收音。
- 私有证据：`~/.local/share/pocketbuddy-esp/fitness-autostart-20260827/verification.json`。日志仅保留字节数、阶段和语音键，不保存原始录音、转录或画面。

## v8 实装：健身服务入口与 iPhone 输入聚焦修复（19:49）

- 当前新包为 `PocketBuddy-FitnessFocus-20260827-v8.app`，Build 8。同一 Bundle ID 保留数据覆盖安装，CoreDevice 安装记录 `DeviceInstall-FitnessFocus-20260827-v8.json` 的 outcome 为 success；启动实收 `FrostBadge registered: true`、`WebView loaded`。v7 只是中间构建，没有安装。
- 「帮我调用健身agent」共用手机与吧唧语音原 Frost 入口，目标改为服务器已部署的「练了吗」`https://pocketbuddy.throughtheglass.art/lianlema/`。不把请求页面的日志当作实际页面 ready；后者须由原 `pocket-lianlema/v1` iframe 握手确认。
- Frost 主输入框原为 10px，语音输入框原为 12–14px；主输入框改为 16px，页面内文字输入、草稿、访问码、选择框设置 `max(16px, 1rem)`，不改变复选框，不禁止手势缩放。没有加入强行复位 viewport 或键盘时操纵页面比例的脚本。
- 实际本地构建页面在 Chromium 的 320px、430px 宽度下，输入聚焦前后页面均无横向撑大，visualViewport scale 为 1，文字输入计算字号为 16px；430×500 可用视口下输入框下边界为 385px。此检查不是 iPhone WKWebView 真机键盘验收。
- 13 文件、155 项离线回归及 TypeScript、签名构建通过；构建前后 649 个源码/配置（包含 CSS）哈希无变化，12 个既有真实 GLB 保留。入口 SHA-256：`f4cf0efeb72afb53df916f0bd96223edb07f180fd2d646a35830d7d83e3f14a1`。
- 本轮未刷写硬件、未改服务器、未调用 MiniMax 或其他付费模型进行测试。私有证据：`~/.local/share/pocketbuddy-esp/phone-fitness-focus-20260827/verification.json`。
- **19:53 用户截图已确认进入真实练了吗训练界面**：弓步蹲、相机画面、服务器分析状态；手机同时收到 `skill_page_ready target=lianlema-coach handshake=pocket-lianlema/v1`。这确认了页面连接，不代表动作计数准确率或吧唧语音触发完整训练已验收。iPhone 真机键盘聚焦仍需单独确认。

## 修正：实际训练服务是练了吗（19:32 现场反馈后）

用户实测 v6 已产生页面请求，但 Her Motion 显示成嵌套的 PocketBuddy 地图，因此 v6 **未通过实际健身页面验收**。先前离线测试只验证了交接逻辑，没有验证被交接页面的真实部署；不能把它解释成整体成功。

- 实际 GET `/her-motion/` 返回主站 HTML；手机相对地址还会指向 `capacitor://localhost/her-motion/`，也会落到本地 SPA 首页。
- 现有已部署训练服务为 `https://pocketbuddy.throughtheglass.art/lianlema/`。已检查其真实页面（深蹲等十项动作、模型已就绪）和 `/lianlema/api/health`：`pocket-lianlema/v1`、RTMO / ST-GCN、`models.ready=true`。只读访问，未开启相机、未发送私人画面、未调用付费模型测试。
- 共享路由中将「健身」「动作识别」指向已登记的 `pocket.lianlema` / `lianlema-coach`；Her Motion 的瑜伽、普拉提等原专用词保留。手机与语音仍复用同一 Frost。
- 「练了吗」保留原 HTTPS、来源及 iframe 握手校验；增加实际 `view-ready` 的诊断标记，不把 iframe load 或错误页当成功。未修改服务器、未替换模型、未添加额外手机确认按钮。
- 12 文件、144 项离线测试通过。真实手机页面与摄像头计数仍待新版现场验收，浏览器服务健康检查不是真人识别准确率证据。

## 手机命令更新（2026-08-27）

按用户最新顺序，先验证手机文字「帮我调用健身agent」，再以吧唧 ASR 替代文字输入。本轮不刷写固件、不联系或交接其他任务，不调用付费 API 进行测试。

- 已修复将「调用健身 Agent」误当作默认十分钟训练的入口；显式打开请求走原已登记的 Her Motion 子 Agent / 页面计划。
- 手机发送与吧唧自动语音共用实时完成通知，统一进行原 Taskmaster 交接及页面跳转。重复通知只跳转一次，历史恢复、无用户输入的任务信号和后台不自动打开页面。
- 用户明确要求便捷启动，已撤掉新增的手机相机确认按钮；指定健身启动命令复用旧启动入口。系统摄像头权限仍由 iOS 控制，未绕过系统权限，未放开其他任务的通用授权。
- 自动语音开关明确标为「松手自动识别并发送给 Frost（本次连接）」；只处理开启后新录音，不重放旧录音。自动打开目前限 Frost 对话页前台。
- 11 文件、130 项相关离线测试及 TypeScript 检查通过；模型请求全部替代为测试桩，未实际消耗 MiniMax 或云模型。手机实际页面跳转、姿态识别及语音执行尚待更新包现场验收，不能用这些测试代替。
- **手机更新已安装并启动**：`/Volumes/PocketBuddy-iOS-Dev/Artifacts/PocketBuddy-FrostCommand-20260827-v6.app`（Build 6），安装 JSON `/Volumes/PocketBuddy-iOS-Dev/DeviceInstall-FrostCommand-20260827-v6.json` 成功，实际进程来自安装目录 `B9A95FD1-B20B-468F-9138-CF65B71E49E8`。插件注册及 WebView 加载已收到；入口 SHA256 `1ce620db39ac90e09df06796b6f8e901abb36e3b02886e3384ba3462b32c78eb`，签名验证通过，638 个源码哈希构建期间未变，上一已装包的 12 个真实模型一致。未卸载 App、未清理用户数据、未刷写固件。证据目录 `~/.local/share/pocketbuddy-esp/phone-agent-navigation-20260827/`。真人手机命令和硬件自动指令仍待用户输入，不以启动日志冒充通过。

## 已验证：真人传输与本机 ASR（19:09）

用户截图确认识别结果为四字，手机日志对应 `local_asr_start bytes=78720 onDevice=true` 和 `local_asr_complete characters=4 onDevice=true`。同一段真实录音已完成 **麦克风 → BLE → 手机完整 PCM → iPhone 本机 ASR**。78,720 是音频字节数，不是 API Token 数；这次没有上传到 MiniMax 或云 ASR。Frost 实际任务与回复回放还未据此验收。

## 历史：传输刚修复时（2026-08-27 19:08）

**真人麦克风→手机音频传输已取得完整实测证据：** 0.2.10/v5最新一次SW2录音39360采样，手机实际收到78720字节（2.46秒），与设备采样数×2完全吻合，零设备入队丢包，手机日志出现 `capture_end` 与 `capture_complete`。结束状态经历313次拥塞重试后成功，修复前缺结束事件的问题在本次实测中已消除。峰值32768出现饱和，因此不能据此称人声清晰。**本机ASR句子、Frost实际回复及回复回放仍未验证。** 用户已被提示在手机点击“本机转文字”，直接使用这段完整音频，无需再录。证据为私有目录中的 `real-microphone-transfer.json` 及对应两端日志。

- **当前固件0.2.10-ojbadge-delivery已烧录并独立读回验证**，应用2,286,608字节，SHA-256 `44d13ed73ce19f692918730e686a2f9874304509bde4dc9c8d740351d2796819`；分区不变，只写0x10000。启动字形34/34，touch/battery/audio/talk_button均为1。
- 当前手机为 `PocketBuddy-CaptureDelivery-20260827-v5.app`（Build 3），相同Bundle ID覆盖安装，安装JSON `/Volumes/PocketBuddy-iOS-Dev/DeviceInstall-CaptureDelivery-20260827-v5.json` 为success；入口SHA-256 `c9a9f639cb00064a61ada6372108ae64ee80ef8e239a6ca0ed0004c48303a2c2`。运行进程路径核对为本次安装目录A780674B，插件注册成功及WebView加载已实收。
- 用户刚才说“你好”时，0.2.9/v4真实记录两次SW2按住/松手：16960采样（33920字节、峰值2957）和32960采样（65920字节、峰值32768），设备入队丢包计数0；手机收到两次开始事件，但没有结束或完整接收记录。因此只能证明实际采样及开始事件送达，不能称完整语音链成功或识别成功。第二次峰值饱和也不等于语音清晰。
- 核实旧固件CaptureEvent仅发送一次并忽略错误；音频高负载时结束通知可能失败。本次新增最多500次、20ms间隔的有界重试并记录实际入队结果；首次成功即停，断连或开始前松手取消。未送达开始状态则丢弃该次采音，不偷偷继续。
- 实测第二段松手后队列排空耗时6.37秒。手机原固定5秒尾包限制改为“5秒无有效数据进展”超时，并保留结束状态后30秒总上限；仍须序号和总字节数与设备采样数完全吻合。45秒没有结束状态会明确报错并丢弃，不能一直显示录音或进入ASR。**上述超时不是用户只能说5秒；当前单段录音上限仍为30秒。**
- 新增C++拥塞重试/失败上限/取消回归通过；TypeScript类型检查及5文件46项相关测试通过，新增慢尾包、总上限、缺结束状态覆盖；ESP-IDF与Xcode构建及冻结包签名检查通过。原12个真实GLB保留。
- 升级后的完整手机音频传输已按上方实测通过；ASR、Frost回复及手机回传播放尚未通过。付费语音调用0。私有证据目录 `~/.local/share/pocketbuddy-esp/capture-delivery-0.2.10/`，不保存原始麦克风PCM或识别文本。

## 历史：0.2.9 / v4（18:57）

- 本任务已收回手机、串口、BLE及该链路源码的独占操作权；「整理代码目录」任务明确停止操作，不再转接用户。
- **设备现为0.2.9-ojbadge-feedback，已实际烧录并独立读回校验。** 应用2,286,112字节，SHA-256 `0651f76e96d4cb11c4378338034e333fa96b6e3d1f17ba7727ee016d9c7eab69`。目标MAC、旧0.2.8、出厂备份及分区检查均通过；只写0x10000，不改分区或NVS。证据见私有目录 `~/.local/share/pocketbuddy-esp/ptt-feedback-0.2.9/flash-record.json`。
- 启动实况：字形34/34、PSRAM 8388608、touch/battery/audio/talk_button均为1，正在广播Frost-OJBadge。仅初始化不代表真实收音通过。
- iPhone已按用户要求覆盖安装并启动 `PocketBuddy-ConnectionUI-20260827-v4.app`（Build 2）；沿用Bundle ID和签名，没有卸载或清除数据。安装JSON为 `/Volumes/PocketBuddy-iOS-Dev/DeviceInstall-ConnectionUI-20260827-v4.json`，outcome为success。入口SHA-256 `a5491c1dbf6a877153133b5e502e677eeef5bb5069c5a3a21a5280cd5ad6b1b9`，实际运行进程路径核对为本次安装目录84BA2BE0。启动实收 `FrostBadge registered: true` 和 `WebView loaded`。
- 用户18:47截图顶部为“电子吧唧·未连接”。下方“连接 Frost-OJBadge”是扫描结果中的操作按钮，蓝勾为任务完成提示音选项，都不是连接成功。已统一请用户点击连接，等待真实连接及录音证据。
- `FrostBadgePanel.tsx`连接区置顶、区分“点击连接”/“连接中”/“已连接”的修复已在v4实装；旧18:47截图属于v3。类型检查、8文件72项相关回归和Xcode构建通过，冻结包签名及入口哈希验证通过，既有12个GLB均保留。构建期间相关源码哈希未变；电脑仍不连接BLE。
- 手机已重启到新包，需重新扫描并连接吧唧；此时“安装/启动成功”不等于手机BLE已连接。正在观察只读串口及手机控制台，只持久化启动和采音字节/峰值/识别字数等诊断元数据，不保存控制台中的PCM或识别文本。
- **真人麦克风音频、手机完整接收、本机中文ASR、同一Frost实际回复和手机回传播放仍未验收。** 本阶段付费语音API调用0次。

## 历史：0.2.8写入及18:01安装

- 用户已确认 0.2.7 按键识别界面可用，知道说话键是哪一颗；不据此猜测照片中上下位置。
- 0.2.8 真实 PTT 固件已写入。第一次 MAC 握手无串口数据，未写 Flash；用户重新插拔 USB 后，身份、原 0.2.7 镜像、出厂备份和现场分区表检查通过，仅写 `0x10000` 应用，随后单独读回校验通过。**写入成功不等于真人录音/ASR 已通过。**
- iPhone 已连接电脑；用户报告手机 App 已能连接吧唧。电脑不抢占 BLE。
- 语音版 iPhone ARM64 包构建及严格签名校验通过，**较早的独立 VoicePTT 包没有安装**。统一最新包已于 18:01 安装，随后本任务独立核对安装 JSON、ASR/采音诊断页面标记并成功启动；控制台实际出现 `FrostBadge registered: true` 和 `WebView loaded`。
- 新固件启动串口已收到：中文字形 17/17，8MiB PSRAM，touch/battery/audio/talk_button 均为 1；电池 4191mV、约 +80mA 充电电流。这不代替真人麦克风测试。
- **真人麦克风音频、手机完整接收、本机中文 ASR、同一 Frost 会话实际处理：全部待现场验收。** 编译和模拟测试不代表这四项通过。

## 历史：手机控制权交接（已结束）

用户协调指定由「整理代码目录」任务（`01a04137-94da-7f12-9f3b-2f9856e8832d`）统一负责后续闭环。已将固件版本、实体操作、证据及尚未验收项完整移交；本任务关闭手机控制台及只读串口监听，不再启动/安装手机、不占 BLE 或串口。关闭监听后再次通过 devicectl 确认最新 App 仍运行，PID 1213；没有用退出控制台代替手机端停止操作。

当时统一产物：`/Volumes/PocketBuddy-iOS-Dev/Artifacts/PocketBuddy-real-model-only-20260827.app`。实际安装记录：`/Volumes/PocketBuddy-iOS-Dev/DeviceInstall-20260827-real-model-only-retry.json`。网页入口 SHA-256：`0cf472b91a2e84a7c4d61820e1651e2eec556658fc4171321df777c73e1f0fba`。该包已被18:32的v3替代；控制权现已回到本任务，不重复安装旧包。

## 后续：长按没有倾听提示

用户随后反馈第二个自定义键长按不显示倾听。经通知手机联调任务并确认串口无人占用，本任务进行了 180 秒只读串口监听与 5 秒广播扫描：真实看见 `Frost-OJBadge` 广播，串口有正常启动/电量日志，窗口内没有连接、READY、SW2 按压或 MIC START 事件。没有主动连接 BLE，没有发送复位、录音、音频或付费 API 请求。监听已自动关闭，手机控制权保持不变。

观察到的直接阻断是手机尚未重连：0.2.8 在蓝牙未就绪时不允许采音，且缺少按键时的离线说明。未观察到 SW2 日志，所以本轮也不能据此称实体按压或麦克风通过；需用户重连并实际按键再验证。

该阶段制作0.2.9候选；现已于18:46实际烧录，当前状态和证据以上方为准。改动为：

- 按键时未连接：`请先连接手机 / 连接后重新按住`。
- 按键时已连接但音频初始化不可用：`录音设备异常 / 请查看手机`。
- 只以真实录音 worker 状态显示 `正在倾听说话`；离线提示不授权开麦，不改变600ms实体门禁、重新连接后松开要求、语音协议及驱动。
- 离线/初始化失败/真实录音/断连停止期间指示/重连授权门禁的主机测试通过；ESP-IDF构建通过。六条提示均在现有字库内，最长154px，没有更换字库。屏幕实机显示尚待协调升级后验收。
- 镜像和检查：`~/.local/share/pocketbuddy-esp/ptt-feedback-0.2.9/`；早期0.2.8只读实况日志：`~/.local/share/pocketbuddy-esp/ptt-feedback-diagnostic-20260827/serial.log`；0.2.9本次实况日志：`~/.local/share/pocketbuddy-esp/ptt-feedback-0.2.9/live/serial.log`。不可混用历史日志证明本次真人验收。

## 本次变更

1. 关闭 `kButtonIdentificationOnly`。GPIO0/SW2 在蓝牙就绪后需先松开，再连续按住 600ms；远程命令和触屏不能开麦。SW1 电源键不改。
2. 中文提示由真实录音 worker 状态驱动：`正在倾听说话 / 松手结束录音`。保留 Noto Sans SC 22px、GB2312 常用字库；不恢复旧的少数字形裁剪版。
3. 录音格式仍是 16kHz、单声道 PCM16 LE，最多 30 秒，结束后留 3.5 秒 BLE 尾包排空时间；两次测试间隔至少 4 秒。松手、超时、断连停止。
4. 手机逐包校验会话号、序号、采样字节数；显示已收到字节/时长、设备峰值和丢包。空录音、序号缺失、没有开始事件、5 秒尾包超时均不能进入 ASR。
5. 复用已有 iOS `SFSpeechRecognizer` 路径，强制 `requiresOnDeviceRecognition=true` 并检查 `supportsOnDeviceRecognition`。用户点击「本机转文字」后执行；不使用手机麦克风，不自动上传录音，不自动改走收费 ASR。
6. 复用已有草稿 → `sendFrostAgentMessage(..., {channel:'badge_voice', inputId})` 入口。用户核对文字后发送，仍进入同一 Frost 会话、Skills 与权限流程；同一录音去重，语音不能代替任务权限确认。

## 构建证据

- 固件版本 `0.2.8-ojbadge-ptt`，2,285,760 字节，应用分区 3MiB 剩余 27%；SHA-256 `84c0a6fb38460864e2949b87644e8e4ae4f907636cb8947d37af873b4ee2bb53`。
- GATT Device Information 0x2A26 改为报告实际 ESP-IDF 应用版本，不再使用 SDK 默认 1.0.0。
- TypeScript 类型检查通过；吧唧协议、客户端、Frost 会话与 iOS 注册入口共 6 个测试文件、48 项测试通过。
- C++ 主机测试通过：600ms 门槛、松手停止、断连、按住不重触发、默认 MTU 23 到 517 分片重组。
- iOS 构建成功，严格签名、Bundle ID、语音权限声明和本地网页入口哈希检查通过。有一项 AppIntents 元数据提取跳过警告，无编译错误。
- 私有证据目录：`~/.local/share/pocketbuddy-esp/voice-ptt-0.2.8/`。其中 `candidate.json` 不是烧录成功证明；只有后续 `flash-record.json` 的校验结果可证明写入。
- 本轮 MiniMax 调用 0 次，云端 ASR 调用 0 次。历史合成音频转录结果不作为真人录音证明。

## 现场验收步骤

1. 写入验证成功后，手机新版 App 前台重新扫描并连接 `Frost-OJBadge`，确认未出现「固件未启用麦克风」。
2. 用户按住已识别的实体键，看到真正的录音提示后说一句短话，例如「你好，Frost」，松手。不要在开机或重置时按住 GPIO0。
3. 手机出现非零接收字节、实际时长、非零峰值、零丢包和「传输校验通过」。仅有非零峰值还不能证明人声可辨认；可在手机回听同一份录音核实。
4. 点击「本机转文字」，用户本人处理 iOS 语音识别权限。核对结果确实对应刚才的话，不用预设文字或缓存音频替代。
5. 点击「填入 Frost 输入框」，核对后发送。观察同一 Frost 会话的真实回复及吧唧状态变化；不自动触发高风险任务、不代替授权。

调试日志只新增字节数、峰值、ASR 字数和错误代码，不新增录音内容或识别文本的持久化。实测日志保留在用户本机私有目录，不能提交到仓库。

参考：[Apple 本机识别支持判断](https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportsondevicerecognition)、[强制本机识别](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition)。
