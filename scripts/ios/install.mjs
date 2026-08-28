// Current source -> prepared assets -> signed app -> verified installation.
// Never accepts a prebuilt .app or a copied Xcode project.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPrepared } from './provenance.mjs';
import { verifyPackagedAppIcon } from './verify-app-icon.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
function option(name) { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; }
const device = option('--device');
if (!device || device.startsWith('--')) throw new Error('用法：npm run ios:install -- --device <CoreDevice ID> [--prepared]');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--device') i++;
  else if (args[i] !== '--prepared') throw new Error(`未知参数：${args[i]}；不允许传入旧 App 或旧工程。`);
}
const env = { ...process.env, NODE_BINARY: process.execPath };
const ssd = '/Volumes/PocketBuddy-iOS-Dev';
if (!env.DEVELOPER_DIR && existsSync(`${ssd}/Xcode.app`)) env.DEVELOPER_DIR = `${ssd}/Xcode.app/Contents/Developer`;
const output = existsSync(ssd) ? `${ssd}/Current` : path.join(root, '.ios-build/current');
mkdirSync(path.join(root, '.ios-build'), { recursive: true });
const lock = path.join(root, '.ios-build/install.lock');
try { mkdirSync(lock); } catch { throw new Error('正式安装流程正在运行；不要并行构建/安装。若进程已退出，请核对后清理 .ios-build/install.lock。'); }
const run = (command, commandArgs) => {
  const result = spawnSync(command, commandArgs, { cwd: root, env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${path.basename(command)} 失败（${result.status}），停止安装。`);
};
const node = (file, extra = []) => run(process.execPath, [file, ...extra]);
function installedVersion(receipt) {
  run('xcrun', ['devicectl', 'device', 'info', 'apps', '--device', device,
    '--filter', "bundleIdentifier == 'art.throughtheglass.pocketbuddy'", '--json-output', receipt]);
  const apps = JSON.parse(readFileSync(receipt, 'utf8')).result.apps;
  if (!Array.isArray(apps)) throw new Error('不能核实当前已装版本，未继续覆盖安装。');
  return String(apps.find(app => app.bundleIdentifier === 'art.throughtheglass.pocketbuddy')?.bundleVersion || '0');
}
try {
  mkdirSync(output, { recursive: true });
  const previous = installedVersion(path.join(output, 'device-before.json'));
  if (!/^\d+$/.test(previous)) throw new Error('已装版本不是数字，需核对版本号后再安装。');
  const now = new Date();
  const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const version = String(Math.max(Number(previous) + 1, Number(`${day}01`)));
  node('node_modules/typescript/bin/tsc', ['--noEmit', '--incremental', '--tsBuildInfoFile', '.ios-build/typecheck.tsbuildinfo']);
  node('--test', ['scripts/ios/provenance.test.mjs']);
  node('node_modules/vitest/vitest.mjs', ['run', 'src/app/lib/frostConversation.test.ts', 'src/app/lib/frostSkillAnswer.test.ts',
    'src/app/lib/frostCompanionVoice.test.ts', 'src/app/lib/frostVoice.test.ts', 'server/minimax-voice.test.ts', '--reporter=dot']);
  if (!args.includes('--prepared')) node('scripts/ios/prepare.mjs');
  const prepared = verifyPrepared(root);
  const derived = path.join(output, 'DerivedData');
  run('xcrun', ['xcodebuild', '-quiet', '-project', path.join(root, 'ios/App/App.xcodeproj'), '-scheme', 'App',
    '-configuration', 'Debug', '-destination', 'generic/platform=iOS', '-derivedDataPath', derived,
    '-allowProvisioningUpdates', `CURRENT_PROJECT_VERSION=${version}`, 'ENABLE_USER_SCRIPT_SANDBOXING=NO', 'build']);
  const product = path.join(derived, 'Build/Products/Debug-iphoneos/App.app');
  const built = verifyPrepared(root, path.join(product, 'public'));
  verifyPackagedAppIcon(root, product);
  if (built.sourceSha256 !== prepared.sourceSha256 || built.assetsSha256 !== prepared.assetsSha256)
    throw new Error('原生编译期间另一次准备替换了输入，拒绝混合安装包；请重新构建。');
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', product]);
  const buildDir = path.join(output, `build-${version}`);
  if (existsSync(buildDir)) throw new Error(`版本产物已存在：${buildDir}；不覆盖未知产物。`);
  mkdirSync(buildDir);
  const app = path.join(buildDir, 'App.app');
  cpSync(product, app, { recursive: true, dereference: true });
  verifyPrepared(root, path.join(app, 'public'));
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  const nowInstalled = installedVersion(path.join(buildDir, 'device-preinstall.json'));
  if (Number(nowInstalled) >= Number(version)) throw new Error('手机已装入同号或更新版本，拒绝覆盖；请重新从当前源码构建。');
  const receipt = path.join(buildDir, 'device-install.json');
  run('xcrun', ['devicectl', 'device', 'install', 'app', '--device', device, '--json-output', receipt, app]);
  const installed = installedVersion(path.join(buildDir, 'device-after.json'));
  if (installed !== version) throw new Error(`安装回读不一致：预期 ${version}，实际 ${installed}。`);
  const latest = { app, version, installedAt: new Date().toISOString(), device, ...prepared };
  writeFileSync(path.join(root, '.ios-build/latest.json'), JSON.stringify(latest, null, 2) + '\n');
  writeFileSync(path.join(output, 'latest.json'), JSON.stringify(latest, null, 2) + '\n');
  console.log(`已验证覆盖安装 ${version}：${app}。未卸载或清除用户数据；真人录音/听到播报仍需实测。`);
} finally { rmSync(lock, { recursive: true, force: true }); }
