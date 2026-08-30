# Taskmaster 与 Agent 可提交性结论

## 结论

当前参赛主体成立为 **The Taskmaster**，不是把多个页面统一叫作 Agent。唯一主控是 `FrostConversationModel + FrostAgentLoop + Taskmaster`：它保存目标与会话状态、限制步骤和工具预算、处理追问/取消/恢复、只调用注册工具，并在真实回执出现后才允许完成。Gemini 3.5 在 Cloud Run 上提出一个结构化的下一步；确定性运行时决定该动作是否允许执行。

硬件是 Taskmaster 的具身输入/反馈端，不是第二个主控：OJBadge 把实体按键语音和设备事件交给 iPhone，同一 Frost 会话选择 Skill、执行工具并把状态或结果送回圆屏/扬声器。

## 当前能力分层

| 层级 | 当前处理 | 提交时怎么演示 |
| --- | --- | --- |
| 主 Taskmaster | 可运行；有限循环、注册工具、确认、取消、超时、幂等和证据门均有自动测试 | 连续演示“目标 → 补条件 → 调工具 → AMap 路线 → trace/Firestore 证据” |
| 核心页面 Skill | 跑步路线、练了吗、Her Motion 等已装备 Skill 才能委派子 Agent | 主视频优先路线；运动页面只作为同一控制面的扩展证据 |
| Photos | 相册/后摄入口会提交用户选择的压缩图；真实 Qwen 定位和固定 SAM 分割成功后才出现候选，用户再次确认才写健康事实 | 只有部署并用真实餐食通过 `/api/photos-harness/health` 和一次分析时才录进视频 |
| OJBadge | ESP32-S3 AgentLink、BLE、实体 PTT、圆屏、扬声器、电量、触摸与头像代码已入仓；主机协议测试可复现，并有既有真机记录 | 演示“硬件触发 → 手机同一会话 → Taskmaster → 回到硬件反馈”，不称硬件自身为 Taskmaster |
| 外部连接器 | Health Sync、Garmin、wger、Mealie、问诊默认不装备 | 保留接入说明，不创建子 Agent、不自动开页面、不进入主视频 |
| Skill Canvas | 线稿编辑与结构预览 | 不作为真实执行引擎或 Taskmaster 证据 |

## 子 Agent 收敛规则

1. 只有 `availability: equipped` 的 Skill 出现在子 Agent 注册表。
2. 每个子 Agent 只有自己的 Skill 契约、独立日志、最多 3 次模型决策和 2 次工具调用。
3. 子 Agent 只能读取说明、追问或准备页面交接，不能递归派生、写健康事实、控制设备或把 `waiting_external` 改写为完成。
4. 缺账号/服务的连接器仍可做只读缺项回答，但不会启动子 Agent。

## 可复现验收

```sh
npm run typecheck
npm test -- --maxWorkers=2
npm run build
npm run agentic:check
npm run hardware:check
npm run bird:check
npm run ios:test
```

Cloud Run 部署后还必须让 `/api/agentic-readiness`、Cloud Logging 和 Firestore 用同一 trace ID 串起来。代码通过不替代真实 GCP 证据、Photos 服务状态或真机录像。
