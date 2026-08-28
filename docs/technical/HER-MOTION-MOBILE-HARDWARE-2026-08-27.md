# Her Motion 手机与圆形硬件链路

本任务只处理当前「谷歌大赛」工作区的 Her Motion、对应导航和共用硬件输出边界；没有向其他 Codex 任务发消息，没有刷固件、改蓝牙协议或部署服务器。

## 已确认的根因与修复

- 原 `/her-motion/` 不在手机资源包里；线上该路径返回 Pocket Buddy 主首页 HTML，HTTP 200/iframe load 不能说明子 Agent 就绪。
- 从用户 SSD 的 `HerMotion-Final-Portable` 只读恢复原版页面到 `vendor/her-motion`，构建到 `public/her-motion/index.html`，模型和 WASM 一起打包。原归档不变。
- 父页面先校验 manifest，再等待当前 iframe、当前 session 的 `opened`；支持 iOS `capacitor://localhost` 的 opaque origin，不接受别的 frame/session。
- 页面切换项目、暂停和摄像头失败不再当作整个会话取消。退出/后台释放摄像头；未完成的权限与模型加载不会复活已退出页面。
- `调用女性运动agent`、`打开女性运动`、`调用 Her Motion 子Agent` 是明确的本机导航，不必调用云模型。硬件导航由 App 根节点监听，不再要求 Frost 对话页保持挂载；每次显式导航生成新的页面实例。

## 预期链路与限制

硬件实体键录音 → BLE 完整 PCM → iPhone 本机 ASR → 同一个 Frost 文字入口（`badge_voice`）→ Her Motion 当前会话 → 已授权/已记住的摄像头自动开启。

Her Motion 当前观察文字 → 经 frame/session 校验 → iPhone 系统声音合成为内存 PCM → BLE → 硬件扬声器。手机没有 Audio/speechSynthesis 播放兜底。开始录音、后台、断连、关闭提示或退出会取消旧提示；较新的对话回复不会被旧页面的取消误停。提示限 100 字、5 秒最短间隔，同样内容至少间隔 20 秒。

- App 必须在前台，硬件连接后要启用「松手自动识别并发送给 Frost（本次连接）」。后台或断连会关闭该模式。
- 首次摄像头授权不能跳过。只有一次真实 getUserMedia 成功才保存已授权标记；用户可取消「下次进入自动开启摄像头」，权限撤销/存储不可用时不自动开。
- 当前手机包有 MediaPipe 姿态关键点，不包含桌面 Yoga-82 专项分类服务；手机不会向旧 localhost 分类接口上传帧，也不声称体式已确认。
- iPhone 需要已安装的中文系统声音；合成或 BLE 失败时显示错误并保持手机静音。
- 当前固件要求实体录音键连续按住约 600ms；远程命令/触屏不能开麦。本任务不移除该保护。不能用注入文字、预录 PCM 或手机侧测试冒充硬件麦克风实测。

## 验证记录

- Build 10：签名校验后安装成功；用户 20:25 截图确认手机进入真实 Her Motion。
- 本地真实 UI：发送「调用女性运动agent」后自动进入 Her Motion；三类运动切换、返回 Frost/Skills 正常，无页面 console error；没有为浏览器测试擅自授予摄像头权限。
- 自动化：12 个相关测试文件、136 项通过，覆盖硬件来源指令、去重、不回放历史、权限门禁、frame/session 校验、静音失败、录音/后台/断连取消以及旧取消不影响新语音。
- 根应用与子应用 TypeScript 检查通过；两个 Vite 构建通过。MediaPipe 1.0.1 与归档 WASM loader 字节一致；pose 模型 SHA-256 为 `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`。
- 独立构建目录：`/Volumes/PocketBuddy-iOS-Dev/her-motion-mobile.8n9Zh9`，不覆盖其他任务共用的 `dist-ios`；Build 10 回退包在 SSD `Artifacts/PocketBuddy-HerMotion-20260827-v10.app`。
- Build 11：网页资源及暂存 iOS 工程检查、ARM64 原生编译、严格签名验证通过；核对包内主入口和子页面与构建资源相同。20:37 安装到已连接 iPhone 成功（`install-v11.json`，版本号 11）；回退包为 `Artifacts/PocketBuddy-HerMotion-20260827-v11.app`。同时验证了归档 SIMD/non-SIMD WASM 二进制与锁定依赖一致。
- 待真人验收：本轮尚无真实硬件说出指定口令、手机打开、再次进入摄像头自动开启、硬件可听见提示的完整连续证据。单元测试的 `badge:test` 是模拟来源，不是实机收音。

## 20:50 实测反馈：已识别，但没有立即打开

- 用户截图：自动语音开启；收到 100480 字节、3.1 秒完整音频；识别原文为「帮我打开一下女性运动卷」；主会话为 `running`，语音状态为「Frost 正在处理」。这证明已超过收音阶段，不能再归因为未开自动发送。
- 使用同一主 Agent 入口复现：旧导航规则不接受动词后面的「一下」，也不接受本次 ASR 的「卷」尾词；因此走了云端子 Agent 准备路径，而非直接导航。本机测试明确捕获到额外 `/api/frost-llm` 请求，未真的调用云端。
- 修复只作用于明确打开 Her Motion 的指令：支持「帮我打开一下女性运动」；仅对来源经入口验证的 `badge_voice`，容纳这次末尾「女性运动卷」的识别结果。原始识别文字、输入 ID、会话证据保持不变，不将否定句、组合任务或其他目标模糊匹配为打开指令。
- 修复后，截图原句的硬件来源测试确认：不请求云模型、只打开一次 `her-motion`、保留原始文字；回归共 13 个相关文件、158 项测试通过，根应用 TypeScript 检查通过。浏览器真实输入「帮我打开一下女性运动」后打开独立 Her Motion 页面，并保持在该页面；未授予浏览器摄像头权限。
- 蓝牙红字来自手机控制命令等待硬件回执，不是上述云端请求的错误。当前工作区已有独立的具体操作名/圆屏状态告警改动，本轮保留；没有把告警文案变更当作硬件故障已解决，也没有重试未知硬件动作或刷固件。
- Build 12 在独立目录 `/Volumes/PocketBuddy-iOS-Dev/her-motion-voice.ydCNDp` 构建成功；原生 ARM64 编译、严格签名检查通过，包内全部网页资源与本次构建逐文件一致。留存包为 `/Volumes/PocketBuddy-iOS-Dev/Artifacts/PocketBuddy-HerMotion-20260827-v12.app`。20:55 及构建后再次查询，目标 iPhone 均为 `unavailable`；本次修复尚未安装，不能把代码测试算作手机/硬件全链路验收。

## 实机验收

1. 更新后在 Frost 连接圆形硬件，打开本次连接的自动识别发送。保持 App 前台。
2. 按住已确认的实体录音键，看到「正在倾听说话」后说「调用女性运动 Agent」，松手；两次录音至少间隔 4 秒。
3. 依次核对实际接收字节/完整性、`asr_complete`、`skill_page_requested target=her-motion source=badge_voice`、`HerMotion page_ready`。无这些证据不记作完整成功。
4. 首次允许相机；离开后再说同一口令，确认自动进入并开相机。取消自动开启后再试，必须保留手动按钮。
5. 点击「测试硬件语音」或开始动作，确认只有硬件出声；`transferred` 仅表示软件传送结束，听见与否由现场确认。
