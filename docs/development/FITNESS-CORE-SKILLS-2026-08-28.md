# Fitness 入口位置与核心 Skills

2026-08-28，按用户新的界面要求调整，覆盖此前“Fitness 顶在标题上方”的位置要求。

## 改动

- Fitness Agent 移到页面标题和 MY SKILLS / 技能画布 / AGENT WORLD 标签栏下方，保持总路由、打开 Frost 和返回原标签的逻辑不变。独立 Skills 页面也改为标题在前，入口在后。
- MY SKILLS 核心区依次为：路线规划、识鸟、女性运动、练了吗。前两项放在最前，保留原有运动能力，标题与区块计数均显示 4 CORE。识鸟不再重复出现在“更多能力”。
- Agent World 增加识鸟核心卡片，紧跟路线规划，直接进入现有识鸟页面；复用现有技能头像和原生 BirdCatalog，没有改鸟图、识别模型或 BLE 协议。

## 验证

- 更新已有布局、核心区和世界注册测试，修改前 10 项失败，修改后相关 18 项全部通过。
- 完整 Vitest：225 文件通过，3 文件跳过；2815 项通过，16 项跳过。
- 类型检查、Bird v3 源码检查通过。
- 实际浏览器检查：430 像素宽的应用容器内，标题、三个标签、Fitness、核心区顺序正确，没有横向溢出。四张核心卡片各有核心标记，Fitness 仅出现一次。
- 点击 Agent World 的识鸟和路线卡，分别进入现有 Bird Listener 和 RUN ROUTE 页面；点击 Fitness 进入 Frost，返回后回到原 Agent World。技能画布中的 Fitness 同样在标题下方。
- 证据位于 [fitness-core-20260828](./evidence/fitness-core-20260828/verification.json)，包含截图和可见 DOM。

这些是入口与布局检查，不构成硬件收音、锁屏 BLE 或跑步导航验收。

## iOS 发布记录

2026082835 全量准备后，Xcode 编译图标时因 Macintosh HD 空间不足失败，未安装。迁移项目 `node_modules/onnxruntime-node/bin` 到外置盘，25 个条目逐项校验后保留原路径软链接，依赖加载检查通过；没有删除个人数据、变更项目源码或清理手机数据。

随后使用新的构建号 **2026082836**，从当前完整源码重新全量归档，使用全新 DerivedData。主应用和两个子应用全量重建；实际 App 的 provenance、技能画布、Frost Skills、Bird v3、确认的眨眼图标、签名与设备授权检查通过。归档内 `PlazaTab-CL203D_L.js` 也检查到四个有序核心入口与识鸟 World 定义。

- 归档：`/Volumes/PocketBuddy-iOS-Dev/Current/Releases/2026082836-cQKp2P/PocketBuddy-2026082836.xcarchive`
- Source SHA-256：`8338d5b78831c29f9763f659cf835a5f18c0d39d268238307f57751bff3ff4bf`
- Assets SHA-256：`8ad94dc1dc9ca9452aac1c1a643bdbc6d67b95fc53d1ce38ccd0f4c9c65fb180`
- 22:25:59 通过 USB（`wired`）安装完成，版本由 2026082834 更新到 2026082836；安装后与启动后回读均确认新版，启动回执成功，22:26 再查进程仍在运行（PID 12234）。
- 安装回执：上述归档同级 `usb-install-fitness-core/phone-install-receipt.json`。无连接中断、未清理手机数据、未上传 TestFlight，安装锁已释放。

页面目视与点击证据来自浏览器；手机端证据为实际版本、安装与启动回执，没有把这些回执写成手机截图或硬件实测。
