# 人物与宠物：仅显示真实素材

用户要求：人物、宠物素材失败时宁可留空，禁止生成球体、简化动物、SVG 吉祥物或首字头像作为替代。

## 源码

- 删除 `vendor/legacy-city/src/app/lib/agent3d/createAgentModel.ts` 整个程序化替代模型工厂。
- `loadAgent3DRuntime` 只读取选定角色的真实 GLB；缺失、损坏、空模型直接报错，不再制造另一种角色。旧 `procedural-3d` 元数据仅用于兼容读取，不再对应渲染实现。
- `Agent3DViewer` 在失败后清空画布；地图与 3D 场景共用真实模型加载路径。
- 删除 `AgentWorldPocketBuddyPortrait` 中的替代 SVG 人物/物件，删除 `PocketBuddyPortrait` 的首字占位。
- 出门人物/宠物缩略图和拍立得移除缺图首字替代；坏图隐藏，原有素材和名字标签不改造成新角色。
- 宠物生成接口失败时不再自动采用本机替代抠图。用户明确选取的原有图鉴素材继续保留。
- 删除对应废弃 CSS；PWA 缓存版本为 `pb-v3-real-assets-only`，只清本应用的旧壳缓存，不清用户档案、记忆或照片。

## 真实资产

此前当前 public 目录缺失了角色配置引用的 9 个 GLB。已从用户现存的 `/Users/zhangcheng/Documents/上街去/app/public` 恢复原始文件，未修改该来源项目：腊肠犬、松鼠、暹罗猫、黄小鸡、小猪、陆龟、男主、Alba 向导、女主。

`scripts/verify-avatar-assets.mjs` 在 Vite 开发/构建前检查这些 GLB 的存在、格式、网格和内嵌依赖；防止下次打包遗漏真实模型。源文件、iOS 第一版修复包及服务器发布包中的 9 个文件已做 SHA-256 对比。

## 验证

- 相关回归：8 个文件、53 项通过，覆盖所有内置人物/宠物的下载失败不替代、未知/旧资料不变成球、真实模型保留、缺图不画首字。
- 本任务发布前的完整确定性回归：186 个文件、2094 项通过；排除 `scripts/health/*.live.test.ts`，不调用收费或真人外部服务。后续 iOS v3 由「整理代码目录」报告 188 个文件、2115 项通过，Swift/Xcode 第 4 次构建 0 错误、0 警告；这不是首次运行或真人语音验收结论。
- `npm run typecheck` 与 `git diff --check` 通过。
- 本机浏览器看到了真实男主、女主、暹罗猫和黄小鸡；线上还观察到一次 GLB 网络下载失败，预览保持空白，没有出现替代造型。
- 线上大 GLB 在本次网络环境下的完整下载曾超时；没有据此声称公网加载性能已解决。服务器上的文件已与本机完整逐文件校验。

## 发布与协调

- 首个核心清理版本于 18:06 上线：`4e43b65a14e33e267f56f1968e302eaec8922b80c4cf5cddb3c77dfb48201e75`。
- 最终含缩略图/拍立得清理版本于 18:20:58 上线：`f33287a7114767a94f20494502ffac6ecc6ac8374a4b65f2e2bb4940a774bf50`；产物 `/Volumes/PocketBuddy-iOS-Dev/pocketbuddy-web-f6q5VS/release`。当前 `/root/pocketbuddy/current` 指向 `releases/20260827-f33287a7-real-assets-only`。
- 发布前逐文件校验上传内容，挂接既有共享环境配置与数据、复用一致的后端依赖，独立 loopback 端口预检成功，并以旧 current 未变化为条件原子切换。仅重启 `pocketbuddy`；练了吗的 81 份后端/资源文件与前一部署逐字一致，不改 Nginx、4020 服务或 coach。
- 公网 `/release.json`、入口 JS/CSS、地图与人物加载器、宠物编辑器、`sw.js` 与最终产物哈希一致；旧模型加载器/宠物编辑器/地图 JS URL 返回 404；健康检查通过，`capacitor://localhost` 接口预检返回 204 且来源正确。
- iPhone 核心清理包于 18:01 覆盖安装成功，不卸载、不清数据；协作任务随后成功启动。安装记录：`/Volumes/PocketBuddy-iOS-Dev/DeviceInstall-20260827-real-model-only-retry.json`。
- 18:32「整理代码目录」已将包含最后缩略图/拍立得清理的 v3 覆盖安装到 iPhone，实际安装的是 v3 而非 v2。产物：`/Volumes/PocketBuddy-iOS-Dev/Artifacts/PocketBuddy-FrostVoiceLoop-20260827-v3.app`；安装记录：`/Volumes/PocketBuddy-iOS-Dev/DeviceInstall-FrostVoiceLoop-20260827-v3.json`。本任务只读核对了安装记录中的应用 Bundle ID、安装目录 `24C388B0-0694-41C9-91CD-5E4BF44E411D` 及包内 index 的 SHA-256：`58d5947cfcb22e17c3ec27ba0e273581a10613d5dfe2d591fc27b14c26cc27ef`，与交接信息一致。
- 手机首次启动和真人语音联调仍由「整理代码目录」负责。交接时手机锁屏，尚未确认 v3 首次运行成功；本任务不争抢手机安装和控制台。
- 不修改原 `pocketearth` 项目，不重写 Frost/阿里云，不改固件或真实 GLB。

## 已清理旧构建

已删除本机旧构建的 22 个旧替代渲染 JS/CSS，以及 11 个仍含首字替代的旧地图 JS；旧包不可继续安装或回滚使用。服务器删除了旧发布中的 4 个替代 JS/CSS 和 3 个首字占位地图 JS。最终扫描全部发布目录的 211 份 JS/CSS，旧替代渲染标记与地图首字占位匹配均为零。

删除的是可由源码重新构建的生成文件，不是用户数据；不保留可直接重新部署旧替代形象的完整旧包。最后 3 份服务器文件按发布交接要求留有只供人工恢复、不对外服务的压缩归档：`/root/pocketbuddy/retired-artifacts/retired-avatar-letter-chunks-20260827.tar.gz`（权限 0600，内容已逐个校验）。源码版本历史未改写。

手机端状态须区分：最后的出门缩略图与拍立得首字清理已随 v3 实装，但首次运行尚未确认。18:01 的冻结包 `/Volumes/PocketBuddy-iOS-Dev/Artifacts/PocketBuddy-real-model-only-20260827.app` 暂时保留，既不删除也不擅自装回；等手机联调任务确认新包首次运行成功后，再协调清退。正在使用的 iOS 当前构建目录不并发删改。
