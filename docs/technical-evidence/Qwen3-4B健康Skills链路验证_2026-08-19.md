# Qwen3-4B × Frost 健康 Skills 链路验证

验证日期：2026-08-19  
结论：7 个外部健康 Skill 均可复用同一套 Qwen3-4B 基座，但模型必须被限定为自然语言表述层，不能成为健康事实源、安全裁决器或工具执行器。

## “llama.cpp OpenAI 兼容服务”的含义

这里的“OpenAI 兼容”只表示 HTTP 接口形状兼容：服务提供 `/v1/models` 和 `/v1/chat/completions`，请求继续使用 `model + messages + temperature` 等字段。模型权重和推理都在本机/自有服务器的 llama.cpp 中运行，不会因此调用 OpenAI 云服务。

Frost 因而可以复用同一种客户端结构，只需把 `baseURL` 指向本地或服务器的 llama.cpp；将来替换端侧 MNN、其他兼容运行时或受控云服务时，上层 Skill 契约不用重写。

## 最终安全边界

```text
本地 Skill Router
  → 确定性规则/只读工具生成证据
  → 压缩为结构化证据摘要
  → Qwen3-4B 只生成 { message }
  → Validator 固定附着 skill/outcome/tools/evidence refs/unknowns
  → 数字溯源、字段、长度和语义断言通过后才进入 UI
```

以下字段不允许由 Qwen 生成或修改：

- Skill ID
- `proceed / wait / degrade / safe_stop` 结论
- 工具调用及权限
- evidence IDs
- 缺失字段
- readiness 上限、停止规则和处方校验结果

Validator 还会拒绝证据中不存在的新数字。OpenFoodFacts 证据使用明确中文营养标签，避免把“盐”误写成“钠”。

## 真实服务器验证结果

服务：llama.cpp OpenAI-compatible loopback endpoint  
模型：`Qwen/Qwen3-4B`，GGUF `Q4_K_M`  
模型别名：`qwen3-4b-local`  
并行：1；上下文：1024；非思考模式

| Skill | 确定性结论 | Qwen 表述结果 | 模型请求耗时 | 结果 |
|---|---|---|---:|---|
| `frost.running-coach` | `degrade` | 高强度间歇跑超出红色上限，应停止 | 3.058s | 通过 |
| `frost.healthsync` | `proceed` | 未记录日期不按 0 计入 HRV | 3.761s | 通过 |
| `frost.mediapipe-motion` | `wait` | 等待连续帧确认，不声称动作完成 | 3.426s | 通过 |
| `frost.endurance-guard` | `degrade` | 黄色阈值冲突，计划未通过 | 3.829s | 通过 |
| `frost.openfoodfacts` | `proceed` | 返回真实条码的每 100g 字段，未知值保持未知 | 15.812s | 通过 |
| `frost.garmin-readonly` | `wait` | 无用户授权数据时等待重新登录 | 3.885s | 通过 |
| `frost.cn-health-library` | `proceed` | 食品估算与仅基于确认事件的周报 | 7.836s | 通过 |

最终 Live Suite：7/7 通过，总耗时 49.21 秒。该数字是模型已加载的热状态结果，不代表冷唤醒耗时。

## 测试数据边界

- OpenFoodFacts：真实公开条码 `3017620422003`，公开 API 返回 Nutella 产品和每 100g 营养字段。
- healthsync：真实安装版本与只读命令；健康记录使用合成数据，未读取用户个人 Apple Health 数据。
- Garmin：真实安装版本与只读白名单命令；未读取账号、凭据或个人 Garmin 数据，鉴权缺失按 `wait` 降级。
- Running Coach、MediaPipe、Endurance Guard：确定性边界样例。
- 中国食品/周报：本地参考库结果与合成的已确认事件。

## 试验中发现并修复的问题

1. 完整证据对象直接放入 4B Prompt 时，输入处理接近一分钟；改为结构化证据摘要后，性能恢复到可交互范围。
2. 让 4B 回填 Skill、工具和 evidence IDs 时，模型会改写引用；现已改为 Harness 固定附着。
3. 让 4B 生成 unknowns 时，它会改变字段结构；现由确定性层生成。
4. OpenFoodFacts 初版表述曾把“盐”误写成“钠”；现使用中文证据标签、禁止钠误写，并增加数字溯源校验。
5. 48-token 输出上限可能截断营养 JSON；最终使用 64 tokens，并保留 80 字 UI 长度上限。

## 可复现命令

先通过安全隧道把服务器 loopback 端点映射到本机，再运行：

```bash
QWEN4B_BASE_URL=http://127.0.0.1:18040/v1 npm run health:eval-qwen4b-skills
```

确定性与边界回归：11 个测试文件、89 项测试通过，并通过 `npm run typecheck`。

## 产品判断

可行，但不是“七套 Skill 都让 4B 自己做”。正确的统一方式是：七套 Skill 共用 Qwen3-4B 的意图/表述基座，各自保留确定性工具和安全门。这样既能统一人格和交互，也不会把健康数据、动作完成、训练安全和营养事实交给小模型猜测。
