# Frost 入场帧图集 · v1

生成方式：内置 imagegen。单个动画图集，不是新角色候选图。

身份参考：`public/assets/skill-avatars/20260827/originals/frost.png`。
结尾使用该原图的既有 WebP，不覆盖原头像，不使用其他腊肠犬模型替代。

## Prompt

Create ONE production-ready animation sprite atlas, 2048 × 1536, exactly FOUR equal columns and THREE equal rows of square 512 × 512 cells, edge-to-edge, no gutters, no borders, no labels, no text. Each cell is one sequential pose of the SAME dog. This atlas will be sliced and played as a frame animation, so registration and identity consistency are essential.

Image 1 is the identity and style reference. Preserve this exact very simple caramel-orange dachshund: large smooth elongated orange head, two broad drooping dark-chocolate ears, tiny dark-brown oval eyes, one round dark-brown nose; smooth subtly dimensional graphic shading. No collar, no costume, no fur details, no white eye highlights, no black outline. Do not redesign it as another dog. Extend its existing cropped body into a simple long orange dachshund body with four short rounded legs and a small rounded orange tail. Both ears must remain recognizable. Use the same soft pale cyan background in EVERY cell, uniformly reaching every edge, with no scenery or props. Fixed lighting throughout.

Read cells LEFT TO RIGHT, TOP TO BOTTOM. Twelve frames:

Row 1, cells 1–4: a registered full-body running cycle. Three-quarter side view running toward screen right, head to the right, body centered at the same location and same scale in all four cells, occupying 70% of each cell's width. Four genuinely different gait phases: front reach / contact and rear push / tucked airborne / opposite front reach. The short legs change naturally; the soft floppy ears bounce slightly. Keep all paws, ears, and the tail inside each cell with generous safety margins. Do not translate the dog within this row; the app will move the sprite across the scene.

Row 2, cells 5–8: the dog has stopped in the middle and faces the viewer in a three-quarter front view, with its long body extending behind to screen left and its tail clearly visible to screen left. Same registered position and size in all four cells, feet grounded. It happily wags only the tail: left / middle / right / middle, with a subtle friendly head tilt. The tail movement must be visible and the face must match the reference. No motion lines or extra tails.

Row 3, cells 9–12: the dog approaches the camera, with its eyes looking at the viewer. Frame 9 is a front three-quarter full-body step, frame 10 a closer chest-and-head step, frame 11 the face filling most of the cell, frame 12 very close to the ORIGINAL reference pose and crop: orange head slightly tilted, both brown ears visible, body entering from the lower-left. Preserve the original character's eye spacing and nose placement; no new features. This sequence ends in the supplied original portrait.

The result is a SINGLE evenly registered sprite sheet for one continuous action: run in, pause and wag, approach camera. No contact-sheet decoration, no frames around cells, no arrows, no captions, no watermark.

## 输出与使用

- 入选原图：`source-atlas-v1.png`，1448 × 1086，4 列 × 3 行；原始生成图仍保留在 Codex generated_images。
- 原图的 12 个姿势拆分为跑步 4 帧、摇尾 4 帧、靠近 4 帧；再加入现有原头像、小嘴、张嘴、闭眼 4 帧，共 16 帧。
- App 资源：`public/assets/frost-arrival/20260828-v1/`；单个 `atlas.webp` 为 79,590 字节。资源清单和参考原图 SHA-256 在 `manifest.json`。
- 构建：`node scripts/ios/presence-arrival-assets.mjs`。仅做等分裁切、尺寸和格式打包，不用代码重画小狗；原头像及现有表情源文件保持原样。
- 实际播放：`FrostArrivalScene.tsx` 与 `frostArrival.ts`，5 秒单次播放：跑入 1.6 秒、摇尾 1.3 秒、靠近 0.9 秒、短问候 0.65 秒、回到头像 0.55 秒。没有新音频、定位、录音或 BLE 控制指令。
- 一个去背景编辑尝试返回了不带 alpha 的棋盘格图片，未用于产品，也未声称它是透明图；最终选择原始青色背景图集。
- 这不是 iOS Widget / Live Activity 的永久动画。系统组件的后续交互替代方案尚待用户确认。

## 未采用编辑的提示词

Edit this exact animation sprite sheet, keeping all twelve dog poses, their pixel positions, scales, proportions, colors and shading unchanged. Keep the 1448 x 1086 canvas and its exact 4-column by 3-row equal cell layout. Make ONLY these changes: remove every pale cyan background pixel to make a genuine transparent alpha background in every cell; remove all thin cell dividing/grid lines; remove the tiny drawn motion-line strokes near the wagging tails. Keep the dogs fully intact and retain only a very subtle neutral transparent contact shadow under each dog, not any rectangular background remnants. Do not rearrange, resize, crop, redraw or redesign any dog. Do not add any new content or labels. Output a transparent PNG sprite atlas, not a checkerboard painted into the image.
