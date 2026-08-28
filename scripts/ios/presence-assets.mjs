// Re-encode the existing approved avatars for WidgetKit. No generated/replacement artwork.
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../../', import.meta.url));
const catalog = JSON.parse(await readFile(path.join(root, 'public/assets/skill-avatars/20260827/catalog.json'), 'utf8'));
const output = path.join(root, 'native/frost-presence/PresenceAssets');
await mkdir(output, { recursive: true });
for (const entry of [...catalog.map(item => ({ index: item.badgeIndex,
  source: `public/assets/skill-avatars/20260827/${item.web}` })),
  { index: 17, source: 'public/assets/bird-skill/20260828/frost.bird-listener.webp' }]) {
  if (!Number.isInteger(entry.index) || entry.index < 0 || entry.index > 17) throw new Error('Invalid avatar index');
  await sharp(path.join(root, entry.source)).resize(256, 256).png().toFile(path.join(output, `buddy-${entry.index}.png`));
}
console.log('WidgetKit: 18 existing avatars prepared, offline and without private data.');
