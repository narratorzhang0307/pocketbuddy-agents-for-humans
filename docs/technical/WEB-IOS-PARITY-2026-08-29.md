# Pocket Buddy Web 与当前 iOS 源码同源发布记录

2026-08-29，按用户要求，从正式工作区当前完整源码重新构建独立 Web 发布包，并替换
<https://pocketbuddy.throughtheglass.art/> 的历史部署。没有从旧服务器发布目录、历史 App、
`Artifacts` 或旧 `dist-ios` 复制源码或局部覆盖新包。

## 当前线上版本

- 服务器发布目录：`/root/pocketbuddy/releases/web-20260829-b727d2623218`
- `current`：仅指向上述目录。
- 源码指纹：`b727d26232180511badaf53c8bfedf09b22e213271d94edef003ed77f0660324`
- 网页入口：`/assets/index-DFP33HAO.js`
- 发布清单：1,268 个构建文件逐文件 SHA-256 校验通过。
- 完整源码构建标记：`fullSourceBuild: true`
- 同步重建的子应用：`lianlema`、`her-motion`
- 构建守卫：技能画布、Frost Skills、识鸟、语音答案和 Frost 眨眼图标均通过。
- 本地归档：`/Volumes/PocketBuddy-iOS-Dev/Current/pocketbuddy-web-HL9oHm/pocketbuddy-web-20260829.tar.gz`
- 归档 SHA-256：`73a1d2be53b2eafafdb58c8c18639a7c6ba9188bd9e6851dc602cc882b63b0f9`

## 线上验收

- HTTPS `/healthz` 正常；HTTP 入口 301 跳转 HTTPS。
- `/release.json` 与本地发布文件 SHA-256 完全一致。
- 线上 `sw.js` 与本地发布文件 SHA-256 完全一致，版本为
  `pb-v4-approved-skill-canvas`。
- iOS `capacitor://localhost` 对 `/api/frost-llm` 的预检返回 204。
- `/.env` 返回 404；服务器继续使用独立的 `shared/.env`，没有将密钥放入静态目录。
- 旧入口 `index-DvDJGRqZ.js` 和退役 Skill Canvas 分包在线返回 404。
- 移动端浏览器实际重载后无控制台错误；首页为当前行动地图界面。
- Photos 页面包含可移除的餐食示例、1,326 示例账本和香草鸡肉考伯碗拆解。
- Agents 页面显示 4 个核心能力、健康咨询 Agent 和自动 Qwen 接入说明。
- 技能画布为确认的线稿编辑器：目标、能力模块、技能组合、形象四段结构；没有回退旧波浪卡片页。

## 清理与恢复

服务器旧发布目录删除前，7 个版本均已保存至：

`/Volumes/PocketBuddy-iOS-Dev/Current/server-backups/`

所有旧版本的普通文件均与服务器原目录逐文件 SHA-256 对照通过；共享 `.env` 与
`.agent-forge-data` 只保留符号链接，不复制私密值或用户数据。旧候选日志和清单另存于
`server-backups/release-metadata/`。验证完成后，服务器 7 个旧发布目录和 9 个旧候选文件
已删除；服务器 `releases/` 只保留当前新版。Nginx、共享配置、上传数据及其他服务器项目
未修改。
