import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// The legacy map imports these profiles but Vite cannot discover string GLB URLs.
// Verify the actual public files before every dev/build so they cannot be omitted again.
export function verifyAvatarAssets(root) {
  const profiles = [
    'vendor/legacy-city/src/app/lib/agent3d/profiles.ts',
    'vendor/legacy-city/src/app/lib/skills/city-companion/catalog.ts',
  ];
  const urls = [...new Set(profiles.flatMap((file) =>
    [...readFileSync(path.join(root, file), 'utf8').matchAll(/["'](\/assets\/[^"']+\.glb)(?:\?[^"']*)?["']/g)].map((match) => match[1]),
  ))];
  if (!urls.length) throw new Error('No character models found in the active catalog.');
  for (const url of urls) {
    const file = path.join(root, 'public', url);
    if (!existsSync(file)) throw new Error(`Missing real character model: ${url}`);
    const data = readFileSync(file);
    if (data.length < 20 || data.toString('ascii', 0, 4) !== 'glTF' || data.readUInt32LE(4) !== 2 || data.readUInt32LE(8) !== data.length) {
      throw new Error(`Invalid real character GLB: ${url}`);
    }
    const json = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString('utf8'));
    if (!json.meshes?.length || [...(json.buffers ?? []), ...(json.images ?? [])].some((item) => item.uri && !item.uri.startsWith('data:'))) {
      throw new Error(`Character model is empty or has unpackaged dependencies: ${url}`);
    }
  }
  return urls;
}
