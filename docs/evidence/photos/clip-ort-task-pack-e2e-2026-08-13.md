# Photos 端侧语义塔固定任务包 E2E

## 结论

使用 Android APK 内同一对 `CLIP ViT-B/32 INT8 ORT` 图像塔与文本塔，对 32 张比赛照片任务包建立 512 维向量后，8 条固定英文查询的 Top-1 均命中预期照片类型。

本次复算只向模型输入 224×224 RGB 像素与查询文本。排序阶段没有读取文件名、人工标签、任务包标签或 EXIF。

| 查询 | Top-1 | 分数 | 关键后续名次 |
|---|---|---:|---|
| a photo of a cat | 去年杭州的猫·轻裁切 | 0.2709 | 前五名全部为猫 |
| a receipt document | 咖啡票据·清晰 | 0.2501 | 前四名依次覆盖登机牌、反光票据、停车票 |
| a QR code | 停车票·二维码 | 0.2797 | 二维码票据精确置顶 |
| a boarding pass | 登机牌·杭州东京 | 0.2926 | 登机牌精确置顶 |
| a lighthouse | 灯塔·重复 | 0.2979 | 两张灯塔占据前两名 |
| people at the beach | 同行朋友 | 0.2578 | 海边朋友连拍占据第 2–5 名 |
| a lake landscape | 无 GPS 湖景 | 0.2255 | 无 GPS 湖景置顶 |
| a blurry accidental photo | 误拍·严重模糊 | 0.2674 | 低对比、欠曝紧随其后 |

完整 Top-5 原始结果见 [clip-ort-task-pack-results-2026-08-13.json](./clip-ort-task-pack-results-2026-08-13.json)。

## 运行身份

- 图像输入：`1×3×224×224 float32`
- 图像输出：`1×512 float32`
- 文本输入：`1×77 int32`
- 文本输出：`1×512 float32`
- 向量持久化：L2 归一化后对称 int8；Android App 私有 SQLite
- 桌面 CPU 固定包复算：32 张图约 0.99 秒（只作为功能证据，不冒充目标手机性能）

## 尚未替代的真机验收

该结果证明模型配对、预处理、BPE 与 top-k 数学链成立；仍需在目标 Android 手机上验证 MediaStore 权限、缩略图读取、SQLite 重启恢复、飞行模式查询、温升和真实耗时。
