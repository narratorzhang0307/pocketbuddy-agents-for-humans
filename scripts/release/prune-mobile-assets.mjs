import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
// Keep exactly one traceable, real exhibit photo for the Android specialist
// smoke check before pruning the multi-view collection. The web/PWA asset tree
// is unchanged; only the offline APK receives this 500 KB fixture.
const exhibitFixtureSource = path.join(dist, 'assets/exhibit-2_5d/harvard-200497-li-complete-mnn/originals/view-00-000.jpg');
const exhibitFixtureTarget = path.join(dist, 'assets/skill-fixtures/exhibit-matting-smoke.jpg');
try {
  await mkdir(path.dirname(exhibitFixtureTarget), { recursive: true });
  await copyFile(exhibitFixtureSource, exhibitFixtureTarget);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const targets = [
  ['mediapipe/wasm', '旧 Gemma/MediaPipe 浏览器模型运行时已退出活跃 Qwen/MNN 路由'],
  ['assets/exhibit-3dgs', '展品 3DGS 资产按需从 OSS 加载，不进入 Base 验证包'],
  ['assets/skills/guji', '公开古籍 Data Pack 按需从 OSS 加载；Base 验证只保留两张小型识读样例'],
  ['hardware-digital-twin.html', '旧 Google/Frost Edge 审核页不属于 Qwen 手机决赛产品，避免混入发布口径'],
  ['exhibits/preset-nike.splat', '8.3MB 预设 Splat 只作可选网页演示，不进入 Android 决赛包'],
  // Keep the four verified inline bundles in the offline APK. They add only
  // about 4 MB and prevent Capacitor's https://localhost origin from depending
  // on an external CORS policy during a live demo. Chunked web copies remain
  // remote-first and are pruned from the APK only.
  ['data-packs/pocket-earth-books/1.0.0/chunks', '离线 APK 使用同版本单文件 Bundle，不重复携带分块'],
  ['data-packs/pocket-earth-books/1.0.0/manifest.json', '离线 APK 使用内联 Bundle'],
  ['data-packs/pocket-earth-movies/1.0.0/chunks', '离线 APK 使用同版本单文件 Bundle，不重复携带分块'],
  ['data-packs/pocket-earth-movies/1.0.0/manifest.json', '离线 APK 使用内联 Bundle'],
  ['data-packs/pocket-earth-music/1.0.0/chunks', '离线 APK 使用同版本单文件 Bundle，不重复携带分块'],
  ['data-packs/pocket-earth-music/1.0.0/manifest.json', '离线 APK 使用内联 Bundle'],
];

// The Android validation shell executes Qwen through native MNN. Browser ONNX
// weights are optional and would add ~22 MB without participating in this test.
const generatedAssets = await readdir(path.join(dist, 'assets')).catch(() => []);
for (const name of generatedAssets) {
  if (!name.startsWith('ort-wasm-') || !name.endsWith('.wasm')) continue;
  targets.push([path.join('assets', name), 'Android Base 验证使用原生 MNN，不携带浏览器 ONNX WASM']);
}

let removedBytes = 0;
for (const [relative, reason] of targets) {
  const target = path.join(dist, relative);
  try {
    const info = await stat(target);
    if (info.isFile()) removedBytes += info.size;
    await rm(target, { recursive: true, force: true });
    console.log(JSON.stringify({ removed: relative, reason }, null, 0));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
console.log(JSON.stringify({ preserved: 'assets/exhibit-2_5d', reason: '离线保留完整馆藏主案例与全部列表缩略图，避免真机缺图' }));
console.log(JSON.stringify({ mobileReleasePrunedBytesAtLeast: removedBytes, policy: 'models/adapters/data/3d install on demand; never first paint' }));
