# iOS 输入聚焦放大修复 · 2026-08-28

## 问题与修改

用户在 26 号 App 的健康咨询页点击问题输入框后，页面自动放大、右侧被裁切，收起键盘后仍停留在放大状态。
该页 textarea/select 使用小字号，且 `theme.css` 存在未分层的全局 `12px` 表单规则，仅添加 Tailwind 字号类不足以覆盖它。

- 健康咨询页增加独立作用域，textarea/select 始终使用 `max(16px, 1rem)`，不在 focus 时才切字号。
- iOS 原生主应用公共表单规则同样设置此最小字号；沿用启动时的 `data-pocket-platform` 标记。
- 保留用户手动缩放，不增加 `user-scalable=no`、`maximum-scale=1` 或按键盘状态缩放页面。
- 健康页及内部滚动容器允许收缩，问题输入框明确 `min-width: 0`。
- 不修改健康咨询数据、Qwen、语音、BLE 或原生固件链路。

## 验证与发布状态

- 健康页新增回归先在旧实现失败，修复后通过；公共 iOS 字号、导航布局、健康会话等合计 18 项针对性检查通过。
- 实际本地浏览器页面：textarea/select 计算字号均为 16px；聚焦前后视口 scale 为 1，页面 clientWidth/scrollWidth 均为 430px。此结果不是 iPhone 软键盘实测。
- 尝试从当前正式根目录全量归档 `2026082827`，在类型检查阶段停止，未生成候选 App、未安装、未上传。
- 当前工作区新增路线改动导致 `MyMapTab.tsx` 的 `AmapNamespace.Polyline/Marker` 共四处类型错误；路线/Frost 三项回归失败。没有覆盖或回退这些非本次 UI 修改。
- `.ios-build/latest-archive.json` 仍指向已上传并安装的 26 号包；它不包含本次输入框修复。GitHub 尚未推送本次 UI 修改。
- 安装新版后仍需实际 iPhone 验证：输入、收起键盘、再次输入、切换科室及返回页面时不自动放大、不横向裁切。

## 用户授权的独立测试发布

用户随后明确要求“路线还没完成，先不包含那个，直接发布测试别的功能”。
本次因此使用新的独立 Git 工作区 `/Volumes/PocketBuddy-iOS-Dev/Current/ui-release-27.kATA5W`，未回滚、覆盖或移动原开发目录的路线代码。
不是复制历史 App 或替换旧包局部资源：独立目录重新安装三个锁文件的依赖，完整构建主应用、两个子应用和原生工程，执行原有全部来源检查。

- 基线为已发布源码 `9baae102`，逐文件同步当前工程的非路线源码和本次 UI 修复；保留远端有效产品文档。
- 仅暂不包含 `FrostBuddyPage.tsx`、`amapRunRoute.ts`、`frostAgentPresentation.ts`、`frostConversation.ts`、`runRouteSkill.ts`、`frostBadge.ts`、`FrostBadgePlugin.swift`、`Info.plist`、`project.pbxproj` 的未完成路线增量，以及新建的 `runRouteDialogue.ts`、`FrostRouteProgress.swift`、`FrostRunNavigation.swift`。
- 上述文件在测试版沿用最后发布版本，既有路线功能没有被删除；输入框修复、健康咨询、识鸟失败诊断、10 秒录音、统一回复音量、已确认小狗图标、小组件和 Photos 示例保留。
- 其余 3,140 个文件在隔离时与当前工程逐字节一致，差异清单和 SHA-256 保存在本机 `.ios-build/isolation.json`，不包含私有环境变量。
- 隔离后全量回归 2,699 通过、16 跳过。此记录不把编译或安装等同于真人硬件收音与软键盘验收。
- 本次例外只用于用户要求的 27 号测试发布；后续完整版本仍应从完成后的正式工作区整包构建，不以这个隔离目录代替正在开发的路线源码。

## 27 号实际安装与分发核验

- 干净工作区首次运行暴露了 Capacitor update 对已有 Web 目录的依赖；`prepare.mjs` 已补上首次从真实源码生成网页，再规范依赖、完整重建和校验的步骤，不创建占位网页或使用旧分包。
- 全量归档成功，来源 SHA-256 为 `83d67b5e02a79bf1ab9b69d7e940d944a00a659427b7927ee3d80d5f67f0cffc`，Web SHA-256 为 `ee09adb1f8d4bb93e4b0c81cce36974d4d2a957ec6d129883fde6ecb8cf42b3d`。
- 16:52:55 CST 回读确认连接的 iPhone 已安装 `2026082827`，16:53:11 成功启动；原位覆盖，没有卸载或清除数据。
- 原生二进制确认健康咨询语音入口、鸟声失败提示存在，未包含 `FrostRunNavigation`。实际打包 CSS 包含健康页和 iOS 公共 16px 下限规则。
- 16:57 CST，解包后的分发 IPA 再次通过来源、技能画布、Frost Skills、识鸟、小狗编译图标、App/Widget 构建号与签名、共享 App Group 和 18 张组件头像检查。
- IPA SHA-256：`c71703594e093c6fd66bd0124be91d434e9588b911c682224b8bc78d58fb6bb9`；本机产物位于 `/Volumes/PocketBuddy-iOS-Dev/Current/Releases/2026082827-qPyz7Z`。
- 本次没有重新部署服务器。App 包更新与服务器更新是独立步骤，沿用现有后端地址。
- 导出时内置磁盘空间不足；只将本会话 24/25/26 号已结束发布的临时文件移到 SSD，保留可恢复副本后重试成功，未删除个人数据。

本机安装和分发包校验不等于 TestFlight 已可下载；Apple 上传、处理与出口合规状态分别记录。实际软键盘及硬件收音体验仍待用户验收。

- 17:00:55 CST，Xcode 确认 `Upload succeeded`，Apple 已接收并开始处理 27 号包；尚未把处理中的包宣称为 TestFlight 可下载，也未代填出口合规声明。
