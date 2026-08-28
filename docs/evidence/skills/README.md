# Pocket Earth Skill 证据目录

本目录只收录可追溯到原始 JSON、模型清单、自动测试或真实运行截图的结论。应用内入口为 `Skills → Skill 证据中心`，可导出同口径的 `pocket-skill-evidence/v1` JSON 台账。

## 判定口径

- **已建立证据**：在固定输入、固定底座和明确指标下，系统或专项模型达到预先声明的质量门槛。
- **条件式成立**：某些集合或运行环境有优势，但样本量、迁移表现或发布门仍不足；产品必须保留 Base/人工回退。
- **协议 / 闭环证据**：该 Skill 不需要 LoRA，验证目标是 Schema、权限、数据生命周期、路由与地图加载/卸载。
- **待手机验收**：桌面与 ARM64 MNN 证据不能替代比赛手机的飞行模式、内存、温升、持续运行和 SME2 A/B。

LoRA 不自动等于优于 Base；原始 LoRA、质量门控后的系统、独立 MNN 专项模型以及 SME2 性能必须分开陈述。

## 模型能力证据

| Skill | 结论 | 可公开表述 | 不能表述 |
|---|---|---|---|
| Book-to-Earth | 闭环已验证 | 4 册资料、68 个确认地点，可安装、落位与卸载 | Mapping 本身是 LoRA 胜出 |
| Reading Jot | 条件式 LoRA | Base 优先，疑难选区才进入 LoRA 与复核门 | 已证明 LoRA 普遍降低 CER |
| Travel | 云端胜出 / MNN 门控 | 云端 64 条盲测槽位准确率 21.3%→98.2% | 当前 8 条 MNN 对照已建立端侧广泛优势 |
| Exhibition | 专项模型已验证 | FP16 MNN 图可执行且图像一致性门通过；72/72 多视图 Alpha | 2.5D 专项模型是 Qwen LoRA；完整 3D 已端侧完成 |
| 古籍识读修复 | 门控系统胜出 | 16 页 5304 字，Base CER 62.18%→门控系统 54.30% | 原始 LoRA 胜过 Base；原始 LoRA CER 实为 75.64% |
| 碑拓识读修复 | 压力集胜出 | 清晰集 +7.55%，压力集 +16.17%，产品保留门控 | 小样本即可证明全面升级 |
| 数字化补全 | MNN 盲测通过 | 12/12 改善，损坏区 MAE 70.50→39.86，蒙版外变化 0 | 这是 LoRA A/B；不可见原文可被确定生成 |

## 内容 / 工作流能力证据

| Skill | 证据目标 | 当前证据 |
|---|---|---|
| Earth Answer | 日期状态机与 Frost 路由 | 路由测试、未来内容不可提前读取 |
| Music | Data Pack 与播放来源语义 | `pocket.music/v1`、YouTube/OSS/external/none 条件测试、96 条示例记录 |
| Books | 数据协议和地图生命周期 | `pocket.books/v1`、未知字段拒绝、1055 条示例记录、加载/卸载 |
| Movies | 数据协议和地图生命周期 | `pocket.movies/v1`、跨 Skill 错配拒绝、2124 条示例记录、加载/卸载 |
| Council | 本地编排、Qwen-only 云模型与隐私门 | 路由、任务模型和敏感原文禁止静默上云测试 |

## 原始文件

`raw/` 是从项目与“上街去”交付证据中复制的冻结副本：

- `travel-cloud-base-lora-64.json`
- `travel-mnn-base-lora-8.json`
- `guji-base-lora-gated-16.json`
- `rubbing-base-lora-clean-24.json`
- `rubbing-base-lora-stress-12.json`
- `restoration-mnn-blind-12.json`
- `exhibition-mnn-host-benchmark.json`
- `exhibition-mnn-image-parity.json`
- `reading-jot-gate-v2-ab.json`

原始设备性能证据由应用内 `真机验收账本` 写入 IndexedDB；正式手机测试需导出汇总、逐条样本、logcat 与 Perfetto ZIP，不能用网页预览或桌面结果替代。
