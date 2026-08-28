import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../', import.meta.url));
const app = path.join(root, 'lianlema-portable/app_project/app');
const output = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'public/lianlema');
function sourceHash() {
  const hash = createHash('sha256');
  function visit(relative) {
    for (const item of readdirSync(path.join(app, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = path.join(relative, item.name);
      if (item.isDirectory()) visit(name);
      else if (item.isFile()) hash.update(name).update(readFileSync(path.join(app, name)));
    }
  }
  visit('src');
  for (const name of ['App.tsx', 'app.config.js', 'package.json', 'package-lock.json']) hash.update(name).update(readFileSync(path.join(app, name)));
  return hash.digest('hex');
}
const sourceSha256 = sourceHash();
const result = spawnSync(process.execPath, [path.join(app, 'node_modules/expo/bin/cli'),
  'export', '--platform', 'web', '--output-dir', output], {
  cwd: app, stdio: 'inherit', env: { ...process.env,
    EXPO_NO_DOTENV: '1',
    LIANLEMA_WEB_BASE_PATH: '/lianlema',
    EXPO_PUBLIC_MODEL_BASE_URL: 'https://pocketbuddy.throughtheglass.art/lianlema',
    EXPO_PUBLIC_MODEL_MODE: 'manual',
    EXPO_PUBLIC_PREFERRED_CAMERA: '',
  },
});
if (result.error) throw result.error;
if (result.status === 0 && sourceHash() !== sourceSha256) throw new Error('Coach source changed during export; do not publish.');
if (result.status === 0 && process.argv[2]) {
  const files = {};
  const collect = (directory) => {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      if (item.isSymbolicLink() || item.name.startsWith('.')) throw new Error('Unexpected private file or symlink in coach export');
      const absolute = path.join(directory, item.name);
      if (item.isDirectory()) collect(absolute);
      else files[path.relative(output, absolute).split(path.sep).join('/')] = createHash('sha256').update(readFileSync(absolute)).digest('hex');
    }
  };
  collect(output);
  writeFileSync(`${output}.manifest.json`, JSON.stringify({ createdAt: new Date().toISOString(), sourceSha256, files }, null, 2) + '\n');
}
process.exit(result.status ?? 1);
