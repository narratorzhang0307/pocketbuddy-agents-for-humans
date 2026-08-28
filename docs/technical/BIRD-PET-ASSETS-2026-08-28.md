# 十二鸟宠物风素材：独立透明资源与 OSS 发布

白头鹎沿用用户已认可的宠物造型，其余十一种鸟已完成同系列更新。鸟与背景保持分离；本次没有修改 T5 工程、刷写 B 板或安装手机。

后续构建清理：当前唯一清单为 `native/frost-badge/ios/BirdCatalog.json`，网页直接导入同一文件。重复的网页 JSON、旧生成器及 48 张旧鸟图已从当前工程移除；Vite 和 Xcode 会检查新版及实际打包字节。下文发布测试数据保留为该次 OSS 发布记录。

## 可复用素材

- 每种鸟保留 1254×1254 真透明 PNG 和无损透明 WebP，完整包含喙、尾巴和双脚，无天空、地面、植物或投影。
- `birds/` 是独立素材；`scenes/` 是与原 T5 背景合成的硬件交付图，不能把后者当作透明原素材。
- 原 T5 背景继续使用 `t5-scenes-v2/backgrounds/`，十二张 PNG 文件和解码像素的 SHA-256 均未变化。
- 透明 ZIP 包含 24 张鸟素材、说明和清单，共 26 项，不含合成背景图片。

[下载透明素材 ZIP](https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/bird-skill/20260828-v1/pet-birds-v3/birds-transparent.zip) · [OSS 分层资源清单](https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/bird-skill/20260828-v1/pet-birds-v3/manifest.json)

![独立鸟素材预览；浅色底仅用于展示](../design/bird-skill-20260828/pet-birds-preview.png)

## 发布与验证

新不可变路径：`pocket-earth/bird-skill/20260828-v1/pet-birds-v3/`。旧图及原背景未被覆盖。

51 个新 OSS 对象上传后通过 HEAD 验证，再通过公开 HTTPS GET 下载核对长度、类型和 SHA-256；同时复核 12 张原背景，总计 63 个公开下载验证。ZIP 内每张 PNG/WebP 也逐项核对哈希。发布对象总计 25,878,358 bytes，包含 12,693,340-byte 便捷下载 ZIP。

硬件只使用 240×240 JPEG，十二张合计 205,944 bytes，最大 22,321 bytes，均低于 65,536-byte 传输限制。高清透明包不烧录进 B 板，固件资源增加为 0。Web 与 iOS 原生目录相同，索引仍为 17–29，识鸟技能头像 index 17 保持不变。目录 SHA-256：`b7503839d862be192d70b4f909b61ec919c6d304d1b58ec13d46c528fcf2831c`。

19 项鸟类素材/蓝牙协议回归及 TypeScript 类型检查通过。透明测试检查真实 alpha、空白边界、PNG 与 WebP 的全部 alpha 和可见 RGB 一致性。Vision 曾误删鹊鸲和喜鹊的白色翼斑，已仅在人工核对的翼部范围内恢复原 RGB；保留棕背伯劳双脚之间的真实透明间隙，避免粗暴填满所有内部空洞。

在独立目录从透明 PNG 原素材重建：51/51 发布文件与已上传版本逐 SHA-256 相同，Web/iOS 清单也完全相同。

原生标准鸟声回图预检 **12/12 识别正确，12/12 返回新版图片 URL**。十二张鸟图及技能头像共 13 个图片事务通过长度、SHA-256、CRC32 与 Mac JPEG 解码检查；7 项异常音频均在识别请求之前拒绝。该预检在 Mac 上重新编译当前原生会话源码，访问实际 HearNature 服务和 OSS；BLE/UIKit 是测试替身，不能作为手机、实体麦克风、ASR、锁屏或 B 板显示证据。详情见本次 `pet-birds-verification.json`。

![新鸟与原 T5 背景的硬件圆屏预览](../design/bird-skill-20260828/pet-birds-t5-preview.png)

## 手机与实板边界

App 的鸟类清单仍内置于安装包。上传新 OSS 文件、更新源码清单，不会自动更换已安装 App 的清单。本轮没有更新手机安装包，没有占用手机蓝牙或连接 B 板。新版图片的手机转发、B 板真实解码/屏幕效果及锁屏链路仍需后续实测。

## 复现

最终 PNG 原素材：`public/assets/bird-skill/20260828/pet-birds-v3/birds/`。原始生成提示词、参考图片哈希、生成文件哈希、透明修复范围：`docs/design/bird-skill-20260828/pet-birds-sources.json`。

当前版本的资源重建入口：

```sh
node scripts/hardware/build-pet-bird-assets.mjs
python3 scripts/release/publish-oss-assets.py --manifest docs/design/bird-skill-20260828/pet-birds-oss-release.json --dry-run
```

旧写实鸟/T5 首帧导出入口 `build-bird-assets.mjs` 已删除，不得恢复为构建入口。本版只使用 `build-pet-bird-assets.mjs`，从已审查的独立 PNG 重建唯一清单，不依赖重新调用图像模型。原始图像生成中间稿并非透明交付物；如需重新抠图，使用 `matte-bird.swift` 和 `refine-bird-matte.mjs`，后者仅接受明确审查的羽毛修复范围，并需重新目检。

详细证据：`docs/design/bird-skill-20260828/pet-birds-oss-verification.json`、`pet-birds-alpha-verification.json`、`pet-birds-verification.json`。本次私有生成、构建和回放证据目录：`/Volumes/PocketBuddy-iOS-Dev/Artifacts/bird-pets-20260828.tK5PML`。
