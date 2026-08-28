import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPublicAppIcon, verifySourceAppIcon, verifyPackagedAppIcon } from './verify-app-icon.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temporary = [];
afterEach(() => { for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function fixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'pb-icon-')); temporary.push(directory);
  for (const relative of ['public/icons', 'ios/App/App/Assets.xcassets/AppIcon.appiconset']) {
    mkdirSync(path.dirname(path.join(directory, relative)), { recursive: true });
    cpSync(path.join(root, relative), path.join(directory, relative), { recursive: true });
  }
  return directory;
}
test('the approved current public and native icon set passes', () => verifySourceAppIcon(root));
test('matching public and native copies of an unapproved icon still fail', () => {
  const directory = fixture();
  writeFileSync(path.join(directory, 'public/icons/icon-1024.png'), 'old globe');
  writeFileSync(path.join(directory, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'), 'old globe');
  assert.throws(() => verifySourceAppIcon(directory), /图标回退/);
});
test('a stale small icon or missing favicon cannot pass', () => {
  const directory = fixture();
  writeFileSync(path.join(directory, 'public/icons/icon-120.png'), 'stale');
  assert.throws(() => verifyPublicAppIcon(directory), /图标回退/);
  rmSync(path.join(directory, 'public/icons/favicon-32.png'));
  assert.throws(() => verifyPublicAppIcon(directory), /缺少已确认/);
});
test('the native asset catalog cannot silently select another icon', () => {
  const directory = fixture();
  writeFileSync(path.join(directory, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json'), JSON.stringify({ images: [{ filename: 'globe.png' }] }));
  assert.throws(() => verifySourceAppIcon(directory), /资源目录/);
});
test('valid web images alone cannot authorize a missing or incorrect compiled icon', () => {
  const app = fixture();
  assert.throws(() => verifyPackagedAppIcon(root, app), /缺少已确认/);
  writeFileSync(path.join(app, 'AppIcon60x60@2x.png'), readFileSync(path.join(app, 'public/icons/icon-120.png')));
  assert.throws(() => verifyPackagedAppIcon(root, app), /图标回退/);
});
