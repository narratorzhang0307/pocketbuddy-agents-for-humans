// Package the approved imagegen poses; never redraw or replace the Frost identity.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = join(root, 'docs/design/frost-arrival-20260828/source-atlas-v1.png');
const output = join(root, 'public/assets/frost-arrival/20260828-v1');
const size = 256;
const digest = data => createHash('sha256').update(data).digest('hex');
const input = await readFile(source);
const metadata = await sharp(input).metadata();
if (metadata.width !== 1448 || metadata.height !== 1086) throw new Error('Unexpected source atlas registration');
const names = ['run-01', 'run-02', 'run-03', 'run-04', 'wag-01', 'wag-02', 'wag-03', 'wag-04',
  'approach-01', 'approach-02', 'approach-03', 'approach-04', 'portrait-rest', 'mouth-small', 'mouth-open', 'blink'];
await mkdir(output, { recursive: true });
const frames = [];
for (let index = 0; index < 12; index++) {
  // Crop the equal cells with a two-pixel inset to exclude the sheet's dividers.
  frames.push(await sharp(input).extract({ left: (index % 4) * 362 + 2, top: Math.floor(index / 4) * 362 + 2,
    width: 358, height: 358 }).resize(size, size).png().toBuffer());
}
const originals = ['public/assets/skill-avatars/20260827/originals/frost.png',
  ...['small', 'open', 'blink'].map(name => `public/assets/frost-talk/20260828/originals/${name}.png`)];
const referenceHashes = [];
for (const path of originals) {
  const bytes = await readFile(join(root, path));
  referenceHashes.push({ path, sha256: digest(bytes) });
  frames.push(await sharp(bytes).resize(size, size).png().toBuffer());
}
const atlas = await sharp({ create: { width: size * 4, height: size * 4, channels: 3, background: '#afdde1' } })
  .composite(frames.map((input, index) => ({ input, left: (index % 4) * size, top: Math.floor(index / 4) * size })))
  .webp({ quality: 92 }).toBuffer();
await writeFile(join(output, 'atlas.webp'), atlas);
const entries = [];
for (const [index, png] of frames.entries()) {
  const bytes = await sharp(png).webp({ quality: 92 }).toBuffer();
  const file = `${names[index]}.webp`;
  await writeFile(join(output, file), bytes);
  entries.push({ index, name: names[index], file, bytes: bytes.length, sha256: digest(bytes) });
}
await writeFile(join(output, 'manifest.json'), `${JSON.stringify({ schema: 'frost-arrival/v1',
  generator: 'built-in imagegen; sharp for cell slicing, resize and packaging only',
  sourceSha256: digest(input), referenceHashes, cellSize: size, columns: 4, rows: 4,
  atlas: { file: 'atlas.webp', bytes: atlas.length, sha256: digest(atlas) },
  background: 'opaque pale cyan, not transparent; never use the rejected checkerboard edit', frames: entries,
}, null, 2)}\n`);
for (const reference of referenceHashes) {
  if (digest(await readFile(join(root, reference.path))) !== reference.sha256) throw new Error('Reference changed');
}
console.log(JSON.stringify({ output, frames: entries.length, atlasBytes: atlas.length, referencesUnchanged: true }));
