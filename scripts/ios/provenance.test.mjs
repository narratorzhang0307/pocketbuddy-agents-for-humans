import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CONTRACT, SOURCE_INPUTS, sealPrepared, sourceHashes, verifyPrepared } from './provenance.mjs';

const temporary = [];
afterEach(() => { for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function write(root, file, value) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), value);
}
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pb-provenance-')); temporary.push(root);
  for (const input of SOURCE_INPUTS) write(root, path.extname(input) ? input : `${input}/source.txt`, 'current input');
  const web = 'ios/App/App/public/';
  write(root, `${web}assets/frostConversation-current.js`, 'frost.skill_answer skill-answer: frost.outdoor-window');
  write(root, `${web}assets/frostCompanion-current.js`, 'speakAnswer requestFrostVoice');
  write(root, `${web}assets/frostVoice-current.js`, '/api/frost-voice/tts pcm_s16le');
  write(root, `${web}index.html`, '<script src="/assets/frostConversation-current.js"></script>');
  const manifest = sealPrepared(root, sourceHashes(root), { platform: 'ios', apiOrigin: 'https://example.com' });
  return { root, web, manifest };
}
test('prepared source and copied signed-package resources verify against one manifest', () => {
  const { root, web, manifest } = fixture();
  cpSync(path.join(root, web), path.join(root, 'App.app/public'), { recursive: true });
  assert.equal(manifest.contract, CONTRACT);
  assert.deepEqual(verifyPrepared(root, path.join(root, 'App.app/public')), manifest);
});
test('a changed source, including a newly added file, invalidates an otherwise matching package', () => {
  const { root } = fixture();
  write(root, 'src/new-feature.ts', 'new code');
  assert.throws(() => verifyPrepared(root), /源码已过期.*new-feature/);
});
test('native configuration, Swift pins and child-app dependencies also invalidate a release', () => {
  for (const file of ['ios/debug.xcconfig',
    'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved',
    'lianlema-portable/app_project/app/package-lock.json', 'scripts/verify-avatar-assets.mjs',
    'agents/hospital_agent_example/data/skills/skills_index.json']) {
    const { root } = fixture();
    write(root, file, 'updated build input');
    assert.throws(() => verifyPrepared(root), /源码已过期/);
  }
});
test('changed, missing and extra stale assets all fail', () => {
  for (const action of ['change', 'delete', 'extra']) {
    const { root, web } = fixture();
    if (action === 'delete') rmSync(path.join(root, web, 'index.html'));
    else write(root, `${web}${action === 'extra' ? 'assets/old.js' : 'index.html'}`, 'stale');
    assert.throws(() => verifyPrepared(root), /网页资源已过期/);
  }
});
test('manual manifest substitution and missing provenance cannot authorize old builds', () => {
  const { root, web } = fixture();
  write(root, `${web}ios-build.json`, '{}');
  assert.throws(() => verifyPrepared(root), /安装包不是本次/);
  rmSync(path.join(root, '.ios-build/prepared.json'));
  assert.throws(() => verifyPrepared(root), /缺少当前源码/);
});
test('copying a complete old project does not make it the canonical build root', () => {
  const { root } = fixture();
  const copy = mkdtempSync(path.join(os.tmpdir(), 'pb-old-copy-')); temporary.push(copy);
  cpSync(root, copy, { recursive: true });
  assert.throws(() => verifyPrepared(copy), /复制的旧工程/);
});
test('source changed mid-build cannot be sealed with a new timestamp', () => {
  const { root } = fixture(); const before = sourceHashes(root);
  write(root, 'src/source.txt', 'concurrent edit');
  assert.throws(() => sealPrepared(root, before, {}), /构建期间源码已过期/);
});
test('a freshly built package still must contain the answer and speech implementations', () => {
  const { root, web } = fixture();
  write(root, `${web}assets/frostConversation-current.js`, 'old page routing');
  assert.throws(() => sealPrepared(root, sourceHashes(root), {}), /缺少新版查询/);
});
