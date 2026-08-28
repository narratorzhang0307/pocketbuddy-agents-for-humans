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
