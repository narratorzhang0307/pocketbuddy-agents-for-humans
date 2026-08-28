# 2026-08-28 当前源码快照

本次将当前开发目录的源码发布至 `narratorzhang0307/pocketbuddy` 的 `main`，以此前 `eaffa7ffc43c758af066e7a26004ad731fadac11` 为父提交，保留已有 Git 历史，不强推。

范围包括主应用、Frost Agent 与 Taskmaster、各 Skill、后端网关、Photos 分析、训练子应用、iOS/Android 宿主、OJBadge 固件、原生桥接、测试与应用静态资源。当前目录不存在的旧版入口不拼入新版本；旧内容仍可从父提交查阅。

不发布 API 密钥、签名文件、用户照片/录音、私有提交材料、依赖目录、训练数据、大型模型权重、设备 Flash 备份和编译缓存。浏览器运行需要的已纳入源码目录的模型/运行库资源与训练权重区分处理。源码中的示例域名/虚构凭据保留用于安全测试。

## 构建边界

- 主应用依赖：在仓库根目录运行 `npm ci`；Node.js 22+。
- 训练页面依赖：在 `lianlema-portable/app_project/app` 运行 `npm ci`。
- Web 子页面需先执行 `node deploy/pocketbuddy/build-coach-web.mjs` 与 `node node_modules/vite/bin/vite.js build --config vendor/her-motion/vite.config.ts`，再运行 `npm run build`。
- iOS 本地资源通过 `npm run ios:prepare` 重建；签名配置及设备安装不属于本次 Git 上传。
- `public/lianlema`、`public/her-motion` 是生成目录，不以旧产物替代源码。
- 训练权重、SAM 权重及既有训练提示音需要按对应模块说明单独准备；上传源码不等于这些外部输入已经发布。

## 硬件分支

`hardware/20260828` 是同批冻结源码导出的硬件专用快照。包含当前 OJBadge 固件、蓝牙/音频/显示协议、iOS 原生桥接、App 侧硬件接入源码和必要资源/工具；完整产品宿主以 `main` 为准。

本次操作不构建/烧录设备，不安装手机，不部署服务器。原工作目录的源码、分支和暂存区保持原样。
