# Frost 单眼表情 · 0.2.19

新增一只眼睛睁开、另一只保持原弯曲眯眼的表情。它与双眼眯眼交替出现，两种都停留约 **1.6 秒**，中间继续开合嘴。录音、其他技能头像和专用显示模式仍可立即暂停动画。

## 图片与预览

使用内置 `image_gen` 编辑原双眼眯眼帧，并以原图作为睁眼形状参考；工具未返回具体模型版本。没有重新生成或覆盖原小狗与原有三张表情。

- 单眼原件：[wink.png](../../../public/assets/frost-talk/20260828/originals/wink.png)
- 完整提示词：[wink-prompt.json](../../../public/assets/frost-talk/20260828/wink-prompt.json)
- 板端 JPEG：[wink.jpg](../../../public/assets/frost-talk/20260828/hardware/wink.jpg)，240×240，15,852 字节。
- 循环 GIF：[frost-speaking.gif](../../../public/assets/frost-talk/20260828/frost-speaking.gif)
- 页面：[index.html](../../../public/assets/frost-talk/20260828/index.html)

GIF/WebP 有 49 个编码帧（相邻相同帧被合并），总长 9.12 秒；单双眼帧分别保持 1,600 ms。它们是动效示意，不是实机录像。硬件有自己的持续循环时钟。

## 烧录与验证

已安装 `0.2.19-ojbadge-frost-wink`，镜像 2,377,984 字节，应用分区剩余 767,744 字节。

SHA-256：`9457b1a931221723c2023434fcbbcb3172ec00b485c3db3a607ad308cf64a394`

先完整备份 0.2.18 当前应用槽；仅写 `0x10000`。10 块物理读回与候选逐字节一致，前 64 KiB 的 bootloader、分区表、NVS、OTA 数据未变。C++ 时序/暂停/单双眼交替测试与 93 项相关头像测试通过。

原图、原有三张表情、30 项头像标签和 OSS catalog 保持不变。新增图仍与小狗一起内置，不依赖 OSS，也没有新增整屏缓冲。其余技能/Agent 头像继续走原 OSS 链。

板端实际表情计时和五种帧切换证据见 `verification.json`、`live-loop.log`。没有新实拍照片，未宣称已进行肉眼视觉验收。

私有完整备份及工具：`/Users/zhangcheng/.local/share/pocketbuddy-esp/frost-wink-20260828/`。独立源码和构建：`/Volumes/PocketBuddy-iOS-Dev/Artifacts/frost-wink-20260828/`。本轮未操作手机，也未把原始 Flash 备份复制到项目。
