#!/usr/bin/env node

import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback = '') => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const root = path.resolve(option('--root', 'dist'));
const base = option('--base', process.env.STATIC_ASSET_BASE || '').replace(/\/+$/, '');
if (!/^https:\/\//.test(base)) throw new Error('Pass an HTTPS OSS release URL with --base');

const textExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.mjs', '.svg', '.txt', '.webmanifest', '.xml']);
const artDirectoryRoots = [
  'assets/agent-forge',
  'assets/animal-agent-avatars',
  'assets/pocket-buddy',
  'assets/pocket-plants',
  'assets/skill-evidence',
];
const roots = [
  ...artDirectoryRoots,
  'assets/**/*.{avif,gif,jpeg,jpg,png,svg,webp}',
  'assets/exhibit-2_5d',
  'assets/exhibit-3dgs',
  'assets/heritage-demo',
  'assets/skills/guji',
  'assets/ort-wasm-*.wasm',
  'exhibits',
];
// Pure art directories are rewritten by prefix as well as by file extension.
// This covers runtime-composed paths such as `/assets/pocket-buddy/${id}.png`.
const resourceUrl = /(?<![A-Za-z0-9._~:/-])\/(assets\/agent-forge|assets\/animal-agent-avatars|assets\/exhibit-2_5d|assets\/exhibit-3dgs|assets\/heritage-demo|assets\/pocket-buddy|assets\/pocket-plants|assets\/skill-evidence|assets\/skills\/guji|exhibits)\//g;
const resourceFileUrl = /(?<![A-Za-z0-9._~:/-])\/(assets\/ort-wasm-[A-Za-z0-9._-]+\.wasm)(?=[?"'\s),;#]|$)/g;
// Catch individual art files in mixed asset directories without moving JSON,
// PDF, WASM, model or Worker URLs off the application origin.
const artFileUrl = /(?<![A-Za-z0-9._~:/-])\/(assets\/[^?"'\s),;#]+\.(?:avif|gif|jpe?g|png|svg|webp))(?=[?"'\s),;#]|$)/gi;

async function filesBelow(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesBelow(absolute));
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

const rootInfo = await stat(root).catch(() => null);
if (!rootInfo?.isDirectory()) throw new Error(`Build directory not found: ${root}`);
let scanned = 0;
let changed = 0;
let replacements = 0;
for (const file of await filesBelow(root)) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  if (relative === 'sw.js' || !textExtensions.has(path.extname(file).toLowerCase())) continue;
  scanned += 1;
  const before = await readFile(file, 'utf8');
  let local = 0;
  const rewrittenDirectories = before.replace(resourceUrl, (_match, resourceRoot) => {
    local += 1;
    return `${base}/${resourceRoot}/`;
  });
  const rewrittenFiles = rewrittenDirectories.replace(resourceFileUrl, (_match, resourcePath) => {
    local += 1;
    return `${base}/${resourcePath}`;
  });
  const rewritten = rewrittenFiles.replace(artFileUrl, (_match, resourcePath) => {
    local += 1;
    return `${base}/${resourcePath}`;
  });
  // Web App Manifest 必须留在应用同源：否则 start_url / scope 会落到 OSS 域名，
  // Android/PWA 安装身份与在线壳来源都会错误。图标等不可变文件仍可走 CDN。
  const after = rewritten.replace(`${base}/manifest.webmanifest`, '/manifest.webmanifest');
  if (after === before) continue;
  await writeFile(file, after);
  changed += 1;
  replacements += local;
}

const report = { schema: 'pocket-earth.asset-cdn/v1', assetBase: base, codeChunksOnCdn: true, scanned, changed, replacements, roots };
await writeFile(path.join(root, 'asset-cdn-manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
