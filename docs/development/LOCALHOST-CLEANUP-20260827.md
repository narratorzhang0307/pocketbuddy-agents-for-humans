# 0827 本地开发清理记录

本页记录第一轮清理。按后续要求，旧树莓派实现已在[第二轮清理](RASPBERRY-PI-CLEANUP-20260827.md)中移出；`hardware/ojbadge-agent-link` 不在第二轮清理范围内。

本轮只移除确认未被应用引用的独立项目镜像、旧安装包、重复工程和生成缓存，不重构正在使用的 UI、前后端或运行架构。

## 本地启动与目录边界

```sh
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

打开 `http://127.0.0.1:5173/`。现有依赖、模型及本地环境配置均保留，不需要因为本轮清理重新安装依赖或训练模型。

| 保留目录 | 用途 |
| --- | --- |
| `src/`、`frost-agent/`、`vendor/legacy-city/` | 页面、Agent、当前地图与路线依赖 |
| `server.mjs`、`server/`、`scripts/`、`deploy/` | 后端、健康工具桥接、构建和部署脚本 |
| `public/`、`knowledge/`、`schemas/`、`skills/` | 动态页面资源、数据包和技能定义 |
| `node_modules/`、`.local-models/`、`lianlema-portable/` | 现有依赖、本地模型、运动功能运行环境 |
| `android/app/src/`、`android/native/`、`var/toolchains/`、`hardware/` | Android 原生实现、模型资产、现有构建工具链和硬件代码 |
| `var/health-skills/`、`var/data-packs/`、`var/knowledge/`、`.agent-forge-data/` | 后端运行工具和运行数据 |
| `dist/` | 当前生产后端使用的静态构建；本轮保留原样 |
| `training/` | 已解耦到 SSD 的训练工作区；不作为页面启动的前置步骤 |

照片示例数据包、正式文档、PPT 和视频没有按“未被代码引用”自动删除。动态资源与功能分支也没有仅凭静态搜索结果裁剪。

## 移出本机的内容

- 未被应用引用的 `deepseek-harness-master/`、Facet/PicQuery 原始研究镜像、`research/upstream/`；Facet/PicQuery 的原许可证和来源说明保留。
- 独立的旧 `模型训练/` 资料项目；它与仍保留的 `training/` SSD 工作区不同。
- `.codex-work/` 等临时工程、文档渲染缓存、`tmp/` 和 PPT 的 `.work/` 中间产物。
- `release/`、`releases/`、`deliverables/` 中明确列出的旧 APK、旧构建快照和中间备份；没有删除整个 `deliverables/`。
- `android/app/build/`、`android/build/`、`var/build/` 等生成输出。源码、原生库、JDK、Android SDK 和现有构建脚本保留。

## 回退与恢复

清理前原样代码快照：`5cb6726d4e655e0992d42353320622b0985ecdb6`（提交备注 `0827 修改`）。清理后提交备注为 `0827修改`，两次提交位于 `pocketbuddy` 的 `codex/0827-local-snapshot` 分支；没有覆盖目标仓库原有 `main`。

本轮移除内容另有完整 TAR，保存在 Extreme SSD 的 `谷歌大赛/安全清理_2026-08-27/清理内容_完整可恢复_2026-08-27.tar`。同目录保存精确清单 `cleanup-plan.json`、逐文件备份校验、保护文件校验和验收记录。TAR 同时保留未上传 GitHub 的大文件及嵌套项目，不要把它当公开资料分享。

需要取回某个旧目录时，先连接 SSD，将 TAR 解压到新建的独立目录，再只复制需要的文件。不要直接解压覆盖当前项目，不要用 Git 重置当前未提交改动。原始完整 Google 项目归档也仍在 SSD，未被本轮清理覆盖。

GitHub 是代码快照，不包含本地密钥、依赖安装目录、模型权重、训练数据或私人比赛材料；完整离线恢复使用 SSD 归档。

## 验证结果

- 本机项目从约 28.2 GiB 降至约 16.0 GiB，不含已挂载的 SSD 训练卷。
- 130,998 个受保护文件的内容/链接与权限记录完全一致，无新增或丢失；包括应用代码、运行资源、模型、依赖安装目录和工具链。
- 160 个测试文件、1,856 项测试全部通过，TypeScript 类型检查与生产构建通过。未运行依赖真实模型服务的 live 测试。
- 开发版地图、Photos、Agents 页面结构与清理前逐项一致，已有路线及 12 个已装备健康 Skills 保留。
- 后端重启后，`/healthz`、两个健康工具状态接口及静态首页均返回 200，响应指纹与清理前一致。
- 新生产构建的 874 个文件与此前验收版本中的对应文件逐字节一致；生产版三个主页面可打开。构建仍有原有的大分包体积提示。
- 新预览窗口切换地图时，高德 SDK 出现 `LngLat(NaN, NaN)` / `Pixel(NaN, NaN)` 控制台错误。用清理前构建在同一地址、窗口复测，同样复现；属于本次已记录的原有现象，未借清理修改地图逻辑。

真实模型推理、设备相册、GPS、Android 真机和硬件联调未在本轮重新执行，不以本次 localhost 验收替代这些验证。
