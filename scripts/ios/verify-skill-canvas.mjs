import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CANVAS_RELEASE = 'editorial-eaffa7f-v1';
export const CANVAS_EDITOR = 'src/app/components/SkillCanvasEditor.tsx';
const sourceFiles = [CANVAS_EDITOR, 'src/app/components/SkillCanvasPage.tsx',
  'src/app/components/PlazaTab.tsx', 'src/app/data/skillAvatarCatalog.ts',
  'src/app/lib/skillTaskmasterRuntime.ts', 'src/app/lib/skillCanvasPose.ts',
  'frost-agent/skill-canvas/contracts.ts', 'frost-agent/skill-canvas/compiler.ts',
  'frost-agent/skill-canvas/store.ts', 'frost-agent/skill-taskmaster/contracts.ts',
  'frost-agent/skill-taskmaster/runtime.ts', 'scripts/ios/verify-skill-canvas.mjs'];
const artNames = ['01-manual-trigger', '02-location-input', '03-health-summary', '04-semantic-decision',
  '05-pose-recognition', '06-safety-gate', '07-voice-notification', '08-evidence-store'];
const avatarNames = ['trigger-chicken', 'location-giraffe', 'health-tiger', 'semantic-owl',
  'pose-rabbit', 'safety-bear', 'voice-cat', 'evidence-elephant'];
export const CANVAS_ART = [
  ...artNames.map(name => `assets/skill-cards/editorial-line-art-v1/${name}.png`),
  ...avatarNames.map(name => `assets/skill-cards/city-agent-avatars/${name}.png`),
];
const legacyCode = ['sdb-builder', 'sdb-mini-art', '把能力放进画布', '把草图变成任务'];
const requiredCode = [CANVAS_RELEASE, 'editorial-line-art-v1/', '01 · 定义目标', '04 · 选择技能形象',
  'adapter-registry-v1'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const requireThat = (ok, message) => { if (!ok) throw Error(`技能画布构建拒绝：${message}`); };
const read = file => readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));
const assetFile = file => /^assets\/[A-Za-z0-9_.-]+\.js$/.test(file);

export function verifyCanvasSource(root) {
  const components = path.join(root, 'src/app/components');
  for (const name of readdirSync(components)) {
    requireThat(!/^(SkillCanvasTab|SkillDeckBuilder)\.(tsx?|jsx?|css)$/.test(name), `旧画布文件仍存在：${name}`);
  }
  const code = read(path.join(root, CANVAS_EDITOR));
  requireThat(requiredCode.every(marker => code.includes(marker)), '不是用户确认的线稿画布');
  requireThat(!legacyCode.some(marker => code.includes(marker)), '新版文件中混入旧波浪卡片');
  const page = read(path.join(components, 'SkillCanvasPage.tsx'));
  const plaza = read(path.join(components, 'PlazaTab.tsx'));
  requireThat(page.includes("import('./SkillCanvasEditor')") && page.includes('CanvasBoundary'), '必须只加载新版并在失败时关闭页面');
  requireThat(plaza.includes("from './SkillCanvasPage'") && plaza.includes('<SkillCanvasPage ')
    && !plaza.includes('SkillCanvasTab'), '正式 Plaza 入口仍指向旧画布');
  const sources = Object.fromEntries(sourceFiles.map(file => [file, sha(readFileSync(path.join(root, file)))]));
  const assets = Object.fromEntries(CANVAS_ART.map(file => [file, sha(readFileSync(path.join(root, 'public', file)))]));
  return { release: CANVAS_RELEASE, sourceSha256: sha(JSON.stringify({ sources, assets })), assets };
}

function scanLegacy(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { scanLegacy(file); continue; }
    if (!/\.(js|css)$/.test(entry.name)) continue;
    requireThat(!/^(SkillCanvasTab|SkillDeckBuilder)[.-]/.test(entry.name), `残留旧分包 ${entry.name}`);
    requireThat(!legacyCode.some(marker => read(file).includes(marker)), `混入旧波浪卡片代码 ${entry.name}`);
  }
}

export function verifyCanvasWeb(root, webDir) {
  const source = verifyCanvasSource(root);
  const manifestFile = path.join(webDir, 'skill-canvas-release.json');
  requireThat(existsSync(manifestFile), '缺少新版画布凭据，请从正式源码重新构建');
  const stamp = json(manifestFile);
  requireThat(stamp.release === source.release && stamp.sourceSha256 === source.sourceSha256, '画布源码或素材已变化，资源包已过期');
  requireThat(Array.isArray(stamp.entries) && stamp.entries.length > 0 && Array.isArray(stamp.chunks), '构建凭据不完整');
  const scripts = [...read(path.join(webDir, 'index.html')).matchAll(/<script\b[^>]*\bsrc="([^"?#]+\.js)"/g)]
    .map(match => match[1].replace(/^\//, ''));
  requireThat(scripts.length === stamp.entries.length && stamp.entries.every(entry => scripts.includes(entry)), 'HTML 指向错误入口');
  const code = new Map();
  for (const chunk of stamp.chunks) {
    requireThat(assetFile(chunk.file), '非法分包路径');
    const bytes = readFileSync(path.join(webDir, chunk.file));
    requireThat(sha(bytes) === chunk.sha256, `分包被替换或过期：${chunk.file}`);
    code.set(chunk.file, bytes.toString('utf8'));
  }
  requireThat(stamp.entries.every(entry => code.has(entry)) && code.has(stamp.editor), '入口或画布未纳入分包校验');
  requireThat(requiredCode.every(marker => code.get(stamp.editor).includes(marker)), '实际画布分包不是确认版');
  for (const [file, hash] of Object.entries(source.assets)) {
    requireThat(sha(readFileSync(path.join(webDir, file))) === hash, `缺失或错配的画布素材 ${file}`);
  }
  scanLegacy(path.join(webDir, 'assets'));
  return { release: source.release, sourceSha256: source.sourceSha256, webDir };
}

export function skillCanvasReleasePlugin(root) {
  let source;
  return {
    name: 'pocketbuddy-approved-skill-canvas',
    configResolved() { verifyCanvasSource(root); },
    buildStart() { source = verifyCanvasSource(root); },
    writeBundle: {
      order: 'post', sequential: true,
      handler(options, bundle) {
        requireThat(verifyCanvasSource(root).sourceSha256 === source.sourceSha256, '构建期间画布源码发生变化');
        const chunks = Object.values(bundle).filter(item => item.type === 'chunk');
        const editor = chunks.filter(chunk => chunk.moduleIds.includes(path.resolve(root, CANVAS_EDITOR)));
        requireThat(editor.length === 1, '没有唯一的新版画布执行入口');
        const webDir = path.resolve(root, options.dir);
        const stamp = { release: source.release, sourceSha256: source.sourceSha256,
          editor: editor[0].fileName, entries: chunks.filter(chunk => chunk.isEntry).map(chunk => chunk.fileName),
          chunks: chunks.map(chunk => ({ file: chunk.fileName, sha256: sha(readFileSync(path.join(webDir, chunk.fileName))) })) };
        writeFileSync(path.join(webDir, 'skill-canvas-release.json'), JSON.stringify(stamp, null, 2) + '\n');
        verifyCanvasWeb(root, webDir);
      },
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[3] ? path.resolve(process.argv[3]) : fileURLToPath(new URL('../../', import.meta.url));
  try {
    const result = process.argv[2] === '--source-only' ? verifyCanvasSource(root)
      : verifyCanvasWeb(root, path.resolve(process.argv[2] || path.join(root, 'ios/App/App/public')));
    console.log(`OK ${result.release} · ${result.sourceSha256}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
