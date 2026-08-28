# Pocket Earth 全部业务 Skills 端侧化与四轮优化验收

日期：2026-08-13  
设备：vivo V2509A（arm64-v8a）  
应用：Pocket Earth 1.0.50（versionCode 51）

## 结论

Skills 页除 Plaza（安装/发布系统）外的 13 个业务 Skill 均已有本机执行入口，页面以
`13/13 ON DEVICE` 统一展示。默认模型路线为 Qwen3-VL-2B + MNN；云端只保留为用户
明确选择的增强能力，不再由端侧失败自动触发。

## 13 个 Skill 的端侧覆盖

| Skill | 本机能力 | 可复查入口 |
|---|---|---|
| EARTH ANSWER | 本地数据与日期状态机 | 365 条本地行动数据 |
| MUSIC | MNN 意图、排序、策展 | Qwen/MNN + 本地音乐 Data Pack |
| BOOKS | 本机视觉识书与对话 | MNN Vision/Text + 本地书库 |
| MOVIES | 本机视觉识片、标签与对话 | MNN Vision/Text + 本地片库 |
| COUNCIL | 多视角发言、争点、裁决 | MNN Text；失败不静默切云 |
| BOOK TO EARTH | 本机 OCR/VL 与地名候选 | MNN + 人工确址 + 私人 Data Pack |
| READING JOT | Base / OCR LoRA 识读 | MNN Vision + 可插拔 Adapter |
| TRAVEL | 约束理解、排序与规划 | Base / Travel LoRA + 本机规则工具 |
| EXHIBITION | 展签识读、抠图、2.5D | MNN Vision + 本机专项工具 |
| 古籍识读 | OCR、Base/LoRA 校对、断句释义 | PP-OCRv5 + MNN Vision |
| 碑拓识读 | OCR、Base/LoRA 校对、断句释义 | PP-OCRv5 + MNN Vision |
| 数字化补全 | 可见字、候选、人工确认、像素修复 | OCR + MNN Text/Vision/Tool |
| PHOTOS CURATOR | 照片技术质量、重复组与审美权重排序 | 本机质量特征 + Qwen3-VL Base；审美 LoRA 为研究候选 |

覆盖清单由 `src/app/lib/skill/onDeviceCoverage.ts` 维护；自动化测试要求集合必须精确等于
以上 13 项，不能用 Plaza、云端接口或预设结果凑数。

## 四轮迭代记录

### 第一轮：路由真实性

- Books、Movies、Music、Council、Travel、Exhibition、Frost 编排默认改走端侧。
- 端侧返回无效内容时显示明确失败，不把云端输出冒充本机结果。
- 旅行详情只联网取得三份公开来源，摘要由端侧 MNN 生成；失败则展示来源摘编。
- 展览和 Heritage 的云端增强仍可使用，但必须由用户明确点击。

### 第二轮：功能回归

- 全仓：109 个测试文件、1625 项测试通过。
- TypeScript：`tsc --noEmit` 通过。
- 覆盖协议、模型 Bundle、Books、Travel、Exhibition、Heritage、Photos 等既有功能。

### 第三轮：真机稳定性

- Java 推理任务继续使用单线程队列，避免多个 MNN Session 并发抢内存。
- 文本与视觉模型族切换时先释放另一模型、Adapter 与 Session；允许冷启动变慢，避免
  vivo 决赛机在加载视觉模型时因短时双倍工作集被系统杀死。
- 原生修复指纹：`pocket-jni-v18-single-family-memory`。
- 原生 JNI 已重新编译，不是只修改源码后复用旧 `.so`。

### 第四轮：决赛交付

- Skills 顶部只显示一个结论：`13/13 ON DEVICE`。
- 每张业务 Skill 卡显示简洁“端侧”标记，保留原 MNN / SME2 手动 ON/OFF 开关。
- 看展搭子新增一个随 APK 离线携带的繁复展厅六视角样例：玻璃、石墙、底座、阴影同场，
  真实 Matting MNN 整组门禁 6/6 通过，再生成相对深度与 2.5D Viewer。
- 最终 APK 强制携带 PP-OCRv5 Mobile、WebView WASM 与中文 ML Kit；删除 OCR 会导致
  APK 验收失败。150 MiB 是包含离线 OCR 的硬上限，不再沿用 Base-only 壳的 40 MiB。
- `install -r` 在 V2509A 覆盖安装成功；未清除已有 Qwen 权重、Adapter 和本地数据。

## APK 与静态证据

- 文件：`deliverables/apk/Pocket-Earth-Plaza-Specialists-1.0.50.apk`
- 大小：74,922,465 bytes
- APK SHA256：`4e267606f7a151390e3d3b117a8dff0b3d66e1bb2e62b7c0d018084dff022ed1`
- JNI SHA256：`96eacc53ec1c8a1e73001a4590c760121d8e6a83c3bf0321cabcabaeeebf07d5`
- MNN SHA256：`ce43815a49fd179b285dea2ad15c3aedb2be71e5371da321ddabb4de84790358`
- 14/14 JNI 导出通过。
- MNN LLM、双图视觉、PP-OCRv5、SME2、KleidiAI 静态契约通过。
- 仅 arm64-v8a；Qwen 权重不焊进 APK；16 KiB 对齐与 APK 签名通过。

## 真机截图

- `01-12-of-12-on-device.png`：最终首屏、模型已安装、手动 MNN/SME2 开关。
- `02-skill-cards-on-device.png`：古籍、碑拓、数字化补全等卡片的端侧标记。

## 证据边界

本记录能证明：13 个业务入口均已接入本机路线、自动化契约和最终 APK；1.0.49 及更早版本
已在指定 vivo 真机覆盖安装并完成启动烟测，1.0.50 已完成主机侧构建、签名与静态验收，待
USB 调试重新枚举后覆盖安装；古籍、碑拓、数字化补全已有此前保存的真机真实样例。
它不把静态 SME2 内核存在写成 SME2 加速已经成立；SME2 性能结论仍应使用同机、同输入、
同 Skill 的 OFF/ON 记录比较。
