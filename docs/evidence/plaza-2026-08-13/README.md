# Plaza 局部改造证据（2026-08-13）

## 改造边界

- Pocket Earth 底部原 `Photos` 入口替换为 `Plaza`，但完整照片能力迁入 Plaza 的 `PHOTOS` 子页；地球与现有 `Skills` 运行台保持原链路。
- Plaza 顶部只保留 `AGENT WORLDS / PHOTOS`。原 Skills Plaza 没有删除，由具体世界、单个 Skill 或 Agent Worlds 底部「查看全部发布」进入。
- Agent World 的世界概念来自作者自有项目快照，角色头像复用作者自有「上街去」动物美术；没有写回或改动两个来源项目。
- 删除钱包、代币、NFT、Injective、合约与交易语义。当前全球目录明确标注为「全球示例网络 / 非实时」，不冒充线上社区。
- Plaza 发现的 Skill 最终只进入本机私人库。声明先通过 Schema、权限和资产协议校验；只有声明包含签名时才执行验签。
- 端侧说明统一为 `Qwen3-VL-2B + MNN`；网页只预览，真实 MNN 安装和自检只在 Android APK 运行。

## 截图目录

1. `01-agent-worlds-home.png`：Agent Worlds 首页、动物发布者、私人世界与全球示例世界。
2. `02-skills-plaza.png`：全球 Skills Plaza、私人安装与协议说明。
3. `03-skill-evidence-expanded.png`：Skill 技术证据展开态。
4. `04-frost-world-suggestion.png`：Frost 根据一句话提出世界草稿；网页明确标注本地规则建议。
5. `05-world-detail.png`：世界详情、世界记忆、NPC 与发布的 Skills。
6. `06-private-skill-forge.png`：受控的私人 Skill 声明工坊；只生成触发词到既有页面的路由。
7. `07-plaza-reading-jot-runtime.png`：Plaza 进入真实 Reading Jot 运行页；返回动作回到 Plaza。

## 已验证交互

- Agent Worlds 与 Skills Plaza 双入口可切换。
- 世界卡片可进入详情；详情可进入单一 Skill 声明或世界全部发布。
- 内置 Skill 可停用、恢复；远程 `http://` Manifest 被拒绝，只接受 HTTPS。
- 私人 Skill 工坊生成的声明会进入现有 Skills 私人库，可打开真实目标页，并可删除。
- Plaza → 阅读摘录 → 真实运行页 → 返回 Plaza 的来源路由闭合；从 Skills 直接进入时仍返回 Skills。
- Web 环境不会伪造 Android MNN 自检、模型安装或实时网络发布者。

## 自动验证

- Plaza 专项：5 个测试文件、20 个测试通过。
- 全量：109 个测试文件、1624 个测试通过。
- TypeScript：`tsc --noEmit` 通过。
- 生产构建：`vite build` 通过；Plaza 保持懒加载，不把旧照片页面并入首屏主包。

## 本轮未执行

- 未部署线上站点。
- 未打包 APK。
- 未修改「上街去」或 Agent World 来源项目。
