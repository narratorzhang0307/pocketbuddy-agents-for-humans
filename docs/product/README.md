# Pocket Buddy 产品文档

当前产品介绍与实现边界以 [项目首页](../../README.md)、[系统架构](../../ARCHITECTURE.md) 和 [Frost 技术说明](../../frost-agent/README.md) 为准。

当前比赛后端只从 [当前后端入口](../backend/README.md)、[当前 GCP 架构](../backend/CURRENT_GCP_ARCHITECTURE.md)、[Google 服务边界](../backend/GOOGLE_SERVICE_BOUNDARIES.md) 和 [当前 API 契约](../backend/CURRENT_API_CONTRACT.md) 开始阅读。

## 找回的完整产品基线

- [Pocket Buddy 完整说明（2026-08-24 Markdown 基线）](POCKET-BUDDY-OVERVIEW-2026-08-24.md)：完整保留此前 README 的产品闭环、双 Taskmaster、Skill Canvas、能力合同与安全原则。
- [Pocket Buddy 终极产品文档 v1.0（原版 Word，2026-08-20）](Pocket_Buddy_终极产品文档_v1.0.docx)：从此前 main 原样恢复，不改写历史正文。
- [产品闭环图](../assets/product-loop.svg) 与 [Skill Canvas 创作流程图](../assets/skill-canvas-flow.svg)：原版设计图；当前执行职责以最新架构为准。

上述文件取自 [上传前的 main：eaffa7ff](https://github.com/narratorzhang0307/pocketbuddy/tree/eaffa7ffc43c758af066e7a26004ad731fadac11)。它们是 Pocket Buddy 本身的设计资料，不是旧产品参赛材料。

## 历史后端规范

以下是 2026-08-21 至 2026-08-23 的 Pocket Buddy 规划文档，保留原路径方便查阅，已明确标记为历史资料：

- [后端开发总规范](../backend/BACKEND_SPEC.md)
- [API 定义](../backend/API_REFERENCE.md)
- [数据结构](../backend/DATA_SCHEMA.md)
- [Skill Taskmaster 协议](../backend/SKILL_TASKMASTER_SPEC.md)

这些文档中的 GCP / Firebase / Gemma 服务、云端实体和完整 Graph Runtime 描述不能作为当前部署或现有接口的证明，也不是本次恢复所授权的实现任务。当前后端入口是根目录的 `server.mjs` 与 `server/`，实际运行配置和代码优先。

## 当前能力入口

- [Photos Harness](../../deploy/pocketbuddy/PHOTOS-HARNESS.md)
- [健康事实 Taskmaster](../../frost-agent/taskmaster/README.md)
- [Frost 主 Agent、子 Agent 与权限边界](../../frost-agent/ARCHITECTURE.md)
- [OJBadge 硬件](../../hardware/ojbadge-agent-link/README-OJBADGE.md)
- [Web 构建和部署](../../deploy/pocketbuddy/README.md)

历史方案、源码实现、模拟测试、服务部署、安装回执与真机验收分别记录；不把其中一种当作另一种。
