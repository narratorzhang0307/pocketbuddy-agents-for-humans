# Pocket Buddy 独立站点发布验收

2026-08-27，按用户指定，将桌面 `谷歌大赛` 当前源码构建并发布到
<https://pocketbuddy.throughtheglass.art>，目标服务器 `43.98.248.74`。
修改源文件后再构建，没有直接修改 iOS 生成资源或手机安装包。

## 发布位置

- 当前发布：`/root/pocketbuddy/releases/20260827-75dbcb74`（精简后的干净构建）。
- 入口：`/root/pocketbuddy/current`，指向上述发布目录。
- PM2：`pocketbuddy`，ID 25，监听 `127.0.0.1:3020`，不直接暴露后端端口。
- Nginx：仅新增 `/etc/nginx/conf.d/pocketbuddy.conf`，HTTP 跳转 HTTPS。
- 配置：`/root/pocketbuddy/shared/.env`，权限 `600`；上传数据独立保留在 `shared/.agent-forge-data`。
- 证书：独立 hostname 证书，到期 2026-11-25；复用现有 ACME 账户，自动续期后检查并重载 Nginx。
- 已保存 PM2 启动列表，原有 `pm2-root` 开机服务已启用。
- 原有 19 个其他站点配置的 SHA256 均未改变，原有 25 个 PM2 应用仍在线。未更新这些项目、其数据或私有 Qwen3-4B 服务。

部署前该域名的 DNS 记录已指向目标服务器，但没有该域名对应的
Nginx 站点和 Pocket Buddy PM2 进程；DNS 记录本身不是应用已部署的证明。
没有执行指向旧 `/root/pocketearth` 的 `deploy/online/deploy.sh`。

## 构建与校验

构建工具和后续发布注意事项见 [`deploy/pocketbuddy/README.md`](../../deploy/pocketbuddy/README.md)。

- 构建时间：`2026-08-27T09:45:13.606Z`。
- `release.json` 的源码指纹：`75dbcb74a7557152441a056490be8bcf47ba1d947147bc9c845b3a01c74dd348`，范围由 `stage.mjs` 定义；不是 Git commit。
- 网页入口：`index-Bq-5fg1C.js`。
- 根项目与练了吗 Expo 项目 TypeScript 检查通过。
- 最新非联网测试：176 个测试文件、1986 项通过，包含新增的 14 项发布资源筛选检查；没有宣称外部 live 测试已通过。
- 生产构建通过；仍有大资源 chunk 警告，首次加载速度未做量化验收。
- 线上 HTML、入口 JS、CSS、地图 JS 与练了吗 JS 的 SHA256 均与本地发布包完全一致。上传后服务器全部 851 个 dist 文件的整树指纹与本地相同：`1f3f77a7981bdc7a2f4c5841e9c71899b87ce7bac597d50eca98dd72ac62bbbc`。
- 发布前扫描 110 个公开文本文件，未发现所配置的两类服务端密钥值；没有把工作区 `.env`、私人媒体或模型目录公开上传。

| 线上检查 | 结果 |
| --- | --- |
| HTTPS 首页 | 200；正常证书校验，未跳过 TLS 校验 |
| HTTP 首页 | 301 跳转 HTTPS |
| `/healthz` | `ok: true`，云脑配置已加载；`edge: stub`、`edgeModelInstalled: false` |
| `/release.json` | 与本地构建指纹一致 |
| `/api/frost-llm` | 实际提交非私人测试提示，返回 `OK`，模型 `qwen3.7-max` |
| iOS API OPTIONS | 204，允许的 origin 精确为 `capacitor://localhost` |
| `/.env` | 404 |
| Agents 页面 | 12 个内置 Skill 入口可见，实际点击练了吗运行页通过 |
| 练了吗错误边界 | 立即解释手机 localhost 与电脑不同，不创建无效 iframe，不再提示手机双击 Mac 脚本 |

## 用户指定的旧 Pocket Buddy 清理

- 用户明确要求只处理服务器的旧 Pocket Buddy，不动原来的项目。
- 未删除或修改 `/root/pocketearth`；其旧 dist 约 1.3GB，仍服务 `pocketearth.throughtheglass.art`。清理后其 PM2 PID 仍为 `266180`、重启计数仍为 `70`，Nginx 配置 SHA256 仍为 `c2981b203668b37f21e9f58f9bbdbf7194b707c674193e96c61792ff72c6f945`。
- 本次精简仅在独立发布流程中排除 `public/mediapipe/` 的旧浏览器 GenAI 运行时和未被当前页面引用的独立 `public/signbridge/` 演示。桌面原文件未删除；地图物种、植物、展品、OCR 和数据包保留。
- 服务器 dist 磁盘占用约 `421M → 290M`，整个 Pocket Buddy 约 `438M → 307M`；dist 实际文件内容 `437,457,143 → 300,307,452` 字节，减少约 131MiB。不是首页下载量。
- 新版 HTTPS、健康检查、iOS 预检、资源哈希与地图页面验证通过后，原子切换 `current`，仅重启 `pocketbuddy`。
- **已删除的唯一服务器旧发布目录**：`/root/pocketbuddy/releases/20260827-4552dfbe`。服务器 releases 中只保留 `20260827-75dbcb74`。
- 删除前核对了本机备份与服务器旧 dist 全部 875 个文件的整树指纹，均为 `258b4e4b24cd6beca16ef7a41cf260744af6c12b1460660c661e2344ed87ba08`。
- 可恢复备份：`/Volumes/PocketBuddy-iOS-Dev/pocketbuddy-web-aiTqtx/release`，附 `RECOVERY.md` 和原服务器依赖锁文件。共享环境配置、上传数据、Nginx 备份与 PM2 备份均保留。
- 已退役的两个模型 URL 返回 404；主站、地图和 Agents 正常加载。源码中的直接引用检查会阻止未来在引用这些目录的情况下继续精简发布。

## 尚未完成的功能边界

本次发布的是主站及其 Node API，不是练了吗独立模型服务。
当前 `VITE_LIANLEMA_URL` 仍回退到 `http://localhost:8082/`，它仅适用于电脑本机。
手机开发者模式、USB 配对、主站 HTTPS 和 Qwen 文本调用均不能替代姿态模型。

要让手机运行训练流程，还需部署/接通真实 RTMPose、ST-GCN 及其前端，配置可访问的
HTTPS 地址，并确认摄像头权限、推理结果和数据处理边界。尚未上传用户摄像头画面，
没有用演示计时器或文字模型冒充姿态推理。

已修改桌面 `LianlemaSkillPage` 的连接判断与就绪握手，并在独立 Expo 源码加入就绪消息。
该 Expo 源码不是本次主站发布包的一部分，必须在其自身部署时构建。

iOS 使用本地打包网页，不会因服务器更新自动替换手机界面。本次没有执行
`ios:prepare`、签名构建或真机安装；后续应从同一桌面源码构建，不能只改生成目录。
语音、其他自托管 Skill、蓝牙与训练会话尚未做此次线上端到端验收。
