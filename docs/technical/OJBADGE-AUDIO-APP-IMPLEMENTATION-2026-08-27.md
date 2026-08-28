# OJBadge 电量、音频与 Frost App 实施记录

## 当前结论

这是一版已烧入硬件的开发固件及已构建的 Android App 接入，不是全部真机验收完成。
保留 Frost、Taskmaster、现有本地记忆和阿里云/OSS，没有迁移账户或上传录音。后续按用户选择增加 MiniMax TTS 适配，见 [MiniMax 接入记录](MINIMAX-FROST-INTEGRATION-2026-08-27.md)。

最新进展：用户要求用实体键避免误触，并改为通过屏幕提示识别是哪颗键。当前已烧入 **`0.2.7-ojbadge-button-ui`**：SW2/GPIO0长按约600ms显示“正在倾听说话”和“仅测试，未录音”，松开恢复；独立于蓝牙，暂时禁用真实录音。已验证写入哈希和真实BLE manifest能力0xA6；串口完整应用启动日志未取得，真人按键/屏幕仍待确认。0.2.5可听语音版本的备份保持原样，0.2.6从未烧录。详见[按键识别记录](../../hardware/ojbadge-agent-link/README-OJBADGE.md#027-按键识别已烧录)。

| 项目 | 已实现/验证 | 尚未完成 |
| --- | --- | --- |
| 固件 | 当前0.2.7识键版：身份检查、旧应用/实际分区核验、应用写后哈希验证、真实GATT manifest返回0xA6；0.2.5可听版保留备份 | 完整串口应用启动日志、实体键提示的真人可见确认、长期运行与功耗测试 |
| 中文按键提示 | Noto Sans SC 22px/2bpp，7545字形，包含GB2312全部6763汉字；逐字覆盖检查及最终字体位图预览通过 | 真机显示与上下按键映射；非GB2312生僻字/Emoji不保证支持 |
| 电量 | BQ27220 真实 100%、4153–4157mV、0mA、flags 0x5268；圆屏显示和 BLE 上报 | 拔线/插线的充放电状态变化、低电量边界实测 |
| 扬声器 | **用户已明确确认两声板载短音及MiniMax“你好”均可听到**；真实CoC下发28608字节，固件写入14304采样，无尾字节或丢包；播放后恢复低音量 | 手机音量控制、长音频、停止/录音打断与稳定性验收 |
| 麦克风 | 16kHz mono PCM16驱动及物理长按保护已实现；当前0.2.7为识键目的禁用采音、移除MIC能力位，显示提示不代表实际录音 | 先确定实体键，再恢复实际PTT；非静音采样、完整BLE上行与可辨识录音仍未通过真人验收 |
| Android | 原生 BLE/CoC 桥编译通过，已生成 debug APK；Frost 页接入状态同步、设备选择、电量、录音预览与回放 | 未连接安卓手机，尚未安装或实测权限、MTU、音频与重连 |
| iOS | 对应CoreBluetooth/CoC源码已准备；独立工程进展见[原生接入说明](../../native/frost-badge/ios/README.md)，不再沿用早期“没有Xcode/工程”的状态 | 签名装机与真实BLE验收不在本次电脑桥测试中 |
| 云端语音 | MiniMax TTS累计三次短合成，后两次已获用户可听确认；另用缓存的1.869秒合成音频对百炼ASR做一次独立探针，正确返回 `venture d 硬件赛道。` | ASR业务接口尚未接入；真人麦克风、手机转发、后端指令分发与部署未验收，不能声称已能与Frost完整语音对话 |

第一轮180秒收音测试没有收到用户触摸，按测试规则失败；不能用电量和 ACK 的通过掩盖收音缺失。后续 CoC 下行和远程录音保护独立测试通过。

## 硬件与安全边界

- 只操作 B 板 ESP32-S3，USB serial `94:A9:90:2B:39:44`。另一台 `1A86:55D2` 设备没有操作。
- 原厂 16MiB 备份仍在用户私有目录，不覆盖；上一版可工作的 `0.1.0` 文件另存为 `frost-bringup-rollback`。
- 当前0.2.7应用 **2,285,728字节**，SHA256 `676ab5c211b24873c7ee872a5e96fb935d4ad5545b90561794177cfa87c9ee2d`，位于私有目录 `button-feedback-0.2.7/candidate`。可听语音版本0.2.5为1,395,216字节，SHA256 `534b0f833503c67f2c19eb01d5dc6039b73bf4ebbcde36c75c81d70a13da7e22`，仍保存在 `audio-0.2.5-working` 且烧录前已再次核验；保留0.2.4提示音回退版本。0.2.0至0.2.3旧测试备份已移到废纸篓，不作为推荐回退版本。
- 只改写应用分区 `0x10000`；先验证分区表与上一版相同，没有写 eFuse、改分区表、配置电池校准或改烧另一块板。
- BQ27220 使用 I2C0 GPIO43/44，与触摸共享。读取SOC、毫伏、带符号电流和状态字；非法值/缺电池/读失败标未知。`0x03` 无有效缓存或超过15秒未更新时返回1005 NoData，不伪造0%。
- ES8311使用独立I2C1 GPIO6/7，I2S MCLK45/BCLK39/WS41，ESP输入DIN40、输出DOUT42、PA17。初始音量25；固件上限100对应DAC0dB，不允许正增益，启动不播放声音。超过60的显式测试音量在停止/断连后恢复25；本次测试桥还在正常播完后主动恢复25。
- 0.2.1补充初始化前ES8311数字模块复位（保持至少10ms，兼容本板100Hz tick）、显式取消DAC静音/功放使能和寄存器读回，参考[上游ES8311驱动](https://github.com/78/xiaozhi-esp32/blob/main/main/audio/codecs/es8311_audio_codec.cc)。未改变音频引脚或电池配置。
- 0.2.5曾使用圆屏长按采音；0.2.6候选改为SW2/BOOT，触屏不再开关麦。**当前0.2.7只显示实体键反馈，暂不开麦。** 实际录音路径的100ms旧DMA丢弃、最长30秒和松开/断连停止仍保留源码中，需确认实体键后重新启用和真机验收。
- App只把触摸当输入，把原有 Frost UI 状态投射为硬件表情，不自动生成授权、工具执行结果或任务完成回执。
- 录音最多30秒，保留在App内存，提供删除、手机预览和回放到吧唧；没有写OSS或调用第三方语音API。
- 当前沿用官方无加密 BLE 开发协议，尚无身份绑定、加密配对和防冒连。仅适合受控开发测试；私人语音产品化前必须补齐。
- 手机前台链路是本轮范围；后台保活、系统杀进程恢复和自动重连未实现/验收，不承诺永久连接。

## 协议

保留 Agent_link v1：FFC1 命令及响应、FFC4 事件、0x34 manifest、0x33 IoActuate、0x14 电量事件、0x03 电量查询。
麦克风走 FFA1 上的0x40 VoiceChunk；扬声器使用 L2CAP CoC PSM0x81，原始16kHz/16bit/单声道/小端PCM。

| 命令/事件 | 载荷 |
| --- | --- |
| `avatar_state` | 1字节：sleep0、idle1、busy2、attention3、celebrate4、dizzy5、heart6 |
| `speaker0` | `[0]`清空播放队列；`[1]`300ms当前音量测试音；`[2,volume]`范围0–100（100=0dB，>60时停止/断连恢复25）；`[3]`显式诊断用500ms的0dB参考音（PCM幅值12000），自动恢复原音量 |
| `0x3C` | `[mode, max_ms LE16]`，显示按住提示，不跳过物理确认 |
| `0x3D` | 停止录音 |
| `0x05` | `[session_id LE32, 3]`，结束PCM流，队列排空后记录播放统计 |
| `0x64` kind1 | `[1,1,count LE32,x LE16,y LE16]`，触摸 |
| `0x64` kind2 | `[1,2,valid,percent,mV LE16,mA signed LE16,flags LE16]`，无效电量percent=255 |
| `0x64` kind3 | `[1,3,active,reason,samples LE32,peak LE16,dropped LE16]`，录音状态与统计 |

录音结束事件可能先于语音队列尾部到达；App按采样总数等待完整尾部，再允许回放，5秒仍不完整则报错。序号缺失、会话变化、奇数字节或超过30秒均拒绝作为完整录音。
停止播放时先关闭手机音频发送端，再发送设备停止指令，避免旧流继续填充队列。

## 工程入口与测试

- 固件：`hardware/ojbadge-agent-link/boards/ojbadge/`；电量和Codec复用 `boards/common/`。
- 协议与连接：`src/app/lib/frostBadgeProtocol.ts`、`frostBadge.ts`。
- UI：`src/app/components/FrostBadgePanel.tsx`，由已有 `FrostBuddyPage.tsx` 传入原有状态。
- Android：`android/app/src/main/java/art/throughtheglass/pocketearth/FrostBadgePlugin.java`，已在MainActivity注册。
- iOS：`native/frost-badge/ios/`，含未验收的源码和接入步骤。

自动检查：ESP-IDF v5.5.4构建；C++主机协议/电量解析测试；Vitest协议、断连、ACK、完整录音、安全输入边界和现有Frost头像回归；`tsc --noEmit`；Vite生产构建；Android原生Java编译及APK打包。
浏览器检查了真实Frost入口、展开/收起和无原生插件提示；浏览器测试不等于手机BLE测试。

Android构建：

```sh
npm run build
npx cap copy android
node scripts/android/run-gradle.mjs :app:assembleDebug
```

安装包位置：`android/app/build/outputs/apk/debug/app-debug.apk`。包体包含项目已有资源，约441MiB，本轮未擅自裁剪原有资源。
入口：**Agents → FITNESS AGENT / Frost → 电子吧唧**。
安装新包后扫描、显式选择设备；电脑BLE测试连接须先结束，避免抢占单个外设连接。

私有日志位于 `/Users/zhangcheng/.local/share/pocketbuddy-esp/`：
`audio-flash-record.json`、`audio-flash-v2.log`、`audio-coc-serial.log`、`audio-coc-test.log`、`audio-mic-gate.log`、`audio-ble-test.log`、`badge-vitest.log`、`badge-typecheck.log`、`badge-web-build.log`、`badge-apk-build.log`。
日志包含成功和未完成的测试，不把失败窗口当成通过。

## 下一次真机验收

按用户最新要求，已先烧入0.2.7本地屏幕识键版本。正常开机后先按照片下方按钮约1秒并松开，看是否出现“正在倾听说话 / 仅测试，未录音”；没有则试另一颗约1秒。不超过2秒，不在按住时插拔/复位/开关机。确认出现提示的那颗才作为SW2映射；不能把三秒关机的SW1用于持续说话。随后恢复真正的实体键PTT，再做收音，不把识键画面计为ASR成功。

1. 确认测试手机为iPhone还是安卓；iPhone需先具备Xcode/签名与原生工程，账号操作由持有人完成。
2. 短提示音和MiniMax语音已由用户确认；实体键版本就绪后，按住SW2说话3–5秒并松开，先做本地收音完整性和可辨识性验证，不自动上传。当前App仍提示触屏且音量界面限制0–60，需在手机联调中同步修改、构建并装机，不能假定已复现电脑桥效果。
3. 把同一录音回放到吧唧，检查可辨识性，测试音量/停止/录音打断播放。
4. 检查Frost空闲/工作/提醒状态随App真实状态变化，触摸不触发授权。
5. 插拔电源验证真实电流变化；断连时采音停止；连续多轮录音不串会话；30秒限制生效。

## 无声排查：0.2.2 数字输出诊断

用户确认0.2.1下的语音及触摸触发本地提示音均没有声音，不能归为已通过。
0.2.2在本地300ms提示音播放中，对已定义的四个I2S输出GPIO接入PCNT输入观察，每个约2ms，恢复输入/上下拉配置，不改变输出路由、不测试其他未知GPIO。超时可能导致计数回绕的测量标为无效。

本轮设备日志实测（软件启停计数有开销，因此频率只是近似值）：

| 信号 | 引脚 | 观察值 | 解释 |
| --- | --- | --- | --- |
| MCLK | 45 | 8262边沿 / 2032µs，约4.07MHz | 与16k × 256的配置相符 |
| BCLK | 39 | 1026边沿 / 2007µs，约511kHz | 与16k × 32的配置相符 |
| WS | 41 | 32边沿 / 2009µs，约15.9kHz | 与16k采样率相符 |
| DOUT | 42 | 120边沿 / 2011µs | 提示音期间ESP输出数据有变化；这不是音调频率 |

本地提示音实际提交4800/4800采样，音量60；PA17读回高电平，DAC未静音，音量寄存器0x97。BLE manifest和控制响应通过，无协议错误。
**这些仅证明ESP端数字输出活动，不证明信号已正确到达ES8311、模拟输出有效或喇叭可听。用户随后明确确认音量60这次也完全没有声音，扬声器发声验收失败。** 没有新增MiniMax调用、没有录音或上传。
本轮日志：`audio-output-diag-{build,flash,serial,ble}.log`，位于上述用户私有目录。

### 随后取得的厂家原理图

此前普通网页抓取只得到空壳；本次使用浏览器成功读取[OJBadge厂家文章](https://arduino.me/a/3350)，取得其中的[OJBadge原理图](https://download.openjumper.cn/OJBadge%E8%B5%84%E6%96%99/SCH_OJBadge%E7%94%B5%E5%AD%90%E5%90%A7%E5%94%A7%E5%8E%9F%E7%90%86%E5%9B%BE.pdf)。图纸标注Movecall绘制、V0.1、更新日期2026-07-14、单页P1。文件441612字节，MD5 `59c7c1cd74d7c677a4faaaf1c196f8ac`，与服务器ETag一致；本地私有参考文件为 `references/ojbadge-schematic.pdf`。Poppler缺中文字体，改用MuPDF渲染并检查完整页面及CODEC/MCU细节。

确认：U1 GPIO17的CTRL接U6功放SHUTDOWN#，下拉R40为100k；功放供电VIN。MCLK45、BCLK39、LRCK41、ESP输入40/输出42均与当前代码一致。喇叭连接在功放差分输出TP1/TP2。这排除了此前“仅参考相近板型”的引脚依据缺口，但不能代替实物电压、焊接或喇叭连通性检查。

### 0.2.3：厂家参考电平的单次测试

读取[OpenJumper的ES8311配套库](https://github.com/ailyProject/aily-blockly-libraries/tree/main/Es8311)及其`src.7z`中的`ES8311Audio.cpp`：初始化默认DAC寄存器0x32=0xBF（0dB），16kHz、16bit、mono、Philips、MCLK256。当前驱动普通音量60为-20dB，25为-37.5dB；数字“60”不是60%线性幅度。较低电平可能影响现场听感，但未因此断言已经找到无声根因。

保留普通音量上限60，另加显式诊断opcode `[3]`：同一幅值6000的300ms渐入渐出短音，临时将DAC设到厂家参考0dB；没有使用0xFF正增益极值。写入100ms静音以排出DMA尾部，随后恢复用户音量。开机、普通TTS和App按钮都不会自动调用该诊断。

实际执行：烧入0.2.3并校验哈希、确认启动；0x32从0x74切换到0xBF，提交4800/4800采样后恢复0x74/音量25，数字引脚活动正常，BLE无协议错误。**用户随后确认这次仍没有声音，发声验收失败。** 本轮没有再合成MiniMax音频，也没有录音上传。日志`audio-reference-{build,flash,serial,ble}.log`；C++主机协议测试与Python语法检查通过。

### 0.2.4：用户要求加大后的单次短音

只提高显式诊断 `[3]` 的PCM幅值6000→12000（约+6dB），时长300→500ms；DAC仍为0dB，不使用正增益。厂家示例 `playTone` 幅值16000仅作为比较依据，不证明本机实际声压。普通提示音、TTS音量上限和开机静音保持不变。

构建通过、0.2.3回退文件校验通过、分区表保持一致；只烧入已核实USB身份的B板应用分区，写入哈希通过并确认0.2.4启动。提醒用户放桌上、不要贴耳后，只发送一次诊断：设备日志记录8000/8000采样、幅值12000、DAC寄存器0xBF，随后恢复音量25/寄存器0x74。四路I2S输出仍有活动，BLE无协议错误。没有新增MiniMax调用或录音上传。

本次加大测试后用户先反馈“好像有了”，要求再发两声；随后的双音测试获得明确确认。用户在构建期间的“还是没有”早于此次播放，不能当成本次结果。不能把PCM提交成功当成扬声器发声，也不能仅凭数字引脚活动宣称硬件损坏。

日志与记录：`audio-louder-{build,flash,serial,ble}.log`、`audio-louder-record.json`，均位于用户私有目录。

按用户后续要求，保持相同固件/幅值/电平，单次连接中显式发送两声500ms短音，间隔约1秒，没有再次加大或调用云API。两次均记录8000/8000采样并恢复音量25，BLE无协议错误；**用户明确确认可以听到两声，板载提示音验收通过。** 测试脚本新增受限参数 `--tone-count 2`，默认仍只发一次；不指定板载提示音模式时拒绝重复参数。日志：`audio-two-tone-{serial,ble}.log`、`audio-two-tone-record.json`。

### 0.2.5：MiniMax语音可听验证

用户明确要求再调用MiniMax说一次“你好”。只发出一笔两字合成，返回894ms、28608字节PCM；原峰值15400，本地衰减为12000（gain=0.77922），不超过刚才提示音的数字峰值。没有循环调用；原始PCM与适配后的PCM/WAV均保存在私有目录 `minimax-hello-confirmation/`，后续可复用。

普通PCM原先仍受音量60（-20dB）限制。本版允许显式请求音量100（DAC0dB），保持初始25和开机静音；高档在停止/断连时恢复25，测试桥正常播完也主动恢复。没有更改现有手机UI上限或自动提高手机音量。

只更新应用分区并验证哈希，确认0.2.5启动；CoC传输完整14304采样，odd_tail=0、dropped=0，DAC0xBF后恢复0x74/25，BLE无协议错误。**用户在本次播放后明确反馈“可以听到！！”，MiniMax→电脑蓝牙桥→B板扬声器的可听语音验证通过。** 这不等于麦克风、手机原生桥、ASR或完整Frost语音对话已验收。

ESP-IDF构建、C++协议测试、Python语法、重复提示音参数保护及变更空白检查通过。日志：`audio-voice-level-{build,flash,serial,ble}.log`、`audio-voice-level-record.json`。

### 用户要求清理旧测试固件

先验证当前0.2.5固件和原厂16MiB备份哈希，再备份可听语音版本至 `audio-0.2.5-working`（应用、分区表、烧录参数、人工验收记录）。0.2.0～0.2.3的四个旧测试目录共5577812字节已移到系统废纸篓 `PocketBuddy-old-voice-firmware-20260827-164915`，没有永久删除或重新擦写硬件。保留原厂备份、0.2.4可听提示音回退版本、诊断日志与API缓存/调用锁，避免丢失恢复依据或重复计费。清理清单：私有目录 `audio-cleanup-record.json`。

## 引脚与平台参考

- [主办方B板说明](https://tidb-pre-match-intro-dct7ede.gamma.site/)
- [厂家MoveCall CuiCan配置，固定提交](https://github.com/MoveCall/claude-desktop-buddy-esp32/blob/ea8320882067e3375527b9083f3247bb7f8ac260/main/boards/movecall-cuican-esp32s3/config.h)
- [TI BQ27220技术手册 §2.7/2.8/2.21](https://www.ti.com/lit/ug/sluubd4a/sluubd4a.pdf)
- [Android BLE权限](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions)
- [Apple CoreBluetooth CoC](https://developer.apple.com/documentation/corebluetooth/cbperipheral/openl2capchannel(_:))
