# Frost 与当前 Skills 头像

本批已完成 **16 个原有 Skill + Frost = 17 张独立头像**，接入「谷歌大赛」项目。

## 后续版本交接（2026-08-28 02:12）

已核对识鸟任务的 [0.2.15 验证记录](../bird-skill-20260828/verification.json) 和 [交接文档](../../technical/BIRD-LISTENER-B-BOARD-2026-08-28.md)：B 板已接续到 `0.2.15-ojbadge-birds`，保留本批 16 套 OSS 头像、原有索引和离线小狗，并新增 13 张云端鸟类图片。该任务记录了 29 张远程图的实际 BLE 解码与串口匹配、应用独立读回及分区/OTA 不变。下文保留本任务亲自验证的 0.2.14 基线，不表示需要把设备回刷到旧版。

**手机候选 `2026082804` 尚未安装，手机黑屏完整链路和新圆屏实拍仍未验收。** 本轮交接仅更新文档，没有再操作串口、BLE 或手机。

## 查看

- [整套总览](contact-sheet.png)
- [交互图库](../../../public/assets/skill-avatars/20260827/index.html)：点击头像，查看 240px 圆屏满幅模拟效果，轻触状态在 3.5 秒后收起。
- 开发服务运行时：[本地预览](http://127.0.0.1:5187/assets/skill-avatars/20260827/index.html)。也可以直接用浏览器打开图库 HTML。
- [初版素材包](frost-skill-avatars-17.zip)：17 张原图、网页版本和 128px 旧版硬件导出。240px 满幅版见当前图库与 `hardware-round/`。

## 240px 圆屏 + OSS（0.2.14，已刷入并验证）

根据用户实拍，将原来的 128px 方形贴图改为原生 240×240 满幅图，圆屏自然裁切四角。17 张原图不变，背景一直延伸到圆边。平时只显示头像；开机、换图、连接变化或轻触圆屏时显示小状态标签，3.5 秒后收起。录音仍使用独立中文提示，不改变物理按键和麦克风授权逻辑。

- [单张圆屏截图](fullbleed-frost-preview.png)、[17 张圆形裁切预览](fullbleed-contact-sheet.png)：均为布局模拟，不是实拍。
- **仅小狗内置**：14,126 字节 JPEG。二进制逐项检查确认另 16 张 JPEG 不在固件内。高清原图与旧版导出保留，不占设备空间。
- **16 个 Skill 使用阿里云 OSS URL**：[完整 URL 表](oss-avatar-urls.md)。已发布 16 个 WebP 和 16 个 240×240 baseline JPEG，共 32 个对象、258,970 字节；全部实际下载并校验长度、SHA-256 和 Capacitor CORS。
- 固件 2,312,752 字节，3 MiB 应用分区剩余 832,976 字节（约 26%）；头像解码双缓冲、接收缓冲与单张缓存合计占 PSRAM 361,472 字节。远程图只放 RAM，不写 Flash。
- 真机已完成应用分区备份、仅写入 `0x10000`、9 块独立读回逐字节校验；分区表与 OTA 选择不变。启动、外设和首帧 LCD DMA 通过，详见 [设备记录](oss-device-verification.json)。
- **16 张实际 OSS → 电脑 BLE → 圆屏传输全部通过**：每张收到匹配 CRC 的解码回执，并与设备串口渲染日志交叉核对。重复 commit 不重复解码；重连后一字节选择命中缓存；断连自动回到小狗。结束时已恢复小狗，详见 [BLE 记录](oss-ble-verification.json) 和 [设备渲染日志](oss-device-display.log)。
- [108 项相关测试](oss-tests.log)、[类型检查](oss-typecheck.log)、[C++ 协议测试](oss-protocol-tests.log)、[固件编译](oss-firmware-build.log)通过。浏览器逐张验证 17 张满幅预览、16 张 OSS 图片加载及状态自动收起，见 [预览记录](oss-browser-checks.json)、[截图](oss-gallery-browser.jpg)。
- **验证边界**：上述 BLE 客户端为电脑，不能代替安装后的 iPhone App 实测；尚未收到此次满幅版的新实拍，不把日志或浏览器截图当作肉眼确认。设备和手机安装已交接给「构建开发板B板识鸟链路」任务，0.2.15 的后续状态见本页顶部交接说明。

0.2.13 满幅小狗预览也已成功刷入、独立读回并启动；其临时内置 17 张图的历史记录见 [0.2.13 验证](verification-0.2.13.json)。此前握手失败已解决，不是当前阻塞。

## 生成与保留

按用户截图和 `ip-as-logo` 规范设计：圆润角色、简洁表情、清楚的色块对比，每个 Skill 使用独立形象。Frost 保留焦糖腊肠犬身份。

用户在说明模型入口限制后确认使用内置 `image_gen`。工具没有返回模型版本，**不把结果标记为已验证的 GPT Image 2**。17 张都是实际生图结果，并非代码绘制替代。Strava 有一次未产生文件的网络失败，技术重试后成功；未因审美或规范偏差自动重画、修补或筛掉原图。

- 原图：`public/assets/skill-avatars/20260827/originals/*.png`，1254 × 1254。
- 网页：同目录下 `web/*.webp`，256 × 256。
- 硬件：同目录下 `hardware/*.rgb565`，128 × 128，每张 32,768 字节，小端 RGB565；PNG 为量化后的显示预览。
- [完整提示词](prompts.jsonl)、[角色设计](manifest.json)、`results-*.json` 保留生成记录。
- [原图校验](source-integrity.json)：17 张均与生图工具输出逐字节相同，SHA-256 各不相同。缩放与量化只用于派生导出，不覆盖原图。

范围取自 `builtins.ts` 与 `externalHealthBuiltins.ts`。MY SKILLS 当前页面展示其中 12 项，其他已发布能力同样拥有头像；未扩大发布范围，未复活历史文旅 Skill。医院子 Agent 不是这 16 个 Skill 之一，保留其原入口。城市场景卡片和 3D 搭子的全身素材也保留原样。

## 接入行为

Skill 卡片、Skill 页标题、Frost 对话身份卡与 Agent 入口使用新头像；发布者文字身份保持不变。统一映射在 `src/app/lib/skill/avatars.ts`。

硬件依据当前页面入口、真实 `skill.dispatched` 事件、只读 Skill 结果或实际子 Agent 委派结果选择头像。仅有助手口头声称或未执行的计划不会换成被提到的技能。新用户消息先回到 Frost；未知或自定义 Skill 回退到 Frost。Her Motion 与 MediaPipe 共用页面，但保留各自头像身份。

`avatar_skill_v1` 接收一个字节的头像编号；0 是内置小狗，其他编号仅在缓存命中时显示，否则回到小狗。新能力 `avatar_jpeg_v1` 支持带事务编号、长度和 CRC32 的 begin/chunk/commit。手机从固定 OSS URL 下载并核对 SHA-256，硬件收到完整文件并验证 CRC32、240×240 尺寸与 JPEG 解码成功后才切换，不能把命令入队 ACK 当作图片显示成功。

旧固件按能力协商继续使用原编号选择。录音、音频尾包接收和播放期间暂停头像传输；新选择会取消旧下载，只显示最新技能。断网、超时或校验失败保留小狗；不把半张图显示出来，不改动麦克风、ASR 或语音授权逻辑。

## 初版 0.2.12 验证（历史）

详见 [历史验证摘要](verification-0.2.12.json)；当前满幅版见 [验证摘要](verification.json)。

- [Vitest](tests.log)：7 个测试文件，79 项通过。覆盖全部发布技能、共用页面、未知技能、真实事件、录音延后、旧固件兼容、快速切换、重连，以及已有语音与卡片行为。
- [网页构建](web-build.log)：通过；已有大体积 chunk 警告仍在。
- [类型检查](typecheck.log)：最终通过。早期运行曾遇到未改动的 `frostSkillAnswer.ts` 三处错误，本次未修改该文件；最终以当前工作区检查结果为准。
- [C++ 协议测试](protocol-tests.log)：通过，包括头像编号边界、RGB565 字节序及既有录音/隐私/MTU 测试。
- [ESP-IDF 5.5.4 固件编译](firmware-build.log)：通过，ESP32-S3 OJBadge。0.2.12 应用镜像 2,850,000 字节，3 MiB 应用分区剩余 295,728 字节（约 9%）；后续扩充头像需关注空间。既有触摸接口弃用警告保留。
- 浏览器实际检查：17 个图库按钮都切换到对应硬件预览，图片全部加载；MY SKILLS 12 张卡片与 Frost 正常，睡眠技能页能打开并显示猫头鹰。查看 [Skills 页面](app-skills-mobile.png)、[Frost 页面](app-frost-mobile.png)、[睡眠页](app-sleep-mobile.png)、[图库](gallery-browser.png)。

**2026-08-28 已刷入真机并独立读回校验，已看到 17 张资源初始化、外设就绪与首帧 LCD DMA 日志。** 开机离线默认显示 Frost。第二次电脑 BLE 轮播成功：17 个编号均收到 ACK，并逐一对应串口渲染日志，结束后已恢复 Frost。用户后续实拍确认了初版方形头像的显示，并据此要求满幅改版。详见 [上板记录](../../technical/OJBADGE-SKILL-AVATARS-2026-08-28.md)。图库圆屏仍是模拟预览，不能充当实物照片。

## 重建

在项目根目录执行 `node scripts/hardware/build-skill-avatar-assets.mjs`，从保留的原图重导出网页、旧版 RGB565、240px JPEG、仅小狗的固件数组、OSS 发布清单和图库。生成器与后续识鸟任务共用，重建前确认新增索引已经合并；不得恢复旧生成器覆盖扩展标签。不可变 OSS 目录内的文件不应覆盖，改变图像编码或内容时应发布新目录。

只测头像云传链路（不发送音频或麦克风命令）：

```sh
/Users/zhangcheng/.local/share/pocketbuddy-esp/ble-venv/bin/python hardware/ojbadge-agent-link/tests/ble_smoke.py --avatar-oss --touch-seconds 0
```

此命令会轮播 16 张云端头像，最后恢复小狗。先确认其他任务及手机没有占用设备。`--avatar-demo` 只适用于历史内置整套图的版本，不应用于 OSS 固件。

硬件首次加入新源文件后，激活已有 ESP-IDF 5.5.4 环境，在 `hardware/ojbadge-agent-link` 执行 `idf.py reconfigure build`。0.2.12 已按现场分区表仅写入 0x10000 应用分区，未更改分区表、OTA 选择或设备配置。备份和读回记录保存在私有目录，不能上传原始备份。
