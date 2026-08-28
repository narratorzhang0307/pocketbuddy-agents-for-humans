# Heritage Skill · Qwen3-VL-2B + MNN Android 真机修复证据

## 结论

2026-08-12 在 vivo V2509A 真机上跑通 `heritage-skill` 的 Qwen3-VL-2B Base 与可插拔古籍视觉 LoRA。两条路径都由 MNN 3.6.1 Android JNI 本地执行，均消费真实图像输入，不再出现 `444...` / `HHH...` 解码坍缩。

## 根因与修复

1. 同一手机、同一模型、同一 `libMNN.so` 上，官方 `llm_demo` 能正确回复“西湖净慈寺。”，证明 2B 基座、INT8 权重与 MNN Android 本身可用。
2. App JNI 偏离官方初始化契约：在 `load()` 前强制 mmap/async 参数，且主进程内重建 MNN 全局 CPU dispatch 表。修复后为 `tmp_path -> load -> tuning -> async=false`，生产推理恢复 MNN 自动 ARM 调度；SME2 A/B 目标切换不再污染主推理进程。
3. Android 视觉输入与电脑成功基线对齐为约 0.17 MP，将 prompt token 从约 1072 降到 225，显著降低端侧延迟与峰值压力。
4. 模型输出在 max-token 边界可能截断 UTF-8 汉字。`NewStringUTF` 因半个字节序列触发 CheckJNI native crash。JNI 现显式解码 UTF-8 为 UTF-16，仅替换末尾不完整字符。

## 真机原始结果

### 文字基线

- 输入：`只回复：西湖净慈寺`
- 输出：`西湖净慈寺。`
- backend: `mnn`
- prompt tokens: 15
- generated tokens: 6
- elapsed: 2679 ms（含冷加载 2351 ms）

### 古籍 Base

- 图像：`xihu-mengxun-leifeng-page-source.jpg`
- 输出摘要：`西湖夢華 卷十一 朝元 古書 市 西 湖 ...`
- adapter: 空
- adapterLoaded: false
- pixels: 0.16 MP
- prompt tokens: 225
- generated tokens: 128
- elapsed: 8234 ms

### 古籍 LoRA

- 同一图像、同一 prompt
- 输出摘要：`西 潭 一 卷 奇 青 玉 之 古 舌 ...`
- adapter: `guji-vision`
- adapterLoaded: true
- pixels: 0.16 MP
- prompt tokens: 225
- generated tokens: 128
- elapsed: 9233 ms

Base 与 LoRA 都通过“可读字符 / 非复读 / 真实视觉消费”门禁。两者一致度低时，产品会进入人工校订，不会自动覆盖原文。

补充按页面实际参数 `maxTokens=256` 回归：Base 13.97 s、LoRA 14.18 s，两者均生成 256 token，均为 0.16 MP 真实视觉输入，无复读、无 native crash。

## APK

- versionName: `1.0.27`
- versionCode: `28`
- file: `dist/Pocket-Earth-Heritage-2B-MNN-1.0.27.apk`
- SHA256: `11740088cc5131cafa39e2b914dc4d9e5ce4c572d840b443b036e36352cba861`
- size: 74 MB
- 真机覆盖安装：成功，原有 2B 基座与 LoRA 资产保留。

## 回归

`npm test -- --run src/app/lib/heritage/rubbing.test.ts`：1 个文件通过，6/6 测试通过。
