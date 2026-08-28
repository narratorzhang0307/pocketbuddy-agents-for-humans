import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { verifyFrostSkillsBundle } from './verify-frost-skills.mjs';
import { verifyPrepared } from './provenance.mjs';
import { verifyCanvasWeb } from './verify-skill-canvas.mjs';
import { verifySourceAppIcon } from './verify-app-icon.mjs';

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
try { verifyCanvasWeb(root, path.join(root, 'ios/App/App/public')); check(true, '唯一新版技能画布、源码指纹与素材一致，无旧版残留'); }
catch (error) { check(false, error.message); }
try { verifyPrepared(root); check(true, '当前源码、网页包、查询问答和 MiniMax 播报入口一致'); }
catch (error) { check(false, error.message); }
check(project.includes('check-xcode-assets.sh'), 'Xcode 编译入口强制执行源码/资源过期检查');
try {
  verifyFrostSkillsBundle(path.join(root, 'ios/App/App/public'));
  check(true, 'Frost 快捷 Skills 使用新版折叠栏，且没有旧页面分包');
} catch (error) {
  check(false, error.message);
}
const coachIndex = read('ios/App/App/public/lianlema/index.html');
const hospitalBundles = readdirSync(path.join(root, 'ios/App/App/public/assets')).filter(name => /^HospitalAgentPage-[\w-]+\.js$/.test(name));
const hospitalCode = hospitalBundles.map(name => readFileSync(path.join(root, 'ios/App/App/public/assets', name), 'utf8')).join('\n');
check(hospitalBundles.length === 1 && ['data-hospital-qwen', 'subagent:hospital-agent', '同意并发送给 Qwen'].every(marker => hospitalCode.includes(marker))
  && !['后端连接', '部署接入说明', 'HOSPITAL_AGENT_BASE_URL'].some(marker => hospitalCode.includes(marker)),
  '医院 Agent 使用现有 Qwen 旗舰路由，无旧部署设置面板');
const photoBundles = readdirSync(path.join(root, 'ios/App/App/public/assets')).filter(name => /^FoodPhotosTab-[\w-]+\.js$/.test(name));
const photoCode = photoBundles.map(name => readFileSync(path.join(root, 'ios/App/App/public/assets', name), 'utf8')).join('\n');
check(photoBundles.length === 1 && ['preview-only', '移除示例', '恢复餐食示例预览', '餐食记录示例', '非 SAM 分割结果'].every(marker => photoCode.includes(marker)),
  'Photos 包含可移除/恢复的独立示例预览，不能漏带或退回旧空白页');
for (const name of ['cobb-bowl', 'omelette-fruit', 'strawberry-salad', 'salmon-asparagus']) {
  const relative = `assets/food-demo/food-sense-${name}.jpg`;
  const packaged = path.join(root, 'ios/App/App/public', relative);
  check(existsSync(packaged) && readFileSync(packaged).equals(readFileSync(path.join(root, 'public', relative))), `Photos 示例图片与当前资源一致：${name}`);
}
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
check(controller.includes('bridge?.registerPluginInstance(PocketPresencePlugin())'), '主界面注册桌面伙伴原生桥');
check(project.includes('art.throughtheglass.pocketbuddy.companion') && project.includes('Embed App Extensions'), 'App 内嵌独立 WidgetKit 扩展');
check(plist.includes('NSSupportsLiveActivities') && plist.includes('pocketbuddy'), '实时活动声明与桌面点击回到 App 的 URL scheme');
const presenceState = read('native/frost-presence/PocketPresenceState.swift');
const presenceWidget = read('native/frost-presence/PocketCompanionWidget.swift');
const presenceEntitlements = read('native/frost-presence/Presence.entitlements');
for (const file of [healthEntitlements, presenceState, presenceEntitlements]) {
  check(file.includes('group.art.throughtheglass.pocketbuddy'), 'App 与桌面组件使用相同共享容器');
}
check(presenceWidget.includes('ActivityConfiguration') && presenceWidget.includes('.systemMedium'), '包含系统中号横卡与灵动岛布局');
for (let index = 0; index <= 17; index++) {
  check(existsSync(path.join(root, `native/frost-presence/PresenceAssets/buddy-${index}.png`)), `离线组件头像 ${index}`);
}
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
for (const permission of ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSPhotoLibraryAddUsageDescription', 'NSLocationWhenInUseUsageDescription', 'NSBluetoothAlwaysUsageDescription', 'NSSpeechRecognitionUsageDescription', 'NSHealthShareUsageDescription', 'NSHealthUpdateUsageDescription']) {
  check(plist.includes(`<key>${permission}</key>`), permission);
}
check(!plist.includes('NSAllowsArbitraryLoads'), '未放开全局不安全 HTTP');
try { verifySourceAppIcon(root); check(true, '使用用户确认的小狗眨眼图标，禁止旧地球图标回退'); }
catch (error) { check(false, error.message); }
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
