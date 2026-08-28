# 医院 Agent 头像 · 小白熊医生

- 标记：A1，单张创作（按用户“一张”请求，不展开六候选）。
- 角色与关联：友善的小白熊医生；用圆润造型和简化听诊器表达医院 Agent 的关怀与倾听，不代表真实医师资质。
- 构图：左下角；延续现有 Skills 的大色块、小表情风格。
- 生成方式：内置 image_gen；接口未返回底层模型版本，不声称已验证为某个具体模型。
- 约束模式：main-prompt constraints；完整约束见下方提示词。
- 目标配色：角色奶油白 #FFF1D5、深青绿 #16564F；背景杏桃 #EDB49C。色值为创作指令，不宣称结果逐像素等于该色值。
- 原生尺寸：1254 × 1254。保留一次生成的完整原图，不重绘、不调色、不缩放。
- 项目原图：[hospital-agent-bear-v1.png](../../../public/assets/agent-avatars/20260828/hospital-agent-bear-v1.png)。
- 原始生成文件：/Users/zhangcheng/.codex/generated_images/01a04137-94da-7f12-9f3b-2f9856e8832d/exec-93d8fb2e-dd97-4283-91e4-6797fe294cc3.png。
- 范围：本轮仅创建并保存新头像及说明；未修改医院页面、能力映射、原生代码、硬件协议；未构建、安装、推送或部署。手机图标尚未替换。

## 2026-08-28 手机头像接入

用户随后明确要求替换手机 App 中的医院头像。桌面源码已更新：MY SKILLS 的医院入口与医院页标题共用 `HospitalAgentAvatar.tsx`，图片为上方本地 PNG，不依赖 OSS 或网络，不新增硬件头像编号。

原 05 冻结包保持不动。新候选位于 `/Volumes/PocketBuddy-iOS-Dev/Artifacts/hospital-avatar-ios-20260828.qLVpII/source`，由 05 完整源码仅叠加头像改动；已重新构建训练、Her Motion 和 iOS Web 资源。桌面与独立候选均通过 3 文件 24 项测试、类型检查。430×932 浏览器预览确认医院入口 52×52、页标题 36×36 处均成功加载原图。这里只是浏览器显示证据，不是手机实拍。

[接入校验与五文件 SHA256](integration-verification.json)。手机安装仍由已接管设备的识鸟任务统一执行；其最后报告的阻断为 Apple 开发者联网验证，官方 7 天离线开发 profile 等待用户授权。本任务没有签名、安装、卸载或清数据，没有修改原 05 包、共享构建输出或 Git index；也没有推送/部署。不能把资源构建成功表述为手机替换完成。

## 完整生成提示词

```text
Create one complete full-bleed 1:1 square image, approximately 1536 by 1536, of an extremely simple and lovable little polar-bear doctor character, visually belonging to a series of cute rounded minimalist animal characters.
Background: fill the entire square with solid softly muted apricot peach #EDB49C. Keep this background uniform in every open area and unoccupied corner.
Subject: one baby-like cream-white polar bear with a huge softly rounded head, both little circular ears visible, a compact deep-teal scrub-clothed upper body, and a calm, gently reassuring face. Two small deep-teal oval eyes and one tiny simple mouth; no snout detailing, no eyebrows, no cheek decorations, no fur marks. Its medical role is communicated by just one boldly simplified stethoscope against the teal chest: broad rounded cream tubing and a single rounded chestpiece, integrated into the character, readable rather than thin or fiddly. No other medical accessories.
Complexity: reduce the bear to a single continuous heavy soft silhouette made of about 4–7 large rounded shapes, with the ears as the only species-defining feature. Head and ears are one cream region; the scrub body is one broad teal region. Keep every shape simple enough to read at 32 by 32. Omit hands and feet from the crop.
Color behavior: exactly three semantic colors across the entire image: cream white #FFF1D5 and deep teal #16564F for the character, plus solid apricot peach #EDB49C for the background. Reuse teal for the facial marks and cream for the stethoscope. No additional black, red, or accent colors.
Composition: upright, emerging prominently from the LOWER-LEFT corner, filling about 85–95% of the square. Allow the lower torso to crop at the bottom; keep the face and BOTH rounded ears visible. The mass of the character is anchored low and left with a little clear background in the upper-right. Do not center or rotate the character.
Style: extremely clean graphic shapes, big gentle forms, compact proportions, a comforting friendly personality, clear color masses. Match the simplicity of a friendly tiny bird or dachshund rendered in a few broad shapes, not a detailed illustration. Add an extremely, extremely subtle, almost imperceptible sense of depth through a barely-there neo-skeuomorphic treatment.
Finish: only this character on the full-canvas background with normal square outer corners.
Constraints: No text, watermark, borders, frames, cards, rounded-square masks, extra subjects, scenery, medical cross, hospital seal, badges, fine outlines, fragile lines, sharp tips, decorative details, photorealistic materials, glossy hotspots, dramatic bevel, strong three-dimensional rendering or external cast shadows. Keep the background solid and uniform, without gradient, texture, vignette or lighting variation.
```
