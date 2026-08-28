# Frost / OJBadge · MiniMax 语音接入

## 范围与当前状态

保留现有 Frost、Taskmaster、阿里云与 OSS，只增加文字转语音（TTS）适配。
已完成后端接口、App 手动生成/试听/吧唧回放入口和离线测试。
用户已填写服务器Key；先后明确授权“你好。”、“你好”与“Venture D 硬件赛道”各一次合成。**累计三次短合成，不自动重试。** 前两次均894ms、28608字节；第三次1869.25ms、59816字节，均为PCM16/16kHz/mono。
**用户已确认第二次合成的“你好”能从B板听到。** 当前0.2.5固件、电脑蓝牙桥与MiniMax的实际发声验证通过，不把这一结果扩展为手机App或麦克风已验收。
新的生产语音接口尚未部署到阿里云；手机装机与实际播音仍待验收。

数据路径：

```text
原有 Frost 生成文字
  → 用户将最近回复填入短句框，确认后手动生成（最多 100 字）
  → 现有 Node 后端 /api/frost-voice/tts
  → MiniMax /v1/t2a_v2
  → 16kHz、单声道、PCM16LE
  → App 内存中的音频，可反复试听
  → 现有 Agent_link L2CAP CoC PSM 0x81
  → B 板 ES8311 / 扬声器
```

麦克风 PCM 接收、录音预览与回放仍保留，不自动上传。
在MiniMax当前公开API目录中未找到独立的通用语音转文字（ASR）接口，没有虚构MiniMax ASR地址。
后续已使用项目现有百炼配置，对此前合成的1.869秒短句做一次阿里云ASR独立探针并取得正确转写；不是麦克风录音。麦克风→手机→后端ASR→Frost的业务接口和完整对话尚未接入/验收，当前正式接口仍返回 `asr:false`。

## 官方接口核对

- 中国区：`POST https://api.minimaxi.com/v1/t2a_v2`，Bearer API Key，仅服务器持有。
- 默认模型：`speech-2.8-turbo`，音色 `male-qn-qingse`。
- 请求：`stream=false`、`output_format=hex`、`audio_setting={sample_rate:16000,format:pcm,channel:1}`。
- 校验 `base_resp.status_code=0`、完成状态 `data.status=2`，以及返回格式/采样率/声道/完整采样/长度。
- 不使用旧示例中的假定 GroupId，不把 MP3 数据当成 PCM 发给硬件。
- API Origin 只允许官方中国区或国际区 HTTPS 地址，客户端不能改写供应商地址、模型或音色。

依据：[MiniMax 同步语音合成 HTTP 文档](https://platform.minimaxi.com/docs/api-reference/speech-t2a-http)、[官方 API 目录](https://platform.minimaxi.com/docs/llms.txt)。

## 配置与安全

在工程根目录 `.env` 的 `MINIMAX_API_KEY=` 后填写 Key；该文件未跟踪、由 Git 忽略，权限为 0600。
使用中国区默认地址。可选配置已列在 `.env.example` 中：

| 变量 | 用途 |
| --- | --- |
| `MINIMAX_API_KEY` | 供应商密钥，只放服务器 |
| `MINIMAX_BASE_URL` | 默认 `https://api.minimaxi.com` |
| `MINIMAX_TTS_MODEL` | 默认 `speech-2.8-turbo` |
| `MINIMAX_VOICE_ID` | 默认 `male-qn-qingse` |
| `FROST_VOICE_ACCESS_TOKEN` | 至少 32 位随机的独立后端访问码，不能等于 MiniMax Key |

修改环境后重启开发/生产服务。Vite 只在真实 loopback、同源、无转发头的本机开发请求中免访问码。
生产服务默认关闭匿名语音调用，手机或远程网页必须提供独立后端访问码。App 设置仅在当前页面内存中保存该码，禁止粘贴 `sk-` 开头的供应商 Key。
不能给这些密钥加 `VITE_` 前缀，也不能编译进 APK/IPA；这不是一个公开匿名的付费代理。
当前访问码适合受控联调；面向多用户发布前仍需接入正式用户鉴权、个人配额和凭据轮换。

## 成本与隐私约束

- 用户主动点击才合成，不自动朗读所有回复，不自动提交麦克风或完整对话。
- 每次 1–100 个 Unicode 字符、最多 30 秒返回音频；请求体最多 4KiB。
- 后端同一时刻只允许一笔合成，每分钟最多 6 次；不是供应商费用的精确估算器。
- 前后端均不自动重试。超时可能已经计费，界面明确提示。
- App 保留最近一次合成音频；收起面板不丢失，试听/吧唧回放不再请求 MiniMax。离开 Frost 页、刷新或显式清除会丢失此内存缓存。
- 工程测试只用模拟响应。**首次真实 API 验证只用“你好。”，只调用一次**，之后重用保存的 PCM。
- 服务端不记录请求文字、密钥或原始供应商错误，不自动上传 OSS。

## 操作与一次性真实验证

App 入口：**Agents → FITNESS AGENT / Frost → 电子吧唧 → Frost 语音回复**。
默认短句为“你好。”。也可手动填入最近一条 Frost 回复的前 100 字，编辑后再生成。
生成后可以本机试听；连上吧唧且没有录音时，可以点击“播放到吧唧（不再计费）”。
网页版不具备原生 BLE/CoC 插件；Android 需要新包，iOS 仍待 Xcode、工程集成和签名。

`node scripts/minimax-short-probe.mjs` 只检查是否配置，无网络调用。
填写 Key 后，明确执行 `node scripts/minimax-short-probe.mjs --live` 才进行一笔“你好。”合成。
脚本在请求前用独占创建的 `attempt.json` 锁定本次机会；失败/超时不会自动重试，成功后重复运行只复用文件。
私有输出目录：`~/.local/share/pocketbuddy-esp/minimax-short-probe/`，其中 `hello.pcm` 是给硬件的原始 PCM，`hello.wav` 是可试听封装。

第二次明确授权的合成保存在私有目录 `~/.local/share/pocketbuddy-esp/minimax-hello-confirmation/`；独立 `attempt.json` 保留防重试。原始PCM峰值15400，本地衰减至12000，缓存为 `hello-level12000.pcm` 和 `.wav`，没有重新合成。

后续蓝牙复用命令（不调用云端，显式0dB档播完恢复25；仅用于已确认的0.2.5固件）：

```sh
~/.local/share/pocketbuddy-esp/ble-venv/bin/python \
  hardware/ojbadge-agent-link/tests/ble_smoke.py \
  --touch-seconds 0 \
  --volume 100 \
  --pcm-file ~/.local/share/pocketbuddy-esp/minimax-hello-confirmation/hello-level12000.pcm
```

该命令是 Mac 真机测试桥，不等于手机 App 已验收。需要串口日志时先打开串口，再建立 BLE；不要在 BLE 测试中打开可能复位设备的串口。

## 验证记录

- Vitest：30 项通过，覆盖 MiniMax 请求格式、凭据隔离、HTTP 200 中的业务错误、超时不重试、并发/速率限制、超长文本与大请求拒绝、输出格式拒绝、手机原生 HTTP 路径、PCM 复用播放、已有 Frost 回归。
- `tsc --noEmit`、Node 模块语法检查、Vite 生产构建与 Android `assembleDebug` 均通过。
- Android 包内已确认包含语音入口、不含直连 MiniMax 的供应商接口；APK 为 `android/app/build/outputs/apk/debug/app-debug.apk`，463,696,014 字节，SHA256 `4350dab2df947b3ed26c82ee012e785053e40bb64e9119308dd050f62d2af9fc`。未连接手机，未安装验收。
- 本地浏览器已检查真实 Frost 入口、默认“你好。”、费用提示、短句编辑、空白内容禁用生成和面板布局；没有点击发起付费合成。
- BLE测试脚本语法检查通过；PCM文件分支已经真实MiniMax文件、完整设备采样日志和用户可听确认验证。
- 真实 API：一次成功，PCM 14,304 采样，峰值12,604、RMS1769.1，WAV 封装内容与 PCM 一致。SHA256 `9eddfb40d21e30663eb50ecf135083878ac6f2dc3f1b9274633cf18a0851f4d3`。
- 首次下行过早关闭通道，设备仅写入12,505采样；测试脚本增加两秒缓冲等待后，设备写入全部14,304采样、odd_tail=0、dropped=0。固定等待只是诊断缓解，不能替代正式手机播放完成回执，手机端仍需验证收尾。
- 早期0.2.1增加ES8311复位/取消静音仍无声；0.2.4的0dB/幅值12000双短音获用户确认。0.2.5允许PCM显式使用同一0dB档，完整写入第二次MiniMax的14304采样后恢复25，用户明确确认听到“你好”。适配PCM的SHA256为 `b14e69bee84ef163a86b5c4d8314b9f072a5e26a7dde163935a05a6160fddadb`。
- 尚待：麦克风真人收音、云端部署、手机安装/音量校准与播放回执、ASR服务、后台连接与加密配对。原有Frost、任务系统和阿里云未重写。

相关硬件状态见 [OJBadge 电量、音频与 App 实施记录](OJBADGE-AUDIO-APP-IMPLEMENTATION-2026-08-27.md)。

### Venture D 短句与适度提高响度

按用户要求，只新增一次“Venture D 硬件赛道”合成，沿用0.2.5固件，不重新烧录。将本地PCM峰值设为18000，相比上次“你好”的12000提高约3.52dB；这只是数字峰值比较，不代表人耳响度同比变化。原始峰值19456，本地gain=0.925164，未削波；硬件仍为已验证的DAC0dB。

实际CoC下发59816字节，设备记录29908采样、odd_tail=0、dropped=0，之后恢复音量25，BLE无协议错误。**用户随后明确确认“能发出语音了”，此短句可听验证通过；相对响度未单独评分。** 无麦克风采集或上传。缓存、一次调用锁和播放记录位于私有目录 `minimax-venture-d-confirmation/`；适配PCM SHA256为 `694fe172b3bcc55151ca5228becb8094237a7d7b2332bb2bea6f2fd23126c698`，后续重播不再计费。

### 云端ASR独立探针（不代表麦克风/手机验收）

核对[阿里云Qwen-ASR官方接口](https://help.aliyun.com/zh/model-studio/qwen-asr-api-reference)后，复用现有 `createQwenProvider` 和服务器百炼Key，仅允许官方HTTPS域名，对缓存的 `venture-d-level18000.wav` 发出一次 `qwen3-asr-flash` 请求。输入1869.25ms，只提供音频、不把预期文字提示给模型，不新增MiniMax调用，也不采集环境音。

实际返回 `venture d 硬件赛道。`，忽略大小写/空格/标点后与原文一致。记录usage为61tokens；这不是费用金额估算。私有目录 `asr-venture-d-probe/` 保存独占调用锁与结果；失败不自动重试。**本次只验证云端模型与现有账号可用，没有验证B板麦克风、BLE上行、手机App或Frost指令分发。**

推荐分工：B板只采集/播放PCM与传输数据；手机通过原生BLE接收音频并转发；现有后端保管Key、调用ASR，将文本交给Frost。ASR不用部署到B板；也不要求手机本地跑识别模型。涉及有副作用的指令继续保留现有确认和权限检查。
