# 服务端 Prompt Harness

协议：`frost-agent-prompt-harness/v1`，版本 `1.0.0`。

## 为什么需要

旧页面会各自向 `/api/frost-llm` 发送 `system` 文本。直接把它当模型 system instruction 会造成规则漂移，也让前端输入可以覆盖后端安全边界。现在所有 Gemini 和服务端 Qwen 文本请求先经过 [`agent-prompt-harness.mjs`](../../server/agent-prompt-harness.mjs)：

1. 服务端策略始终是最高权威。
2. 旧 `system` 字段被保留兼容，但转换为低权威、非可信的“客户端任务说明”。
3. 按 task 选择固定 profile、输出 token、温度、超时和 JSON 要求。
4. 输入被确定性截断；结构化输出必须通过 `JSON.parse`。
5. 响应返回收到/接受字符数与是否截断；Firestore 只记录 profile、接受字符数和截断布尔值，不记录正文。

## Profile

| Profile | task 匹配 | 约束 |
| --- | --- | --- |
| `taskmaster` | `taskmaster`、`health-*` | 强制 JSON；只有可验证下一步；无证据不完成 |
| `subagent` | `subagent:*` | 限定委派范围；不能扩权或伪造设备结果 |
| `route` | `run-route-intent`、route/plan 后缀 | 强制 JSON；不能编造坐标或已完成活动 |
| `skillAnswer` | `skill-answer:*` | 只回答指定 Skill，保留安全门 |
| `research` | `research-*` | 只使用实际证据/搜索结果，不造引用 |
| `evidence` | `mapping-*`、`exhibition-*` | 证据约束提取，不造原文、页码、坐标 |
| `default` | 其他 | 保留旧页面用途，但服从服务端基线策略 |

## HTTP 契约

请求：

```json
{
  "prompt": "string, required, max 24000 chars",
  "system": "string, optional compatibility task instruction, max 5000 chars",
  "json": true,
  "task": "taskmaster",
  "session_id": "optional",
  "run_id": "optional"
}
```

响应除 `text/model/provider/traceId/evidence` 外，包含：

```json
{
  "promptHarness": {
    "protocol": "frost-agent-prompt-harness/v1",
    "version": "1.0.0",
    "profile": "taskmaster",
    "budget": {
      "prompt": { "limitChars": 24000, "receivedChars": 320, "acceptedChars": 320, "truncated": false },
      "clientInstruction": { "limitChars": 5000, "receivedChars": 0, "acceptedChars": 0, "truncated": false }
    }
  }
}
```

`json:true` 或 profile 强制 JSON 时，模型返回非 JSON 会得到 `bad_model_output`，不能把破损文本交给执行器。

## 新增任务流程

1. 能复用现有 profile 就只发送规范 task 名；不要复制新系统提示词。
2. 确需新策略时，在 `PROFILES` 添加最小规则和预算。
3. 在 `promptProfileForTask` 增加确定性匹配。
4. 添加 profile、注入防护、预算和输出校验测试。
5. 同一 PR 修改调用端与本文档。
