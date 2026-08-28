# OJBadge × Frost：首次烧录验证记录

> 本文保留首次 `0.1.0` 上板的历史证据。当前硬件已更新为 `0.2.0-ojbadge-audio`，最新能力、哈希和待验收项见[音频与 App 实施记录](OJBADGE-AUDIO-APP-IMPLEMENTATION-2026-08-27.md)。

日期：2026-08-27。当前范围是 **B 板适配与 Agent_link 设备端协议**，不是完整 Frost App 联调。

**当前结论：首次烧录及基础双向 BLE 联调通过。** 已有实物照片确认显示，并收到真实触摸回传：设备计数 `14`，坐标 `(78, 123)`，协议解析错误为空。此结论仅覆盖开发机与 B 板，不代表 Frost App 已接入。

## 固件与备份

- 源码目录：`hardware/ojbadge-agent-link`；基于官方 Agent_link 提交 `3c93ecfcdc473c952a0e85d9797c2663e9ba7d87`，保留 MIT 许可。
- 构建环境：ESP-IDF **v5.5.4**；固件版本 **0.1.0-ojbadge-bringup**。
- 目标：ESP32-S3 rev0.2，16MiB Flash、8MiB PSRAM；烧录时 USB 串口 `/dev/cu.usbmodem1101`。串口可能变化，下次操作必须重新核对设备身份。
- 出厂固件为 `xiaozhi 2.0.5`。覆盖前已分 16 个 1MiB 块完整读取，每块与设备校验，再拼接为 16MiB 恢复镜像。未改写 eFuse。
- 私有备份目录：`/Users/zhangcheng/.local/share/pocketbuddy-esp/backups/ojbadge-94a9902b3944-20260827-142218/`。备份可能含设备配置，不应上传仓库或公开分发。
- 恢复镜像 SHA256：`3d20126242812d79f12496da722ac85ede98b2f48a3de21e6205b7269f7e954f`。
- 已烧录应用镜像 SHA256：`5469e2dbe56b624947dac3c4371214eed8266b2ba95f0ad21381f39275fe8ee6`。

之前经扩展坞读取曾掉线；改为电脑直连后完成备份、烧录和测试。一次读取因测试程序的时间上限停止，不等同于设备掉线。旧的不完整备份不可用于恢复。

## 已验证

| 检查 | 实测结果与边界 |
| --- | --- |
| Flash 写入 | bootloader、分区表、OTA 初始数据和应用共 4 个镜像均收到 esptool 的哈希校验成功结果；本地镜像哈希已再次核对 |
| 启动 | 实际启动新版本；检测到 16MB Flash 和 8MB PSRAM，PSRAM 内存检查通过；已观察的日志窗口没有 panic 或连续重启 |
| 屏幕驱动 | GC9A01 初始化成功，首帧 LCD DMA 完成；这不能替代肉眼确认颜色、方向和文字 |
| 实物显示 | 用户提供的照片确认圆屏亮起，能读到 `FROST / OJBADGE`、`CELEBRATE`、`BLE OK` 和 `WAITING FOR APP`，黄色圆角脸及双眼可见，文字没有颠倒或镜像；静态照片不能验证眨眼动画 |
| 触摸芯片 | I2C 初始化成功，CST816 系列驱动读到 ID `182 / 0xB6`；尚不等于已收到触摸事件 |
| 本地触摸 | 用户确认按住圆屏后，`BLE OK` 会变成 `TOUCH` 及计数；本地识别和 UI 更新已由用户确认 |
| BLE 触摸上行 | 真实点击后收到 `0x64` 自定义事件：设备计数 `14`，`x=78`、`y=123`；本次捕获 1 条事件，计数 14 不代表测试程序捕获了 14 条；协议解析错误为空 |
| BLE | Mac 实际扫描并连接 `Frost-OJBadge`，协商 MTU 256 |
| Manifest | 收到 462 字节、2 个分片的完整清单；能力 `0x0084`，端点 `avatar_state`、`touch0`、`screen0` |
| 下行命令 | 通过官方 `0x33` 指令发送 `screen0 = BLE OK` 和 `avatar_state = 4`，均返回成功响应 |
| UI 应用 | 串口进一步确认文字已应用、状态切换为 `CELEBRATE`；不只检查 BLE ACK |
| 主机回归 | C++ 协议测试通过：MTU 23–517 的分片均不越界且重组无损；BLE 测试脚本语法检查通过 |

证据保存于上述私有备份目录：`first-flash.log`、`first-boot.log`、`ble-integration.log`、`ble-touch-confirmation.log`、`flash-record.json`，以及用户提供的 `display-photo.png`。照片含用户周边环境，不放入源码仓库。BLE 测试正常结束时会主动断开，固件重新广播；这本身不是 USB 掉线或设备关机。照片中的 `BLE OK` 是之前下发后保留的文字；实时连接状态是底部 `WAITING FOR APP`，不能据此宣称 Frost App 已连接。

触摸复测曾有 40 秒和 90 秒窗口未收到事件；确认本地触摸正常后，在第三次测试的 240 秒等待上限内收到真实事件，测试正常退出。最终结果包含 `manifest=true`、`commands_acknowledged=true`、上述 `touch_events`，以及空的 `protocol_errors`。不把前两次未收到事件推断为硬件损坏，也不宣称已测完所有坐标、手势或长时间连接稳定性。

## 尚待验收

- 动态眨眼效果仍需现场观察或视频；静态显示已由照片确认。
- 当前验证了单次触摸上行；全屏坐标映射、连续点击、手势及长时间连接稳定性不在本次已通过项目中。
- Frost App 尚未接入 BLE；本次测试使用开发机 Python/bleak，不能替代手机实测。

## 接入我们自己的软件

固件保留官方 Agent_link 的服务 UUID、FFC1 命令响应、FFC4 事件及 I/O 清单，新增 B 板适配和 `avatar_state` 端点；未绑定官方 App 或云端账号。它为自研客户端预留接口，但不会自动让现有 Frost App 获得蓝牙能力。

下一步在现有 Capacitor App 内实现原生 BLE 桥与权限、扫描连接、通知订阅、协议分片及断线恢复，再把 Frost 运行状态映射到 `avatar_state` / `screen0`。硬件触摸先作为输入事件交给 App，不直接转换为任务完成、工具结果或用户审批。设备归属校验与可靠业务回执也需另行实现。

本版未启用 Wi-Fi、语音、OSS 图片下载、TiDB Agent Stack、OTA 和完整中文字体。没有把 Wi-Fi 密码或云端凭证写入固件或仓库。

用户后续已明确要求麦克风、扬声器、电量计全部实现，现已列为下一版必做功能；这不改变本记录对应固件的实际能力范围。驱动复用位置和分别验收标准见固件说明，尚未将这些项目标为实现或验收通过。

构建、协议字段和复测命令见[固件说明](../../hardware/ojbadge-agent-link/README-OJBADGE.md)。
