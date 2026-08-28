#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback = '') => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const root = process.cwd();
const dist = path.resolve(option('--root', 'dist'));
const release = option('--release', process.env.POCKET_STATIC_RELEASE || '20260812-final-v5');
const prefix = `pocket-earth/releases/${release}`;
const contentType = (file) => ({
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.glb': 'model/gltf-binary',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.splat': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.zip': 'application/zip',
}[path.extname(file).toLowerCase()] || 'application/octet-stream');

const sha256 = (file) => new Promise((resolve, reject) => {
  const digest = createHash('sha256');
  const stream = createReadStream(file);
  stream.on('data', (chunk) => digest.update(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(digest.digest('hex')));
});

async function filesBelow(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesBelow(absolute));
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

// CDN release 收齐除可变应用壳以外的所有构建产物。Vite base 不仅改写 JS/CSS，
// 也会改写 manifest、图标和启动图；漏掉任一类都会让在线壳产生 404。
const shellFiles = new Set(['index.html', 'sw.js', 'manifest.webmanifest', 'asset-cdn-manifest.json', 'robots.txt', 'sitemap.xml']);
const candidates = (await filesBelow(dist)).filter((file) => {
  const relative = path.relative(dist, file).split(path.sep).join('/');
  // 旧 Gemma/MediaPipe 浏览器运行时已退出 Qwen/MNN 决赛路由，不再进入新 release。
  return !shellFiles.has(relative) && !relative.startsWith('mediapipe/');
});

const objects = [];
for (const file of candidates.sort()) {
  const relative = path.relative(dist, file).split(path.sep).join('/');
  const info = await stat(file);
  objects.push({
    local: path.relative(root, file).split(path.sep).join('/'),
    key: `${prefix}/${relative}`,
    bytes: info.size,
    sha256: await sha256(file),
    contentType: contentType(file),
  });
}

const manifest = {
  schema: 'pocket-earth.oss-release/v1',
  release,
  bucket: 'last-night-on-earth',
  endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
  publicBase: 'https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com',
  status: 'ready-for-upload',
  objects,
};

const output = path.resolve(option('--output', 'docs/deploy/oss-static-release-20260811.json'));
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output, objects: objects.length, bytes: objects.reduce((sum, item) => sum + item.bytes, 0) }));
