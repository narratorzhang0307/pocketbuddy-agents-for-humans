// Shared by prepare, Xcode and installation. No git state or provider secrets are used.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONTRACT = 'pocketbuddy-skill-answers/v1';
const root = fileURLToPath(new URL('../../', import.meta.url));
export const SOURCE_INPUTS = ['src', 'frost-agent', 'native', 'server', 'scripts/ios', 'scripts/hardware', 'scripts/verify-avatar-assets.mjs', 'deploy/pocketbuddy',
  'agents/hospital_agent_example/data/skills/skills_index.json', 'agents/hospital_agent_example/data/skills/skills.json',
  'vendor/legacy-city/src', 'vendor/her-motion', 'lianlema-portable/app_project/app/src',
  'lianlema-portable/app_project/app/App.tsx', 'lianlema-portable/app_project/app/app.config.js',
  'lianlema-portable/app_project/app/package.json', 'lianlema-portable/app_project/app/package-lock.json',
  'public', 'ios/App/App', 'ios/App/App.xcodeproj/project.pbxproj', 'ios/App/CapApp-SPM/Package.swift',
  'ios/App/CapApp-SPM/Sources', 'ios/debug.xcconfig',
  'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved',
  'package.json', 'package-lock.json', 'tsconfig.json', 'vite.pocketbuddy.config.ts', 'capacitor.config.ts', 'index.html'];
const ignored = new Set(['node_modules', '.git', '.build', 'dist', 'xcuserdata', '.DS_Store']);
const generatedNative = new Set(['ios/App/App/public', 'ios/App/App/capacitor.config.json', 'ios/App/App/config.xml']);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function fileHashes(directory, selections = ['.'], source = false) {
  const files = {};
  function visit(relative, parents = new Set()) {
    const name = path.basename(relative);
    if (ignored.has(name) || name.startsWith('._') || (source && (generatedNative.has(relative) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(name)))
      || (!source && relative === 'ios-build.json')) return;
    const file = path.join(directory, relative);
    if (!existsSync(file)) throw new Error(`构建输入缺失：${relative}`);
    if (statSync(file).isDirectory()) {
      const real = realpathSync(file);
      if (parents.has(real)) throw new Error(`循环目录链接：${relative}`);
      const next = new Set([...parents, real]);
      for (const entry of readdirSync(file).sort()) visit(relative === '.' ? entry : `${relative}/${entry}`, next);
    } else files[relative] = sha256(readFileSync(file));
  }
  for (const selection of selections) visit(selection);
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
}
const digest = files => sha256(JSON.stringify(files));
export const sourceHashes = (directory = root) => fileHashes(directory, SOURCE_INPUTS, true);
function sameFiles(expected, actual, label) {
  const changed = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].filter(key => expected[key] !== actual[key]);
  if (changed.length) throw new Error(`${label}已过期或被替换（${changed.slice(0, 5).join('、')}）；必须从当前源码重新运行 npm run ios:prepare，禁止安装旧包。`);
}
export function verifyAnswerBundle(webDir) {
  const assets = path.join(webDir, 'assets');
  for (const [prefix, markers] of [
    ['frostConversation-', ['frost.skill_answer', 'skill-answer:', 'frost.outdoor-window']],
    ['frostCompanion-', ['speakAnswer', 'requestFrostVoice']],
    ['frostVoice-', ['/api/frost-voice/tts', 'pcm_s16le']],
  ]) {
    const files = readdirSync(assets).filter(file => file.startsWith(prefix) && file.endsWith('.js'));
    if (files.length !== 1 || !markers.every(marker => readFileSync(path.join(assets, files[0]), 'utf8').includes(marker)))
      throw new Error(`缺少新版查询→Qwen→MiniMax→BLE 构建入口：${prefix}；拒绝旧版或混合包。`);
  }
}
export function sealPrepared(directory, before, metadata) {
  const after = sourceHashes(directory);
  sameFiles(before, after, '构建期间源码');
  const webDir = path.join(directory, 'ios/App/App/public');
  verifyAnswerBundle(webDir);
  const assets = fileHashes(webDir);
  const manifest = { ...metadata, contract: CONTRACT, builtAt: new Date().toISOString(),
    sourceSha256: digest(after), assetsSha256: digest(assets) };
  writeFileSync(path.join(webDir, 'ios-build.json'), JSON.stringify(manifest, null, 2) + '\n');
  const stateDir = path.join(directory, '.ios-build');
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(path.join(stateDir, 'prepared.json'), JSON.stringify({ root: realpathSync(directory), manifest, sources: after, assets }, null, 2) + '\n');
  return manifest;
}
export function verifyPrepared(directory = root, webDir = path.join(directory, 'ios/App/App/public')) {
  const statePath = path.join(directory, '.ios-build/prepared.json');
  if (!existsSync(statePath)) throw new Error('缺少当前源码的构建凭据；请先运行 npm run ios:prepare，不能从旧工程直接签名。');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  if (state.root !== realpathSync(directory)) throw new Error('禁止使用复制的旧工程；请回到构建凭据指定的正式源码目录。');
  const manifest = JSON.parse(readFileSync(path.join(webDir, 'ios-build.json'), 'utf8'));
  if (manifest.contract !== CONTRACT || JSON.stringify(manifest) !== JSON.stringify(state.manifest)) throw new Error('安装包不是本次准备的版本；禁止旧包或手工替换的构建标记。');
  sameFiles(state.sources, sourceHashes(directory), '源码');
  sameFiles(state.assets, fileHashes(webDir), '网页资源');
  verifyAnswerBundle(webDir);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const manifest = verifyPrepared(root, process.argv[2] ? path.resolve(process.argv[2]) : undefined);
    console.log(`OK ${CONTRACT} · source ${manifest.sourceSha256.slice(0, 12)} · assets ${manifest.assetsSha256.slice(0, 12)}`);
  } catch (error) { console.error(`error: ${error.message}`); process.exitCode = 1; }
}
