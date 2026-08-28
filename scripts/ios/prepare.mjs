import { existsSync, readFileSync, copyFileSync, writeFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadEnv } from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
const env = { ...process.env, POCKET_BUDDY_BUILD_TARGET: 'ios' };
const settings = loadEnv('ios', root, 'VITE_');
const webOnly = process.argv.includes('--web-only');
// An incremental build may share SSD web assets with the existing native project.
// This explicit mode is only for unchanged Capacitor configuration/plugin dependencies.
const webDir = path.join(root, 'dist-ios'), nativeWebDir = path.join(root, 'ios/App/App/public');
if (webOnly && (!existsSync(webDir) || !existsSync(nativeWebDir) || realpathSync(webDir) !== realpathSync(nativeWebDir))) {
  throw new Error('--web-only 要求 dist-ios 与 iOS public 指向同一份资源，不能留下旧手机资源。');
}
const cordovaFiles = webOnly ? ['cordova.js', 'cordova_plugins.js'].map(name => ({ name,
  content: readFileSync(path.join(nativeWebDir, name)),
})) : [];

function fail(message) { console.error(message); process.exit(1); }
function run(script, args) {
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], { cwd: root, env, stdio: 'inherit' });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}

if (Number(process.versions.node.split('.')[0]) < 22) fail('Capacitor 8 要求 Node.js 22+。');
if (env.POCKET_BUDDY_LIVE_URL?.trim()) fail('请取消 POCKET_BUDDY_LIVE_URL；iOS 必须打包本地页面。');
let api;
try { api = new URL(settings.VITE_POCKET_BUDDY_API_ORIGIN?.trim() || 'https://pocketbuddy.throughtheglass.art'); }
catch { fail('VITE_POCKET_BUDDY_API_ORIGIN 不是有效 URL。'); }
if (api.protocol !== 'https:' || api.username || api.password || api.pathname !== '/' || api.search || api.hash) {
  fail('VITE_POCKET_BUDDY_API_ORIGIN 必须是无路径、无凭据的 HTTPS origin。');
}
env.VITE_POCKET_BUDDY_API_ORIGIN = api.origin;
const project = path.join(root, 'ios/App/App.xcodeproj/project.pbxproj');
if (!existsSync(project)) fail('缺少 ios/App/App.xcodeproj；请先恢复本仓库 iOS 工程，不自动覆盖未知目录。');

console.log(`准备本地 iOS 资源包（不部署、不签名、不上传）。API: ${api.origin}`);
// Vite copies public/lianlema as-is: rebuild it first so native releases cannot
// silently ship an old training page without the health-memory result bridge.
run('deploy/pocketbuddy/build-coach-web.mjs', []);
run('node_modules/vite/bin/vite.js', ['build', '--config', 'vendor/her-motion/vite.config.ts']);
run('node_modules/vite/bin/vite.js', ['build', '--config', 'vite.pocketbuddy.config.ts', '--mode', 'ios', '--outDir', 'dist-ios']);
writeFileSync(path.join(root, 'dist-ios/ios-build.json'), JSON.stringify({
  platform: 'ios',
  appId: 'art.throughtheglass.pocketbuddy',
  apiOrigin: api.origin,
  packageVersion: JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version,
}, null, 2) + '\n');
// Reuse the product icon; never ship Capacitor's template icon.
copyFileSync(path.join(root, 'public/icons/icon-1024.png'), path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
if (webOnly) {
  for (const file of cordovaFiles) writeFileSync(path.join(webDir, file.name), file.content);
  console.log('仅更新共享资源；保留既有 Capacitor 配置、插件依赖和 SSD 目录链接。');
} else run('node_modules/@capacitor/cli/bin/capacitor', ['sync', 'ios']);
run('scripts/ios/check.mjs', ['--assets-only']);
console.log('资源和工程已准备好。安装完整 Xcode 后运行 npm run ios:check，再运行 npm run ios:open。');
