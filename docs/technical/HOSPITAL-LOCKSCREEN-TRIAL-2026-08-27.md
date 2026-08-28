# 医院 Agent · Qwen 会话与锁屏试验准备

## 已完成的范围

新增 `server/hospital-consultation.mjs`，通过现有 `createQwenProvider` 使用服务器 Qwen 配置。
`server/hospital-agent.mjs` 保留原医生部署的只读健康检查，并挂载独立的
`/api/hospital-agent/consultation` 接口。

这是 **Qwen 驱动的真人语音咨询适配器**，不是原 `hospital_agent_example` 比赛运行器：
它使用现有疾病目录中的提问资料，不运行模拟患者、开检查、专科投票或比赛评测。
不把普通 Qwen 对话冒充原完整虚拟诊疗流程，不声称临床验证、确诊或处方能力。

- 访问需独立 `HOSPITAL_CHAT_ACCESS_TOKEN`，至少32字符，不能与供应商 Key 相同。
- `GET` 仅检查配置；不算 Qwen 实际可用证明。
- `POST action=start` 在真实 Qwen 往返成功后才返回：
  “已经调用好医院 Agent，你有什么咨询的吗？我是 AI 健康信息助手，不能代替医生诊断。”
- `POST action=message` 保留本次会话上下文；`action=end` 取消当前请求并移除上下文。
- 客户端生成 UUID `sessionId` 和 `inputId`；重复成功请求复用结果，失败请求不会自动重试。
- 最多16个内存会话、30分钟空闲过期、12轮成功对话、每分钟12次请求、2个同时请求。
- Qwen 15秒超时；回复完整且不超过100字符。截断输出直接拒绝，不截掉可能重要的医疗语义。
- 录音不上传；本接口只收文字。不保存健康对话到文件、数据库、OSS或日志。
- 本次没有修改生产环境配置或发布线上服务，也没有生成/分发生产访问码。

## 验证

`server/hospital-consultation.test.ts` 与既有 `server/hospital-agent.test.ts`：28项通过。
覆盖独立鉴权、服务器密钥隔离、Qwen成功后激活、多轮请求上下文、去重、失败不激活、
输出截断拒绝、会话过期与退出、请求验证，以及原健康接口回归。

真实探针 `node scripts/hospital-consultation-probe.mjs --live` 已执行一次：

| 请求 | HTTP | 用时 | 模型 | 回复字符数 |
| --- | --- | --- | --- | --- |
| 建立会话 | 200 | 886ms | qwen3.7-max | 45 |
| 无身体不适的连通追问 | 200 | 898ms | qwen3.7-max | 49 |

探针只调用2次Qwen，没有录音、没有使用真人健康信息、没有调用MiniMax。
私有结果只保留状态/耗时/字数等元数据：
`/Users/zhangcheng/.local/share/pocketbuddy-esp/hospital-qwen-probe-20260827/result.json`。
`attempt.json` 的排他写入阻止直接重跑而重复消费。

## 未完成，不得宣称通过

1. 原生锁屏链路尚未实现：现有 iOS 插件仍把音频包交给前台 WebView；
   原 Frost 自动语音会在进后台时关闭。只添加 `bluetooth-central` 不会自动补齐流程。
2. 需要在原生层接收并校验物理按键录音、调用本机ASR、转发Qwen、保持医院会话、
   将系统TTS的PCM经L2CAP回传；前台JS不得重复消费同一录音。
3. 必须服从iOS有限后台时间，处理到期取消，不使用静音循环或假音频保活。
4. 硬件当前 `screen0` 文字区主要使用默认字体和较小高度；完整中文提示需要核对字体与版式，
   不能把命令ACK当作用户已看见文字。固件如需修改，先核对实物、分区和可恢复备份。
5. 生产接口部署、手机构建/安装、BLE与锁屏真机验收均未执行。
   同一手机同时有其他任务更新与核对安装包，本轮没有安装、重启、占BLE或刷写硬件。

## 真机验收必须满足

前台完成首次配对、系统权限和一次明确的试验授权后：手机真实锁屏至少2分钟；
按吧唧实体键说“调用下医院Agent”；Qwen会话成功后，吧唧显示并朗读激活提示；
再做至少2轮无健康隐私的追问，全程不点亮手机、不借Mac转发、不注入替代录音。
分开记录设备收音、完整音频、ASR、后端回包、显示和用户实际听到的结果。
后台到期、断连、重复按键、退出会话和App被强制关闭分别验证，失败如实保留。

依据：[Apple CoreBluetooth后台执行](https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/CoreBluetoothBackgroundProcessingForIOSApps/PerformingTasksWhileYourAppIsInTheBackground.html)、
[Apple有限后台任务](https://developer.apple.com/documentation/uikit/uiapplication/beginbackgroundtask(withname:expirationhandler:))。
