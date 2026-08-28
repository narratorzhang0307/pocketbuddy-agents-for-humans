# Pocket Buddy：iPhone 现场演示准备

## 当前验收边界（2026-08-27）

- Finder / Xcode 已识别用户连接的 iPhone 15 Pro Max，iOS 18.3.1；账户持有人已开启手机开发者模式并完成重启确认。已确认 USB 配对、`developerModeStatus: enabled`、`ddiServicesAvailable: true`。17:34 样式更新安装时连接中断；用户重连后，17:38 确认 connected、手机解锁，更新安装与启动成功。
- Capacitor iOS 工程、本地网页资源、API origin 路由、后台原生 origin CORS 已准备。原有 Frost、任务系统、阿里云服务保留。
- FrostBadge Swift 插件已加入 App 编译目标，并由主界面控制器注册；蓝牙权限已声明。已在编译出的 `App.debug.dylib` 中核对到 `FrostBadgePlugin` 与 `PocketBuddyViewController` 符号。
- **完整 iPhone ARM64 构建、Personal Team 签名、安装和启动已通过；手机蓝牙验收仍未完成。** 用户已信任本人开发者账户并提供 App 打开截图，后续 `devicectl` 启动成功。首次启动的安全检查拒绝已解除，不需要重复信任或清除 App 数据。
- Xcode 26.6（17F113）已从苹果官网下载、解压到 `/Volumes/PocketBuddy-iOS-Dev/Xcode.app`，应用完整性校验通过。已按用户当次明确确认接受 **Xcode and Apple SDKs Agreement**，必需系统组件安装完成，`-checkFirstLaunchStatus` 返回 0。
- iOS 平台组件已通过 Xcode → Settings → Components 安装；`simctl` 确认 iOS 26.5（23F77，arm64）为 `Ready` / `isAvailable: true`。系统管理的 runtime 约 7.9 GiB，位于内置磁盘，不是外置 Xcode 应用包的一部分。
- 初次构建曾因缺少平台组件而在 destination / `ibtool` / `actool` 阶段失败；安装平台及首次缓存初始化后，使用标准 `-scheme App -destination 'generic/platform=iOS'` 构建成功，无须改动原生业务代码绕过错误。
- 之前仅有 Command Line Tools 时出现的 `SwiftBridging` 重复模块定义未在本次完整 Xcode 构建中复现。系统全局 `xcode-select` 未更改。
- 用户明确授权创建证书并签名安装后，Xcode 已生成有效的 Apple Development 签名身份，并创建包含此 iPhone 的开发 profile；私钥保留在用户正常 macOS 钥匙串中，未导出。
- 账户持有人已自行完成 Xcode → Settings → Apple Accounts 登录；使用 `Cheng Zhang (Personal Team)`，Team ID 为 `XP6NALCUCX`，未看到可用的付费 Team。App 自动签名已开启，Debug / Release 的 DEVELOPMENT_TEAM 已由 Xcode 写入工程；原 Bundle ID 未改变。
- 2026-08-27 后续已将桌面源码独立部署到 `https://pocketbuddy.throughtheglass.art`：HTTPS、版本文件、Qwen 文本调用及 `capacitor://localhost` API 预检通过，见 [部署验收记录](POCKETBUDDY-DEPLOY-2026-08-27.md)。本次发布没有重新构建或安装 iOS 包；不能据此认定手机界面已更新。`练了吗` 的 RTMPose / ST-GCN 服务尚未部署接通，语音及其他独立 Skill 服务也未做端到端验收。

## 本次构建验收

- App：`/Volumes/PocketBuddy-iOS-Dev/DerivedData/PocketBuddy/Build/Products/Debug-iphoneos/App.app`。
- 构建记录：先前的 `UnsignedBuild-20260827-1.xcresult`、`SignedBuild-20260827-1.xcresult`、`SignedBuild-20260827-map-fix.xcresult` 和最新的 `/Volumes/PocketBuddy-iOS-Dev/SignedBuild-20260827-map-style.xcresult` 均返回 `status: succeeded`、`errorCount: 0`、`warningCount: 0`；`xcodebuild` 退出码 0。样式兼容修复版于 17:38 从独立保存的 Artifacts 包安装成功，并完成首次画面核对。
- 已检查二进制为 Mach-O arm64，Bundle ID 为 `art.throughtheglass.pocketbuddy`，MinimumOSVersion 为 `15.0`。
- `npm run ios:prepare`、`npm run typecheck` 通过；iOS API 路由、CORS、吧唧协议与客户端的 4 个测试文件共 42 项测试通过。
- 最新产物使用 `CODE_SIGNING_ALLOWED=YES`，`codesign --verify --deep --strict` 通过。Profile 到期时间为 `2026-09-03T09:01:44Z`，即北京时间 9 月 3 日 17:01:44；仅包含当前演示 iPhone。
- 安装记录：`/Volumes/PocketBuddy-iOS-Dev/DeviceInstall-20260827-1.json`，`devicectl device install app` 退出码 0，确认 `art.throughtheglass.pocketbuddy` 已安装。
- 首次启动记录：`/Volumes/PocketBuddy-iOS-Dev/DeviceLaunch-20260827-1.json` 保留早期安全检查拒绝。用户完成信任后已能打开 App；地图修复版于 17:26 再次启动成功，真机日志显示 `FrostBadge registered: true`。插件注册不等于 BLE 或声音实测通过。这不是 TestFlight 构建或 App Store 上架。

## iPhone 高德地图初始化修复（17:26）

- 用户截图中的黄色交叉道路是 `StreetGardenLab` 的失败/预览示意图，不是真实高德底图。实际入口是 `EarthActionMapTab → vendor/legacy-city/MyMapTab → GardenKnowledgeMap → StreetGardenLab`。
- 已核对 iOS 资源中的高德 Key / 安全配置与环境一致；同一 `dist-ios` 在桌面浏览器能加载高德及植物/声音标记，控制台无错误。没有修改 Key、白名单、云端后台或网络安全策略。
- 真机日志与打包代码位置对应到 `createdMap.add(buildingLayerRef.current)`：默认隐藏的 `AMap.Buildings` 在 iPhone 上抛出 `TypeError: undefined is not an object (evaluating 'n.gn.Ha')`，外层 catch 因此将整个地图设为 error。高德脚本并非没有调用；尚未将 SDK 内部 renderer 差异进一步归因为某个系统限制。
- 修复：楼块按用户点击才创建；独立处理失败并提示，保留基础地图；高德异常日志显式包含 name/message/stack 并脱敏 URL 凭据。若基础地图加载失败，提示当前为示意图，不静默伪装成真实地图。其他街道、路线、伙伴、Frost 和后端不作重写。
- 回归：地图楼块、路线转换、iOS API 路由、吧唧客户端/协议合计 5 个文件 41 项测试通过；`npm run typecheck`、`npm run ios:prepare`、签名编译和严格签名校验通过。桌面同包地图初始化正常，无 warn/error 日志。
- 已成功安装记录：`/Volumes/PocketBuddy-iOS-Dev/DeviceInstall-20260827-map-fix.json`，安装及启动成功；观察期间原高德初始化异常没有再出现。**用户 17:29 新截图已确认真实西湖底图、地名、高德署名和植物/鸟类标记出现，但底图仍是默认瓦片样式，不是原有绿色草地设计。** 启动时另有一条未分类的 `JS Eval error A JavaScript exception occurred`，不应误称真机所有日志均无异常。
- `dist-ios` 和同步后的工程 `ios/App/App/public` 是指向 SSD WebAssets 的符号链接；已核对最终 `App.app/public` 为真实目录且内部无符号链接，入口与本次构建一致。因此手机安装包不依赖 SSD 路径。未来修改复制流程时需重新检查这个边界。

## 严格保留 GitHub 原样式（17:39，真机画面已核对）

- 用户要求以 `narratorzhang0307/pocketbuddy` 记录为准。已通过 `git ls-remote` 核对远端 `codex/0827-local-snapshot` 为 `a47cde0084d096a64f0bb87388f50909a35ff35c`；default main 是更早的 `eaffa7ff`。未切换分支、覆盖工作区、提交或推送。
- 对照该快照，`GROUND_THEMES`、`GARDEN_STYLE`、样式应用逻辑和初始化地图参数均逐段相同；整个 `StreetGardenLab.css` 的 Git blob hash 与快照同为 `50b3f04a80e4e5583a1e43520a963df1e52cbd2b`。原值保留：`meadow` / `amap://styles/fresh`、背景 `#f1f3ef`、`features: ["bg", "road"]`、canvas 滤镜 `saturate(0.95) contrast(1.04)`。没有换主题、改配色或改布局。
- [高德官方说明](https://lbs.amap.com/faq/js-api/map-js-api/create-project/1060847223)：降级为栅格绘制时自定义样式不生效，可在加载 JSAPI 前设置 `window.forceWebGL = true`。已检查 SDK 的环境分支，该开关仍依赖实际可用的 WebGL 上下文；没有使用内部 `forceWebGLBaseRender`、更改 UA 或放松 WebKit 安全设置。
- 仅在 `src/native/iosBootstrap.ts` 的原生 iOS 分支、两个地图加载器之前设置官方开关。增加平台边界测试；地图 complete 事件记录样式、canvas 数量和栅格瓦片数，供真机验证。网页/PWA、Android 和原有样式文件不变。
- 6 个测试文件 46 项通过；类型检查、iOS 准备、签名构建、深度严格签名校验通过。最终包资源无符号链接，入口与此次 `dist-ios` 一致。
- 已将该签名候选单独保存在 `/Volumes/PocketBuddy-iOS-Dev/Artifacts/PocketBuddy-map-style-20260827.app` 并重新校验签名，避免后续其他构建覆盖待安装版本。
- 早期安装记录 `/Volumes/PocketBuddy-iOS-Dev/DeviceInstall-20260827-map-style.json` 保留 `Connection interrupted` 失败。重连后的成功记录为 `/Volumes/PocketBuddy-iOS-Dev/DeviceInstall-20260827-map-style-retry.json`，退出码 0；17:38:37 成功启动。更新同一 Bundle ID，未卸载或清除 App 数据。
- 真机 complete 日志：`[amap] rendered {"style":"amap://styles/fresh","canvas":1,"rasterTiles":0}`，确认已使用矢量画布，而非忽略样式的栅格瓦片。
- 通过 Xcode 的 Take Screenshot 取得并人工核对 iPhone 17:39 实际画面：浅绿色陆地、青蓝水面、淡黄色道路、简洁底图、原有植物/鸟类挂卡和高德署名均正常。验收截图：`/Volumes/PocketBuddy-iOS-Dev/Artifacts/iphone-map-style-20260827.png`。**本轮地图启动及原样式恢复已验收；不代表 GPS、全部地图交互或 BLE/音频已实测。**
- GitHub 基线：[0827 快照地图组件](https://github.com/narratorzhang0307/pocketbuddy/blob/a47cde0084d096a64f0bb87388f50909a35ff35c/vendor/legacy-city/src/app/components/StreetGardenLab.tsx)。

## SSD 安排

原盘 `/Volumes/Extreme SSD` 是 exFAT，分配块为 1 MiB，直接放入大量小源码文件会浪费空间。没有格式化或重新分区。

创建了独立 APFS 稀疏映像：

```text
/Volumes/Extreme SSD/PocketBuddy-iOS-Dev.sparsebundle
挂载后：/Volumes/PocketBuddy-iOS-Dev
逻辑上限：100 GiB，随写入增长，不是立即占用 100 GiB
```

实测 APFS 内 23 字节测试文件分配 4 KiB，空映像在原 SSD 上约占 54 MiB。测试文件已移除。映像有正常元数据开销，删除内容后映像大小不保证自动缩回。

Xcode、DerivedData 和 SPM 下载放在挂载后的 APFS 卷内；源代码保留在当前工作区。系统管理的平台 runtime 和缓存仍占用内置磁盘。此次 runtime 约 7.9 GiB；额外缓存生成失败后内置盘一度仅剩约 367 MiB，暂停新增构建/下载，先释放空间。不能理解为完全不占内置磁盘。

已将本次生成的 `dist-ios` 目录移到 `/Volumes/PocketBuddy-iOS-Dev/WebAssets/dist-ios`，原路径保留符号链接，未移动源代码；内置盘可用空间回升到约 792 MiB。App 内的已编译资源与工程内 `ios/App/App/public` 未移除。

已完成的空间恢复操作：本次 Xcode 在 `/Library/Developer/CoreSimulator/Caches/dyld/25F80/inc/com.apple.CoreSimulator.SimRuntime.iOS-26-5.23F77` 留下约 2.6 GiB 失败缓存，其日志含 `could not write file`。官方 `simctl runtime dyld_shared_cache remove com.apple.CoreSimulator.SimRuntime.iOS-26-5` 返回成功，但未释放该 root 所有的增量临时目录。随后通过 Finder 将此单一目录移动到 `/Volumes/PocketBuddy-iOS-Dev/BuildCacheArchive/com.apple.CoreSimulator.SimRuntime.iOS-26-5.23F77` 保留。Finder 的管理员确认流程已结束；已核对原目录不存在、目标文件在 SSD、内置盘回升至约 2.8–3.5 GiB 可用。未永久删除该归档，未处理其他系统缓存或用户文件。此失败缓存不视为有效可复用产物，后续不要在空间紧张时启动不必要的模拟器或重新生成大缓存。

手机开发者模式开启后，Xcode 又开始提取 iPhone 调试支持文件。新建的 `~/Library/Developer/Xcode/iOS DeviceSupport` 中仅有本次设备的 `iPhone16,2 18.3.1 (22D72)`，临时文件约 3.8 GiB，导致内置盘再次降至约 117 MiB。已先正常退出 Xcode，确认进程结束，再将整个新建的 `iOS DeviceSupport` 目录移动到 `/Volumes/PocketBuddy-iOS-Dev/iOS DeviceSupport`，原路径保留符号链接；内置盘恢复约 4 GiB。随后重新打开 Xcode，后续设备支持文件继续写入 SSD。没有删除用户文件；该目录中提取/处理尚未完成的临时状态不能当作调试支持已准备完成的证明。

重启后可挂载：

```sh
hdiutil attach '/Volumes/Extreme SSD/PocketBuddy-iOS-Dev.sparsebundle'
```

使用完先关闭 Xcode 和构建任务，推出 `PocketBuddy-iOS-Dev`，再推出物理 SSD；构建时不要拔盘。

## 安装完整 Xcode

本机已完成下载和解压，无需重复下载。记录：

- 安装包：`/Volumes/PocketBuddy-iOS-Dev/Xcode_26.6_Apple_silicon.xip`，2,318,258,791 字节。
- `pkgutil --check-signature`：`Status: signed Apple Software`。
- `codesign --verify --deep --strict`：退出码 0，`valid on disk`、`satisfies its Designated Requirement`。
- `DEVELOPER_DIR=... xcodebuild -version`：Xcode 26.6，Build version 17F113。
- 安装包和解压应用在 APFS 卷合计约 6.3 GiB；加上 SPM 和两次构建目录，目前该 APFS 卷约用 7.3 GiB。解压曾使用内部临时空间，完成后已回收；后续 iOS runtime 和系统缓存另占内置空间。
- 曾经按用户允许临时启用 App Store 外置盘选项，但该列表不显示 APFS 映像，因此未开始商店安装；选项已恢复关闭。

以下为重建环境时的操作说明。本机协议、平台组件和无签名编译均已完成，不必再次下载。

从 [Apple 官方下载页](https://developer.apple.com/download/all/?q=Xcode%2026.6) 获取 **Xcode 26.6 Apple silicon.xip**，保存到挂载的 `PocketBuddy-iOS-Dev`，在同一卷解压。不要把解压后的数万文件直接放到 exFAT 根目录。

Xcode 26.6 支持这台 Mac 和 iOS 18.3.1 真机，不需要为本次演示升级手机。登录、许可协议、管理员授权需要账户持有人确认。此版本的 Components 将 iOS 平台支持与匹配模拟器列在同一项，必须完成所需平台组件；不下载其他 watchOS / tvOS / visionOS 或旧版模拟器。平台下载/安装可能使用系统管理的内置磁盘空间，需持续核对可用容量，不能仅按外置卷剩余空间判断。

下面命令假设实际解压路径为 `/Volumes/PocketBuddy-iOS-Dev/Xcode.app`；先核对路径。使用单条命令的 `DEVELOPER_DIR`，不更改系统全局 Xcode 选择。

```sh
DEVELOPER_DIR=/Volumes/PocketBuddy-iOS-Dev/Xcode.app/Contents/Developer npm run ios:check
npm run ios:prepare
```

可先做无签名编译（不是可安装 IPA）：

```sh
DEVELOPER_DIR=/Volumes/PocketBuddy-iOS-Dev/Xcode.app/Contents/Developer xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App -configuration Debug -destination 'generic/platform=iOS' \
  -derivedDataPath /Volumes/PocketBuddy-iOS-Dev/DerivedData/PocketBuddy \
  -clonedSourcePackagesDirPath /Volumes/PocketBuddy-iOS-Dev/SourcePackages \
  CODE_SIGNING_ALLOWED=NO build
```

在 Xcode UI 构建时，也要把 Settings → Locations → Derived Data 设置到该 APFS 卷；CLI 的路径参数不会自动改变 UI 设置。

## 给自己的 iPhone 安装（不等 TestFlight）

1. 用外置卷上的 Xcode 打开 `ios/App/App.xcodeproj`。不要重新执行 `cap add ios`。
2. Xcode → Settings → Accounts 登录本人 Apple Account。账户持有人自行输入密码、验证码。
3. App target → Signing & Capabilities：开启自动签名，选择本人 Team。若付费会员尚未激活，优先尝试 **Personal Team** 自用开发签名。不能保证账户当前一定提供该选项，需实际确认。
4. Bundle ID 默认 `art.throughtheglass.pocketbuddy`。如果苹果提示 ID 被占用或 Team 无权限，停下核实，不擅自换账号或覆盖已有标识。
5. 选择已连接 iPhone 作为运行目标。按 Xcode/手机提示完成信任、开发者模式及重启确认；不要更新、恢复或抹掉手机。
6. Run。手机若提示未受信任开发者，按系统提示到设置中信任自己的开发签名。

Personal Team 是本人设备开发测试，通常签名有效期 7 天，到期需重新构建安装。它不是 TestFlight，也不能因此把安装包长期分发给别人。TestFlight 上传/分发仍需付费会员有效及相应苹果后台权限。

## 现场蓝牙验收清单

先停止电脑上占用同一吧唧的测试连接，手机打开蓝牙，保持 App 前台。入口：**Agents → FITNESS AGENT / Frost → 电子吧唧**。

- 扫描，明确选择 `Frost-OJBadge`；允许系统蓝牙权限后连接。
- 确认 App 显示“已连接”、真实电量；改变 Frost 状态并观察圆屏同步。
- 触摸圆屏，确认 App 收到触摸计数，不能把触摸当作任务完成。
- 用低音量执行“扬声器测试”，由现场人员确认确实发声。
- 按住圆屏 0.6 秒说话，松开；确认录音有非静音内容，先在手机播放，再“回放到吧唧”。最长 30 秒。
- 断开后重新扫描/连接；拔下手机 USB，确认蓝牙功能仍可使用。
- 锁屏或切后台后返回，检查断连提示及手动重连。当前不承诺后台保持连接或自动恢复。

任一步未验证不得标记为“手机实测通过”。当前 BLE 未完成加密身份绑定，仅用于受控现场测试；音频默认只在本次 App 内存中，不自动上传。音频来源是吧唧，未申请手机麦克风权限。

## 数据与联网注意事项

- 原 Safari/PWA 的本地数据不会自动迁移进原生 App 沙盒，首次安装要重新建立演示伙伴/状态。
- iOS 包内置页面，不使用 `POCKET_BUDDY_LIVE_URL`。`VITE_POCKET_BUDDY_API_ORIGIN` 只能是公开 HTTPS origin，不放密钥。
- 后台必须允许 `capacitor://localhost` 的所需 API CORS，并部署相应服务。不能用“关闭跨域限制”作为修复，也不会自动切换旧域名。
- 既有 Android 专属插件不因此自动移植到 iOS。当前重点是 Frost BLE；其他原生功能逐项验收。

参考：[Apple 自用设备开发与会员区别](https://developer.apple.com/help/account/basics/about-your-developer-account)、[Xcode 支持范围](https://developer.apple.com/xcode/system-requirements)、[真机运行](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices)、[Capacitor 本地插件注册](https://capacitorjs.com/docs/ios/custom-code)。
