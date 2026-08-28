# 识鸟直接打开与实板回图验收

日期：2026-08-28。仅处理识鸟入口和本轮识鸟链路测试。

## 入口修复

截图原话“帮我打开下识别鸟类声音的agent”此前未命中识鸟规则。现在：

- 手机与 Swift 原生同时识别“鸟类声音”“鸟的叫声”等说法，保留否定与退出分支。
- 明确打开识鸟的指令直接进入 `frost-bird-listener`，不再经过“自然时刻”计划卡和额外的运行按钮。
- 原生识鸟状态会带动手机打开 Skill；锁屏时不操作页面，恢复前台后同步当前识鸟状态。
- 打开页面后，在蓝牙能力就绪时自动准备识鸟；不会因重复状态、录音中、失败或主动退出而自动重启。
- 首屏明确提示“按住 B 板屏幕录音”。自动准备不等于开麦：实体触屏长按仍是采音条件，松手后才识别和回图。

代码位于 `src/app/lib/birdListener.ts`、`src/app/components/BirdSkillPage.tsx`、`src/app/App.tsx`、`frost-agent/harness/skillRouter.ts`、`native/frost-badge/ios/FrostBirdProtocol.swift`、`native/frost-badge/ios/FrostBirdSession.swift`。未改服务器、固件或鸟图清单。

## 本轮实际验证

| 检查 | 结果 | 范围 |
| --- | --- | --- |
| 前端回归 | 6 文件，264 项通过 | 含截图原话、直接跳页、自动准备、防重复启动与录音/头像互斥 |
| TypeScript | 通过 | 当前工作区源码 |
| Swift 协议与生命周期 | 通过 | 本机编译测试；不是手机黑屏验证 |
| C++ 协议 | 通过 | 实体长按门控、录音状态、图片事务、CRC 与分片 |
| 浏览器原话跳转 | 通过 | 430×932；直接出现识鸟页面，无额外运行点击；浏览器无原生 BLE |
| 标准鸟声 → 现有识别服务 | 12/12 与样本标注一致 | 用户指定录音，每个鸟种一段；不是野外准确率 |
| OSS → 实板 | 13/13 图片成功 | 识鸟头像及十二张新鸟图；真实 BLE 解码回执与串口 CRC 均匹配 |

回放使用当前生产 `FrostBirdSession.swift` / `FrostBirdProtocol.swift`；只为 Mac 测试移除 UIKit import 并提供系统生命周期替身，录音输入来自指定的标准文件。识别请求、OSS 下载及图片发送由实际原生识鸟代码执行，BLE 下行连接真实 B 板。**电脑代替了手机，录音输入是文件，不是板载麦克风。**

当前实板实际读取的固件为 `0.2.21-ojbadge-frost-sw`，MTU 256。本轮未刷写固件。12 次识别都成功，13 次图片上传均有唯一事务的匹配回执；重复收到的回执已按 index/token/CRC 去重，不能把 99 条通知当作 99 次图片解码。

图片全部属于 `bird-skill-pet-birds-v3`，保持新宠物鸟与 T5 背景合成后的圆屏 JPEG；独立鸟素材和背景的解耦结构未改变。原录音逐 SHA256 复核未变。回放识别到回图中位耗时约 6.62 秒，不含真人录音、真实音频上行和 iPhone 调度。

结束时实板观察到 `BIRD mode=0` 和 BLE 断开；没有用肉眼或相机确认屏幕颜色，因此只声称取得板端 JPEG 解码及应用记录。

## 手机范围

入口修复曾从当前根目录完整构建并保留数据覆盖安装为 `2026082814`。实际包包含新原生识鸟规则、ASR 上下文及录音页面。首次启动检查被 iOS 的 `Locked` 状态拒绝，未取得该包的真人链路证据。

随后用户明确要求先不处理 App、以后重新构建，已停止手机操作。**本轮不声称“B 板麦克风 → iPhone → 服务器 → B 板”或黑屏闭环通过。** 新包需继续用真实实体按压验证手机收音、服务结果、对应图片解码回执，再单独验证锁屏。

## 证据与复现

- [机器可读报告](../design/bird-skill-20260828/direct-open-and-board-return-verification.json)
- [浏览器截图](../design/bird-skill-20260828/direct-open-browser.png)
- 原始本轮日志及编译/安装回执目录：`/tmp/bird-direct-open-85_qe_sc`

实板回图测试使用 `scripts/hardware/verify-bird-session.py --live --one-per-species --ble-python <有 Bleak 的 Python>`；输出目录必须是新目录。只连接已确认的 B 板，运行期间不要同时让手机占用 BLE。此脚本不能替代手机或实体麦克风验收。
