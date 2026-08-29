import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// Unlike a source inventory, a release inventory must include dist/ and Expo's
// assets/node_modules/ directory. Every byte shipped to the server is covered.
export function hashReleaseFiles(directory) {
  const files = {};
  function visit(relative) {
    for (const entry of readdirSync(path.join(directory, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Release contains a symlink: ${name}`);
      if (entry.name.startsWith('.')) throw new Error(`Release contains a private dotfile: ${name}`);
      if (entry.isDirectory()) visit(name);
      else if (entry.isFile()) files[name] = createHash('sha256').update(readFileSync(path.join(directory, name))).digest('hex');
      else throw new Error(`Unexpected release entry: ${name}`);
    }
  }
  visit('');
  return files;
}
