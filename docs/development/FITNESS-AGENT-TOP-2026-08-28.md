# Fitness Agent 总路由入口置顶

日期：2026-08-28。

## 变更

- 将 Fitness Agent 从 My Skills 的「更多能力」列表移到 Agents 页公共顶栏，位于 MY SKILLS / 技能画布 / AGENT WORLD 的标题及子页签之前。
- 三个子页共享同一个总路由入口，不在 Skills 列表重复显示。独立 Skills 页面也保持总路由先于标题。
- 复用原有 Frost 会话与 Skill 路由；从哪个子页进入，退出 Frost 后回到该子页。原来的 My Agent、外部 Skill 返回逻辑保留。
- 保留跑步路线、女性运动、练了吗三个核心能力的顺序和下方其他能力。

## 验证

- 新增 5 项层级回归：调整前全部失败，调整后通过。
- TypeScript、识鸟 v3 源码检查通过；全量 Vitest 最终 2,754 项通过、16 项跳过，0 项失败。
- 真实本机网页分别从 My Skills、技能画布、Agent World 点击总路由，均进入原有 Frost 会话，返回到原子页。
- 430 × 932 与 375 × 812 的浏览器视口已检查。375 宽视口中总路由按钮 clientWidth 与 scrollWidth 均为 347，未横向溢出。
- 截图和 DOM 记录：`evidence/fitness-router-top-20260828/`。这是浏览器页面证据，不是 iPhone 截屏或实体 BLE 验收。
- 全量测试原始记录：`/Volumes/PocketBuddy-iOS-Dev/fitness-agent-top-20260828-tests.json`。

此次只调整入口层级和返回位置，不代表此前待完成的锁屏新发起路线已实现。

## 真机更新

- 从当前完整源码使用统一归档脚本构建 `2026082830`，全量重建两个子应用、主应用和原生 App，使用全新 DerivedData；全部来源、画布、Frost Skills、识鸟、实际图标及签名检查通过。
- 安装前再次核验实际 App，确认只有一份总路由入口分包，并确认签名覆盖已连接的 iPhone。
- 安装命令报告连接中断；没有盲目重装。随后从设备读取已安装版本为 `2026082830`，20:14 成功启动，再次回读仍为该版本。覆盖原 `2026082829`，没有卸载或清除用户数据。
- 归档和实际设备回执保存在 `/Volumes/PocketBuddy-iOS-Dev/Current/Releases/2026082830-hRKjSy/`，未上传 TestFlight。
- 源码 SHA-256：`1b3f2faa6da84a2332a9d610066dab36d846e42067aec5314f1a12f7d50bfa0d`。
- Web 资源 SHA-256：`aff965e721ffb77d334539d9d9796065ef4b182191098ae5dbf24baac9369b46`。
