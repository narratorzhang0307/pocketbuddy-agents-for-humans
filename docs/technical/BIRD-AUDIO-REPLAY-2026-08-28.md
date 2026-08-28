# 识鸟链路：本地标准录音回放验收

日期：2026-08-28。范围仅为本对话要求的识鸟链路检查。

## 结论

用户指定目录中的 **19 段录音、12 种鸟，19/19 与目录标注一致**。本次没有 HTTP 错误，没有自动重试。13 张 OSS JPEG（识鸟头像及十二鸟图）全部通过原生代码的长度、SHA256、CRC32 校验，并由 Mac 解码确认 240×240。

**这是文件回放的软件链路通过，不代表“B 板麦克风 → iPhone → 服务器 → B 板”实机链路通过，也不代表野外准确率。** 本轮未启动手机 App、未运行 ASR、未测试黑屏、未刷板、未采集麦克风。

机器可读结果：[local-standard-audio-session-verification.json](../design/bird-skill-20260828/local-standard-audio-session-verification.json)。

## 实际执行方式

1. 读取 `/Users/zhangcheng/Desktop/杭州常见物种标准声音/鸟` 下全部 19 个 M4A；结束后重新核对源文件 SHA256，原录音未修改。
2. 用 macOS `afconvert` 转为 16 kHz、单声道、PCM16，取前十秒，符合当前鸟叫录音上限。目录 `普通夜莺` 内的文件实际名为 `普通夜鹰.m4a`，按普通夜鹰映射，未改源目录。
3. 在 Mac 编译实际 `FrostBirdSession.swift` 与 `FrostBirdProtocol.swift`。生产源码唯一转换是去掉 `import UIKit`；测试文件提供明确的 UIKit/后台生命周期替身，BLE 写入及回执也使用替身。没有另写一套识别业务逻辑。
4. 将每段 PCM 组装为真实协议格式的 `kind=6` 录音控制事件及 `0x40` 有序音频包，输入实际 `FrostBirdSession.receive`。所有样本均故意让结束元数据先于最后一包音频到达，确认不会提前上传。
5. 实际原生代码组装 WAV、选择最响三秒、通过真实 HTTPS 请求现有 `https://hearnature.throughtheglass.art/hardware/recognize`，解析返回值、查询物种白名单、下载 OSS 图片并校验。TLS 校验未关闭。
6. 实际原生代码输出图片 begin/chunk/commit。测试接收端检查顺序、事务、长度、CRC，进行 Mac JPEG 解码，再返回模拟执行回执；故意让应用回执早于写入完成及命令 ACK，以验证三者均到齐后才推进。

本次回放使用的生产会话源码 SHA256：`f3fabbce1905eacbb1f22ba2b88b44aa0b466e8d53cbf06aa0f9c386557b65a4`。未修改 App、固件或服务器运行代码。

最终检查发现工作区该文件 SHA 已变化；逐行对比确认仅本轮未执行的 ASR 上下文词列表变化，录音接收、预处理、识别上传、结果解析、OSS 下载及传图方法全部保持一致。证据绑定实际编译快照，不将其宣称为 ASR 验证；详细 SHA 对照见 JSON 的 `finalSourceAudit`。

## 样本结果

| 鸟种 | 录音数 | 匹配正确 |
| --- | ---: | ---: |
| 白头鹎 | 2 | 2 |
| 大杜鹃 | 1 | 1 |
| 红嘴蓝鹊 | 2 | 2 |
| 麻雀 | 2 | 2 |
| 普通夜鹰 | 1 | 1 |
| 强脚树莺 | 2 | 2 |
| 鹊鸲 | 2 | 2 |
| 乌鸫 | 2 | 2 |
| 喜鹊 | 1 | 1 |
| 珠颈斑鸠 | 1 | 1 |
| 棕背伯劳 | 1 | 1 |
| 棕脸鹟莺 | 2 | 2 |

单段回放从接收样本至结果的中位耗时 1.078 秒，范围 0.738–10.301 秒；**不包含实体录音时间、真实 BLE 传输或 iPhone 后台调度**。

## 异常与回归

- 七类实际原生会话异常测试通过：序号缺口、重复包、混入其他会话、设备报告丢包、断连结束、过短录音、静音。全部在进入网络识别步骤之前拒绝。
- 14 个前端测试文件、161 项测试通过；TypeScript 类型检查通过。
- 原生协议测试通过：意图、WAV/窗口、CRC、顺序、尾包、丢包、断连。
- 原生 stop/launch 生命周期回归通过：清理期间忙碌、离线、断连及失败分支。
- C++ 协议测试通过：图片事务/CRC、录音状态拥塞、实体长按授权、重连门控与 MTU 分片。

没有验证服务器故障、真实 iOS 后台期限、真实 ASR 或实际麦克风效果；不将上述七类测试描述成覆盖了所有异常。

## 本轮实板检查的限制

运行现有 `ble_smoke.py --bird-oss --touch-seconds 0` 时，未发现名为 `Frost-OJBadge` 的目标设备，脚本在连接之前退出。后续只读扫描可见同协议 UUID 的广播，但设备名称均不匹配目标，因此未擅自连接。

**本轮没有向实板传图，也没有得到新的实板解码回执。** 原有实板证据不计入此次文件回放的通过数。

## 下一步真人实测

先确认目标 B 板身份，确保手机 App 能正常启动并连接该板。首次在前台开启识鸟后：长按自定义键说“帮我识别下鸟叫”；收到录音提示后长按触屏，播放其中一段标准鸟声约六秒并松手，检查对应鸟图。前台通过后，再验证锁屏流程。

实测要核对同一次操作的录音包完整性、服务响应及板端图片解码回执；这三项齐备后，才能确认真实“硬件录音经手机上传服务器”的闭环。

## 复现

测试入口：`scripts/hardware/verify-bird-session.py`；测试接收端：`native/frost-badge/tests/BirdSessionReplay.swift`。默认只准备录音及编译，必须显式传入 `--live` 才会上传样本。输出目录必须尚不存在；遇限流停止，不自动重试。

```sh
DEVELOPER_DIR=/Volumes/PocketBuddy-iOS-Dev/Xcode.app/Contents/Developer \
python3 scripts/hardware/verify-bird-session.py \
  --audio-root '/Users/zhangcheng/Desktop/杭州常见物种标准声音/鸟' \
  --output-dir '/tmp/bird-session-replay-new-run' \
  --live --interval 12
```

本次原始日志、转换后 PCM 和构建收据保存在：`/Users/zhangcheng/.local/share/pocketbuddy-esp/bird-skill-20260828/standard-session-replay-20260828` 及其同级 `standard-replay-*` 日志。
