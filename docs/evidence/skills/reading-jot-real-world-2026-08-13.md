# Reading-Jot 真实书页画线链路验收（2026-08-13）

## 结论

链路真实可行，但不能把“固定大裁剪 + 两次同源 OCR 一致”当成范围证明。本次用公开许可的真实相机书页，实际跑通：

1. 用户画线坐标 → 行级几何选区；
2. 共享 PP-OCRv6 Small 整页文字框 + 裁剪复核；
3. 差异质量门 → 自动通过或人工校对；
4. 用户确认文字 → 本机 MNN / Qwen3-VL-2B 整理；
5. 用户主动点击 → 只上传选区小图和确认文字给云端 Qwen 视觉核校。

三组真实样本的目标汉字 CER 均为 0；两组逐字（含标点）完全一致并自动通过，一组只缺分隔斜线且裁剪 OCR 与整页 OCR 冲突，因此正确进入人工确认。

## 样本与许可

- `monaneng-page.jpg`：Wikimedia Commons，[Copyright page of A Taiwanese Aborigine's Experience](https://commons.wikimedia.org/wiki/File:Copyright_page_of_A_Taiwanese_Aborigine%27s_Experience_by_Monaneng_20160525.jpg)，Public domain。真实相机拍摄，存在阴影和轻微透视。
- `dictionary-spread.jpg`：Wikimedia Commons，[A New Daily Use English-Chinese Dictionary copyright page](https://commons.wikimedia.org/wiki/File:Copyright_page_of_A_New_Daily_Use_English-Chinese_Dictionary_owned_by_GIO_20250404.jpg)，CC BY-SA 4.0。真实摊开书页，存在书脊弯曲、左右亮度差和纸张斑点。

下载地址、许可和画线归一化坐标固化在 `tests/fixtures/reading-jot/real-world/cases.json`。红线只渲染到 `*-preview.jpg` 供核对，OCR 输入始终是没有烧入红线的原照片，与产品 Canvas 叠线行为一致。

## 最终结果

| Case | 模式 | 目标 | 最终文字 | 严格 CER | 质量门 |
|---|---|---|---|---:|---|
| monaneng-underline | 单红线 | 出版者／人間出版社 | 出版者人間出版社 | 1/9 | manual-review |
| dictionary-underline | 单红线、书脊弯曲 | 發行人：蕭宗謀 | 發行人：蕭宗謀 | 0 | ppocr-accepted |
| dictionary-brackets | 双竖线、跨三行 | 出版/印刷/发行三行 | 三行逐字一致 | 0 | ppocr-accepted |

最终一次浏览器 WASM 实测，整页 OCR 分别约 3.9s、7.0s、6.7s；相同辞典页在产品单次交互中只识别一次，本基准为保持 case 独立而重复了页面推理。

## 真实发现并修复的问题

### 1. Vite 开发态无法加载 PaddleOCR

为了保留包内相对 Worker，`@paddleocr/paddleocr-js` 被排除预打包；其 CommonJS 依赖 `clipper-lib` 随即失去默认导出互操作，页面在模型加载前报错。修复为：PaddleOCR 主包保持 exclude，`clipper-lib`、`js-yaml`、OpenCV helper 单独 include。

### 2. 固定向上 14.5% 会吞入多行，且旧质量门会“共同犯错”

第一轮中，单红线把目标上下五行一起识别，裁剪 OCR 与整页范围 OCR 仍有 74%–89% 一致度，错误地自动通过。修复为：

- 单红线按 stroke Y 选择中心位于红线上方且最近的 OCR 行；
- 只有最近行以句号等终止符结束时，才向上回溯连续换行句；
- 双竖线使用用户两笔的原始 Y 边界，不再使用带 padding 的裁剪框做范围判断；
- 裁剪结果只取与行级几何候选最接近的连续行；
- 自动通过阈值由差异 34% 收紧到 22%。

### 3. 相邻三行的同列汉字被检测器纵向粘连

辞典的“世界書局”三行纵向对齐，PP-OCR 检测器输出 `界界界書書書局局局` 高框。修复包含两层：

- 文档 profile 的 detector unclip ratio 从 1.7 收紧到 1.25；
- 仅当高框确实跨越至少两个独立邻行时，折叠重复字符，并用 OCR 可见的共同后缀补齐被截断的邻行。该规则有单元测试，不使用语言模型补字。

### 4. 端侧 2B 对稀疏版权字段产生语义幻觉

真实 MNN 调用曾把“發行人：蕭宗謀”解释为“萧宗谋撰写并评价某部作品”，并误把 UI 的“未填写”视为证据。修复为：

- 空书目字段改成“用户未提供；不是原文”；
- 版权页字段由确定性规则落槽和解释；
- Qwen 返回的书名、作者候选必须逐字出现在确认摘录中，否则丢弃。

修复后真实 MNN 返回经过产品函数的结果为：“这是一条书籍出版信息，原文标注的發行人为‘蕭宗謀’。”，标签仅为“版权页 / 出版信息”，证据门通过。

### 5. 云端视觉核校正确，但自由补了年代与地域

线上 `/api/qwen-vision` 对三行辞典 crop 的 `correctedExcerpt` 逐字正确，但原始响应推断了“1930–1940 年代、上海/台北版本”。图片没有这些证据。修复为：

- 云端 prompt 明确禁止从字体、纸张、繁简体或机构名推断年代、地点、版本；
- 多行版权字段使用与端侧相同的证据 guard；
- 保留逐字核校稿，但背景推测和无证标签不会进入产品结果；
- 真正的年代/版本调查必须等有明确书名、版次后，走独立的 Books 云端检索链。

修复后的真实线上评估：`correctedExact=true`，`evidenceGuarded=true`。线上当前返回模型为 `qwen3-vl-plus`；源码默认已是支持视觉的 `qwen3.7-plus`，需随下一次标准线上发布更新服务配置。

## 可复跑入口

```bash
python3 scripts/generate-reading-jot-real-fixtures.py
npm run dev
# 打开 /ocr-benchmark.html → 运行真实书页画线验收 / 运行端侧 Qwen 整理验收
npm run reading-jot:cloud-eval
```

云端评估只发送公开许可样本的裁剪小图，不发送任何用户数据。
