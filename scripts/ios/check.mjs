import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
let failed = false;
function check(ok, message) {
  console.log(`${ok ? 'OK' : 'FAIL'} ${message}`);
  if (!ok) failed = true;
}
function read(relative) {
  const file = path.join(root, relative);
  check(existsSync(file), relative);
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}
function json(relative) {
  try { return JSON.parse(read(relative)); }
  catch { check(false, `${relative} 无有效 JSON`); return {}; }
}

const project = read('ios/App/App.xcodeproj/project.pbxproj');
const plist = read('ios/App/App/Info.plist');
const controller = read('ios/App/App/PocketBuddyViewController.swift');
const sceneDelegate = read('ios/App/App/SceneDelegate.swift');
const appDelegate = read('ios/App/App/AppDelegate.swift');
const storyboard = read('ios/App/App/Base.lproj/Main.storyboard');
const badgePlugin = read('native/frost-badge/ios/FrostBadgePlugin.swift');
const healthPlugin = read('native/frost-health/ios/FrostHealthPlugin.swift');
const healthEntitlements = read('ios/App/App/HealthKit.entitlements');
const spm = read('ios/App/CapApp-SPM/Package.swift');
const config = json('ios/App/App/capacitor.config.json');
const build = json('ios/App/App/public/ios-build.json');
const index = read('ios/App/App/public/index.html');
const coachIndex = read('ios/App/App/public/lianlema/index.html');
const coachScripts = [...coachIndex.matchAll(/<script\b[^>]*\bsrc="(\/lianlema\/[^"?#]+\.js)"/g)];
check(coachScripts.length > 0, '包含独立训练子应用的脚本入口');
const coachCode = coachScripts.map((match) => read(`ios/App/App/public${match[1]}`)).join('\n');
check(coachCode.includes('pocket-lianlema/v1') && coachCode.includes('workout-completed'), '训练页面包含真实完成结果回写协议，不能打包旧 public/lianlema');
const herMotionPackage = json('ios/App/App/public/her-motion/manifest.json');
check(herMotionPackage.app === 'HerMotion' && herMotionPackage.protocol === 'pocket-her-motion-bridge/v1', '包含真正的 Her Motion 子应用，而非主站 SPA 回退');
check(read('ios/App/App/public/her-motion/index.html').includes('Her Motion'), 'Her Motion 独立页面入口存在');
check(project.includes('art.throughtheglass.pocketbuddy'), 'Bundle ID 与现有 Pocket Buddy 一致');
check(spm.includes('CapacitorPhotoLibrary'), 'SPM 包含现有照片库插件');
check(controller.includes('bridge?.registerPluginInstance(FrostBadgePlugin())'), '主界面注册原生 FrostBadge 插件');
check(controller.includes('bridge?.registerPluginInstance(FrostHealthPlugin())'), '主界面注册只读 FrostHealth 步数插件');
check(healthPlugin.includes('toShare: []') && healthPlugin.includes('.stepCount') && healthPlugin.includes('HKStatisticsQuery'), '健康插件只请求步数读取，不写入 HealthKit');
check(healthEntitlements.includes('com.apple.developer.healthkit') && project.includes('CODE_SIGN_ENTITLEMENTS = App/HealthKit.entitlements;'), '编译配置包含 HealthKit entitlement（真机仍须签名授权与用户授权）');
check(appDelegate.includes('config.delegateClass = SceneDelegate.self'), 'App 使用已检查的 SceneDelegate');
check(/rootViewController\s*=\s*PocketBuddyViewController\(\)/.test(sceneDelegate)
  && !/rootViewController\s*=\s*CAPBridgeViewController\(\)/.test(sceneDelegate), '实际 Scene 入口使用注册插件的控制器，不能绕回默认桥');
check(storyboard.includes('customClass="PocketBuddyViewController"') && storyboard.includes('customModule="App"'), 'Storyboard 使用已注册插件的桥接控制器');
check(badgePlugin.includes('jsName = "FrostBadge"') && project.includes('../../native/frost-badge/ios/FrostBadgePlugin.swift'), '复用同一份 FrostBadge Swift 源码');
check(badgePlugin.includes('request.requiresOnDeviceRecognition = true') && badgePlugin.includes('recognizer.supportsOnDeviceRecognition'), '吧唧 ASR 强制本机识别且检查支持性，不回退云端');
for (const source of ['SceneDelegate.swift', 'PocketBuddyViewController.swift', 'FrostBadgePlugin.swift', 'FrostHealthPlugin.swift']) {
  const sourcesPhase = project.split('/* Begin PBXSourcesBuildPhase section */')[1]?.split('/* End PBXSourcesBuildPhase section */')[0] ?? '';
  check(sourcesPhase.includes(`${source} in Sources`), `App 编译目标包含 ${source}`);
}
check(config.webDir === 'dist-ios' && !config.server?.url, '使用独立本地资源包，不是远端网页壳');
check(config.plugins?.CapacitorHttp?.enabled !== true, '保留 WebKit fetch 流式响应与取消能力');
check(build.platform === 'ios' && build.apiOrigin?.startsWith('https://'), '构建记录包含 iOS API origin');
check(/<script[^>]+src="[^\"]+\.js"/.test(index), 'HTML 包含构建后的应用入口');
for (const permission of ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSPhotoLibraryAddUsageDescription', 'NSLocationWhenInUseUsageDescription', 'NSBluetoothAlwaysUsageDescription', 'NSSpeechRecognitionUsageDescription', 'NSHealthShareUsageDescription']) {
  check(plist.includes(`<key>${permission}</key>`), permission);
}
check(!plist.includes('NSAllowsArbitraryLoads'), '未放开全局不安全 HTTP');
const appIcon = path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
const productIcon = path.join(root, 'public/icons/icon-1024.png');
check(existsSync(appIcon) && existsSync(productIcon) && readFileSync(appIcon).equals(readFileSync(productIcon)), '使用现有产品图标');
for (const match of index.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)) {
  const file = path.join(root, 'ios/App/App/public', match[1]);
  check(existsSync(file) && statSync(file).size > 0, `入口资源 ${match[1]}`);
}

if (process.platform === 'darwin') {
  const lint = spawnSync('/usr/bin/plutil', ['-lint', path.join(root, 'ios/App/App/Info.plist'), path.join(root, 'ios/App/App.xcodeproj/project.pbxproj')], { encoding: 'utf8' });
  check(lint.status === 0, 'Apple plist / Xcode 工程语法检查');
  if (lint.status !== 0) console.log(lint.stdout || lint.stderr);
}

if (!process.argv.includes('--assets-only')) {
  check(process.platform === 'darwin', '原生编译需要 macOS');
  const version = spawnSync('xcodebuild', ['-version'], { encoding: 'utf8' });
  const major = Number(version.stdout?.match(/Xcode (\d+)/)?.[1]);
  check(version.status === 0 && major >= 26, '安装并选择完整 Xcode 26+（Command Line Tools 不够）');
  if (version.status === 0) {
    const sdk = spawnSync('xcrun', ['--sdk', 'iphoneos', '--show-sdk-version'], { encoding: 'utf8' });
    check(sdk.status === 0 && Number(sdk.stdout?.trim().split('.')[0]) >= 26, 'iOS 26+ SDK（App Store Connect 上传要求）');
  }
  console.log('注意：此检查不等于编译/签名通过；Team、证书、会员激活及 TestFlight 权限需在 Xcode/苹果后台确认。');
}
if (failed) process.exitCode = 1;
