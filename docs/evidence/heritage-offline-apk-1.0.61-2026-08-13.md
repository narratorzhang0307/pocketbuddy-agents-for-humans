# Heritage 端侧链路恢复证据（1.0.61）

日期：2026-08-13  
设备：vivo V2509A / Android 16 / arm64-v8a

## 故障结论

1.0.60 是 Capacitor LIVE 壳，`server.url` 指向生产域名。虽然 APK 内包含 PP-OCRv5 和 ORT，WebView 仍从线上站点请求 `/assets/ocr/*`，导致页面等待时间异常；`cpuTarget=0` 不是本次原因。

## 修复

- 1.0.61 移除 `server.url`，UI、PP-OCRv5、ORT 和 Worker 均由 APK 内的 `https://localhost` 资源提供。
- 保留昨晚验证过的 PP-OCR Worker 路径与古籍业务链路，不更换模型或提示词。
- 云端 Qwen 增强仍使用显式 HTTPS 接口，只在用户主动点击时联网。
- `android:debug:offline` 构建命令显式清除 `POCKET_EARTH_LIVE_URL`，防止后续环境变量误生成 LIVE 包。

## 真机结果

- Capacitor：`Loading app at https://localhost`
- 本地 OCR 请求：`https://localhost/assets/ocr/PP-OCRv5_mobile_*.tar`
- APK 内 OCR/ORT 资源：6 项，54,339,726 bytes
- 原生中文 OCR：约 466 ms
- Qwen3-VL-2B / MNN：约 3,737 ms
- 页面体感：约 5 秒出识读结果
- MNN 3.6.1；SME2 本次为 OFF；`cpuTarget=0`（自动调度）

## 交付物

`deliverables/android/2026-08-13-v1.0.61-offline/Pocket-Earth-Heritage-OFFLINE-1.0.61-v62.apk`

SHA-256：`a676d33cb824ee1828e89e78e10d39bd1156ef5b3cc4ecbd66616f5996ed32b6`

