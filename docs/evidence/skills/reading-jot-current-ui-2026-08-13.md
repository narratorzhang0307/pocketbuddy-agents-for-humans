# READING-JOT 当前 UI 真实链路证据

日期：2026-08-13（Asia/Shanghai）

## 结论

当前竖版手机 UI 已用同一张公开许可的英汉辞典摊开页重新跑通：确定性红线范围 → PP-OCRv6 → 端侧 Qwen 2B / MNN → 云端 Qwen3-VL-Plus。所有模型输出均与摘录原文并列展示，不会自动覆盖；保存仍需要用户确认。

## PPT 证据总页

![READING-JOT 当前 UI 真实链路证据](./reading-jot-current-ui-2026-08-13/00-reading-jot-evidence-slide-16x9.png)

## 原生竖版截图

### 1. 公开书页与红线

![公开书页与红线](./reading-jot-current-ui-2026-08-13/01-capture-current-ui.png)

### 2. PP-OCRv6 识读与质量门

![PP-OCRv6 识读](./reading-jot-current-ui-2026-08-13/02-ppocr-current-ui.png)

### 3. 端侧 Qwen 2B / MNN 整理

![端侧 Qwen 2B / MNN](./reading-jot-current-ui-2026-08-13/03-edge-2b-current-ui.png)

### 4. 云端 Qwen3-VL-Plus 精读

![云端 Qwen3-VL-Plus](./reading-jot-current-ui-2026-08-13/04-cloud-current-ui.png)

### 5. 云端真实运行轨迹

![云端真实运行轨迹](./reading-jot-current-ui-2026-08-13/05-cloud-run-trace-current-ui.png)

## 本次实测记录

| 环节 | 实际结果 | 耗时 / 模型 | 数据边界 |
| --- | --- | --- | --- |
| 红线范围 | 固定公开样本的归一化画线坐标，命中右页出版信息 | 确定性规则 | 原图仅在本次页面内存 |
| PP-OCRv6 | `發行人：蕭宗謀`；选区与整页文字框一致；质量门通过 | 11.30s；`PP-OCRv6_small`；99% | 整页不落库 |
| 端侧整理 | 识别为出版信息，生成 `版权页`、`出版信息` 标签 | 4.23s；`Qwen3-VL-2B/MNN` | 只读确认文字，不发送原图 |
| 云端精读 | 返回 qwen3-vl-plus 增强稿；发现更长上文并标为待核验，未覆盖确认原文 | 12.22s；`qwen3-vl-plus` | 仅上传选区小图与确认文字 |

## 可复现方式

开发态 URL 使用 `?readingJotEvidence=dictionary` 固定公开样本与画线坐标，避免系统相册选择器影响自动化验收。该入口只在 `import.meta.env.DEV` 下生效，不改变生产相册 / 拍照流程。云端证据请求由同源 Vite 中转到公开演示接口以绕过浏览器 CORS，中转不读取本地模型密钥。

