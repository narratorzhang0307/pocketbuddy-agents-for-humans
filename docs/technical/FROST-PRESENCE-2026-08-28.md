# 桌面伙伴：吧唧 → App → Widget / 灵动岛

## 本次范围

复用现有 Pocket Buddy iOS 壳、FrostBadge BLE 客户端和 18 张角色头像。新增独立 `PocketPresence` 原生插件和 `PocketCompanion` WidgetKit 扩展。没有修改吧唧固件、扫描策略、语音链路、Taskmaster、云端 API 或部署。

这不是 NFC 实现，也不伪装系统桌面。Web 只提供明确标注的 App 内动画预览；真正的桌面小组件和灵动岛由 iOS 原生扩展绘制。

## 用户入口

1. Agents → FITNESS AGENT / Frost → 页头「桌面伙伴」。开发预览可打开 `/#companion`。
2. 在原有「电子吧唧」面板连接设备，等待当前角色头像确实同步成功。
3. 点「从吧唧接过来」，20 秒内轻点吧唧圆屏，或在 App 前台轻摇手机。不需要碰撞设备。
4. 手机内横卡播放角色入场。没有连接设备时，可点「预览入场」，页面会明确标为预览。
5. 点「同步到桌面」。回到主屏幕，长按空白处 → 编辑 → 添加小组件 → Pocket Buddy → 桌面伙伴。
6. 点「开始陪伴」，开启一小时的 Live Activity。支持的 iPhone 可在灵动岛显示头像，其他支持机型在锁屏显示卡片。点桌面卡片或灵动岛可返回功能页。
7. App 内、锁屏卡片和展开的灵动岛均提供「结束陪伴」。到时显示结束状态，回到 App 时清理活动；没有 APNs / 后台常驻服务，不能保证进程被挂起或终止时恰好一小时自动移除系统卡片。iOS 自身仍管理最终存活时间。

## 真实边界

- 接收必须由用户当次主动开启。旧触摸计数不能重放；超时、取消、切后台、断连、更换连接、角色变更、录音或识鸟都会取消。
- 触摸和摇晃只控制表现层，不等于任务审批、不启动录音、不调用模型或定位。
- 「摇一摇」使用手机 UIKit 的 shake 事件；没有宣称硬件带有 IMU，也没有声称 NFC 或距离检测成功。
- 硬件现有固件没有角色离场接口。本版确认真实 BLE 输入后，在手机端呈现入场；不会声称硬件里的角色已经消失，也不清空硬件屏幕。
- 对方手机接力、NFC 贴近识别、永久桌宠和跨系统桌面的自由飞行动画不在本版范围。
- Widget / Live Activity 更新由系统调度，不能保证两个系统区域按帧连续衔接。动画遵循系统短动画限制。

## 数据与运行

- 公共快照只允许：头像索引、角色名、姿态、吧唧连接状态、电量及原生更新时间/前后台标记。
- 不复制设备标识、账号、聊天、语音、GPS 或健康记录。
- 共享容器：`group.art.throughtheglass.pocketbuddy`。主 App 保留既有 HealthKit entitlement，另加同一 App Group；扩展仅具有 App Group。
- 共享快照为本地原子写入的 `companion-v1.json`。没有服务端存储、推送凭据或远程资源抓取。
- Native 小组件使用 18 张已批准头像的离线 PNG，总体约 528 KiB。`scripts/ios/presence-assets.mjs` 从已有 WebP 生成，不生成新形象。
- 原生桥通过队列接收公开状态；Widget reload 请求合并到约 15 秒间隔。Live Activity 状态与 Widget 时间线独立。
- 桌面显示「上次电量 / 上次已连接」，不把后台 WebView 的旧快照冒充持续实时 BLE 状态。
- 主 App 仍保持原部署版本；本次扩展最低 iOS 17，原生开始方法对旧系统返回明确错误。

## 编译与签名

```sh
npm run typecheck
npx vitest run src/app/lib/frostPresence.test.ts src/app/lib/frostBadge.test.ts src/app/lib/frostCompanion.test.ts src/app/lib/skill/avatars.test.ts
npm run ios:prepare -- --web-only
DEVELOPER_DIR=/Volumes/PocketBuddy-iOS-Dev/Xcode.app/Contents/Developer npm run ios:check
```

`--web-only` 只适用于本机既有 `dist-ios` 与 iOS `public` 指向同一份 SSD 资源的配置；其他环境使用 `npm run ios:prepare`。没有改变 Capacitor 包依赖。

真机签名必须让主 App 和新扩展均具备上述 App Group。不能去掉 entitlement 冒充共享成功，也不能用原 App 的旧 profile 给新扩展签名。正式 Apple Developer 团队与对应 profiles 由账户持有人提供/授权；本次没有创建证书、注册 App ID 或修改开发者后台。

首次本机签名检查时：主 App 的旧 `iOS Team Provisioning Profile: art.throughtheglass.pocketbuddy` 不包含 App Groups 权限，新扩展也没有开发描述文件。当时无法直接安装。

后续 TestFlight 核查已解除该签名障碍：账户现为有效 Apple Developer Program，同一团队 `XP6NALCUCX` 已有 Pocket Critter（Apple ID `6806112121`）的内部测试构建。主 App 和扩展的 App Group 均已在苹果后台核对；新版本 `0.1.0 (2026082810)` 已成功签名归档，并通过分发包深度签名校验。App / 扩展的分发 entitlement 均含共享组、`beta-reports-active=true`、`get-task-allow=false`。使用现有登录与云端分发证书，未创建 API key 或导出私钥。

本次独立发布目录：`/Volumes/PocketBuddy-iOS-Dev/testflight-presence.bmaJKy`。它在已发布版本对应的冻结源码上叠加 Presence，保留 09 的眨眼图标及 1184 个既有非入口资源，不混入后续其他开发改动。2026-08-28 12:31 CST 上传成功，12:35 苹果处理完成；已填写本构建出口合规和测试说明，并分发至原 `Owner Internal Test`（1 名现有测试员）。12:38 CST 在 App Store Connect 核实 `0.1.0 (2026082810)` 状态为「正在测试」。没有新增测试员或提交公开 App Store 发布。

发布证据、签名和 IPA 哈希见该目录的 `TESTFLIGHT-PRESENCE-10.md`；构建 ID 为 `452acbea-8cd7-4ad3-a62d-768476a16e05`。用户从 TestFlight 的 Pocket Critter 条目更新，手机桌面 App 名及组件搜索名仍为 Pocket Buddy。TestFlight 可分发不等于已完成真机 Widget / 灵动岛运行验收。

## 验收记录

- 相关 Vitest：114/114 通过（包含原 BLE、Frost companion、角色资产回归）。
- TypeScript：最终 `npm run typecheck` 通过。
- 最终 iOS 网页资源构建与内嵌资源静态检查通过。
- iOS 工程、plist、插件注册、相同 App Group、扩展内嵌与 18 个离线资源静态检查通过。
- App + Widget 扩展的模拟器目标、iPhone ARM64 目标编译通过（`CODE_SIGNING_ALLOWED=NO`，不是已签名安装包）。编译仍有 Swift 5 / Sendable 并发警告，包含既有 BLE 插件与本次通知桥；没有编译错误。
- 浏览器：390×844 与 320×740 布局检查；窄屏无横向溢出；真实 Agents → Frost → 桌面伙伴入口通过；预览按钮工作；Web 上系统能力按钮禁用。
- 系统 UI 验收：未完成。模拟器首次启动时内置磁盘降到约 485 MB，已关闭本次启动的模拟器，没有删除用户文件。不要把浏览器截图算作系统 Widget / 灵动岛运行证据。
- 真机 BLE 动作、摇晃、桌面添加、Live Activity 开始/结束及深链回到 App：需签名安装后验收。

## 后续：Frost 五秒入场（本地待发布）

用户已提供真机 Widget / 灵动岛截图，并要求增加「跑入 → 中间摇尾 → 凑近镜头 → 原头像」动作，以及桌面持续眨眼/动嘴。

- App 入场已新增 12 个 imagegen 姿势帧，复用原头像及 3 个现有表情，合计 16 帧；运行时图集约 78 KiB。素材与提示词见 `docs/design/frost-arrival-20260828/prompt.md` 和 `public/assets/frost-arrival/20260828-v1/manifest.json`。
- `FrostArrivalScene.tsx` 只负责本地表现；「预览入场」与原真实触摸/摇晃通过后的入场共用五秒动画。其他角色仍使用原入场，不会被换成小狗。
- 可中途停止；切后台、关闭面板、更换角色都会停止，重开不自动重播。遵从「减少动态效果」，素材加载失败或超过六秒时保留原头像。
- 没有增加 NFC、后台常驻、录音、音频、定位、固件命令或 Widget 高频更新。没有修改原头像、蓝牙连接判定及系统组件数据模型。
- Apple 官方文档限制 Widget / Live Activity 单次动画最多两秒，常亮低亮度状态不播放动画。无法把 App 的循环动图直接当作系统组件的常驻动画；已向用户提出「点击小狗，短暂眨眼回应」替代方案，尚待确认，未擅自改动 Widget 交互。
- 验证：TypeScript 通过；5 个测试文件、119 项通过；独立目录生产 JS/CSS 构建通过，未覆盖已有 `dist`/`dist-ios`。该构建为 `publicDir:false` 的代码编译验证，不是已打包可上传的 iOS 版本；字体/背景运行时资源和大包警告仍存在。
- 浏览器实际 430px 内容区：无横向溢出；观察到跑入、摇尾、靠近、原头像收尾；完整播放、立即停止、重播、关闭中断与重开不自动播放通过。未把网页验证说成新动画的真机验证。
- 本次未上传新的 TestFlight，已发布的 `2026082810` 不包含此后续动画。按后续跨任务构建协调，下一次正式 iOS 构建必须从当前根目录全量同步最新源码与资源（包含 `public/assets/frost-arrival/20260828-v1/`），不得沿用旧 Artifacts 快照或旧发布副本仅叠加局部文件。历史 10 版本的隔离构建记录仅用于追溯，不是下一版的构建基线。
- 保留当前 Frost Skills 的 `details/summary` 默认折叠实现、`scripts/ios/verify-frost-skills.mjs`、`check.mjs` 中的接入及 Xcode 必跑的 `Verify Current Web Assets` 阶段，不覆盖或绕过校验。共享 `dist-ios` 由识鸟任务重建期间，本任务不并行清空、复制或重建该目录；后续打包前先协调其重建完成状态。

本机日志：`/tmp/pocketbuddy-presence-tests.log`、`/tmp/pocketbuddy-presence-typecheck.log`、`/tmp/pocketbuddy-presence-web-final.log`、`/tmp/pocketbuddy-presence-device-build.log`、`/tmp/pocketbuddy-presence-signing-check.log`。临时日志仅用于本机排查，不作为长期发布产物。

官方接口依据：[WidgetKit](https://developer.apple.com/documentation/widgetkit)、[ActivityKit](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities)、[动画限制](https://developer.apple.com/documentation/widgetkit/animating-data-updates-in-widgets-and-live-activities)。
