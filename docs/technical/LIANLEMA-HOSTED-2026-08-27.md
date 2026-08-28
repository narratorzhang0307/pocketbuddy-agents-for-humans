# 练了吗服务器连接与 iOS 更新记录 — 2026-08-27

## 当前结果

- 桌面源码已修改并发布至 `https://pocketbuddy.throughtheglass.art/lianlema/`。
- RTMO-s 与 ST-GCN 真实权重已在独立 CPU 服务中加载、预热；HTTPS 会话建立、实际空白帧推理、结束会话均通过。
- iOS 已从同一桌面工作区构建、签名成功；**尚未安装新包、尚未完成真机摄像头和动作计数验收**。
- 开始时 iPhone 15 Pro Max 在线，但 18:12 安装时 CoreDevice 报设备不可用；之后设备列表为 unavailable，USB 树也没有 iPhone。未卸载或清除手机 App，已请用户重新连接并解锁。

### 后续发布与手机协调

“评估电子吧唧与Agent协同方案”任务随后准备了 `20260827-f33287a7-real-assets-only` 完整包。已只读核对：其 `server.mjs`、`server/package.json` 与本轮现网一致，`dist/lianlema` 逐文件一致，主入口保留 HTTPS 训练地址与 camera-only 授权。本任务本轮服务器发布已结束，不再竞争切换；由该任务完成候选包的共享配置/数据挂载、独立端口预检和后续发布。此记录中的 `6f887cbe` 是本轮历史发布，不代表后续始终为 current。

后续发布回执：该任务报告已于 18:20:58 补齐共享链接和依赖、完成独立端口预检并切换到 `20260827-f33287a7-real-assets-only`，旧非 active 发布中的已退休人物占位编译文件已先归档再清理。本任务随后独立读取公网 `release.json`，确认完整指纹为 `f33287a7114767a94f20494502ffac6ecc6ac8374a4b65f2e2bb4940a774bf50`；公网训练模型健康仍为 `ready: true`、`frameStorage: none`。本任务未再次切换、清理服务器或修改模型服务。

根据协调消息，手机由“整理代码目录”独占语音端到端联调。本任务暂停安装；下文保存的 18:11 App.app 仅作为本轮历史构建证据，**不得直接装回手机覆盖后续更新**。后续 iOS 更新须先与手机占用任务协调，再从最新合并源码构建，保留本轮训练入口与权限改动。

## 根因与修复

原来的生产入口默认访问 `http://localhost:8082/`。手机的 localhost 并不是 Mac，开发者模式或 USB 配对也不会部署电脑上的模型服务。

生产/iOS 入口改为自己的 HTTPS 训练页，开发环境仍可用原有本机便携包。Expo 导出设置 `/lianlema` 资源前缀，不复制桌面外接摄像头偏好。训练页明确同意后才开启摄像头，压缩帧长边最多 640，间隔 650 ms；暂停/离开停止采集。计数来自实际模型/规则响应，不使用演示计数或估算心率。

服务复用原项目 RTMO、ST-GCN、动作评估引擎，但不公开旧 Flask debug/file-upload 服务。单独实现会话 token、会话隔离、过期/容量/频率限制、图片大小校验、精确 Origin 和 no-store。画面只在内存分析，模型不放入静态目录。手动选择动作时用 RTMO 关键点和原有确定性动作规则；ST-GCN 自动识别接口保留，当前手机 UI 默认手动模式，不声称每一帧都由 ST-GCN 分类。

## 发布位置

- 网页发布：`/root/pocketbuddy/releases/20260827-6f887cbe-coach`。
- 当前指针：`/root/pocketbuddy/current`。
- 发布源码指纹：`6f887cbe0eea819ade72b80844b2fc99301bcea742923f7ea19b4f6e9c6a9481`。是 stage 脚本覆盖文件的工作区指纹，不是 Git commit 或全盘哈希。
- 模型代码：`/root/pocketbuddy/coach/releases/20260827-coach-v1`，由独立 `pocketbuddy-coach` systemd 服务运行。
- 私有权重：`/root/pocketbuddy/shared/coach-models`（约 39 MiB）；Python 环境约 1.3 GiB，不在 dist。
- 本次网页 dist 约 358 MiB，其中训练页约 4.6 MiB；包含工作区同时进行的其他既有更新，不把全部体积变化归于训练功能。
- HTTPS Nginx 配置仅修改 `/etc/nginx/conf.d/pocketbuddy.conf`；其之前版本备份于 `/root/pocketbuddy/shared/nginx-before-coach-20260827.conf`。
- 共享 `.env` 与 `.agent-forge-data` 保留原内容与 600/700 权限。

上线过程中一次新发布目录准备命令因旧版本不存在 package-lock 而中止，随后过早切换造成 Pocket Buddy 启动失败。已立即回滚，补齐共享配置/数据链接，在 3021 独立端口验收成功后才重新切换。失败启动产生的空 pet-assets 目录保存在 `shared/coach-deploy-preflight-data-20260827`，未合并、覆盖或删除真实共享数据。未触及原 pocketearth 目录；它的 PID 266180、重启计数 70 与前检查一致，pocket-earth 的 PID 91055、重启计数 1 也未变化。

## 已验证

- Python 20 项测试通过：会话授权/隔离/过期/容量/频率/输入限制，以及原动作引擎与识别器测试。
- 前端 41 项测试通过：连接边界、token 协议、结束取消、错误不造结果、Skill 网络权限与发布资产策略。
- Expo TypeScript 检查、Expo web export、主应用 Vite 构建、iOS 本地资源检查通过。
- 两个模型服务端 SHA256 与桌面文件一致：
  - RTMO: `d0703d40d19f3921da51ae725402d5fdae4d2478c7442072d3101bd396f370d8`
  - ST-GCN: `632bd41370c6c4cf56be20fe60b627bbb1d2f956860f9cdb8b24f038f280ab71`
- 服务器和公网空白帧实际推理：`no_person`、0 次、0 关键点；公网样本模型推理耗时 243.5 ms（不包含手机采集/网络延迟）。不是实时运动准确率证明。
- HTTPS 模型健康 ready；服务只监听 127.0.0.1:4020；无服务重启。
- 原生 Origin 预检 200，允许精确 `capacitor://localhost` 与 Authorization/Content-Type；非允许 Origin 403，无 token 帧请求 401，模型静态文件与 `.env` 404。
- 训练页 iframe 允许来源仅同站和 capacitor://localhost，主站 X-Frame-Options 仍为 DENY。
- 浏览器实际显示“模型已就绪 · RTMO / ST-GCN”；进入训练先显示同意提示，授权前 DOM 中 video 元素为 0。未擅自开启用户摄像头。
- 主应用 Agents → 练了吗 的真实点击链路也已通过：iframe 收到就绪握手，连接遮罩消失，显示服务器标识和动作选择页（非只验收独立 URL）。

## iOS 待安装包

完整 Xcode 26.6，原 Team 与 Bundle ID 不变。`xcodebuild` 退出码 0，`codesign --verify --strict` 通过。

- 已保存：`/Volumes/PocketBuddy-iOS-Dev/Artifacts/20260827-1811-lianlema/App.app`。
- 构建来源仍是 `ios/App/App.xcodeproj`，不手改 App 内生成 JS。
- iOS 入口资源与签名包中入口 HTML 的 SHA256 均为 `7da0d4af30ab61d6042ea2309d5490e6bcfbe172a8b242be2e559ed9ab80c056`。
- 主站及 iOS 的 MusicAgentsTab 产物均包含新的 HTTPS 地址，均不包含旧 localhost:8082 启动地址。

以下为本轮历史安装命令，当前不执行；后续须按上方协调约定换成最新合并包：

```sh
DEVELOPER_DIR=/Volumes/PocketBuddy-iOS-Dev/Xcode.app/Contents/Developer xcrun devicectl device install app \
  --device 979F1007-8F1E-53F9-85CD-836378C2D071 \
  /Volumes/PocketBuddy-iOS-Dev/Artifacts/20260827-1811-lianlema/App.app
```

然后打开 App → Agents → 练了吗，确认模型就绪，用户亲自同意开启相机。需要现场确认全身预览、实际动作计数、暂停停止采集、退出关闭相机；不能把编译或空白帧测试记作真机通过。

配置参考：[Expo SDK 54 baseUrl](https://docs.expo.dev/versions/v54.0.0/config/app/)、[Expo web export](https://docs.expo.dev/deploy/web/)、[WebKit 摄像头能力](https://webkit.org/blog/11353/mediarecorder-api/)。这些文档不替代本项目的设备实测。
