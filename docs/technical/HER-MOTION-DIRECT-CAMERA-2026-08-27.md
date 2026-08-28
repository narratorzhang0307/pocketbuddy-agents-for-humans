# 女性运动与练了吗一致的 Frost 直达相机入口

## 本次状态

2026-08-27：源码修复、202 项相关测试、主应用/Her Motion 类型检查和独立 iOS 模式 Web 构建通过。**尚未安装到 iPhone**，没有发布远端主站，也没有改刷硬件。

`/Volumes/Extreme SSD`、`/Volumes/PocketBuddy-iOS-Dev` 未挂载；`xcode-select -p` 为 CommandLineTools，`xcrun --find devicectl` 失败。`dist-ios` 与 `ios/App/App/public` 的原有外接盘链接保留不动，未创建替代挂载目录。

## 原因与最小修复

Her Motion 已能收到 Frost 交接并进入训练页面，但原来只在自己的 `enabled && granted` 本地标记都成立时调用 `getUserMedia`。练了吗曾获得相机权限，并不代表 Her Motion 的本地 `granted` 标记已经存在。

- `HerMotionSkillPage` 把当前 handoff 传给原有 URL 构造函数。
- 仅 `her-motion` / `pocket.her-motion` 的新鲜 Frost 交接可以携带直启信号：需 agent session、run ID、用户原始命令，时间不超过两分钟。
- 子页面校验同源父页面、会话、skill、时间和 run ID，运行前消费一次性标记。首次也可发起系统相机请求，但不会伪造权限已授予。
- 保留自动开启复选框、真实系统授权、手动启动及后台/退出时终止相机的行为。同一调用重载不会再次自动启动，迟到的授权会停止返回的视频轨道。
- 自动启动延迟一个事件轮次，避免开发环境 StrictMode 的 effect 重放取消唯一的一次启动。

没有编辑练了吗、ASR、BLE 协议、Frost 主路由或系统权限配置。原有其他工作区更新保留。开始/结束校验时，练了吗组件及 connection helper 的 SHA-256 均未变。

## 验证

- 新增 `src/app/lib/health/herMotionAutoStart.test.ts`：修复前 26 项失败；修复后通过，覆盖首次调用、来源/会话/skill 不符、缺失/过期交接、一次性消费、拒绝授权、复选框、存储不可用以及普通访问。
- 13 个相关测试文件，共 **202 项通过**：Her Motion 的 auto-start/camera/launch/bridge/session/package/audio，练了吗 connection/training，Frost companion runtime/conversation，以及 badge/protocol。
- `npm run typecheck`、`npm run typecheck --prefix vendor/her-motion` 通过。
- `npm run build --prefix vendor/her-motion` 通过。
- 主应用 `POCKET_BUDDY_BUILD_TARGET=ios ... vite build --config vite.pocketbuddy.config.ts --mode ios --outDir <独立目录>/web` 通过；原有大 chunk 提示仍存在。
- 主包与子包均包含新的相机交接逻辑；内置 pose model SHA-256 与 manifest 一致。

实际构建产物在隔离 localhost 页中验证，iframe 明确禁用真实 camera/microphone 权限，仅由测试脚本提供 canvas 合成画面；不是实体 iPhone/硬件实测，也没有上传人体画面或验证硬件出声。

| 场景 | 观察结果 |
| --- | --- |
| 首次 Frost 调用，无 Her Motion 已授权标记 | 无需点击子页面；一次相机请求，收到 workout-started，本机模型加载，显示 LIVE VISION |
| 手动暂停 | 轨道停止，回到可手动开启状态，无自动重启 |
| 同一调用重载 | 只收到 opened，没有第二次相机请求 |
| 拒绝系统权限（模拟） | 一次请求，显示权限说明，没有重试循环 |
| 自动开启复选框关闭 | 无相机请求，保留手动按钮 |
| 授权未完成时进入后台，随后授权返回 | 返回轨道立即停止；回前台没有自动复活 |
| 普通入口首次访问，无直接交接 | 无相机请求，保留手动按钮 |

## 产物与后续安装

独立目录：`/Users/zhangcheng/.local/share/pocketbuddy-esp/her-motion-autocamera-XmrK20/`

- `source-before/`、`her-motion-before/` 保存本次编辑前源码与原子应用构建备份。
- `web/` 曾保存通过验收的 iOS 模式 Web 资源，**不是已签名或已安装的 .app**。2026-08-27 源码备份时因磁盘不足清理了这个可重建目录；下列主 index 哈希是当次验收记录，重新安装前需要重新构建。
- `smoke-server.mjs`、`smoke.html`、`fake-camera.js` 为仅本地模拟相机验收脚本，不在产品包内；测试服务已在验收后关闭。
- 主 index SHA-256：`c471827f514f29ae0da96a92f2ec489702ee870f5c30028c35eff1a02d0e99c7`。
- Her Motion index SHA-256：`e569cae6295130a8aed68081a71df2b13001347e3cb7f493a6f7b47dd68f9021`。
- Her Motion JS：`assets/index-anGG0uGu.js`，SHA-256 `495e89d66b53010182939365d0c060c722081aac364790aa9f0b0aff5f77adaf`。

外接盘恢复后，先重新核对当前完整工作区（其他任务仍可能有更新），再走现有 iOS 构建/签名/安装流程。真机验收需用户对硬件说「调用女性运动 Agent」，确认无需点击页面即可发起相机流程；首次系统授权由用户确认。不能把电脑模拟页通过说成手机已更新。
