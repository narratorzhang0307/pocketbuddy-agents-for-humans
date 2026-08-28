# Frost 长眯眼 · 0.2.18

> 后续已新增单眼表情并安装 0.2.19，单双眼均保持约 1.6 秒。最新记录见 `../frost-wink-20260828/README.md`；此页保留 0.2.18 的历史证据。

按用户反馈，将眯眼停留从 120 ms 延长到 **1,600 ms**；两次眯眼开始之间间隔 4,800 ms，期间约有 3.2 秒睁眼动嘴。待机/离线仍循环，录音和其他技能显示仍可立即中断眯眼。

预览 GIF/WebP 的眯眼帧也延长至 1,600 ms，预览循环为 4.56 秒。预览是示意，不是实机视频。没有重新生成或修改小狗图像、其他头像或 OSS catalog。

已安装固件 `0.2.18-ojbadge-frost-blink`，2,362,016 字节，SHA-256：

`4a7bd4d993910b4f9b6321a27713f74d33db65ae3f877e7b3ee726cc7bceeb21`

已先完整备份上一版 0.2.17，仅写入 `0x10000` 应用分区。10 块物理读回与候选逐字节一致；前 64 KiB 的 bootloader、分区表、NVS 和 OTA 元数据保持不变。编译、C++ 时序测试和 93 项相关头像测试通过。

设备日志记录新版本启动、首个 LCD DMA 完成与约 1.6 秒的眯眼呈现间隔。完整运行与计时结果见 `verification.json` 和 `live-loop.log`。计时在板端图像帧切换处采集；不等同于摄像机测量，没有新肉眼照片验收。

私有备份、烧录和观测脚本：`/Users/zhangcheng/.local/share/pocketbuddy-esp/frost-blink-20260828/`。独立源码快照与构建：`/Volumes/PocketBuddy-iOS-Dev/Artifacts/frost-blink-20260828/`。未操作手机，未把原始 Flash 备份复制进项目。
