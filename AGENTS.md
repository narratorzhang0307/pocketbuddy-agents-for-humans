# 识鸟构建约束

- 唯一鸟图清单是 `native/frost-badge/ios/BirdCatalog.json`。网页直接导入它，Xcode 将同一文件打入 App；不要恢复 `src/app/lib/skill/birdCatalog.json`。
- 当前有效版本为 `bird-skill-pet-birds-v3`：十二只宠物风鸟图，透明素材与原 T5 背景分开。保留 `t5-scenes-v2/backgrounds/` 的十二张原背景，它们不是废弃素材。
- 唯一素材生成入口是 `scripts/hardware/build-pet-bird-assets.mjs`。旧的 `build-bird-assets.mjs` 及 v1/v2 鸟形象图已退役，不得复制回来作为默认资源。
- 从当前工程源码构建，不能用历史 `.app`、冻结源码快照或旧 `dist-ios` 代替。`npm run ios:prepare` 重建实际 iOS Web 资源；若只更新 Web，只有在脚本确认共享资源链接一致时才可使用 `--web-only`。
- `npm run bird:check` 必须通过。Vite 生成的 `bird-release.json` 绑定实际 JS 哈希；不能只拷贝新清单或版本号覆盖旧 Web 包。
- Xcode 的 `Verify Packaged Bird Release` 阶段必须保留并每次执行。它检查实际 `.app` 内的原生清单、Web 入口、JS 哈希与素材。
- 安装任何候选 App 前，使用当前工程的 `node scripts/hardware/check-bird-release.mjs --app /绝对路径/App.app` 检查。失败即停止，不得跳过检查来安装旧包。
- `BUILD SUCCEEDED`、版本号提高、OSS 已上传，都不能单独证明手机或硬件已收到新版。手机、蓝牙、实板、锁屏验收须分别记录实际证据。

## 技能画布：只允许用户确认的线稿版

- 唯一入口为 `SkillCanvasPage.tsx` → `SkillCanvasEditor.tsx`，视觉基线是用户在本地确认的 GitHub `eaffa7f` 版本。
- `SkillCanvasTab.tsx`、`SkillDeckBuilder.tsx` / `.css` 和 `sdb-*` 彩色波浪卡片已废弃，禁止恢复、复制或作为 fallback。新画布加载失败时显示不可用，不回退旧页面。
- 构建必须通过 `scripts/ios/verify-skill-canvas.mjs`：校验实际页面分包、源码指纹和素材；旧包、混合包或缺失新版直接失败。不要安装 SSD 历史包。
- 本轮只恢复画布界面与本机草稿，不恢复旧 Firebase/Gemma 后端；未接通的自定义图执行明确不可用，不能把预览冒充真实运行。

## 正式 iOS 整包发布

- 发布基线只能是这个正式工作区的当前完整源码。不得从 `Artifacts`、`testflight-*`、`source-final` 等历史副本拷贝工程后局部叠加，也不得复用历史 `.app` 或旧 Web 分包。
- 统一用 `node scripts/ios/archive.mjs --build-number <已核对未使用的构建号>`：全量重建主应用和子应用、执行 Capacitor 同步、使用全新的 DerivedData，然后核验归档内的实际资源。该命令不上传、不安装。
- 与其他任务协调 `.ios-build/install.lock` 和共享 `dist-ios`；锁存在时不能另行 prepare、替换资源或启动安装。打包期间若源码变化，必须重新全量准备，不能重写哈希凭据绕过检查。
- 发布前再次对归档/导出的 App 执行 provenance、技能画布、Frost Skills 和识鸟检查。构建成功、签名有效、构建号提高均不能替代这些检查。保留用户数据，不以卸载 App 作为清理旧代码的方式。
- App 品牌图标固定为用户确认的 Frost 小狗单眼眨眼图，完整尺寸保存在 `public/icons/`。`verify-app-icon.mjs` 校验已确认的图片指纹和实际 App 编译图标；仅检查 public/native 两份图片相同不够，禁止回退地球图标。工具链重编码导致指纹变化时须人工视觉核对，不跳过检查。

## GitHub 正式源码

- 用户指定的正式仓库为 `narratorzhang0307/pocketbuddy`，远端名 `pocketbuddy`，主分支 `main`。本地 `origin` 指向另一个仓库，不能当作同一个上传目标。
- 上传前核对当前工作区与远端最新历史，保留远端有效产品文档；不强推、不从旧发布目录复制源码。主应用和两个子应用的干净构建步骤见 `docs/development/CURRENT-SOURCE-BUILD.md`。
