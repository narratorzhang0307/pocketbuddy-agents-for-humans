# 技能画布旧版退役记录 · 2026-08-28

## 结论与范围

用户在本地预览确认了 GitHub `eaffa7ffc43c758af066e7a26004ad731fadac11`
对应的线稿能力卡片、目标定义、技能组合和独立动物形象布局。正式工程已切换到该视觉基线，
但使用当前工程的 Qwen 能力标识、编译器与本机草稿存储，不恢复旧 Firebase/Gemma 接口。

唯一正式入口：`PlazaTab.tsx` → `SkillCanvasPage.tsx` → `SkillCanvasEditor.tsx`。
新分包加载失败时只显示不可用，不回退任何历史画布。

本轮恢复界面、结构编译和本机草稿保存。自定义技能图的实际执行尚未接入当前后端，
页面明确标注不可执行；没有读取健康或相机、播放语音，也没有生成伪造的执行成功记录。
已安装 Skill 的 Frost 调用链不在本轮修改范围内。

## 回退原因

Git 历史显示，8 月 21 日不是最后一次更新；8 月 23–24 日仍有界面与执行链更新。
`5cb6726d` 的本地变更重新引入旧波浪卡片画布，随后 `f317f4a` 的源码快照上传包含了该状态。
因此本次问题不只是浏览器缓存：源码入口本身曾经回退，另有旧 Android 静态资源和构建中间产物残留。

## 已退役文件

- `src/app/components/SkillCanvasTab.tsx`
- `src/app/components/SkillDeckBuilder.tsx`
- `src/app/components/SkillDeckBuilder.css`
- Android 静态目录中的 `SkillCanvasTab-CHNqv_1-.js`、`SkillCanvasTab-CPFrGnTX.css`
- Android debug 中间目录中的旧画布 JS/CSS 及对应压缩文件，共 4 个文件

上述 3 个源文件和 6 个生成文件已移出工程。恢复副本仅在工程外：
`/Volumes/PocketBuddy-iOS-Dev/Artifacts/canvas-removal-20260828.tCXCb8/`。
该目录不是构建输入，不得从中安装或拷回旧版画布。未删除用户草稿、照片、健康数据或 App 数据。

项目范围扫描仅在防回退检查与测试中保留 `sdb-builder` 等检测字符串，不再有可执行旧实现。

## 构建阻断规则

`scripts/ios/verify-skill-canvas.mjs` 校验正式源码、16 张素材、真实入口及画布分包的 SHA-256。
Vite 在构建完成时写入 `skill-canvas-release.json`；不接受单独替换版本字符串或混入旧分包。
缺少新凭据、源码变化、分包替换、旧文件复活，都会导致检查失败。

检查已接入 Vite、iOS 资源检查和 Android `preBuild`。Service Worker 同时拒绝旧画布分包 URL。
原生安装仍必须通过完整构建来源校验；不能绕过检查安装历史 `.app`。

```sh
node scripts/ios/verify-skill-canvas.mjs --source-only
node scripts/ios/verify-skill-canvas.mjs dist
node scripts/ios/verify-skill-canvas.mjs dist-ios
node scripts/ios/verify-skill-canvas.mjs android/app/src/main/assets/public
```

Android 旧资源已退役，下一次打包前必须从当前源码重建并同步完整 Web 资源。
不能只补回被删除的旧分包，也不能手写或复制构建凭据来放行。

## 本轮验证

- TypeScript 检查通过。
- 28 项画布相关针对性测试通过。
- 全量 Vitest：217 个测试文件通过、3 个跳过；2645 项测试通过、16 项跳过。
- iOS 构建来源独立测试：7 项通过。
- 独立完整 Web 生产构建成功，画布源码指纹：
  `ff889ecdd68a453ab005e80c050d627c231d0b3153bf7fc05e5f4dcbca363124`。
- 浏览器从正式 App 的 Agents → 技能画布入口验证了新布局、线稿素材与翻面交互。
- 全工程旧文件名及波浪卡片实现扫描无运行时代码残留。

独立验证产物：上述工程外目录的 `verified-web/`；本地预览地址 `http://127.0.0.1:5190/`。
本轮未安装手机、未覆盖共享 `dist-ios`、未发布服务器，也未执行 Git 提交或推送。
Web 编译与浏览器验收不等于手机已经更新。
