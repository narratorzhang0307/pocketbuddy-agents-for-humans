# Frost OJBadge 固件：头像、电量与音频接入

## 当前：0.2.12 内置 Skill 头像（2026-08-28）

已刷入并独立读回验证 `0.2.12-ojbadge-avatars`。17 张 128×128 RGB565 头像常驻 Flash，共 544 KiB；显示缓冲占用 32 KiB PSRAM。开机无需手机或网络即选择 Frost。新增 `avatar_skill_v1` 端点接收单字节编号 0–16，App 可按 Skill 选择头像。

只更新原有 0x10000 应用分区，已完整备份此前 0.2.11 应用并校验；未改分区表或 OTA 选择。新应用 2,850,000 字节，3 MiB 应用分区剩余 295,728 字节。实际启动确认 17 张资源、8 MiB PSRAM、触摸、电量、音频及实体键就绪，首帧 LCD DMA 已完成。可见颜色与实际切换验收状态详见[头像上板记录](../../docs/technical/OJBADGE-SKILL-AVATARS-2026-08-28.md)。

开发机可在手机断开吧唧后运行 `python tests/ble_smoke.py --avatar-demo --touch-seconds 0`，每张显示两秒并最终恢复 Frost；该选项不会发送麦克风或音频命令，也不会自动调用模型。

## 历史：0.2.10 电量与音频接入

基于主办方 Agent_link 提交 `3c93ecfcdc473c952a0e85d9797c2663e9ba7d87`，保留其 MIT 许可。当前已烧入并读回验证 **`0.2.10-ojbadge-delivery` 真实按键采音及状态传输修复固件**（2026-08-27 19:04）。用户已用先前 0.2.7 提示确认说话键；新版在蓝牙就绪后按住 SW2/GPIO0 约600ms，真正录音时显示“正在倾听说话 / 松手结束录音”，松手结束。触屏和远程命令不能开麦。

手机本机 ASR 和同一 Frost 会话的最新进展见[真人语音验收记录](../../docs/technical/OJBADGE-PTT-PHONE-ACCEPTANCE-2026-08-27.md)。**0.2.10/v5已实测真人麦克风→手机完整音频：39360采样、78720字节、2.46秒，完整性校验通过，设备入队丢包0。** 本机ASR句子、同一Frost实际回复及手机回复回放仍待验收；峰值饱和也需另验人声清晰度。

**源码与设备均为0.2.10：** 只写0x10000应用分区；写前核对目标、原0.2.9、出厂备份和现场分区表，写后独立读回校验通过。保留0.2.9的未连接/音频异常提示，新增录音开始/结束状态的有界拥塞重试；成功入队不重复发送，断连或开始前松手取消，不改变音频格式、引脚或驱动。启动已见34/34字形及touch/battery/audio/talk_button均为1。0.2.9真人实测两次采到非零音频、手机收到开始事件，但结束/完整性未通过；0.2.10仍需新一轮实测。私有记录为 `~/.local/share/pocketbuddy-esp/capture-delivery-0.2.10/flash-record.json`。

此前0.2.5已完成真实电量读取，**用户已确认双提示音、MiniMax“你好”和“Venture D 硬件赛道”可听到**。0.2.5可用备份保持原样；0.2.6只编译过，从未烧录；0.2.0～0.2.3旧无声测试备份已按要求移到废纸篓。音频和手机联调状态见[实施记录](../../docs/technical/OJBADGE-AUDIO-APP-IMPLEMENTATION-2026-08-27.md)。

收到的侧面照片有上下两颗银色按钮，但没有可读位置标识。用户随后要求直接用屏幕提示识别，故先烧入只显示反馈的0.2.7；不据此认定下面那颗一定是BOOT。

**2026-08-27 上板进展：** 已完成原固件 16MiB 全量备份、烧录后哈希校验、启动检查及开发机真实 BLE 下发，用户照片已确认文字和表情显示；真实触摸也已通过 BLE 回传（设备计数 `14`，坐标 `78,123`）。基础双向通信通过，动画效果、长期稳定性及 Frost App 联调仍待验收；详情见[烧录验证记录](../../docs/technical/OJBADGE-FLASH-VALIDATION-2026-08-27.md)。

## 构建

激活 ESP-IDF **v5.5.4** 后，在本目录运行：

```sh
idf.py -D 'SDKCONFIG_DEFAULTS=sdkconfig.defaults;sdkconfig.defaults.ojbadge' set-target esp32s3
idf.py build
```

`set-target` 用于首次初始化独立固件目录，后续通常只需要 `build`。ESP-IDF、下载依赖和 build 输出不进入 App 源码依赖。不要在不确定串口和备份状态时运行 flash；按 `build/flasher_args.json` 中实际生成的偏移烧录，不照抄其他板子的命令。

## 本版本能力

- `Frost-OJBadge` BLE 广播，沿用官方 UUID、FFC1 命令响应、FFC4 事件和 I/O manifest。
- GC9A01 240×240 TFT，LVGL 8.4 双缓冲局部刷新，显示状态和简单眨眼。
- CST816 系列触摸使用主办方公布的 GPIO 43/44/46/38；真机已读到芯片 ID `0xB6`，本地触摸计数和单次真实坐标回传已验证；全屏坐标映射和连续手势另行验收。
- 官方 `screen0` 输出；自定义 `avatar_state` 输出接受 **一个二进制字节**：0 sleep、1 idle、2 busy、3 attention、4 celebrate、5 dizzy、6 heart。
- `touch0` 是布尔输入；自定义 `0x64` 触摸事件载荷为 `version=1, kind=1, counter LE32, x LE16, y LE16`，共 10 字节。它只是输入，不是任务完成证明或审批。
- 修正 manifest 在默认 MTU 23 时的分片预算。状态及文字回调进入 UI 队列，不在 BLE 回调中做渲染。

现已启用BQ27220和ES8311；0.2.7只读取已核实的SW2/GPIO0，不改SW1电源键。未启用Wi-Fi或OTA下载，不包含账号及密码。中文提示使用Noto Sans SC常用字库，其他原有英文标签保留原字号；不是完整Unicode/Emoji支持。可靠业务回执与设备归属校验仍待接入。

协议响应 payload 是 `[acked_cmd][status][error LE16][extra...]`，前四字节不是单纯的 status/error。`0x33` 成功响应的 payload 例如 `33 00 00 00`。I/O manifest 的 JSON 顶层字段是 `proto/rev/caps/io`。

## 三项必做功能与剩余验收

麦克风、扬声器和电量计均已加入 `0.2.0-ojbadge-audio`。官方 ASR/TTS 服务是否采用是另一项选择，不影响硬件需求。当前不自动录音、不自动上传，也没有接入云端语音识别。

| 功能 | 拟接入范围 | 真机验收 |
| --- | --- | --- |
| 电量计 | BQ27220 实测电量、电压及充电状态，圆屏显示并通过协议上报 | 读取真实数据；失败标未知；结合插拔电源检查状态。充电电流、外接电源、充满不能混为同一状态 |
| 扬声器 | ES8311 + AW8010 播放提示音及来自 App 的语音，提供音量与停止控制 | 先低音量验证实际发声，再验证音频传输、缓冲和播放结束；播放不阻塞显示与触摸 |
| 麦克风 | 0.2.8恢复实体长按采音和MIC能力位；0.2.7诊断版已替换 | 验证录音可辨识、音频格式与真实传输；明确显示真实录音状态，断连停止，不默认持续录音 |

已复用 `boards/common/bq27220.*`、`boards/common/es8311_audio.*`。电量计复用触摸的 I2C0 GPIO43/44；音频使用I2C1 GPIO6/7，ESP DIN40、DOUT42、PA17，已与OJBadge厂家原理图核对。音量初始25，固件上限100对应DAC0dB；超过60的显式档位在停止/断连后恢复25，开机不播放声音。手机UI仍限制0–60，需后续同步校准。已烧录0.2.5按住圆屏0.6秒后采音；候选0.2.6改为实体键。松开/断连/30秒超时停止；远程`0x3C`只提示按住，不直接开启麦克风。

`speaker0`接受`[0]`停止队列、`[1]`300ms测试音、`[2,volume]`设置0–100音量；`[3]`是显式诊断用500ms参考短音，PCM幅值12000、DAC0dB，结束恢复原音量，普通App不自动调用。App停止播放时先关闭发送端，防止后续PCM再次入队。MiniMax语音通过CoC PSM0x81下发28608字节、固件写入14304采样且无尾字节/丢包，用户已确认可听到；真实麦克风上行及手机播放仍待验收。

## 0.2.6 实体说话键候选：未烧录

此节保留历史候选的设计和构建记录。0.2.6未烧入设备；下述0.2.7识别版本也已由0.2.9取代，当前状态以上方说明为准。

依据[厂家OJBadge原理图 V0.1](https://download.openjumper.cn/OJBadge%E8%B5%84%E6%96%99/SCH_OJBadge%E7%94%B5%E5%AD%90%E5%90%A7%E5%94%A7%E5%8E%9F%E7%90%86%E5%9B%BE.pdf)：SW1连接独立的三秒开关机电路；SW2/BOOT连接G0，即ESP32-S3的GPIO0，R15为10k上拉，按下接地。候选固件只把GPIO0设为输入，不驱动它，不改SW1。

- 蓝牙及音频就绪后，先观察到松开，再接受新的连续600ms长按；短按、连接前一直按着均不会开麦。
- 松开立即请求停录，断连停录，最长30秒。达到上限或App停止后，即使仍按着也不重复开启，需松开重按。
- 触屏不再开始或停止录音，保留普通触摸事件。录音时仍显示 `REC - RELEASE TO END`；提示为 `HOLD BOOT TO TALK`。
- GPIO0是启动配置引脚：只能在正常启动后按；不要按着它插电、复位或开机。实体位置确认之前不让用户试长按电源键。

已通过ESP-IDF v5.5.4构建、镜像校验及主机长按状态机/协议回归；应用1395760字节，SHA256 `1a12b19a7f0e6f732876c2208a7e28e1fbd30f384346f0170c47134f3025eb4a`，分区表与可用0.2.5一致。构建仍有原有触摸API弃用警告。**这些不是实体按键或收音的真机通过记录。** 手机UI仍描述0.2.5触屏操作，需在确认并烧入0.2.6后同步更新、构建和装机。

候选及检查记录存放于用户私有目录 `.local/share/pocketbuddy-esp/button-ptt-0.2.6-prep/`；可用0.2.5备份保持原样。本次没有连接测试、录音、上传或语音API调用。

## 0.2.7 按键识别：已烧录

- 用户要求用屏幕提示分辨实体键，暂不需要连接手机或电脑蓝牙。SW2/GPIO0输入长按600ms后显示“正在倾听说话”，同时明确标注“仅测试，未录音”；松开隐藏独立提示层。触屏和远程文字不会清除正在显示的提示层。
- `kButtonIdentificationOnly=true`，没有调用实际开始采音的路径，远程录音请求也不能启用它；BLE能力位从0xA7改为0xA6，移除MIC。恢复实际PTT前须明确关闭此诊断开关并重新验收。
- Noto Sans SC 22px/2bpp字体共7545字形，含GB2312全部6763个汉字；源字体和生成字形集合均已逐字比对。位图815151字节，存于Flash映射的只读区，不把整套字库解码到PSRAM。字形预览直接解码最终C数组，提示句无缺字；许可与复现方式见[字体说明](boards/ojbadge/fonts/README.md)。
- 应用2285728字节（约2.18MiB），SHA256 `676ab5c211b24873c7ee872a5e96fb935d4ad5545b90561794177cfa87c9ee2d`，3MiB应用分区仍有27%余量；不改分区表。
- 烧录前验证目标芯片MAC、0.2.5旧应用及设备实际分区表；只写0x10000应用，写后哈希通过。之后真实BLE连接并重组manifest，返回能力0xA6及screen0/speaker0/touch0/avatar_state，证实新识别模式在运行；读取后已断开，没有发送屏幕、音频或录音命令。
- 串口首次只收到了bootloader加载应用的前半段，复查没有得到完整应用启动日志。因此运行验证依据是写入哈希和真实GATT回复，不宣称已在串口看到13/13字形初始化或按键事件。**屏幕可见反馈、按下/松开及上下哪颗对应SW2，仍需真人确认。**

试按方法：设备已正常开机时，先按照片下方按钮约1秒就松开；若没有提示，再试另一颗约1秒。不要超过2秒，不在按住时复位、插拔电源或开关机。该步骤不录音、上传或调用语音API。记录位于私有目录 `.local/share/pocketbuddy-esp/button-feedback-0.2.7/`。

## 原始固件与引脚依据

主办方：[B 板说明](https://tidb-pre-match-intro-dct7ede.gamma.site/)。首次只读检查确认 ESP32-S3 rev0.2、16MiB Flash、8MiB 内置 PSRAM，安全启动/Flash 加密均未启用；未改写 eFuse。

从已读取的出厂固件 app descriptor 得到 `xiaozhi 2.0.5`；编译路径出现 `movecall-cuican-esp32s3`。其上游显示引脚与主办方表一致，作为 BGR、反色和镜像初始化的辅助依据，不据此假定所有外设相同：[参考板配置](https://github.com/78/xiaozhi-esp32/blob/bb9122ab08c3083eeb4f67b3974b7afe771723b8/main/boards/movecall/cuican-esp32s3/config.h)。

出厂备份保存在用户目录的 `.local/share/pocketbuddy-esp/backups/`，不进入仓库。**必须完成全量读取和校验后再覆盖固件**；部分分块文件不能宣称是完整恢复备份。此前通过扩展坞读取中断，改为电脑直连后重试。

## 检查

主机协议、电量解析和实体长按状态机回归测试（不需要连接设备）：

```sh
c++ -std=c++17 -Wall -Wextra -Werror tests/protocol_host_test.cpp components/agent_link/src/protocol.cpp -o /tmp/ojbadge-protocol-test
/tmp/ojbadge-protocol-test
```

真机验收：USB 启动日志没有重启循环；PSRAM 正常；圆屏可见且方向正确；触摸计数和坐标随实际操作变化；BLE 可发现并能重组 manifest；通过 `screen0` 或 `avatar_state` 实际改变屏幕。只看到广播或返回 ACK 不等于完成上述验收。

开发机 BLE 冒烟测试：安装 `bleak==3.0.1` 后运行 `python tests/ble_smoke.py --touch-seconds 40`。它只连接唯一名为 `Frost-OJBadge` 的目标，校验 manifest 和响应，发送 `BLE OK`/CELEBRATE，再等待真实触摸；macOS 如请求蓝牙权限，需由用户授权。此工具不是手机 App，也不代表 Frost 软件接入已完成。

音频测试：`python tests/ble_smoke.py --audio --touch-seconds 180`，需真人按住说话后松开，否则测试失败；`--coc-tone --touch-seconds 0` 检查 macOS 真实 CoC 下行；`--mic-gate --touch-seconds 0` 检查远程请求本身不产生录音。测试不保存或上传麦克风原始音频。
