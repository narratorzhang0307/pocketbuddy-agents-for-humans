# iOS 28：最新界面与分发记录

## 发布范围

用户要求在继续 TestFlight 分发的同时纳入“调整红圈元素避免方块感”的最新源码。
只检查当前工作区，没有读取或联系其他任务。用户此前明确暂缓未完成的路线增量。

- Photos 拍照、相册入口使用圆形图标和无边框操作按钮；保留可移除、可恢复的餐食示例。
- Skills 首屏展示三项核心能力，其余能力和健康咨询等入口仍在下方，没有删除功能。
- Her Motion 增加本地已有视频的姿态关键点分析入口、进度及取消处理。
- 保留输入控件至少 16px 的 iOS 自动放大修复、小狗图标、桌面组件、灵动岛、健康咨询、识鸟 10 秒与失败诊断、回复音量。

## 发布范围更新：纳入高德路线

用户随后确认高德路线规划已完成，明确要求一起发布。此前排除路线的候选包均未上传、未安装，
现已停用；改为在正式工作区直接运行 `node scripts/ios/archive.mjs --build-number 2026082828`，
不再使用任何路线排除清单。完整纳入路线条件补问、高德规划、地图路线层、iOS 原生定位、
导航语音和蓝牙重连实现。锁屏/实板导航效果仍须用新包验收，不以代码或编译通过代替实测。

## 先前候选构建（已被上面的完整构建取代）

从正式工作区读取全部已审计的当前源码和资源，在干净 Git 工作目录中全量构建。
以 GitHub `94521cee` 为提交基线，仅保留用户要求暂缓的 21 个路线相关文件的已发布实现；
不加入 5 个新增路线实现/测试文件。没有回写、撤销或覆盖原工作区的路线开发内容。
远端有效产品文档保留。私有照片、验收截图、日志、密钥、构建目录不进 GitHub。

第一次候选归档发现 Her Motion 的进度初始化又有源码更新，已中止；
随后重新同步全部 3134 个当前输入并从全新 DerivedData 全量重建，不修改旧 Web 包或哈希凭据。
主应用、Her Motion 和练了吗均按各自锁文件重新安装依赖。

## 加密声明

用户已授权提交加密/出口合规声明。核查对象为实际 iOS 发布资源，不以未被打包的研究源码推断：

- 网络连接通过系统 URLSession/WKWebView；原生 CryptoKit 使用 SHA-256 验证资源。
- Web 使用系统 Web Crypto 校验摘要及签名；没有找到发布包中另行实现的加密算法。
- 唯一 `AES` 字符串命中为练了吗音频格式枚举 `AES3`，不是 AES 加密实现。
- 源码中的 PDF.js 研究入口并未出现在本次 Web 包中；不是为了申报而删减该功能。
- 主应用及桌面组件的 `ITSAppUsesNonExemptEncryption` 设为 `false`。

依据：[Apple 加密出口说明](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations)、
[Apple 所需文稿对照](https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption)。
如果未来增加自定义/第三方加密实现，需要重新审查，不能沿用本结论。

27 号构建的合规声明和测试说明已保存，并已加入现有 Owner Internal Test 群组；
Apple 页面已显示“正在测试”。本轮没有重部署服务器，没有卸载 App 或清理用户数据。

## 验证

- 最终完整源码全量测试：2732 通过，16 跳过；224 个测试文件通过，3 个跳过（17:25）。
- 原生识鸟生命周期测试通过，包括 ACK、断连、撤旧鸟图、保留原始错误以及 HTTP 前后故障区分。
- 鸟图源清单检查通过：`bird-skill-pet-birds-v3`。
- 原生路线回放：GPS 精度、过期、跳点、环线、往返、转弯去重、偏航及到达通过。

## 完整归档验证

最终归档直接来自正式工作区，构建号 `2026082828`，使用全新的 DerivedData；
主应用、Her Motion 和练了吗均全量重建。此前发现识鸟页面在打包中继续变更，
过期检查使候选构建失败；没有跳过检查，没有手工替换哈希，没有上传失败候选。

- Source SHA-256：`882fb1a5c97292d93a16c083a785271bb17cc77bac4dff98b91aea3c577de4ca`
- Assets SHA-256：`a0e04d62e3b9225d68ecb5d07b5a877e2b19476185e3388e45e5ebafe72d271e`
- 实际 App 包通过 provenance、线稿画布、Frost Skills、识鸟清单/资源、小狗编译图标、签名检查。
- App 和桌面组件均为同一构建号，App Group 一致，18 张离线头像与当前资源一致。
- 实际原生二进制包含 FrostRunNavigation 和 FrostRouteProgress；Web 包包含 startRunNavigation 桥接。
- 实际 Info.plist 包含 location、bluetooth-central、audio 后台模式，以及加密声明。
- 浏览器打开本次正式 Web 包，确认圆形 Photos 操作与示例、三项核心能力、保留的健康咨询和其他 Skills，以及高德路线规划页面。
- 现有生产服务器接受 run-route-intent 条件提取请求，返回 HTTP 200 / qwen3.7-max；本次未重新部署服务器，因此本地新增的专用 512 token 路由限制不能声称已部署。
- 17:26 尝试覆盖安装前，CoreDevice 显示已配对 iPhone unavailable；未开始安装、没有卸载或删除用户数据。

完整归档不等于手机/实板/锁屏验收；这些仍需安装新版后按路线文档执行。

## 导出与上传

17:27 导出的 App Store Connect IPA 再次通过同样的实际包校验。
IPA SHA-256：`2ad2898418cd09042fb7ec48707ef797314fc2fe3f1272956053e75692bf70dd`。
17:31:04，Xcode 返回 `Upload succeeded`；Apple 页面列出 `2026082828`，状态为“正在处理”。
测试群组分发状态完成后另行追加，不能把上传成功等同于已可下载。
