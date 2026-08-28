# OJBadge 初版内置 17 张头像：0.2.12 历史记录

后续已完成满幅小狗 0.2.13 和「仅小狗内置、其余 OSS」0.2.14 的刷写与校验。最新方案及证据见 [头像 README](../design/skill-avatars-20260827/README.md)。本页保留初版记录，不能用于判断设备现在的固件、容量或传输方式。

日期：2026-08-28。用户明确要求把整套头像放到实体硬件上观看。

## 已完成

- 真机核对：ESP32-S3 rev0.2、16 MiB Flash、8 MiB PSRAM；USB 身份与此前板子一致。安全启动与 Flash 加密关闭，未写 eFuse。
- 17 张头像以 128×128 RGB565 编入 Flash，总计 557,056 字节（544 KiB）；显示缓冲只申请 32,768 字节（32 KiB）PSRAM。高分辨率原图仍保留在项目中。
- 新版本 `0.2.12-ojbadge-avatars`，应用 2,850,000 字节，SHA-256 `37a0e9174aa5f6753f3a7daf856c9174fff26e62938c6f3507b7b70be26d5bbe`。
- 设备当前 3 MiB 应用分区剩余 295,728 字节，足够此次 17 张头像。整片 Flash 剩余空间不能等同于应用分区余量；以后增加大量头像需要重新评估分区或资源存储方案。
- 写前完整读取并校验现场 0.2.11 应用分区，验证原有 16 MiB 出厂备份。只写 0x10000 应用；写后独立读取全部新应用并比对 SHA-256。现场分区表与 OTA 选择数据前后相同。
- 真机启动日志确认新版运行、全部 17 张头像初始化、PSRAM=8,388,608、touch/battery/audio/talk_button 均为 1，首帧 LCD DMA 完成。观察窗口没有 panic 或重复启动。
- 开机默认选择 Frost，无需连接手机或网络。头像切换只传一个编号，不上传图片。

## 现场预览状态

第一次开发机 BLE 轮播没有执行：扫描时设备已经被手机连接，串口记录了另一客户端的真实语音通信。已告知用户断开手机连接。第二次成功连接，17 张头像每张停留约两秒；全部收到 ACK，串口依次记录 `Skill avatar applied: index=0..16`，最后再次记录 `index=0 name=FROST`。测试结束已断开开发机 BLE，设备保留 Frost。

本次已确认刷入、启动及全部 17 张的真实 BLE 指令与设备渲染日志，**尚未由照片或用户反馈确认可见颜色与方向**。没有把这些日志当作实物照片。

## 复测与恢复

手机断开后，可用现有 BLE 环境执行：

```sh
/Users/zhangcheng/.local/share/pocketbuddy-esp/ble-venv/bin/python hardware/ojbadge-agent-link/tests/ble_smoke.py --avatar-demo --touch-seconds 0
```

该模式每张停留两秒，最后恢复 Frost；不发送开麦、扬声器或云端请求。BLE ACK 需要与串口 `Skill avatar applied` 日志交叉核对，仍不能代替肉眼确认。

本次构建、现场分区、备份、写入、独立读回、启动与 BLE 尝试日志位于用户私有目录 `/Users/zhangcheng/.local/share/pocketbuddy-esp/skill-avatars-20260828/`。完整可恢复旧应用为 `rollback/app-slot-0.bin`，不要上传设备备份。若需要恢复，只在再次核对同一设备与分区后写回该应用，不能整片擦除或改写配置。
