// Build the current desktop checkout into an isolated release, without touching dist-ios.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build, loadEnv } from 'vite';
import { assertNoRetiredPublicReferences, RETIRED_PUBLIC_DIRECTORIES, shouldPublishPublicAsset } from './public-assets.mjs';
import { sourceHashes, sha256, verifyAnswerBundle } from '../../scripts/ios/provenance.mjs';
import { hashReleaseFiles } from './release-files.mjs';
import { verifyCanvasWeb } from '../../scripts/ios/verify-skill-canvas.mjs';
import { verifyBirdWeb } from '../../scripts/hardware/check-bird-release.mjs';
import { verifyFrostSkillsBundle } from '../../scripts/ios/verify-frost-skills.mjs';
import { WINK_ICONS } from '../../scripts/ios/verify-app-icon.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const outputParent = process.argv[2];
// A server release always rebuilds both sub-apps from this workspace.
// Do not accept exports/snapshots whose source may no longer match the main app.
if (process.argv[3]) throw new Error('External export input is no longer accepted. Run stage.mjs with only the output parent; both sub-apps are rebuilt automatically.');
if (!outputParent || !path.isAbsolute(outputParent) || !existsSync(outputParent)) {
  throw new Error('Usage: node deploy/pocketbuddy/stage.mjs /absolute/existing/output-directory');
}
const stage = mkdtempSync(path.join(outputParent, 'pocketbuddy-web-'));
const release = path.join(stage, 'release');
mkdirSync(release);

function sourceHash() {
  // Reuse the iOS source inventory, including native catalogs and original assets.
  // Additional runtime/coach inputs are not part of the historical iOS inventory.
  const sources = sourceHashes(root);
  for (const file of ['server.mjs', 'lianlema-portable/app_project/app/metro.config.js']) {
    if (existsSync(path.join(root, file))) sources[file] = sha256(readFileSync(path.join(root, file)));
  }
  return sha256(JSON.stringify(sources));
}
function runNode(args, cwd = root) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Sub-app build failed: ${args[0]}`);
}
const sourceSha256 = sourceHash();
const publicRoot = path.join(root, 'public');
const releasePublic = path.join(stage, 'public');
cpSync(publicRoot, releasePublic, {
  recursive: true,
  dereference: true,
  filter: (source) => {
    const relative = path.relative(publicRoot, source);
    return !relative.split(path.sep).some(part => part.startsWith('.'))
      && !['lianlema', 'her-motion'].includes(relative.split(path.sep)[0]) && shouldPublishPublicAsset(relative);
  },
});
const coachExport = path.join(stage, 'coach');
runNode([path.join(root, 'deploy/pocketbuddy/build-coach-web.mjs'), coachExport]);
const coachManifest = JSON.parse(readFileSync(`${coachExport}.manifest.json`, 'utf8'));
cpSync(coachExport, path.join(releasePublic, 'lianlema'), { recursive: true });
runNode([path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config',
  path.join(root, 'vendor/her-motion/vite.config.ts'), '--outDir', path.join(releasePublic, 'her-motion')]);
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
verifyCanvasWeb(root, path.join(release, 'dist'));
verifyBirdWeb(root, path.join(release, 'dist'));
verifyFrostSkillsBundle(path.join(release, 'dist'));
verifyAnswerBundle(path.join(release, 'dist'));
for (const [name, expected] of Object.entries(WINK_ICONS)) {
  if (sha256(readFileSync(path.join(release, 'dist/icons', name))) !== expected) throw new Error(`Packaged Frost icon mismatch: ${name}`);
}
if (sourceHash() !== sourceSha256) throw new Error('Source changed while building; do not publish this release.');
cpSync(path.join(root, 'server.mjs'), path.join(release, 'server.mjs'));
mkdirSync(path.join(release, 'server'));
for (const file of readdirSync(path.join(root, 'server'))) {
  if (file.endsWith('.mjs') || file === 'package.json' || file === 'package-lock.json') cpSync(path.join(root, 'server', file), path.join(release, 'server', file));
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
for (const key of Object.keys(env).filter((key) => /^(?:DASHSCOPE_|QWEN_|MINIMAX_|FROST_VOICE_|FROST_AGENT_|FROST_FIRESTORE_|GEMINI_|GOOGLE_GENAI_|GOOGLE_CLOUD_|PHOTOS_HARNESS_)/.test(key))) {
  if (env[key] && !/[\r\n]/.test(env[key])) runtime[key] = env[key];
}
writeFileSync(path.join(stage, 'runtime.env'), Object.entries(runtime).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
if (sourceHash() !== sourceSha256) throw new Error('Source changed while staging runtime; rebuild before publishing.');
const marker = { app: 'pocketbuddy', builtAt: new Date().toISOString(), sourceSha256,
  coachSourceSha256: coachManifest.sourceSha256, fullSourceBuild: true,
  checks: ['approved-canvas', 'frost-skills', 'bird-release', 'voice-answers', 'frost-wink-icons'],
  rebuiltSubApps: ['lianlema', 'her-motion'], excludedPublicDirectories: RETIRED_PUBLIC_DIRECTORIES };
writeFileSync(path.join(release, 'dist/release.json'), JSON.stringify(marker, null, 2) + '\n');
writeFileSync(path.join(stage, 'release.json'), JSON.stringify(marker, null, 2) + '\n');
writeFileSync(path.join(stage, 'release-files.json'), JSON.stringify(hashReleaseFiles(release), null, 2) + '\n');
console.log(`Prepared Pocket Buddy release: ${stage}`);
console.log(`Source SHA256: ${sourceSha256}`);
console.log('Private runtime.env is outside the public release; upload it only to the private shared directory.');
