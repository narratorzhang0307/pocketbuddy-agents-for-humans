# Frost Agent · Pocket Buddy

Frost 是用户面对的长期伙伴。手机文字、吧唧本机转写后的文字以及健康建议入口共用同一个主会话；Skill 提供能力，Taskmaster 管理执行边界。

产品说明见 [Pocket Buddy](../README.md)，当前实现细节见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 统一执行链

```text
手机文字 / 吧唧录音经 iPhone 本机 ASR
  → sendFrostAgentMessage
  → FrostConversationModel + FrostAgentLoop
      ├─ 只读问答 / 记忆建议 → 服务端选定模型 → 校验回复
      └─ 已登记 Skill → Taskmaster → 独立 Skill 子 Agent
          → 原 Skill 页面 / 可信工具
          → 权限、确认、真实结果与健康事实边界
  → 同一会话的状态、证据和回复
```

[FrostConversation](../src/app/lib/frostConversation.ts) 处理统一对话、路由与记忆；[FrostAgentRuntime](../src/app/lib/frostAgentRuntime.ts) 维护运行会话。手机和吧唧没有各自独立的模型人格或健康事实库。

## 模型与设备分工

- 云端模型：通过服务端代理完成结构化决策、Skill 查询或健康建议；参赛部署固定为 Gemini 3.5，其他部署可保留兼容提供商。模型和密钥只由服务端配置，不进入浏览器或 App。
- iPhone：承担原生 BLE、本机 ASR、相机和健康数据权限；能力是否可用取决于真实系统状态。
- 电子吧唧：承担录音、显示和音频交互，由 Companion 投射经过校验的状态。
- MiniMax：为已接入的回复生成语音；不把云端合成成功等同于硬件已经出声。
- `edge/` 保留 MNN 等可选兼容路径；它们不代表默认手机流程已支持完全离线模型。

## 目录

| 目录 | 用途 |
| --- | --- |
| [runtime](runtime/) | 有限循环、消息收件箱、审批、日志、恢复与 Goal Driver |
| [subagents](subagents/) | 已装备 Skill 的子 Agent 身份、独立上下文和服务端模型请求 |
| [taskmaster](taskmaster/) | 任务监督、子 Agent 委派、健康事实和幂等执行边界 |
| [skill-canvas](skill-canvas/) | 能力卡编译与保存；用户从画布明确启动后，由 skill-taskmaster 执行已绑定能力并记录证据 |
| [skill-taskmaster](skill-taskmaster/) | 旧导入路径的兼容转发 |
| [harness](harness/) | Brain、路由、交接、记忆和校验 |
| [skills](skills/) | 能力说明与健康领域适配 |
| [edge](edge/) | 可选模型运行时契约与适配 |
| [harness/memory.ts](harness/memory.ts) / [longTermMemory.ts](harness/longTermMemory.ts) | 本地会话和长期信息相关实现 |

历史的 `agents/` 领域代码与其他兼容目录不是当前产品能力清单；实际可调用能力以注册表、装备状态和宿主权限为准。

只有 `availability: equipped` 的 Skill 会创建子 Agent。已安装但缺账户、桥接器或服务的 Skill 只返回接入说明；不会分配子 Agent、打开页面或生成“已完成”状态。

## 安全与真实状态

1. 主 Agent 和子 Agent 都受步骤、工具、超时和上下文边界约束。
2. 模型输出只能作为候选；写入健康事实、采集数据或控制设备需要相应执行校验。
3. 语义上的“确认”不能替代系统权限，也不能确认已失效的旧任务。
4. `waiting_external` 仅表示等待真实能力结果，不表示训练、播放或写入完成。
5. 中断恢复不得重放已提交副作用；缺服务、缺权限、断连和失败需要明确展示。
6. 手机后台、锁屏相机及锁屏语音不由这份文档保证可用。

历史产品设计与原版详细说明见 [产品文档索引](../docs/product/README.md)。当前调用链以源码和实际验证结果为准。
