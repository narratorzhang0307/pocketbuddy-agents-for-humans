# Pocket Earth Photos：Facet / PicQuery 适配说明

## 最终产品结构

Photos 顶层固定为三页：

1. **精选**：借鉴 Facet，把一整个相册压缩成少量需要用户确认的相似组、连拍组和技术问题；技术质量、通用审美与个人偏好保持分层，任何删除或发布动作都需要用户确认。
2. **找照片**：借鉴 PicQuery，以 Android MediaStore 的稳定 asset id 为源，增量生成本地向量，支持自然语言检索和以图搜图；原片不复制进 App。
3. **杂志**：保留 Pocket Earth 原有杂志与日历视图，只显示用户已经确认收录的照片；它是精选结果层，不再承担清理任务。

## 可复用思想与 Pocket Earth 实现

| 上游能力 | Pocket Earth 适配 | 真实性边界 |
|---|---|---|
| Facet 技术评分 | 缩略图清晰度、曝光、色彩、对比度；Qwen 只处理代表图 | 未运行的人脸、闭眼或构图模型不得显示为已检测 |
| Facet 连拍/相似组 | dHash + pHash + 时间/GPS 聚类，组内先按技术质量选代表 | 只建议，不自动删除 |
| Facet PersonalRanker | 用户 A/B 选择写入本机事件账本，再对候选重排 | 与 LoRA 解耦；换模型后可重放历史选择 |
| PicQuery MediaStore | `PocketPhotoLibrary` 原生桥分页枚举稳定 asset id | APK 只缓存 ≤320px 缩略图和派生索引，原片仍在系统相册 |
| PicQuery 增量 embedding | IndexedDB 保存模型版本、源文件修改时间和 int8 向量 | 模型升级仅重建向量，不改原片或确认记录 |
| PicQuery 文搜图 | 本地文本向量与图片向量余弦检索 | 无已安装模型时明确降级到标签/时间/GPS/OCR |
| PicQuery 以图搜图 | 直接使用已索引照片的图片向量检索相似照片 | 不需要重新读取原片，也不产生网络请求 |

## 模型分工

- **便宜、全量、本机**：EXIF、像素质量、dHash、pHash、聚类和 IndexedDB。
- **语义检索、本机**：轻量图文 embedding；模型未安装时不伪造结果。
- **复杂代表图、端侧**：Qwen3-VL-2B-Instruct，经 Android JNI → MNN 3.6.1；网页预览只能展示交互，不能签发真机 MNN 证据。
- **LoRA**：仍保留研究入口，但没有通过真机加载与冻结盲测门槛前不进入生产排序。

## Android 验收标准

1. 相册授权来自 Android 系统权限页，枚举结果来自 MediaStore。
2. 刷新后 asset id 稳定；撤销权限后结果隐藏，不把未见资产误判为删除。
3. 原片仍由系统相册持有；Pocket Earth 只在用户点开时请求该 asset。
4. Qwen 状态必须返回 Android JNI、MNN 版本、Qwen3-VL-2B 资产校验和真实推理结果。
5. 浏览器、云端或规则回退不得显示为 `MNN READY`。
6. APK、Web UI 与模型清单中不得混入 Qwen 4B 名称或资产。
