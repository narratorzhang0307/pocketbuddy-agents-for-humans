# 练了吗原声 → OJBadge

## 范围

保留 Frost、Taskmaster 和现有服务器姿态识别。只把原有训练语音从手机扬声器改为圆屏吧唧播放；这不是把 iPhone 的所有系统声音重定向为蓝牙耳机。

链路：服务器姿态结果 → 练了吗选择既有语音键 → App 加载包内 PCM → 原 Agent_link BLE L2CAP 通道 → 吧唧扬声器。没有重新生成教练声音，没有调用 MiniMax 或其他付费语音 API。

硬件是同一个 Frost Agent 的随身输入、显示和播报终端，不宣称独立运行大模型或拥有完整任务编排系统。健身场景下手机需要远距离拍摄全身，吧唧把按键语音和指导反馈留在身边，这才是使用硬件的场景理由。

## 资源与播放规则

- `scripts/ios/prepare-coach-audio.py` 使用本机 afconvert，把原有 64 段 MP3 转成 16 kHz、单声道、PCM16，合计 7,015,680 字节，附带源文件和成品 SHA-256。
- 全套 PCM 位于 App 包内 `assets/frost-coach-audio/`，不整包写入吧唧 Flash。App 内存最多缓存 8 段；吧唧复用原有流式缓冲，只接收当前语音。
- 训练页与主 App 以 `pocket-lianlema-audio/v1` 交换已知音频键。主 App 校验 iframe 来源、窗口、随机会话、递增请求号和固定素材目录；不接受任意 URL、任意文本或 Agent 指令。
- iOS 训练页启用吧唧专用输出后，即使断连、失败或版本不符，也不会回退到手机扬声器。独立浏览器版本保留原有音频行为。
- 暂停、结束、离开页面、进入后台、开始硬件录音或蓝牙断开时取消。旧加载结果不能在重连后复活；相同提示不因每次姿态更新而反复打断，待播计数只保留最新项。
- 原生通道按 640 字节/20ms 发送，吧唧边收边播。此参数不是现场延迟测量；`transfer_ms` 是整段传输耗时，不能冒充首音延迟或用户实际听到的证明。

## 发布与回滚

服务器只替换练了吗 HTML 入口并新增一个哈希 JS 文件，未重启 PocketBuddy、未改模型或共享配置。独立补丁目录包含旧训练页完整备份及发布记录：

`/root/pocketbuddy/shared/static-patches/20260827-coach-badge-audio-v1/`

- 线上训练页 HTML SHA-256：`7e4187aedf5debede84a5fe1491b059af4e80b983e1268a0e57f51ccc8a6bbee`
- 线上训练 JS SHA-256：`26052ebf8ab18cff0133cd0673aba3564dc52d82a54b2a8ba1d74cd06f84fd40`
- 主站 HTML SHA-256 仍为 `7f87ad73fde8734a5e331a46e7172de830e19ce7eea1f7836f392c2fde6b653e`；服务器模型 health 仍为 ready。

如需回滚，只在当前入口仍等于本补丁哈希时恢复该备份入口，不覆盖别人的后续发布。旧哈希资源保留，旧 App 不带新音频参数时继续原行为。

## 验证边界

- 17 文件、184 项离线测试通过：原素材、SHA、单调请求、断连/录音/暂停取消、旧加载失效、重复提示、待播计数以及无手机声音回退。
- TypeScript、Expo 导出、iOS 资源准备及签名构建通过；831 个构建输入未变化，原 12 个 GLB 与上一已装 v8 包一致。
- 已装冻结包：`/Volumes/PocketBuddy-iOS-Dev/Artifacts/PocketBuddy-CoachBadgeAudio-20260827-v9.app`，Build 9。入口 SHA-256：`44e57104a49e924ea6bad670dbc322d9c75d828c2f67ef38dee8a195ce317376`。
- 20:15 覆盖安装保留数据，`DeviceInstall-CoachBadgeAudio-20260827-v9.json` 为 success。20:17 进程 2273 的实际路径对应该包；启动实收插件注册及 WebView 加载成功。安装和启动不等于蓝牙已连接或用户听到声音。
- 私有诊断：`~/.local/share/pocketbuddy-esp/coach-badge-audio-20260827/`，只记录语音键、字节数和传输耗时，不保存用户原始录音或转录。
- 以上不能替代现场验收：仍需确认实际听到吧唧教练声、手机安静，以及暂停/结束的真实行为。本轮不刷固件，付费语音测试调用为零。

## 2026-08-28 教练原声增益

- 用户已反馈能听到练了吗原声，但太小，要求至少提高 4 倍。扫描原有 64 段 PCM：最大峰值 32019/32768，直接乘 4 会使部分录音约 6.59% 的采样削波。因此保留全部原始音频及 SHA，改为播放时调整硬件 DAC 电平，不改手机扬声器或服务器素材。
- 练了吗音频端口固定请求 `gain: 4`。按仓库 ES8311 的默认 `-50..0 dB / 0..100` 曲线，增益取整为 25 个音量档位；默认 `25 → 50`，约 `+12.5 dB`、`4.217×` 信号幅度。此数值不是现场声压或主观响度测量。
- 保留已有 60 上限和用户静音。若原档位已高于 35，增强会受上限约束，不虚称仍能获得 4 倍；日志记录请求增益、原档位、目标档位和是否受限。
- 增强不写为全局首选音量：停止、退出清理以及下一条普通 PCM、Frost 系统朗读或测试音前恢复原档位。增益控制等待期间取消不会再发旧 PCM；旧停止不能降低新教练语音，新显式音量/静音选择优先。传输失败会尝试停止并恢复，失败不回退手机播放。
- 11 文件、220 项离线回归及 TypeScript 通过；Vite iOS 网页构建在内存中验证通过（64 个产物，未写入资源目录）。未调用付费语音服务、未刷固件、未改其他任务的导航或原素材。
- 尚未编译/安装本次原生更新：`/Volumes/PocketBuddy-iOS-Dev` 未挂载，Xcode 不可用，内盘剩余约 192 MiB。没有覆盖失效的共享资源链接，也没有清理用户文件。需要接回开发盘和 iPhone 后打包安装，再验证现场音量。旧手机版本可临时通过 Frost 蓝牙面板的「音量 → 高」提高音量。

### 2026-08-28 01:04 安装准备更新

- 外接 Extreme SSD 已恢复。其开发映像留有未挂载的旧连接，正常推出该映像后重新挂载成功，未格式化、修复或删除盘内内容；Xcode 已可用。
- 以独立源码快照 `/Volumes/PocketBuddy-iOS-Dev/coach-volume.DeMhNi` 构建 Build 14（0.1.0），不覆盖共享 `dist-ios` 或其他任务的产物。快照创建后工作区另有文件变化，未混入该冻结候选，也未修改那些变化。
- 原生 ARM64 编译、严格签名验证、全部包内网页资源逐文件比对通过；独立快照补齐测试依赖后，11 文件 / 220 项测试与 TypeScript 再次通过。64 段原始 PCM 完整性验证通过，增强逻辑已包含在原生包内。
- 待安装包：`/Volumes/PocketBuddy-iOS-Dev/Artifacts/PocketBuddy-CoachVolume-20260828-v14.app`。入口 SHA-256：`b1d3b948b3938c4eb868ea3072a5a3687ad446a81b8053443d2491fd5b4855f0`；构建记录：快照内 `Build14.xcresult`。
- **仍未安装**：目标 iPhone 在 CoreDevice 中为 `unavailable`，实际读取 App 信息报无法定位设备（error 1011），USB 列表只有 SSD、扩展坞和 ESP 开发板等，没有 iPhone。需要恢复手机数据连接后先读取实际已装版本，避免覆盖后续更新，再安装该候选并核对回执。现场音量与完整语音链路尚待用户实测。

### 2026-08-28 01:11 已安装到 iPhone

- USB 已重新识别 iPhone，CoreDevice 为 `available (paired)`。安装前实际查询为 Build 13；沿用 `art.throughtheglass.pocketbuddy` 覆盖安装 Build 14，未卸载 App 或清除用户数据。
- `coach-volume.DeMhNi/DeviceInstall-CoachVolume-v14.json` 的 `info.outcome=success`。安装后 `DeviceAfterInstall.json` 再次实际读取为 0.1.0 / Build 14，路径是 `E4693D87-B699-4AA4-8A03-6EACA285042A/PocketBuddy-CoachVolume-20260828-v14.app`。
- `DeviceLaunch-CoachVolume-v14.json` 为 success；已前台启动，PID 4467，进程可执行路径与本次安装目录一致。安装前再次检查冻结包严格签名及入口 SHA-256，与上述候选完全一致。
- 本次只完成安装与启动核对，没有代替用户触发硬件播报、开启摄像头或进行真人语音实测。请用户连接吧唧测试练了吗的实际响度、手机静音和暂停行为；首次试音不要贴耳。

### 2026-08-28 最高档 Build 15 已安装

- 用户试听 Build 14 后仍认为太轻，明确要求最高音量。练了吗现在固定请求 `gain: 'max'`：非静音时每段原声使用硬件 `speaker0 [2,100]`，即现有固件允许的最高档、ES8311 0 dB；不再使用默认的 25→50。没有修改原始 PCM、提高 DAC 到正增益、改服务器音源或刷写固件。
- 固件停止回执早于其播放任务执行清空，且停止/断连会把 >60 档复位到 25。最高档发送前增加 100 ms 的复位等待，再检查连接及取消状态；这不是设备实际音量读回。保留用户静音、失败/停止后恢复原档位、普通 Frost 回复不继承最高档，以及无手机扬声器回退。
- 工作区与独立安装快照均通过 11 文件 / 235 项回归和 TypeScript。新增最高档、PCM 原样传输、复位等待期间停止/录音/断连、延迟回执后静音和恢复测试。所有 64 段 PCM 完整性验证通过。
- 独立快照 `/Volumes/PocketBuddy-iOS-Dev/coach-max.M8uNv2` 以已装 Build 14 为基底，只加入本次 4 个音量相关源码/测试文件差异，未混入或覆盖其他任务后续修改。原生编译、严格签名验证、包内资源逐文件比对通过。冻结包：`/Volumes/PocketBuddy-iOS-Dev/Artifacts/PocketBuddy-CoachMax-20260828-v15.app`；入口 SHA-256：`d71ce3d04d837b9a610accb5d4428cdf0ebe493e400c63a70cbe506d5e63a4e2`。
- 01:19 安装回执 `DeviceInstall-CoachMax-v15.json` 为 success，实际安装后查询 `DeviceAfterInstall.json` 确认 0.1.0 / Build 15，目录为 `9D8B133A-41B6-4681-924B-7188F82DDF5E/PocketBuddy-CoachMax-20260828-v15.app`；`DeviceLaunch-CoachMax-v15.json` 已确认前台启动成功。安装前实际查询仍为 Build 14；本次为同 Bundle ID 覆盖安装，未卸载或清数据。
- 最高档真实响度仍需用户试听；未以安装成功或发送参数替代硬件声压验收。首次请放在桌上试听，不要贴耳。
