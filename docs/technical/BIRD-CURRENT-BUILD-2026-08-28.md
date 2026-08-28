# 识鸟旧代码清理与当前构建验收

## 当前唯一来源

十二鸟当前版本为 `bird-skill-pet-birds-v3`。唯一清单是 `native/frost-badge/ios/BirdCatalog.json`，网页和 iOS 原生直接使用同一文件，SHA-256 为 `b7503839d862be192d70b4f909b61ec919c6d304d1b58ec13d46c528fcf2831c`。

已从当前工程删除旧生成器 `scripts/hardware/build-bird-assets.mjs`、重复清单 `src/app/lib/skill/birdCatalog.json`，以及十二鸟 v1/v2 的 48 张旧 JPEG/WebP。实际删除前已逐文件记录 SHA-256，并压缩备份到工程外，不参与构建。

`pet-birds-v3/birds/` 的透明 PNG/WebP 是独立可复用素材；`pet-birds-v3/scenes/` 是硬件交付用合成图。`t5-scenes-v2/backgrounds/` 的十二张原 T5 背景完整保留，文件哈希未变。目录名中的 v2 不表示这些背景已废弃。

## 防止重新带入旧版

- 网页、头像传输和素材生成脚本统一读取原生目录中的唯一清单。
- `scripts/hardware/check-bird-release.mjs` 拒绝旧清单、重复清单、旧生成器和已淘汰图片；逐项检查新版鸟图及原背景的文件哈希。
- Vite 在写完最终 JS 后生成 `bird-release.json`，记录实际入口及所有 JS 文件哈希。只换 JSON 或版本号、保留旧 JS，不能通过验证。
- Xcode 的 `Verify Packaged Bird Release` 在复制资源之后每次运行，检查实际 App 内的 `BirdCatalog.json`、HTML 入口、JS 和图片。
- 安装前必须用当前工程检查实际 App。历史源码副本不会自动获得新规则，不能继续用它们构建或安装。

```sh
npm run bird:check
node scripts/hardware/check-bird-release.mjs --web-dir dist
node scripts/hardware/check-bird-release.mjs --web-dir ios/App/App/public
node scripts/hardware/check-bird-release.mjs --app /绝对路径/App.app
```

## 本次验证

识鸟素材、头像和 BLE 协议相关测试 32/32 通过，TypeScript 类型检查通过。当前普通 Web 与 iOS Web 资源的识鸟校验均通过，均含新版清单及 56 个经哈希核验的 JS 文件；48 张旧鸟图均不在当前打包资源中。

实际归档 App 的识鸟成品检查已通过：内嵌原生清单、实际 HTML/JS 和鸟图均为当前宠物版。直接读取 Xcode 结果为归档成功、0 个错误；对实际 App 执行严格签名验证也通过。这些检查独立于单元测试中的模拟目录。

曾遇到源码与 Web 资源不同步，构建校验明确拒绝，未绕过。最终复核时，受检归档与工作区最新的整包准备凭据不一致，因此本记录仅确认该实际 App 的识鸟资源正确，不将它宣布为可安装的当前整包。安装前仍须通过当前源码的整包凭据校验。本轮没有尝试安装。

逐项结果和实际 App 路径见 `docs/design/bird-skill-20260828/current-build-verification.json`；不能把中途复制出的资源或部分 App 目录当作构建成功。

## 证据和边界

本次私有证据：`/Volumes/PocketBuddy-iOS-Dev/Artifacts/bird-single-source-20260828-130946/`。其中 `removal-manifest.json` 记录 50 个移除文件，`retired-bird-code-and-art.tar.gz` 是工程外恢复备份，`tests-final.log`、`typecheck-final.log` 记录最终检查。

本次清理不删除历史 OSS 对象、不改 T5 固件、不刷 B 板、不安装手机。已安装 App 不会因源码或 OSS 更新而自行更新；手机转发、实板显示与锁屏链路仍需使用通过成品校验的新安装包分别实测。本次也未提交或推送 Git。
