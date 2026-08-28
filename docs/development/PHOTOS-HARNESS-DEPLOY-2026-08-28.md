# Photos Harness + SAM 上线记录

## 结论

2026-08-28 01:50 CST 已将真实食物分割链路部署至
`https://pocketbuddy.throughtheglass.art`，接入左侧 Photos 的 `FoodPhotosTab`。
部署前先完成 GitHub 推送；保留旧版本与 shared 配置/数据，不操作手机或硬件。

- GitHub：`narratorzhang0307/pocketbuddy`
- 分支：`codex/0828-photos-sam`（未强推或覆盖 main）
- 运行代码提交：`0d689b80e2885e59b482980fcd617b845a185d5d`
- 当前 release：`/root/pocketbuddy/releases/20260828-photos-sam-v1`
- 可回退 release：`/root/pocketbuddy/releases/20260828-skill-answers-v2`
- 主站 source SHA256：`b77177839f9c04c82331404d12c832d5c1f2a01a543b3bc1ae0ade32a10255e4`
- 训练子页面 source SHA256：`b046511c4eb73fad5c75b5fbc2ea68b7ce4bd0520f2f0a557b80bd11a64b8fba`

## 实际部署

`Photos → /api/photos-harness/analyze → Qwen 定位 → 私有 SAM → Harness 评分/数量校验 → 用户确认 → 同一健康记忆`。

Harness 推理代码来自 SSD 安全清理归档的 `模型训练/pocket/training/`。
SAM 原权重仍保留在 SSD 的 `PocketEarthTraining/checkpoints/`，另复制到服务器私有模型目录；没有把训练集或权重塞回电脑项目或 Git。

- Qwen：复用既有 API，当前视觉模型 `qwen3-vl-plus`。
- SAM：原始 `sam2.1_hiera_base_plus.pt`，SHA256 `a2345aede8715ab1d5d31b4a509fb160c5a4af1970f199d9054ccfb746c004c5`。
- 服务：`pocketbuddy-photo-harness.service`，只监听 `127.0.0.1:4030`，独立 venv、私有令牌、单任务、CPU 100%、内存 1900MiB、swap 0。
- 权重/依赖健康检查与真实推理分别验收；不以健康接口 200 代替分割验证。
- 旧自训练 Qwen LoRA **没有部署**，也没有开通新的付费模型实例。

## 验证

- 冻结目录：2,448 项测试通过、16 项跳过；TypeScript 通过。
- Python 5 项测试通过，主站及训练子页面从冻结源码构建通过。
- 记忆任务交接的 30 个文件逐 SHA256 一致，另一任务已独立核对 GitHub。
- 服务器原始 SAM + 历史定位：公开沙拉图 10 候选、5 通过、5 待复核，约 17.9 秒。
- 一次真实 Qwen + SAM：9 候选、5 通过、`needs_review`，总约 37.5 秒（SAM 约 16.5 秒）。逐掩膜解码验证尺寸和非空前景/背景；不是矩形或示例掩膜。
- 推理服务观测峰值约 1.30GiB，完成后释放模型进程，未终止其他应用。
- HTTPS 健康检查、iOS `capacitor://localhost` 预检 204、无同意请求拒绝通过。
- 上传后逐文件 checksum 对比无内容差异。浏览器实际检查线上 Photos 新入口，旧演示餐食/假摄入不再显示。
- 本轮真实 Qwen 调用 1 次，无自动付费重试；没有录入任何真实或测试餐食到用户记忆。

## 边界与后续

低分区域仍需人工核对；SAM 分数不是准确率，营养是 Qwen 粗略估算，不是从掩膜称重。
用户改餐名时需重填热量；旧菜品/宏量营养不被错误沿用。只有明确确认的份量与时间进入记忆，稳定 UUID 防重复。

Web 已发布不代表 iOS 包已更新。此轮没有安装手机，HealthKit 真机、手机新版 Photos 与锁屏语音仍需后续统一原生包验收。
训练提示音属于既有非源码构建输入：从本机已安装的 `lianlema-portable/app_project/app/assets/audio` 复制到 SSD 冻结构建目录；未强制加入被忽略的音频文件。

运维与恢复步骤见 `deploy/pocketbuddy/PHOTOS-HARNESS.md`。私有令牌/环境文件和测试掩膜证据不在本记录或 Git 中。
