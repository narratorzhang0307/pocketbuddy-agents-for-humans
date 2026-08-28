# iPhone「扫描吧唧」按钮灰色：源码修复与真机记录

## 原因

用户截图显示原生插件不可用提示，按钮因 `frostBadge.supported()` 为 false 而禁用；不是扫描失败，也不是服务器未部署。

`Main.storyboard` 已指向 `PocketBuddyViewController`，但实际 Scene 启动入口在 `ios/App/App/SceneDelegate.swift` 中创建了默认 `CAPBridgeViewController`，绕过 `capacitorDidLoad()` 内的 FrostBadge 注册。仅检查插件编入二进制或 Storyboard 配置不足以发现此错误。

## 桌面源码先修，再构建安装

- `ios/App/App/SceneDelegate.swift` 改为创建 `PocketBuddyViewController`。这是桌面「谷歌大赛」项目中的原生源码，Xcode 直接编译它，不修改安装包内的文件。
- 自定义控制器增加仅 Debug 启用的插件注册结果日志；不打印用户内容。
- `scripts/ios/check.mjs` 同时检查 AppDelegate、实际 Scene 入口和 Sources 编译目标。
- `src/native/iosBridgeRegistration.test.ts` 增加三项入口回归，首项先复现失败，再随修复通过。
- 保留前端插件可用性判断，没有强行启用按钮；不改固件、蓝牙协议、用户权限或数据。

## 2026-08-27 验证

- 完整工作区：174 个测试文件、1967 项测试通过；类型检查和 iOS 工程检查通过。
- 使用桌面同一工程及现有本地网页资源，在 SSD 的独立 `DerivedData/PocketBuddy-BadgeScanFix` 构建，避免覆盖其他任务的构建目录。
- `BadgeScanFix-20260827-1.xcresult`：构建成功，0 errors、0 warnings；`codesign --verify --deep --strict` 通过。
- 已核对安装包与工程网页入口 SHA-256 相同，新原生二进制含注册诊断。
- `BadgeScanFix-DeviceInstall-20260827-1.json`：更新安装成功，Bundle ID 不变，未卸载或清除 App 数据。
- 真机重启日志实际输出 `[PocketBuddy] FrostBadge registered: true` 和 `WebView loaded`。结束本次诊断控制台后再次确认 App 进程仍在运行。

以上结果和安装包位于 `/Volumes/PocketBuddy-iOS-Dev/`。本次没有提交、推送 Git 或部署服务器。

## 尚需现场确认

插件已在真机注册，不等于已经连上吧唧。用户需在 App 内进入 `Agents → FITNESS AGENT / Frost → 电子吧唧`，点「扫描吧唧」，允许 iOS 蓝牙权限并选择 `Frost-OJBadge`。本轮未替用户点击权限、未连接抢占设备、未触发录音或播放。

本地 BLE 扫描不依赖服务器；Qwen 对话、云端语音和远程训练服务分别依赖对应后台。扫描、连接、真实电量和音频仍须逐项验收，不以插件注册或编译成功代替。

参考：[Capacitor 本地插件注册要求](https://capacitorjs.com/docs/ios/custom-code)。
