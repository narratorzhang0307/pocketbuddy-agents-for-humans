# MY AGENT 相机与 Qwen 角色生成链路

更新日期：2026-08-13

## 结论

MY AGENT 的“打开相机 · 扫描物件”复用“上街去”的角色生成后端。前端只负责实时取景、拍摄、即时本机预览和任务状态；Qwen 密钥与生成提示词全部留在服务端。

## 用户链路

1. 用户从 MY AGENT 卡册进入出生页，点击醒目的相机入口。
2. 浏览器通过 `MediaDevices.getUserMedia` 打开后置相机；取景画面只在本机显示。
3. 用户按下快门后，前端按摄像头原始宽高比生成 JPEG（最长边限制为 1440 像素），并立即退出相机回到出生页；实时取景同样完整显示，不做放大裁切。
4. `processAgentImage` 在本机校验、缩放并生成兜底抠图，因此原图和初步结果可以先显示。
5. 前端向 `POST /api/pets` 上传临时图片，使用 `mode=mascot` 与 `adaptive-v1` 模板。
6. 服务端通过阿里云 DashScope 多模态图像接口调用 `qwen-image-2.0-pro`（可由 `QWEN_PET_IMAGE_MODEL` 覆盖），结合“上街去”的角色风格参考板，保留主体身份并生成统一纯绿底角色。
7. 服务端校验单主体、完整边界与留白，再运行 `controlled-chroma-key-v2` 去绿底、去绿溢色并校验透明区域，输出透明 PNG。
8. 前端轮询任务进度，下载最终 PNG，再次本机校验后回填“原图 / 已萌化”对照区。失败时保留第 4 步的本机兜底结果。

## 代码位置

- 相机、出生页与回填：`src/app/components/PocketBuddyForge.tsx`
- 前端临时任务客户端：`src/app/lib/agent3d/petCutoutApi.ts`
- HTTP 接口与访问令牌：`server/pet-api.mjs`
- Qwen、主体校验、绿幕去底与 30 分钟清理：`server/pet-pipeline.mjs`
- Android 相机权限：`android/app/src/main/AndroidManifest.xml`

## 服务与隐私边界

- 供应商：阿里云百炼 / DashScope。
- 默认模型：`qwen-image-2.0-pro`。
- 默认接口：`https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`。
- 鉴权：仅服务端读取 `DASHSCOPE_API_KEY`，不写入 Web 包或 Agent 记忆。
- 上传限制：12 MB；JPEG、PNG、WebP、HEIC/HEIF。
- 每个任务含随机 `accessToken`，原图、纯色底图和透明 PNG 均为 `private, no-store`。
- 成功下载后前端主动释放任务；未释放任务在 30 分钟后删除；服务重启也会清理中断任务。
- 原始照片不会进入 MY AGENT 的人格或记忆，只有用户确认保存后的透明角色图与用户填写的人格字段留在本机口袋。

## 架构贡献表述

技术架构可概括为：`实时相机取景 → 本机图像净化/兜底 → 临时私有任务 API → DashScope Qwen 图像身份保持与角色萌化 → 受控纯色背景 → 服务端色键透明化与质量门禁 → 本机持久化角色、人格与事件记忆`。

这条链路与“上街去”原后端相比，只将风格参考中的腊肠犬素材指向本项目的 CITY DECK 版本；Qwen 请求方式、任务隔离、透明抠图和清理策略保持一致。
