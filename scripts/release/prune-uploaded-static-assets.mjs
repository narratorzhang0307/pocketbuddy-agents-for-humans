#!/usr/bin/env node

import { readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback = '') => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const root = process.cwd();
const manifestPath = path.resolve(option('--manifest', 'docs/deploy/oss-static-release-20260811.json'));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const externalizedPrefixes = [
  'dist/assets/exhibit-2_5d/',
  'dist/assets/exhibit-3dgs/',
  'dist/assets/heritage-demo/',
  'dist/assets/skills/guji/',
  'dist/assets/ort-wasm-',
  'dist/exhibits/',
];
const artFile = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
// Keep the small, fixed offline acceptance set even when the same immutable
// objects also exist in the CDN release. The rest of the exhibition/art tree
// is rewritten to HTTPS and removed from the APK.
const offlineRequiredFiles = new Set([
  'dist/assets/exhibit-2_5d/harvard-200497-li-complete-mnn/exhibit.json',
  'dist/assets/exhibit-2_5d/harvard-200497-li-complete-mnn/raw-mnn-gate.json',
  'dist/assets/exhibit-2_5d/harvard-200497-li-complete-mnn/capture-normalization.json',
  'dist/assets/exhibit-2_5d/harvard-200497-li-complete-mnn/originals/view-00-000.jpg',
  'dist/assets/exhibit-2_5d/harvard-200497-li-complete-mnn/originals/view-05-300.jpg',
  'dist/assets/exhibit-2_5d/harvard-200497-li-complete-mnn/views/view-00-000.webp',
  'dist/assets/exhibit-2_5d/harvard-200497-li-complete-mnn/views/view-00-000-depth.png',
  'dist/assets/exhibit-2_5d/harvard-200497-li-complete-mnn/views/view-05-300.webp',
  'dist/assets/exhibit-2_5d/harvard-200497-li-complete-mnn/views/view-05-300-depth.png',
  'dist/assets/exhibit-2_5d/ego-ch-42-79-0-gallery-relief-museum-mnn/views/view-00-000.webp',
  'dist/assets/exhibit-2_5d/harvard-315439-rong-mirror-museum-matting/views/view-00-000.webp',
  'dist/assets/exhibit-2_5d/harvard-204612-jade-bi-museum-matting/views/view-00-000.webp',
  'dist/assets/exhibit-2_5d/abo-eef43318-museum-mnn/views/view-00-000.webp',
  'dist/assets/exhibit-2_5d/chsd-Ark_HM_791_HI-museum-mnn/views/view-00-001.webp',
  'dist/assets/exhibit-2_5d/chsd-Ark_HM_217_HI-museum-mnn/views/view-00-001.webp',
]);
let bytes = 0;
let files = 0;
for (const item of manifest.objects) {
  if (offlineRequiredFiles.has(item.local)) continue;
  const isUploadedArt = item.local.startsWith('dist/assets/') && artFile.test(item.local);
  if (!isUploadedArt && !externalizedPrefixes.some((prefix) => item.local.startsWith(prefix))) continue;
  const file = path.resolve(root, item.local);
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) continue;
  if (info.size !== item.bytes) throw new Error(`Refusing to prune changed asset: ${item.local}`);
  await rm(file);
  bytes += info.size;
  files += 1;
}
await rm(path.join(root, 'dist/mediapipe'), { recursive: true, force: true });
console.log(JSON.stringify({ prunedUploadedFiles: files, prunedUploadedBytes: bytes, externalizedPrefixes, uploadedArtPruned: true, retiredRuntime: 'dist/mediapipe' }));
