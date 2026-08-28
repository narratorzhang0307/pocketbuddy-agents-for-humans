# T5 原背景：OSS 发布与回图预检

2026-08-28。原背景已补齐并上传；**本页不是新版图片的 iPhone 或 B 板显示验收记录。**

**历史发布记录：** 本页的写实鸟合成图及生成器已退役，不再属于当前工程构建入口。十二张原背景仍保留并用于宠物版。当前资源与构建约束见 [宠物版素材说明](BIRD-PET-ASSETS-2026-08-28.md) 及项目根目录 `AGENTS.md`。

## 修正内容

T5 在 `buddy_runtime.c` 中为十二种鸟指定独立的 `scene_id`。`city_display.c` 先显示固定背景，再显示鸟的透明精灵。旧版导出只读取了鸟的 PBM 首帧，并铺上纯色底，因此漏掉了原来的月亮、植物和地面。

新版直接解码 T5 工程 `src/display/buddy_assets_data.c` 中的原调色板与 RLE，不重新生成背景。另行编译原 `buddy_assets.c` 解码器，逐像素对比十二张导出的 PNG：**12/12 完全相同**。T5 工程未被修改。

每种鸟发布三个文件：400×400 原背景 PNG、240×240 完整画面 JPEG、256×256 完整画面 WebP。合成沿用 T5 的 466px 舞台、224px 鸟画布及中心 y=-10 的位置比例；B 板继续显示自己的实时状态文字，图片不烘焙 T5 的操作提示。当前是静态首帧，并未移植 T5 的鸟类动画。

![十二鸟圆屏预览](../design/bird-skill-20260828/t5-scenes-preview.png)

## 云端结果

- 新路径：`pocket-earth/bird-skill/20260828-v1/t5-scenes-v2/`，位于现有原生 URL 白名单内。
- **36/36 对象**上传后 HEAD 验证，并重新通过公开 HTTPS GET 下载、逐 SHA256 校验；合计 **568,184 bytes**。
- 十二张完整 JPEG 合计 198,602 bytes，单张 13,007–22,033 bytes，均低于板端 65,536-byte 限制。
- 旧的 26 个本地资源未改动，旧 OSS 对象未覆盖。识鸟技能头像也保持不变。
- Web 与 iOS 的新清单完全相同，SHA256：`9166c89e9b11a065fb0918bd2fd4ff8bf4a27e5bacdee44b84ecaf234b0b425f`。

示例：[白头鹎原背景 PNG](https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/bird-skill/20260828-v1/t5-scenes-v2/backgrounds/pycnonotus-sinensis.png)、[带背景的完整 JPEG](https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/bird-skill/20260828-v1/t5-scenes-v2/pycnonotus-sinensis.jpg)。

## 验证范围

沿用已冻结的实际原生会话可执行程序，只在独立 Mac 测试包中替换新 `BirdCatalog.json`。使用用户指定目录中的十二种标准鸟声，重新执行真实 HearNature 请求和 OSS 下载：**12/12 识别正确，12/12 返回新图 URL**。十二张鸟图和技能头像的 13 个图片事务通过长度、SHA256、CRC32、分块重组及 Mac JPEG 解码检查；7 项异常音频均在识别请求之前被拒绝。相关前端 13 项测试和类型检查通过。

该轮 BLE 和 UIKit 是测试替身，没有把其回执当作实板证据。此前旧图的真实 B 板验收见 [v1 回图记录](BIRD-OSS-RETURN-2026-08-28.md)，不能替代本版验收。

USB 枚举确认了 T5 双串口 `5B22030687`；仅向日志口发送 `bird_test_status` 查询，未收到该命令的状态响应。因此本页的原背景像素来自已核验的 T5 工程数据，并非宣称从正在运行的 T5 内存读回。没有刷写 T5 或 B 板，也没有安装手机。

## 仍需完成

手机内置清单必须随 App 更新；发布新 OSS 文件不会自动修改旧安装包，也不能覆盖旧 URL 绕过 SHA 校验。之后需验证新完整画面的真实 B 板解码回执和屏幕效果，并继续实体收音、真实手机中转及锁屏验收。当前未占用手机的蓝牙连接。

## 复现与交付

生成入口：`scripts/hardware/build-bird-assets.mjs`；发布清单：`docs/design/bird-skill-20260828/t5-scenes-oss-release.json`。生成器读取 T5 工程，只写本项目的图片与 Web/iOS 清单。

详细结果：[t5-scenes-verification.json](../design/bird-skill-20260828/t5-scenes-verification.json)。私有证据：`/Volumes/PocketBuddy-iOS-Dev/Artifacts/bird-t5-scenes-20260828.JJTDEO`，含输入快照、原 C 解码器、上传日志、公开下载校验、原生回放、测试日志和仅含本次识鸟背景改动的 `bird-background-source-patch.tar.gz`。
