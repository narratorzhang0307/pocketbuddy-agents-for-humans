// Build the current desktop checkout into an isolated release, without touching dist-ios.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, loadEnv } from 'vite';
import { assertNoRetiredPublicReferences, RETIRED_PUBLIC_DIRECTORIES, shouldPublishPublicAsset } from './public-assets.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const outputParent = process.argv[2];
// Optional isolated, freshly rebuilt coach export; never rewrite shared public/lianlema.
const coachExport = process.argv[3] ? path.resolve(process.argv[3]) : undefined;
const coachManifest = coachExport ? JSON.parse(readFileSync(`${coachExport}.manifest.json`, 'utf8')) : undefined;
if (!outputParent || !path.isAbsolute(outputParent) || !existsSync(outputParent)) {
  throw new Error('Usage: node deploy/pocketbuddy/stage.mjs /absolute/existing/output-directory');
}
const stage = mkdtempSync(path.join(outputParent, 'pocketbuddy-web-'));
const release = path.join(stage, 'release');
mkdirSync(release);

function sourceHash() {
  const hash = createHash('sha256');
  function visit(relative) {
    const absolute = path.join(root, relative);
    for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) visit(name);
      else if (entry.isFile() && /\.(?:ts|tsx|mjs|js|json|css|html|py|service|conf|txt)$/.test(entry.name)) hash.update(name).update(readFileSync(path.join(root, name)));
    }
  }
  for (const directory of ['src', 'vendor/legacy-city/src', 'frost-agent', 'server', 'deploy/pocketbuddy', 'public/lianlema', 'lianlema-portable/app_project/app/src']) visit(directory);
  for (const file of ['package.json', 'package-lock.json', 'vite.pocketbuddy.config.ts', 'scripts/verify-avatar-assets.mjs', 'index.html', 'server.mjs', 'public/sw.js', 'lianlema-portable/app_project/app/app.config.js', 'lianlema-portable/app_project/app/App.tsx']) {
    hash.update(file).update(readFileSync(path.join(root, file)));
  }
  return hash.digest('hex');
}
const sourceSha256 = sourceHash();
const publicRoot = path.join(root, 'public');
const releasePublic = path.join(stage, 'public');
cpSync(publicRoot, releasePublic, {
  recursive: true,
  filter: (source) => {
    const relative = path.relative(publicRoot, source);
    return (!coachExport || (relative !== 'lianlema' && !relative.startsWith(`lianlema${path.sep}`))) && shouldPublishPublicAsset(relative);
  },
});
if (coachExport) {
  if (!coachManifest?.sourceSha256 || !coachManifest.files['index.html']) throw new Error('Missing verified coach manifest');
  for (const [file, expected] of Object.entries(coachManifest.files)) {
    if (path.isAbsolute(file) || file.split('/').includes('..') || file.split('/').some(part => part.startsWith('.'))
      || createHash('sha256').update(readFileSync(path.join(coachExport, file))).digest('hex') !== expected) throw new Error('Coach export hash mismatch');
  }
  cpSync(coachExport, path.join(releasePublic, 'lianlema'), { recursive: true });
}
process.env.POCKET_BUDDY_BUILD_TARGET = 'web';
await build({
  root,
  configFile: path.join(root, 'vite.pocketbuddy.config.ts'),
  publicDir: releasePublic,
  build: { outDir: path.join(release, 'dist'), emptyOutDir: true },
});
function checkReferences(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) checkReferences(file);
    else if (entry.isFile() && /\.(?:html|js|mjs|css|json|webmanifest)$/.test(entry.name)) {
      assertNoRetiredPublicReferences(readFileSync(file, 'utf8'), path.relative(release, file));
    }
  }
}
checkReferences(path.join(release, 'dist'));
if (sourceHash() !== sourceSha256) throw new Error('Source changed while building; do not publish this release.');
cpSync(path.join(root, 'server.mjs'), path.join(release, 'server.mjs'));
mkdirSync(path.join(release, 'server'));
for (const file of readdirSync(path.join(root, 'server'))) {
  if (file.endsWith('.mjs') || file === 'package.json') cpSync(path.join(root, 'server', file), path.join(release, 'server', file));
}
// Only audited inference runtime; never copy tests, images, weights, env or a venv.
mkdirSync(path.join(release, 'server/photo-harness'));
for (const file of ['service.py', 'worker.py', 'food_harness.py', 'grounding.py', 'providers.py']) {
  cpSync(path.join(root, 'server/photo-harness', file), path.join(release, 'server/photo-harness', file));
}
mkdirSync(path.join(release, 'knowledge'));
cpSync(path.join(root, 'knowledge/travel-place-sources.mjs'), path.join(release, 'knowledge/travel-place-sources.mjs'));

// Private, server-only configuration: never copy the source .env or unrelated credentials.
const env = loadEnv('production', root, '');
const runtime = { API_PORT: '3020', API_HOST: '127.0.0.1', TRUST_PROXY: 'true', EDGE_BACKEND: 'stub', HEALTH_SKILL_LOCAL_BRIDGE: 'false', CLOUD_RATE_LIMIT_PER_MINUTE: '24' };
for (const key of Object.keys(env).filter((key) => /^(?:DASHSCOPE_|QWEN_|MINIMAX_|FROST_VOICE_|PHOTOS_HARNESS_)/.test(key))) {
  if (env[key] && !/[\r\n]/.test(env[key])) runtime[key] = env[key];
}
writeFileSync(path.join(stage, 'runtime.env'), Object.entries(runtime).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
const marker = { app: 'pocketbuddy', builtAt: new Date().toISOString(), sourceSha256,
  ...(coachManifest ? { coachSourceSha256: coachManifest.sourceSha256 } : {}), excludedPublicDirectories: RETIRED_PUBLIC_DIRECTORIES };
writeFileSync(path.join(release, 'dist/release.json'), JSON.stringify(marker, null, 2) + '\n');
writeFileSync(path.join(stage, 'release.json'), JSON.stringify(marker, null, 2) + '\n');
console.log(`Prepared Pocket Buddy release: ${stage}`);
console.log(`Source SHA256: ${sourceSha256}`);
console.log('Private runtime.env is outside the public release; upload it only to the private shared directory.');
