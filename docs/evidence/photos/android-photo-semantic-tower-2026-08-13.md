# Pocket Earth Android 照片语义塔证据说明

## 当前真实链路

`Android MediaStore assetId → 224px 系统缩略图 → CLIP 图像塔 → 512 维归一化 int8 → App 私有 SQLite`

查询时走：

`自然语言 → 本地同源 CLIP 文本塔 → 512 维查询向量 → SQLite 余弦 top-k → 标签/时间/GPS/OCR 合并 → 少量候选按需交给 Qwen3-VL-2B + MNN 复核`

这条链路不复制系统相册原片，不持久化像素或查询文本，也不上传照片或向量。删除 App 的派生索引不会删除系统照片。

## 为什么当前不用“MobileCLIP”冒名

PicQuery 主干代码已经提供 MobileCLIP2-S0 + LiteRT 的接口，但仓库本身没有附带可直接验证的成对 `image_model.tflite` / `text_model.tflite` 权重。Pocket Earth 当前 APK 使用 PicQuery v1.1.2 已发布包中成对且可追溯的 CLIP ViT-B/32 INT8 ORT 模型作为第一条可运行基线。

因此 UI 与 RunTrace 明确标记为 `CLIP / Android ORT`。MobileCLIP2-S0 只保留为未来可替换升级槽；模型升级会重建向量，不会混用不兼容的 embedding 空间，也不会触碰原片和用户确认记录。

## 固定资产身份

- PicQuery: <https://github.com/greyovo/PicQuery>，源码 MIT。
- Release: `v1.1.2`
- Release APK SHA256: `9d045a6c40598db0211218b89907b65ff72bf08f8ffc2b32826c8fa7185fb1af`
- 图像塔 SHA256: `977f817cd83a37dbad50ac2629476f3792fe334c76f95ad8873434bb9faa6090`
- 文本塔 SHA256: `fb5277500358c43f6309e588da7e30b4aaf0e976ba559ad8b3af481985457ee5`
- BPE SHA256: `924691ac288e54409236115652ad4aa250f48203de50a9e4722a6ecd48d6804a`

MIT 只覆盖 PicQuery 源代码；模型权重继续遵循上游模型条款，二者不混称。

## 验收门槛

1. APK 可以安装且插件报告三份资产哈希正确。
2. 用户授权后可按 MediaStore ID 增量建库；第二次运行复用未修改照片。
3. App 重启后 SQLite 中的向量仍可查询。
4. 固定照片包中的猫、票据、二维码查询能够返回对应类别。
5. 飞行模式下文本塔和 top-k 仍可运行。
6. 清除向量后系统照片数量不变。

在以上真机门槛全部通过前，界面只显示“已编译/待真机验收”，不宣称性能或召回率完成。
