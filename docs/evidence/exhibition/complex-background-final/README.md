# 看展搭子：繁复背景六视角 2.5D 验收证据

日期：2026-08-13

## 结论

同一件石质浮雕的 6 张普通 RGB 原图保留了展厅玻璃、石墙、底座、地面、阴影与邻近物体，
没有先由人工抠成白底。真实 `exhibit-matting-v1-fp16.mnn` 逐张推理后，6/6 通过整组质量门，
再生成相对深度与可旋转 2.5D 观察结果；不是六张预制透明 PNG 冒充推理。

## 冻结输入

- 数据源：EGO-CH Object Segmentation 真实文化场所序列。
- 对象序列：`ego-42-79-0`。
- 固定帧：`0040 / 0050 / 0110 / 0150 / 0100 / 0170`。
- 展示角度：`0 / 60 / 120 / 180 / 240 / 300` 度。
- 输入清单：`../ego-ch-complex-gallery-relief-sequence.jsonl`。
- 输入清单 SHA256：`126db681fc2d8b7e59c7b5c484d314448c8e42ba970a8b9b97fae09e83772a4a`。

## 真实运行结果

| 验收项 | 结果 |
|---|---:|
| MNN Runtime | MNN 3.6.1 FP16 |
| Matting 模型 SHA256 | `95f35d70763cd83f58e79d83ebba2c682853bee764906dce9b366d1d07ea4b10` |
| 通过视角 | 6 / 6 |
| Review / Reject | 0 / 0 |
| 最大观察角缺口 | 60° |
| 中位前景比 | 0.588342 |
| 中位包围盒填充比 | 0.803687 |
| 六张 MNN 单图耗时 | 1.294 / 1.321 / 1.446 / 3.792 / 3.830 / 2.711 秒 |
| 完整构建耗时 | 50.375 秒（Mac CPU + Depth 构建，不冒充 vivo 性能） |
| 2.5D GLB SHA256 | `23dddb779b8ed5282d0657938e325c236e1afd46cff0ceb5f68f52e1376f9094` |

质量策略为 `museum_structure_guard_fail_closed_v1`。另行测试的玻璃柜、雕像等繁复序列若没有
通过整组门禁，均未包装成成功样例；本目录只保留通过样例。

## 可复查文件

- `mobile-fullpage.png`：六张繁复背景原图、MNN 6/6 结果、质量门与 2.5D Viewer 的移动端整页截图。
- `exhibition-entry.png`：看展搭子主页的一键体验入口。
- App 离线资产：`public/assets/exhibit-2_5d/ego-ch-42-79-0-gallery-relief-museum-mnn/`。
- 机器可读结果：上述资产目录中的 `exhibit.json`、`manifest.json` 与 `quality-policy.json`。
- 脱敏后 `exhibit.json` SHA256：`c628f80e93223b2904631c0d11526cf042d0ec8d3c9b806ca1265534066e80bd`。

## 证据边界

这组证据证明“繁复真实背景下的同物六视角输入 → MNN 抠图质量门 → 相对深度 → 可旋转 2.5D”
链路已实际运行并能离线随 APK 演示。它不声称生成未拍摄的背面，也不把 Mac CPU 耗时写成
vivo 真机速度；Viewer 在大角度时只切换到最近的已观察视角。
