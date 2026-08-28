// A release is always rebuilt from this working tree, never from an old .app,
// copied project, or a partially overlaid release directory. Does not upload.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPrepared } from './provenance.mjs';
import { verifyCanvasWeb } from './verify-skill-canvas.mjs';
import { verifyFrostSkillsBundle } from './verify-frost-skills.mjs';
import { verifyBirdApp } from '../hardware/check-bird-release.mjs';
import { verifyPackagedAppIcon } from './verify-app-icon.mjs';

const root = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--build-number' || !/^[1-9]\d{0,17}$/.test(args[1])) {
  throw new Error('用法：node scripts/ios/archive.mjs --build-number <已核对未使用的构建号>；不接受旧工程、旧包或跳过全量准备。');
}
if (process.platform !== 'darwin') throw new Error('正式 iOS 归档需要 macOS 和完整 Xcode。');
const version = args[1];
const stateDir = path.join(root, '.ios-build');
mkdirSync(stateDir, { recursive: true });
// Shared with ios:install: only one workflow may prepare the native Web bundle.
const lock = path.join(stateDir, 'install.lock');
try { mkdirSync(lock); }
catch { throw new Error('另一个 iOS 构建/安装仍持有锁；请先协调完成，不覆盖共享资源。'); }
const owner = path.join(lock, 'archive-owner.json');
const env = { ...process.env, NODE_BINARY: process.execPath };
const ssd = '/Volumes/PocketBuddy-iOS-Dev';
if (!env.DEVELOPER_DIR && existsSync(`${ssd}/Xcode.app`)) env.DEVELOPER_DIR = `${ssd}/Xcode.app/Contents/Developer`;
const run = (command, commandArgs, capture = false) => {
  const result = spawnSync(command, commandArgs, { cwd: root, env, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} 失败（${result.status}），停止归档。${capture ? `\n${result.stderr || result.stdout}` : ''}`);
  return result.stdout;
};
const node = (file, extra = []) => run(process.execPath, [file, ...extra]);
const plistValue = (file, key) => run('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', file], true).trim();
try {
  const parent = existsSync(ssd) ? path.join(ssd, 'Current/Releases') : path.join(stateDir, 'releases');
  mkdirSync(parent, { recursive: true });
  const output = mkdtempSync(path.join(parent, `${version}-`));
  const temp = path.join(output, 'tmp');
  mkdirSync(temp);
  env.TMPDIR = `${temp}/`;
  writeFileSync(owner, JSON.stringify({ pid: process.pid, root, version, output, startedAt: new Date().toISOString() }, null, 2) + '\n');
  console.log(`全量归档源码：${root}\n本次独立产物：${output}`);
  node('node_modules/typescript/bin/tsc', ['--noEmit']);
  run(process.execPath, ['--test', 'scripts/ios/provenance.test.mjs', 'scripts/ios/verify-app-icon.test.mjs']);
  // Intentionally no --prepared/--web-only: rebuild child apps, all public files,
  // Swift dependencies, Capacitor configuration and the actual native Web bundle.
  node('scripts/ios/prepare.mjs');
  const prepared = verifyPrepared(root);
  const archive = path.join(output, `PocketBuddy-${version}.xcarchive`);
  run('xcrun', ['xcodebuild', '-quiet', '-project', path.join(root, 'ios/App/App.xcodeproj'), '-scheme', 'App',
    '-configuration', 'Release', '-destination', 'generic/platform=iOS',
    '-derivedDataPath', path.join(output, 'DerivedData'), '-clonedSourcePackagesDirPath', path.join(output, 'SourcePackages'),
    '-archivePath', archive, '-resultBundlePath', path.join(output, 'Archive.xcresult'),
    '-allowProvisioningUpdates', `CURRENT_PROJECT_VERSION=${version}`, 'ENABLE_USER_SCRIPT_SANDBOXING=NO', 'archive']);
  const app = path.join(archive, 'Products/Applications/App.app');
  const web = path.join(app, 'public');
  verifyPrepared(root, web);
  verifyCanvasWeb(root, web);
  verifyFrostSkillsBundle(web);
  verifyBirdApp(root, app);
  verifyPackagedAppIcon(root, app);
  for (const bundle of [app, path.join(app, 'PlugIns/PocketCompanion.appex')]) {
    if (plistValue(path.join(bundle, 'Info.plist'), 'CFBundleVersion') !== version) throw new Error(`构建号不一致：${bundle}`);
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
  }
  for (let index = 0; index <= 17; index++) {
    const name = `buddy-${index}.png`;
    if (!readFileSync(path.join(root, 'native/frost-presence/PresenceAssets', name))
      .equals(readFileSync(path.join(app, 'PlugIns/PocketCompanion.appex/PresenceAssets', name)))) {
      throw new Error(`桌面组件头像不是当前源码：${name}`);
    }
  }
  const receipt = { root, version, archive, app, verifiedAt: new Date().toISOString(), ...prepared,
    fullPrepare: true, freshDerivedData: true, uploaded: false };
  writeFileSync(path.join(output, 'release.json'), JSON.stringify(receipt, null, 2) + '\n');
  writeFileSync(path.join(stateDir, 'latest-archive.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(`归档通过：${archive}\n源码 ${prepared.sourceSha256}\n资源 ${prepared.assetsSha256}\n尚未上传；上传前须再次核验本次归档，不能替换为旧包。`);
} finally {
  if (existsSync(owner)) unlinkSync(owner);
  rmdirSync(lock);
}
