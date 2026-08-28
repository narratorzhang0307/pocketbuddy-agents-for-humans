import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error ESM shared with Vite, iOS and Android builds.
import { CANVAS_ART, CANVAS_EDITOR, CANVAS_RELEASE, skillCanvasReleasePlugin, verifyCanvasSource, verifyCanvasWeb } from '../../scripts/ios/verify-skill-canvas.mjs';

const fixtures: string[] = [];
const source = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8');
afterEach(() => { for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const write = (root: string, file: string, text: string) => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
};

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'canvas-build-')); fixtures.push(root);
  for (const file of [CANVAS_EDITOR, 'src/app/components/SkillCanvasPage.tsx', 'src/app/components/PlazaTab.tsx',
    'src/app/data/skillAvatarCatalog.ts', 'frost-agent/skill-canvas/contracts.ts', 'frost-agent/skill-canvas/compiler.ts',
    'frost-agent/skill-canvas/store.ts', 'scripts/ios/verify-skill-canvas.mjs']) write(root, file, source(file));
  const web = path.join(root, 'web');
  for (const file of CANVAS_ART) { write(root, `public/${file}`, file); write(web, file, file); }
  const entry = 'assets/index-current.js', editor = 'assets/SkillCanvasEditor-current.js';
  write(web, 'index.html', `<script type="module" src="/${entry}"></script>`);
  write(web, entry, `import('./SkillCanvasEditor-current.js');`);
  write(web, editor, `${CANVAS_RELEASE} editorial-line-art-v1/ 01 · 定义目标 04 · 选择技能形象`);
  const bundle = {
    [entry]: { type: 'chunk', fileName: entry, isEntry: true, moduleIds: [] },
    [editor]: { type: 'chunk', fileName: editor, isEntry: false, moduleIds: [path.join(root, CANVAS_EDITOR)] },
  };
  const plugin = skillCanvasReleasePlugin(root);
  plugin.configResolved(); plugin.buildStart();
  const seal = () => plugin.writeBundle.handler({ dir: web }, bundle);
  seal();
  return { root, web, entry, editor, seal, bundle };
}

describe('技能画布构建必须失败关闭', () => {
  it('校验正式源码；新分包、素材与入口都绑定到当前源码', () => {
    expect(verifyCanvasSource(process.cwd()).release).toBe(CANVAS_RELEASE);
    const { root, web } = fixture();
    expect(verifyCanvasWeb(root, web).release).toBe(CANVAS_RELEASE);
  });

  it.each(['SkillCanvasTab.tsx', 'SkillDeckBuilder.tsx', 'SkillDeckBuilder.css'])('拒绝恢复旧源码 %s', name => {
    const { root } = fixture(); write(root, `src/app/components/${name}`, 'old');
    expect(() => verifyCanvasSource(root)).toThrow('旧画布文件仍存在');
  });

  it.each(['SkillCanvasTab-old.js', 'SkillDeckBuilder-old.css'])('即使新入口正确也拒绝残留旧分包 %s', name => {
    const { root, web } = fixture(); write(web, `assets/${name}`, 'retired');
    expect(() => verifyCanvasWeb(root, web)).toThrow('残留旧分包');
  });

  it('旧波浪 CSS 改名也不能混入新包', () => {
    const { root, web } = fixture(); write(web, 'assets/renamed.css', '.sdb-mini-art { display: block; }');
    expect(() => verifyCanvasWeb(root, web)).toThrow('混入旧波浪卡片');
  });

  it('不能只复制一个新版版本号骗过校验', () => {
    const { root, web, editor } = fixture(); write(web, editor, CANVAS_RELEASE);
    expect(() => verifyCanvasWeb(root, web)).toThrow('分包被替换或过期');
  });

  it('源码变化后禁止使用先前资源', () => {
    const { root, web } = fixture(); write(root, CANVAS_EDITOR, `${source(CANVAS_EDITOR)}\n// changed`);
    expect(() => verifyCanvasWeb(root, web)).toThrow('资源包已过期');
  });

  it('构建过程中变化也不盖上新时间戳', () => {
    const { root, seal } = fixture(); write(root, CANVAS_EDITOR, `${source(CANVAS_EDITOR)}\n// changed`);
    expect(seal).toThrow('构建期间画布源码发生变化');
  });

  it('HTML 换回旧入口时拒绝通过', () => {
    const { root, web } = fixture(); write(web, 'index.html', '<script src="/assets/old.js"></script>');
    expect(() => verifyCanvasWeb(root, web)).toThrow('HTML 指向错误入口');
  });

  it('缺少素材或凭据直接失败，不使用其他目录兜底', () => {
    const { root, web } = fixture();
    rmSync(path.join(web, CANVAS_ART[0]));
    expect(() => verifyCanvasWeb(root, web)).toThrow();
    rmSync(path.join(web, 'skill-canvas-release.json'));
    expect(() => verifyCanvasWeb(root, web)).toThrow('缺少新版画布凭据');
  });

  it('Vite、iOS 和直接 Gradle 构建均接入检查', () => {
    expect(source('vite.pocketbuddy.config.ts')).toContain('plugins: [skillCanvasReleasePlugin(__dirname)');
    expect(source('scripts/ios/check.mjs')).toContain("verifyCanvasWeb(root, path.join(root, 'ios/App/App/public'))");
    expect(source('android/app/build.gradle')).toContain("dependsOn 'verifyApprovedSkillCanvas'");
    expect(source('public/sw.js')).toContain('pb-v4-approved-skill-canvas');
    expect(source('public/sw.js')).toContain('status: 410');
  });
});
