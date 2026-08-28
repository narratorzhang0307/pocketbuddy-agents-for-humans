# Pocket Earth Skills / 古籍 / 看展决赛收口审计（2026-08-12）

> 范围：除 `Photos` Tab、`src/app/lib/photo/**` 与 `training/aesthetic-curator/**` 外的决赛产品。Photos 由另一任务独立负责，本审计不覆盖、不修改其业务实现。

## 本轮落地

- `看展搭子`：保留 Pocket Earth 的 Qwen/MNN 编排与视觉风格，迁入“上街去”已经验证的 6 组 2.5D 展品实例与展签/时间线/3D 能力；主列表改为紧凑条目，不再套展品票卡层。
- `古籍 / 书籍 Mapping`：迁入《四时幽赏录》《梦粱录》《板桥杂记》《浮生六记》4 册示例，共 68 个已确认地点。预览恒常可见；Data Pack 加载后进入 Mapbox `内容`层，卸载后地图层与本机 Pack 同步移除。
- `古籍识读修复`：Qwen Base 与 `guji-vision` LoRA 双候选；竖排正文、夹注、印章分层，不可见字保留 `□`。
- `碑拓识读修复`：Qwen Base 与 `rubbing-vision` LoRA 双候选；风化噪声不自动补字，强分歧进入人工校订。
- `数字化补全`：Qwen 先路由材料，再把用户确认的遮罩交给 MNN 修复器；遮罩外像素必须零变化，结果只另存副本。
- Skills Plaza：13 项能力全部可发现/预览；主 Skills 页只显示已装备项。四个古籍相关 Skill 使用不同小动物发布者。
- Frost：新增古籍识读、碑拓识读、数字化补全的独立路由，继续由一个 Frost Agent 调度 Skills，不再把每个步骤包装成“子 Agent”。

## 数据与发布边界

- 四个原始 `.skill` 留在“上街去”本机工程，不上传。
- 发布的 `pocket.mapping/v1` 包只含公共领域古籍短引、事实性地名、坐标、章节索引与来源 SHA；私人整理说明被排除。
- Data Pack：`art.throughtheglass.pocketearth.guji-mapping-demo@1.0.0`，4 records / 68 locations。
- OSS 不可变发行：`20260812-final-v5`，109 objects / 45,549,697 bytes；上传后逐项 `HEAD` 回读大小和 `x-oss-meta-sha256`。
- CDN 根：`https://assets-pocketearth.throughtheglass.art/pocket-earth/releases/20260812-final-v5/`。
- 首屏门禁：841,385 bytes，小于 3MiB；首屏依赖闭包不含 `.mnn`、LoRA、Data Pack、3D、MediaPipe WASM。

## 五轮验收记录

1. **架构与协议**：核对源/目标后只迁入能力与实例，不覆盖目标已有 Qwen/MNN 链路；`pocket.mapping/v1` 严格协议通过。
2. **静态与单元测试**：`npm run typecheck` 通过；非 Photos 76 个测试文件、1,466 条测试通过；新增四个文博 Skill 的路由、权限、共享 Qwen 底座和独立发布者契约测试。
3. **生产与 OSS**：生产构建通过；修复旧清单 SHA 漂移和发布顺序；v5 公开静态资产与古籍 Data Pack 上传、回读通过。
4. **Android 静态验收**：`app-debug.apk` 构建通过；13/13 JNI 导出、MNN LLM、CPU target 2/3、SME2、KleidiAI、arm64-v8a、16KiB 对齐、签名、无内置模型权重全部通过。最终 APK SHA256：`e6862e010695dc9edecc1ba7341e318fddd9633bfc076bd68df4ff916e0e0112`。
5. **真实 UI 回归**：浏览器实测 Plaza → Mapping 预览 → OSS 装载 → Mapbox 68 点 → 卸载；古籍三入口与看展紧凑列表均可进入；控制台 0 error / 0 warning。

## 与赛事要求逐项对应

| 要求 | 当前证据 | 状态 |
|---|---|---|
| 至少使用一款 Qwen 系列模型 | Qwen3-VL-2B 双基座；云端 Qwen API 只做授权增强 | 已满足 |
| 核心交互逻辑支持本地运行 | Android JNI → MNN；离线/失败有确定性回退，不把浏览器结果冒充端侧 | 代码与包内证据满足；真机待验 |
| 推荐 MNN 推理框架 | `libMNN.so`、`libpocket_mnn_jni.so` 已进入 arm64 APK | 已满足 |
| Arm SME2 加速与性能优化 | MNN 包含 SME2/KleidiAI；UI 提供 target 2/3、ABBA×2、A/B 各 20 次和 IndexedDB 逐样本账本 | 代码与包内证据满足；真机数据待验 |
| 手机创意 AI 应用 | 可装卸 Skills、私人 Data Pack、Frost 调度、Mapbox 落位及文博/旅行/书影音工作流 | 已满足 |

## 唯一不能在桌面替代的证据

- 比赛手机安装、模型下载与真实端侧解码。
- 飞行模式下的完整闭环。
- 同一台 Armv9/SME2 手机上的 target 2/3 正式 ABBA×2（每模式不少于 20 次）、温度/版本/Input SHA 门禁、logcat 与 Perfetto 导出。

未获得上述真机证据前，产品只显示“真机成绩待验”，不得宣称 SME2 已产生确定加速比例。
