# 练了吗：预录视频分析与公开样本试验

## 已上线的入口

[线上练了吗](https://pocketbuddy.throughtheglass.art/lianlema/) → 选择动作 →「上传视频分析」。已在摄像头页时，可以点「改用预录视频分析」；尚未授权摄像头时也能进入。

- 选择本机视频，最长 60 秒、最大 100 MB，建议 MP4、单人全身、单一动作。
- 必须先勾选画面分析同意。原视频在本地解码，每秒抽取 4 张 JPEG，长边最多 640；只通过既有模型会话发送抽帧，不上传原文件或原声音轨。
- 页面显示真实帧进度、关键点数量、推理耗时、模型计数与带时间的纠正提示。空画面显示无法判断，不虚构动作分数。
- 当前模式是「用户选择动作 → 模型估计姿态 → 既有动作规则评估」，不是自动识别任意视频动作，也没有在本轮训练新模型。
- 需保持页面在前台；离开、进入后台或点击停止会停止分析和教练声音。**本功能不提供手机黑屏分析保证。**
- 遇到服务在推理前明确返回 busy/限流，原帧最多重试 3 次；不会跳帧或重复计进度。网络超时不自动重发，防止已经处理的帧重复计数。
- 教练提示复用原声音/吧唧通道，不新增付费 TTS。实际硬件是否听到仍需真机验证。

## 功能验证

- 原相关测试 45 项通过：视频输入/时长/同意、顺序推理、停止与迟到响应、解码、无人体、失败不伪造完成、既有模型与吧唧音频通路。
- 后续复查：4 个前端测试文件 33 项通过；新 live 测试默认跳过 2 项，普通测试不会自动访问线上服务。
- busy 补丁后最终复查：5 个相关测试文件 81 项通过（包括工作区同期扩展的 Frost 用例）；本轮视频控制器新增 3 项重试/停止/不重发未知结果测试。
- 主应用与 Expo 的 TypeScript 检查通过；两个 Python 脚本编译检查通过。
- 线上浏览器实际选择生成的 0.75 秒空画面 MP4、确认同意并分析：3/3 帧完成，0 可用姿态，次数「—」，推理证据真实；没有开启摄像头。
- 已检查 390px 手机宽度布局并恢复浏览器默认视口。这里是浏览器验收，不是 iPhone 真机/蓝牙验收。

## 公开视频与真实模型试验

数据来源：[MM-Fit 作者项目](https://mmfit.github.io/)、[作者发布的 RGB 视频](https://zenodo.org/records/7672767)、[作者代码](https://github.com/KDMStromback/mm-fit)。视频发布记录许可为 CC BY 4.0。引用：Strömbäck, Huang, Radu (2020), MM-Fit, DOI:10.1145/3432701。

在推理前固定选择 w19 的第一组 squats 和第一组 pushups；没有按结果筛选好看的样本。只用 HTTP Range 读取标签，再按原始 30fps 标签时间截取小片段；没有下载完整数据集。两端各加 0.75 秒，用于保留起止姿态；输出去掉音轨、压到 640 宽。

| 样本 | 原始标注帧 | 标注次数 | 本地时长 | 体积 |
| --- | --- | --- | --- | --- |
| w19 第一组深蹲 | 1014–1510 | 10 | 18.03 秒 | 718,465 B |
| w19 第一组俯卧撑 | 5420–6088 | 10 | 23.77 秒 | 682,284 B |

已通过接触表核对动作与时间段。俯卧撑片段是**跪姿俯卧撑**；通用 pushups 标签不代表标准全身俯卧撑，也不能用次数标注验证纠正建议的正确性。

本地样本与逐帧数字报告目录：
`/Users/zhangcheng/.local/share/pocketbuddy-esp/lianlema-video-test-uJmkAn/mmfit-verified`

样本仅用于本地验收，未加入 public、未公开发布、未用于训练。帧推理走已部署的 HTTPS 模型 API，复用线上前端的 `analyzeVideo` 和 `ModelCoachProvider`；此 live 脚本以 FFmpeg 替代浏览器视频解码，不能宣称它是 iPhone 上传全过程实测。

### 结果

| 样本 | 分析完成度 | 可用姿态 | 模型计数 / 标注 | 本机端到端耗时 |
| --- | --- | --- | --- | --- |
| 深蹲 | 未完整通过；最完整一次 72/73 帧 | 72/72 已处理帧 | 已处理部分计 4 次；不是最终计数，原标注 10 次 | 该次 125.050 秒后失败 |
| 跪姿俯卧撑 | 96/96 帧 | 96/96 | 1 / 10，漏计 9 次 | 125.276 秒 |

俯卧撑最终报告为 `push_up.result-2026-08-27T14-49-29-841Z.json`，单帧平均模型推理 246.5 ms（不含网络、解码、间隔）。帧姿态阶段中只有 1 帧达到既有规则的 `bottom` 条件，9 次标注动作没有形成完整计数周期。这证明服务收到了人体画面，但计数规则在这段跪姿视频上不可靠；不能把运行测试通过当成准确率通过。

初次深蹲完成了 72/73 帧，最后一帧被 FFmpeg 按“下一帧”方式寻址而越过真实末帧，脚本已按实测帧数/fps 限制到末帧时间；这是 CLI 解码器差异，不是模型正确性修复。原报告为 `squat.result-2026-08-27T14-44-55-353Z.json`，只有 4 帧进入 `bottom` 阶段。

此外试验遇到 `inference_busy`，随后深蹲公网重跑发生两次 12 秒请求超时。临时 SSH 通路补测也在建立会话时超时，未形成完整深蹲结果；单独健康和 start/stop 连通性检查又正常，因此**尚未定位间歇超时根因，不能归咎于用户网络，也不能宣称稳定性验收通过**。一次通路尚未就绪时的本地拒绝连接也保留了报告。所有原始失败报告保留，未拼接失败片段或伪造完整结果。没有调整姿态模型、计数阈值或按准确率重选样本。

两组样本只能证明上述已观测表现，不能推出数据集整体准确率或医学/训练安全性。当前不应把这些样本包装成准确计数演示；若需提升计数，应另做机位/动作变体覆盖和独立验证集。视频功能已发布不等于上述模型计数/稳定性问题已经解决。

### 复现

先使用已经存在且有空间的父目录；下载脚本会创建新的子目录，不覆盖既有样本：

```sh
python3 scripts/health/download-lianlema-video-samples.py /absolute/existing-parent/new-mmfit-samples
LIANLEMA_VIDEO_LIVE=1 LIANLEMA_VIDEO_TEST_DIR=/absolute/existing-parent/new-mmfit-samples \
  node node_modules/vitest/vitest.mjs run scripts/health/lianlema-video.live.test.ts --reporter=verbose
```

下载脚本依赖 Python `certifi`、`imageio_ffmpeg`。live 测试默认跳过，只有显式开关和本地样本目录都设置后才会请求线上 CPU 服务；每个样本串行处理，结束关闭会话。报告保留真实计数差异，不把「接口跑通」等同于「计数准确」。

诊断脚本另有显式 `LIANLEMA_VIDEO_TUNNEL=1`，仅指向本机 `127.0.0.1:14020` → 服务器既有 `127.0.0.1:4020` 的 SSH 通道；它不等价于公网或手机验收。本轮临时通道在试验结束后关闭。

## 本轮部署与回滚

只发布练了吗网页，不切换主站 release、不重启服务、不改模型或密钥、不安装手机 App。采用完整文件清单 SHA256 校验后原子交换，保留旧目录。遵循本轮采用的 karpathy-guidelines / git-workflow：限定改动范围，不整理或提交工作区其他任务的改动。

- 首次练了吗视频前端版本：`20260827-video-y4xwou`；最终含 busy 重试补丁的版本：`20260827-video-retry-uJmkAn`，各 79 文件验证通过。
- 主站 release 保持：`/root/pocketbuddy/releases/20260827-f33287a7-real-assets-only`。
- 最终回执：`/root/pocketbuddy/coach-web/releases/20260827-video-retry-uJmkAn/receipt.json`。
- 上一版视频网页：`/root/pocketbuddy/coach-web/releases/20260827-video-retry-uJmkAn/previous`；最初无视频入口的网页仍保存在 `20260827-video-y4xwou/previous`。
- 最终 index SHA256：`3c43857a60d03e5f9d15e663c943e2c210c232a41424b053d6a23a0a4ed2756b`，公网读取一致。
- 最终入口 JS：`_expo/static/js/web/index-0d1240d66531eb6198fb8e3858358fe2.js`；SHA256 `aec3d8f63497be0814978508bdc3628d75d6f7c77393de3728d49d6a0e46441c`，公网完整下载后校验一致。
- 主站 index SHA256 未变：`7f87ad73fde8734a5e331a46e7172de830e19ce7eea1f7836f392c2fde6b653e`；模型服务持续 active。

确有回滚需求时，在服务器运行以下命令；它会拒绝覆盖已经被其他发布改变的主站或练了吗版本。本轮未执行回滚：

```sh
python3 /root/pocketbuddy/coach-web/releases/20260827-video-retry-uJmkAn/promote-coach-web.py \
  20260827-video-retry-uJmkAn \
  /root/pocketbuddy/releases/20260827-f33287a7-real-assets-only \
  3c43857a60d03e5f9d15e663c943e2c210c232a41424b053d6a23a0a4ed2756b --rollback
```

外接 SSD 在部署后离线，因此真实视频样本转存到上面的本机目录；未删除或重建挂载卷。旧本地编译产物仍留在该卷先前的 `lianlema-video-y4xwou/public-before`。

最终重试补丁的本地编译产物在本机试验目录 `web-retry`，已同步到 `public/lianlema`；补丁前的视频网页备份在同一目录的 `public-before-retry`。停止了本轮本机预览服务器，没有停止任何生产服务。

## 穿插问题：Frost 能否直接调用 Skill

本轮只读检查并重新运行了 Frost 的 40 项相关测试，没有额外改动或重新发布 Frost 主应用。

- 当前源码的手机文字与硬件 ASR 文字共用 `sendFrostAgentMessage`，明确「调用健身 Agent」可通过同一 Runtime 直接打开已装备的练了吗页面。
- 若子 Agent 状态为 `waiting_user`，自动打开会被暂停；截图中的追问与「运行」卡片符合此类状态，但截图不能证明具体是哪一个版本或哪一句转写触发了它。
- 「打开能力页面」不是摄像头授权、选视频授权或任务完成。缺信息/有副作用的操作仍须保留确认。
- 本轮练了吗网页发布不会更新手机内置的 Frost 主界面代码；不可因此宣称手机端截图问题已经修复。
