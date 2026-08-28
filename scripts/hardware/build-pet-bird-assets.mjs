// Rebuild the approved pet release from independent, reviewed RGBA bird masters.
// Original T5 backgrounds remain separate immutable objects. Nothing is flashed.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const output = 'public/assets/bird-skill/20260828/pet-birds-v3';
const docs = 'docs/design/bird-skill-20260828';
const prefix = 'pocket-earth/bird-skill/20260828-v1/pet-birds-v3';
const host = 'https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com';
const sha = b => createHash('sha256').update(b).digest('hex');
const crc32 = bytes => {
  let c = 0xffffffff;
  for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); }
  return (~c) >>> 0;
};
const sources = JSON.parse(await readFile(`${docs}/pet-birds-sources.json`, 'utf8'));
if (sources.birds.length !== 12 || new Set(sources.birds.map(b => b.id)).size !== 12) throw Error('Expected twelve unique species');
const current = JSON.parse(await readFile('native/frost-badge/ios/BirdCatalog.json', 'utf8'));
if (JSON.stringify(current[0]) !== JSON.stringify(sources.mascot)) throw Error('Skill mascot changed; do not overwrite it');
const objects = [], catalog = [sources.mascot], birds = [], metrics = [];
await mkdir(`${output}/scenes`, { recursive: true });
async function object(relative, bytes, contentType) {
  const local = `${output}/${relative}`, key = `${prefix}/${relative}`;
  await writeFile(local, bytes);
  const item = { local, key, contentType, bytes: bytes.length, sha256: sha(bytes) };
  objects.push(item);
  return { url: `${host}/${key}`, bytes: item.bytes, sha256: item.sha256 };
}
for (const [i, bird] of sources.birds.entries()) {
  if (bird.index !== 18 + i) throw Error('Stable firmware indices changed');
  const png = await readFile(bird.pngLocal);
  if (sha(png) !== bird.pngSha256) throw Error(`Unreviewed bird PNG: ${bird.id}`);
  const meta = await sharp(png).metadata();
  if (!meta.hasAlpha) throw Error(`Opaque bird PNG: ${bird.id}`);
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let zero = 0, solid = 0, edge = 0, left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const a = data[(y * info.width + x) * 4 + 3];
    zero += a === 0; solid += a >= 250;
    if ((!x || !y || x === info.width - 1 || y === info.height - 1) && a) edge++;
    if (a) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
  }
  if (edge || zero < info.width * info.height * .3 || solid < info.width * info.height * .1) throw Error(`Invalid alpha extent: ${bird.id}`);
  const bounds = { left, top, width: right - left + 1, height: bottom - top + 1 };
  const pngAsset = await object(`birds/${bird.id}.png`, png, 'image/png');
  const webp = await sharp(png).webp({ lossless: true, effort: 6 }).toBuffer();
  const webpAsset = await object(`birds/${bird.id}.webp`, webp, 'image/webp');
  const sprite = { png: pngAsset, webp: webpAsset, width: info.width, height: info.height,
    alpha: true, bounds, pivot: { x: .5, y: .5, space: 'normalized-canvas' } };
  const bgPath = new URL(bird.background.pngUrl).pathname.replace('/pocket-earth/bird-skill/20260828-v1/', 'public/assets/bird-skill/20260828/');
  const background = await readFile(bgPath);
  if (sha(background) !== bird.background.pngSha256) throw Error(`Original T5 background changed: ${bird.id}`);
  const bgRaw = await sharp(background).ensureAlpha().raw().toBuffer();
  if (sha(bgRaw) !== bird.background.rgbaSha256) throw Error('T5 background pixel mismatch');
  const stage = await sharp(background).resize(466, 466).png().toBuffer();
  // Fit the entire silhouette inside the same 224px T5 bird canvas, without clipping long tails.
  const silhouette = await sharp(png).extract(bounds).resize(198, 198, { fit: 'inside' }).png().toBuffer();
  const sz = await sharp(silhouette).metadata();
  const layer = await sharp({ create: { width: 224, height: 224, channels: 4, background: '#00000000' } })
    .composite([{ input: silhouette, left: Math.floor((224 - sz.width) / 2), top: Math.floor((224 - sz.height) / 2) }]).png().toBuffer();
  const composed = await sharp(stage).composite([{ input: layer, left: 121, top: 111 }]).png().toBuffer();
  const jpeg = await sharp(composed).resize(240, 240).flatten({ background: '#f7f0de' })
    .jpeg({ quality: 88, progressive: false, chromaSubsampling: '4:4:4' }).toBuffer();
  if (jpeg.length > 65536) throw Error('JPEG exceeds B-board RAM transfer limit');
  const sceneJpeg = await object(`scenes/${bird.id}.jpg`, jpeg, 'image/jpeg');
  const sceneWebp = await object(`scenes/${bird.id}.webp`, await sharp(composed).resize(256, 256).webp({ quality: 90 }).toBuffer(), 'image/webp');
  const layout = { ...bird.t5Layout, frame: 'pet-v3-static', birdFit: 198, birdFitMode: 'alpha-bounds-contain', statusTextBaked: false };
  const source = { kind: 'generated-pet-bird', release: sources.release, audioUrl: bird.audioUrl,
    sprite, background: bird.background, layout, generation: { provider: bird.generation.provider, generatedSha256: bird.generation.generatedSha256 } };
  catalog.push({ index: bird.index, id: bird.id, name: bird.name, jpegUrl: sceneJpeg.url, webUrl: sceneWebp.url,
    bytes: jpeg.length, sha256: sha(jpeg), crc32: crc32(jpeg), source });
  birds.push({ index: bird.index, id: bird.id, name: bird.name, sprite, background: bird.background,
    scene: { jpeg: { ...sceneJpeg, crc32: crc32(jpeg) }, webp: sceneWebp }, layout, generation: source.generation });
  metrics.push({ id: bird.id, width: info.width, height: info.height, hasAlpha: true, transparentPixels: zero,
    solidPixels: solid, edgeNonTransparentPixels: edge, bounds, repairedInteriorPixels: bird.matting.repairedInteriorPixels });
}
const manifest = { schemaVersion: 1, release: sources.release,
  description: 'Twelve reusable pet birds with true alpha; original T5 backgrounds are separate; scenes are hardware delivery derivatives.',
  flashArtworkBytes: 0, birds };
await object('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'), 'application/json');
await object('README.txt', Buffer.from('十二只宠物风格鸟 · 透明素材包\n\n'
  + 'birds/：1254×1254 真透明 PNG 与无损透明 WebP；只有鸟，无天空、植物、地面或背景。\n'
  + 'manifest.json：物种、尺寸、透明边界、OSS 地址和 SHA-256。\n'
  + 'T5 原背景是独立资源，地址列于 manifest.background。scenes/ 仅为硬件合成衍生图，不是透明素材。\n'
  + 'ZIP 仅包含独立鸟 PNG/WebP、说明和清单，不含合成背景图。\n'
  + '白头鹎采用已认可造型，其余十一只保持同系列风格。画面经 AI 绘制、Vision 抠图与白色羽区修复。\n'
  + '硬件仍只下载小尺寸 JPEG 到 RAM，本素材包不烧录进 B 板。\n'), 'text/plain; charset=utf-8');
// Deterministic ZIP; packaging only, no image processing in Python.
execFileSync('python3', ['-c', `from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
root = Path(${JSON.stringify(output)})
files = sorted(root.glob('birds/*')) + [root/'manifest.json', root/'README.txt']
with ZipFile(root/'birds-transparent.zip', 'w', compression=ZIP_DEFLATED) as archive:
 for path in files:
  entry = ZipInfo(path.relative_to(root).as_posix(), (2026, 8, 28, 0, 0, 0))
  entry.compress_type = ZIP_DEFLATED
  entry.external_attr = 0o644 << 16
  archive.writestr(entry, path.read_bytes())
`]);
await object('birds-transparent.zip', await readFile(`${output}/birds-transparent.zip`), 'application/zip');
const json = JSON.stringify(catalog, null, 2) + '\n';
await writeFile('native/frost-badge/ios/BirdCatalog.json', json);
await writeFile(`${docs}/pet-birds-alpha-verification.json`, JSON.stringify(metrics, null, 2) + '\n');
await writeFile(`${docs}/pet-birds-oss-release.json`, JSON.stringify({ release: sources.release,
  endpoint: 'https://oss-cn-hangzhou.aliyuncs.com', bucket: 'last-night-on-earth', objects }, null, 2) + '\n');
console.log(JSON.stringify({ birds: birds.length, objects: objects.length, bytes: objects.reduce((n, o) => n + o.bytes, 0),
  jpegBytes: catalog.slice(1).reduce((n, b) => n + b.bytes, 0), maxJpegBytes: Math.max(...catalog.slice(1).map(b => b.bytes)),
  catalogSha256: sha(Buffer.from(json)), flashArtworkBytes: 0, mascotUnchanged: true }));
