# 三种 Frost 律动：OSS → iPhone → 圆屏吧唧试验

## 当前状态：第一种手动闭环已确认，已构建免下载按钮的自动版

- 已从 SSD 原版 Python/PIL 渲染器导出三种律动，没有生成新角色或修改原始树莓派目录。
- 已上传三个 `.fmp` 和一个清单到现有 OSS Bucket；无覆盖旧对象、无改 Bucket 权限或 CORS。
- 四个对象总计 431,837 字节。三个资源重新通过公开 HTTPS 下载，长度和 SHA-256 全部一致。
- 独立传输、下载、播放器和面板模块已接入现有 App/固件入口，下载器已加入 Xcode 编译目标。没有改动原有音频协议、硬件引脚和存储分区。
- 本次 TypeScript 5 个测试文件共48项通过（含7项律动测试），类型检查通过；C++ 解码器全部44帧、RGB565字节序、CRC、截断和非法RLE检查通过。
- ESP-IDF完整构建和Xcode真机签名构建通过。iPhone已安装 `PocketBuddy-MotionTrial-20260827-v1.app`（Build 4），并已启动、确认FrostBadge原生插件注册成功。
- 固件候选 `0.2.11-ojbadge-motion` SHA-256：`187eaa382694fb66bb8603c082ba19156670fdcc89bce30cf8eeb0e93946dec7`。只写 `0x10000` 应用区，旧应用0.2.10和16MiB工厂备份均已核验；完整记录见产物目录 `flash-record.json`。
- 19:29:02设备日志确认槽位0收到110384字节、CRC `16ea1d36`；19:29:03确认13帧、完整循环。用户照片确认圆屏显示日落哼唱。旧手机日志也有原生OSS下载SHA验证。**只能据此确认第一种，不能推断三种全部成功。**
- 用户随后要求取消手动下载。自动版 `PocketBuddy-MotionAuto-20260827-v7.app`（Build 7）已通过8个测试文件共72项回归、类型检查、网页构建、Xcode签名构建，并已于19:44安装、19:45启动。此更新不刷固件、不改原生语音实现。真机自动同步结果以 `FrostMotionAuto-20260827` 目录的日志为准。
- 19:45:45真实iPhone日志确认自动调度器启动；19:46:01实际BLE连接，19:46:04自动下载固定OSS清单并检查缓存（现场0/3）。19:46:59第一包110384字节通过手机/硬件两侧校验，19:47:00自动开始第二包。该链路没有下载按钮触发；后续两包完成情况继续以日志验收，不提前宣称成功。
- 19:48:48手机控制台结束、BLE断开；19:49:36只读设备检查发现已安装版本变成Build 8（此前本任务安装并核对的是Build 7）。本任务没有覆盖Build 8、没有联系其他任务；停止自己持有的串口观察以释放设备。**自动触发及第一包完整传输已实证，第二/第三包的自动完成与播放尚未验收。**
- 本地Build 8安装产物的`FrostBuddyPage-IuhqKvnD.js`仍包含自动调度、缓存核验和自动同步完成逻辑；没有恢复旧下载按钮。19:49:47已观察到再次BLE连接，19:50:39本任务串口观察退出，之后不再持有设备通道或控制台。

本次实装由用户随后明确要求开始实测而执行；本任务不再联系或读取其他Codex任务。无需重复录音。本轮只验收律动，不把原有语音功能的历史结果当作新版语音验收。

## 自动版行为（2026-08-27 Build 7）

- 用户建立BLE连接、收到`motion`能力清单后，App前台自动开始，无需点下载或展开律动面板；首次蓝牙权限/选设备仍由用户决定，不擅自配对其他设备。
- 单例 `frostMotionAuto.ts` 在页面切换、面板收起后继续存在。`frostMotionRuntime.ts`只订阅现有吧唧和同一Frost状态；不新建Agent、不执行工具、不代替权限确认。
- 连接时先用现有stop/query命令核验三个槽的CRC；因为0.2.11固件在播放时query返回帧数，需短暂停止一次以得到CRC，不能把帧数误认作缓存版本。CRC匹配的完整包不重复下载/下发。
- 手机仅在内存缓存固定清单和三包，以减少中断后的重复HTTPS下载。缺失包自动传送并校验。新包在Frost空闲时短暂预览，再跟随现有状态：idle→日落、busy→爵士、celebrate/heart→电子。attention/dizzy/sleep恢复原状态画面，不用开心动画覆盖警告。
- 实体录音、收音收尾、识别/回复语音、手动硬件操作、退到后台或断连会中止后续分块。恢复后自动重查缓存；已经完整提交的包不重传，未完成包重新开始（尚非字节级断点续传）。绝不为了动画关闭用户的语音开关。
- 失败后5秒、15秒各重试一次，仍失败保留错误，不随电量包无限重试。回到前台、网络恢复、重新连接或用户主动重试可重新检查。
- 正常UI仅有自动同步开关、就绪数量、进度；没有“下载并试验三种律动”按钮。开关暂停的是自动同步，已在硬件播放的有效包可继续；错误时保留“重新检查”作为故障恢复入口。
- 此处“自动”是App内部自动调度，不代表已实现后台常驻、锁屏推送、BLE自动重连或任意远程服务器指令。OSS仍是固定三种试验清单，没有修改云端配置或上传更多资源。

## 三种资源

清单：<https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/frost-motion/20260827-trial-v1/manifest.json>

清单 SHA-256：`694c905df2dd78b24c6fc037e68c0f952c630f0423f29767f9689ebc07fdd248`，1605 字节。

| 槽位 | 原版造型 | 律动 | 字节 | 帧数 / 间隔 |
| --- | --- | --- | --- | --- |
| 0 | sunset-playing / 日落哼唱 | bob | 110384 | 12 / 75ms |
| 1 | jazz-playing / 爵士摇摆 | sway | 213470 | 20 / 80ms |
| 2 | electronic-peak / 电子跳跃 | jump | 106378 | 12 / 58ms |

资源 URL 是上述清单同目录的 `{id}.fmp`，精确 SHA-256、整包 CRC32 均在清单内。手机不需要显示动画，仅下载、校验、转发和显示进度。

源目录：`/Volumes/Extreme SSD/pocket earth 决赛/hardware/frost-edge-google/sunset-radio/raspi`。
造型数据 SHA-256：`88e9162ff1a122ae68f5f010adbaf70263982b96dbe02e738ac83ba304ec57a5`。
本次产物、当地预览 GIF、联系表、发布清单及共享入口改前备份位于：
`/Volumes/PocketBuddy-iOS-Dev/Artifacts/FrostMotion-20260827/`。

生成器：`scripts/hardware/build-frost-motion-demo.py`。上传复用了 `scripts/release/publish-oss-assets.py`，读取本机 CLI OAuth 已续期的凭据，不在 App 中放 AccessKey。没有上传 Python 源码、用户录音或私人数据。

## 文件格式与缓存

FMP1 是有限尺寸的纯数据，不含可执行代码。20 字节头：magic、width、height、frames、frame_ms、palette_count、reserved、payload_crc32；整数均为小端，前六个数值为 uint16，CRC 为 uint32。

载荷为 RGB565 调色板、`frames+1` 个绝对帧偏移 uint32、每帧 RLE `(count:uint8, palette_index:uint8)`。最多 144×144、32 帧、64 色、512KiB/包；全帧像素计数、偏移、CRC、边界在设备校验后才能使用。

本次只使用三个 PSRAM 槽和一个暂存包，不格式化或写入现有 storage 分区。包完成后才替换旧槽；断连或接收空闲15秒丢弃未完成包，已有有效包继续可用。**设备重启后需重新传送**，不是已完成持久化。运行像素缓冲约40.5KiB；实际总占用需真机验证。

## 已注册的最小传输协议

保留 Agent_link `0x33` 路由；新增输出 ID `motion`，业务参数：

| 操作 | 参数 |
| --- | --- |
| 开始 | `[0, slot, total_bytes LE32, whole_file_crc32 LE32]` |
| 分块 | `[1, slot, offset LE32, bytes...]`；按实际写入上限扣除全部帧头 |
| 提交 | `[2, slot]`；设备验证全部数据和结构 |
| 播放 | `[3, slot]`；由设备计时循环 |
| 停止 | `[4, 0]`；恢复原状态画面，丢弃未完成暂存包 |
| 查询 | `[5, slot]` |

业务回执通过自定义事件 `0x64`：`[1,4,slot,status,value LE32]`。status：1开始、2已收到的偏移、3安装完成CRC、4已绘制帧数、5停止、128错误码。播放成功需收到大于一周期帧数的回执；仍需肉眼确认屏幕，不能由回执宣称屏幕像素已经正确可见。

手机每次操作同时等控制响应和匹配槽位/状态/值的业务回执。缺包、CRC错误、换连接、录音中或超时均不计成功。当前沿用未加密的开发 BLE 链路，只适合受控现场，未实现生产级设备归属认证。

## 已完成接入与现场操作

- `ojbadge.cc` 在显示初始化后创建Player，注册`motion`输出，将数据复制到队列；原UI循环调用Tick。原录音提示层保持最上层，录音期间暂停动画。
- `FrostMotionDownload.swift` 加入Xcode Sources和原生插件方法清单；限定当前OSS前缀及SHA256。OSS不向`capacitor://localhost`返回CORS，因此使用原生HTTPS，没有修改整个Bucket规则。
- `FrostBadgeClient`仅增加原有串行命令队列的motion发送入口和实际MTU预算读取；`FrostMotionBridge`复用该队列。
- `frostMotionRuntime.ts`绑定真实原生下载和蓝牙包监听，传输必须App前台；语音开启或录音时禁用面板入口。
- `FrostMotionPanel`已接入原有吧唧面板；Build 7显示自动同步状态，没有手机动画画布，不改用户语音模式。
- 安装保护脚本 `scripts/hardware/flash-frost-motion-trial.py` 精确核对板卡MAC `94:A9:90:2B:39:44`、原应用、备份和分区，烧录后独立读回整个应用计算SHA256，并再次比较分区。
- iPhone入口（Build 7）：Frost → 展开“电子吧唧” → 扫描并连接 `Frost-OJBadge`。之后无需下载点击，空闲前台自动核验/同步，手机仅显示进度。语音开启但处于等待说话时允许同步，实际语音活动时自动让路。
- 完成后跟随同一Frost的真实状态切换；不再靠三个人工播放按钮驱动。不要在试验中重启吧唧，缓存当前仅在内存。
- 只记录原生下载SHA、硬件安装CRC、播放帧数及目视结果；日志不收集音频或对话文字。现场有界观察脚本：`scripts/hardware/observe-frost-motion-trial.py`，每次最多15分钟，支持准确停止标记，不复位设备。

待验收：Build 7在只建立连接、不点击下载的情况下，自动下载缺失包并完成下发。手机日志需有 `auto_coordinator_started`、`auto_cache_checked`、缺失包的`phone_https_verified`及`phone_to_badge_verified`、`auto_sync_complete assets=3 manual_download=0`；播放需有手机回执与设备`playback ... full_cycle=1`，最后由用户确认圆屏画面。只有三种都通过后再讨论批量，不扩大到483种或服务器后台推送。

## 手机作为中转站的边界

设计可行：服务器保存Agent状态/素材版本，手机接收或拉取信号并转成蓝牙指令，硬件本地播放，并回传输入和状态。共享应基于同一Agent/设备标识，不复制出另一套互相冲突的记忆。

本次范围是**前台三种资源闭环**，不是后台常驻推送、长连接恢复、设备绑定或多设备同步的完成证明。iOS后台执行受系统约束，需独立设计与验收：[Apple Core Bluetooth后台说明](https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/CoreBluetoothBackgroundProcessingForIOSApps/PerformingTasksWhileYourAppIsInTheBackground.html)。
