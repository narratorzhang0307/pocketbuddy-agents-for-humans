// Export generated originals; never modify, repaint or replace the source PNGs.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const docs = join(root, 'docs/design/skill-avatars-20260827');
const output = join(root, 'public/assets/skill-avatars/20260827');
const board = join(root, 'hardware/ojbadge-agent-link/boards/ojbadge');
const manifest = JSON.parse(await readFile(join(docs, 'manifest.json'), 'utf8'));
const labels = ['FROST', 'HER MOTION', 'LIANLEMA', 'RUN ROUTE', 'RUN COACH', 'HEALTHSYNC', 'MOTION VISION', 'ENDURANCE', 'FOOD FACTS', 'GARMIN', 'CN FOOD', 'OUTDOOR', 'STRAVA', 'SLEEP', 'MEAL LENS', 'WGER', 'MEALIE'];
if (manifest.entries.length !== labels.length) throw new Error('Update the versioned firmware mapping before changing the catalog.');
for (const folder of ['web', 'hardware', 'hardware-round']) await mkdir(join(output, folder), { recursive: true });
const birdLabels = ['BIRD LISTENER', ...JSON.parse(await readFile(join(root, 'native/frost-badge/ios/BirdCatalog.json'), 'utf8')).slice(1).map(item => item.name)];
const catalog = [], arrays = [], previewTiles = [], cloudObjects = [];
const cloudPrefix = 'pocket-earth/skill-avatars/20260828-round-v1';
const cloudBase = `https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/${cloudPrefix}`;
const crc32 = data => { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let b = 0; b < 8; b++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (~crc) >>> 0; };
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
for (const [badgeIndex, item] of manifest.entries.entries()) {
  const original = `originals/${item.id}.png`;
  const source = await readFile(join(output, original));
  const metadata = await sharp(source).metadata();
  const web = `web/${item.id}.webp`, legacyHardware = `hardware/${item.id}.png`;
  const hardware = `hardware-round/${item.id}.jpg`;
  await sharp(source).resize(256, 256, { fit: 'contain', background: item.background.match(/#[a-f0-9]{6}/i)[0] }).webp({ quality: 92 }).toFile(join(output, web));
  const rgb = await sharp(source).resize(128, 128, { fit: 'contain', background: item.background.match(/#[a-f0-9]{6}/i)[0] }).flatten().removeAlpha().raw().toBuffer();
  const rgb565 = Buffer.alloc(128 * 128 * 2), display = Buffer.alloc(128 * 128 * 3);
  for (let i = 0; i < 128 * 128; i++) {
    const value = ((rgb[i * 3] >> 3) << 11) | ((rgb[i * 3 + 1] >> 2) << 5) | (rgb[i * 3 + 2] >> 3);
    rgb565.writeUInt16LE(value, i * 2);
    display[i * 3] = Math.round((value >> 11) * 255 / 31);
    display[i * 3 + 1] = Math.round(((value >> 5) & 63) * 255 / 63);
    display[i * 3 + 2] = Math.round((value & 31) * 255 / 31);
  }
  await writeFile(join(output, `hardware/${item.id}.rgb565`), rgb565);
  await sharp(display, { raw: { width: 128, height: 128, channels: 3 } }).png().toFile(join(output, legacyHardware));
  // Native panel resolution, opaque edge-to-edge artwork. Baseline JPEG is
  // decoded once per selection by the existing ESP JPEG component into RGB565.
  const jpeg = await sharp(source).resize(240, 240, { fit: 'cover' }).flatten().removeAlpha()
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4', progressive: false }).toBuffer();
  await writeFile(join(output, hardware), jpeg);
  const bytes = Array.from(jpeg, byte => `0x${byte.toString(16).padStart(2, '0')}`);
  arrays.push(`static const uint8_t kJpeg${badgeIndex}[] = { // ${item.id}\n${Array.from({ length: Math.ceil(bytes.length / 24) }, (_, row) => `  ${bytes.slice(row * 24, row * 24 + 24).join(',')},`).join('\n')}\n};`);
  catalog.push({ ...item, badgeIndex, hardwareLabel: labels[badgeIndex], original, web, hardware, width: metadata.width, height: metadata.height,
    sha256: createHash('sha256').update(source).digest('hex'), hardwareBytes: jpeg.length,
    hardwareSize: 240, hardwareFormat: 'baseline-jpeg-to-rgb565', legacyHardware,
    cloud: badgeIndex ? { jpegUrl: `${cloudBase}/${hardware}`, webUrl: `${cloudBase}/${web}`,
      sha256: createHash('sha256').update(jpeg).digest('hex'), crc32: crc32(jpeg), bytes: jpeg.length } : null });
  if (badgeIndex) for (const [file, contentType] of [[hardware, 'image/jpeg'], [web, 'image/webp']]) {
    const content = await readFile(join(output, file));
    cloudObjects.push({ local: `public/assets/skill-avatars/20260827/${file}`, key: `${cloudPrefix}/${file}`,
      contentType, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') });
  }
  const left = 40 + (badgeIndex % 5) * 232, top = 130 + Math.floor(badgeIndex / 5) * 258;
  previewTiles.push({ input: await sharp(source).resize(208, 208).png().toBuffer(), left, top });
  const caption = `<svg width="220" height="42"><text x="0" y="18" font-family="Arial,PingFang SC,sans-serif" font-size="14" font-weight="600" fill="#243e34">${escape(item.name)}</text><text x="0" y="36" font-family="monospace" font-size="10" fill="#768274">${escape(item.id)}</text></svg>`;
  previewTiles.push({ input: Buffer.from(caption), left, top: top + 214 });
}
await writeFile(join(board, 'frost_avatar_assets.cc'), `// GENERATED by scripts/hardware/build-skill-avatar-assets.mjs. Do not hand edit.\n// Only Frost is resident in flash; other portraits arrive from OSS via the phone.\n#include "frost_avatar_assets.h"\nnamespace frost_avatar {\nconst char* const kLabels[kCount] = {${[...labels, ...birdLabels].map(x => JSON.stringify(x)).join(',')}};\n${arrays[0]}\nconst Asset kFrostImage = {kJpeg0, sizeof(kJpeg0)};\n}\n`);
await writeFile(join(root, 'src/app/lib/skill/avatarCloudCatalog.json'), JSON.stringify(catalog.filter(item => item.cloud).map(item => ({ id: item.id, index: item.badgeIndex, ...item.cloud })), null, 2) + '\n');
await writeFile(join(docs, 'oss-release.json'), JSON.stringify({ schema: 'pocket-earth.oss-release/v1', release: 'skill-avatars-20260828-round-v1', bucket: 'last-night-on-earth', endpoint: 'https://oss-cn-hangzhou.aliyuncs.com', objects: cloudObjects }, null, 2) + '\n');
await writeFile(join(output, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
const template = await readFile(join(root, 'scripts/hardware/skill-avatars-gallery.html'), 'utf8');
await writeFile(join(output, 'index.html'), template.replace('__CATALOG__', JSON.stringify(catalog).replaceAll('<', '\\u003c')));
const title = Buffer.from('<svg width="1160" height="80"><text x="0" y="24" font-family="monospace" font-size="12" letter-spacing="4" fill="#6c7c6b">FROST / SKILL PORTRAITS</text><text x="0" y="66" font-family="Arial,PingFang SC,sans-serif" font-size="32" font-weight="700" fill="#243e34">焦糖与 16 位能力伙伴</text></svg>');
await sharp({ create: { width: 1220, height: 1194, channels: 3, background: '#f5f1e8' } }).composite([{ input: title, left: 40, top: 25 }, ...previewTiles]).png().toFile(join(docs, 'contact-sheet.png'));
console.log(`Exported ${catalog.length} originals → WebP, legacy RGB565, full-screen JPEG firmware and interactive gallery. ${catalog.reduce((sum, item) => sum + item.hardwareBytes, 0)} compressed bytes. Original bytes unchanged.`);
