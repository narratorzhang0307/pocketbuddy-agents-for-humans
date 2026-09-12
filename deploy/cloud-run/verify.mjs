#!/usr/bin/env node
// Verify the actual deployed Canvas bundle and shared API; camera acceptance is separate.
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyCanvasSource, verifyCanvasWeb } from '../../scripts/ios/verify-skill-canvas.mjs';

const args = process.argv.slice(2);
const urlIndex = args.indexOf('--url');
if (urlIndex < 0 || !args[urlIndex + 1]) throw Error('Usage: node deploy/cloud-run/verify.mjs --url https://SERVICE.run.app [--model]');
const origin = new URL(args[urlIndex + 1]);
if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' ||
    !(origin.protocol === 'https:' || (origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)))) {
  throw Error('Use a bare HTTPS origin (or localhost for a local server / gcloud proxy).');
}
const root = fileURLToPath(new URL('../../', import.meta.url));
async function request(relative, options = {}) {
  const response = await fetch(new URL(relative, origin), {
    ...options, redirect: 'error', signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw Error(`${relative}: HTTP ${response.status}`);
  return response;
}
async function json(relative, options) {
  const response = await request(relative, options);
  if (!response.headers.get('content-type')?.includes('application/json')) throw Error(`${relative}: expected JSON, received a page/fallback`);
  return response.json();
}

const health = await json('/healthz');
if (health.ok !== true) throw Error('Node server is not healthy');
const sports = await json('/api/sports-coach/health');
if (sports.ready !== true || sports.protocol !== 'pocket-sports-pose/v1') throw Error('Python sports rules are not ready');
console.log('PASS Node server and Python sports rules');

const source = verifyCanvasSource(root);
const stamp = await json('/skill-canvas-release.json');
if (stamp.sourceSha256 !== source.sourceSha256 || stamp.release !== source.release) throw Error('Deployed Skill Canvas differs from this checkout; rebuild / check revision traffic');
if (!Array.isArray(stamp.chunks) || !stamp.chunks.length || stamp.chunks.length > 256) throw Error('Invalid Canvas manifest');
const files = ['index.html', ...stamp.chunks.map(chunk => {
  if (!/^assets\/[A-Za-z0-9_.-]+\.js$/.test(chunk.file)) throw Error('Invalid Canvas chunk path');
  return chunk.file;
}), ...Object.keys(source.assets)];
const downloaded = await mkdtemp(path.join(tmpdir(), 'pocket-cloud-run-'));
const poseAssets = new Map();
try {
  await writeFile(path.join(downloaded, 'skill-canvas-release.json'), JSON.stringify(stamp));
  for (let index = 0; index < files.length; index += 4) {
    const results = await Promise.allSettled(files.slice(index, index + 4).map(async file => {
      const response = await request(`/${file}`);
      const target = path.join(downloaded, file);
      await mkdir(path.dirname(target), { recursive: true });
      const bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(target, bytes);
      if (file.endsWith('.js')) {
        for (const match of bytes.toString().matchAll(/["'](\/assets\/(pose_landmarker_lite|vision_wasm_(?:nosimd_)?internal)-[A-Za-z0-9_-]+\.(task|wasm|js))["']/g)) {
          poseAssets.set(`${match[2]}.${match[3]}`, match[1]);
        }
      }
    }));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
  }
  verifyCanvasWeb(root, downloaded);
  console.log(`PASS deployed Skill Canvas source, ${stamp.chunks.length} JS chunks and 16 artwork hashes`);
  const poseSources = {
    'pose_landmarker_lite.task': 'vendor/her-motion/public/models/pose_landmarker_lite.task',
    ...Object.fromEntries(['vision_wasm_internal.js', 'vision_wasm_internal.wasm',
      'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']
      .map(file => [file, `node_modules/@mediapipe/tasks-vision/wasm/${file}`])),
  };
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  for (const [asset, sourceFile] of Object.entries(poseSources)) {
    if (!poseAssets.has(asset)) throw Error(`Pose model/runtime not referenced by the deployed app: ${asset}`);
    const response = await request(poseAssets.get(asset));
    if (hash(Buffer.from(await response.arrayBuffer())) !== hash(await readFile(path.join(root, sourceFile)))) {
      throw Error(`Pose asset mismatch: ${asset}; run npm ci and verify the deployed build`);
    }
  }
  console.log('PASS actual bundled MediaPipe model and both WASM runtimes');
} finally {
  await rm(downloaded, { recursive: true, force: true });
}

for (const app of ['her-motion', 'lianlema']) {
  const page = await (await request(`/${app}/`)).text();
  if (!page.includes(`/${app}/`) || !page.includes('<html')) throw Error(`${app}: missing child page (main-page fallback is not a pass)`);
}
console.log('PASS both existing coaching pages are packaged (their separate model APIs are not tested here)');
const agent = await json('/api/agentic-readiness');
if (agent.ready !== true) throw Error('Frost model is not configured');
console.log(`PASS Frost configuration; Cloud Run revision: ${agent.cloudRun?.revision || 'local / proxy'}`);
if (args.includes('--model')) {
  const result = await json('/api/frost-llm', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'Deployment connectivity check. Reply with one brief greeting.', task: 'chat', locale: 'en' }),
  });
  if (result.error || !result.text?.trim() || !result.model || !result.provider) throw Error('Frost did not return an actual model response');
  console.log(`PASS real Frost request: ${result.provider} / ${result.model}; trace ${result.traceId || 'unavailable'}`);
} else {
  console.log('SKIP paid model request; run again with --model to test credentials, quota and upstream access');
}
console.log('Next: run verify_app.py for all 23 actions, then HTTPS browser camera / consent / stop / save acceptance.');
