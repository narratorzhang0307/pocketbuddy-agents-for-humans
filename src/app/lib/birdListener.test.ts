import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';
import { BIRD_ASSETS, birdIntent, createBirdSessionNavigation, createBirdSkillAutoStart, type BirdStatus } from './birdListener';
import { BIRD_LISTENER_SKILL } from './skill/birdListenerBuiltin';
import { validateSkillManifest } from './skill/protocol';
import { resolveSkillRunTarget } from './plaza/skillRoutes';
import { skillAvatarFor } from './skill/avatars';
import { avatarUploadPackets } from './frostAvatarCloud';
// @ts-expect-error Build-only ESM gate shared with Vite and Xcode.
import { BIRD_CATALOG, BIRD_CATALOG_SHA256, BIRD_RELEASE, verifyBirdApp, verifyBirdSource, verifyBirdWeb } from '../../../scripts/hardware/check-bird-release.mjs';

describe('bird listener contract', () => {
  it.each(['帮我识别下鸟叫', '帮我识别一下鸟声', '打开识鸟', '听一下这是什么鸟',
    '帮我打开下识别鸟类声音的agent', '打开鸟类声音识别skill', '帮我识别鸟的叫声',
    '帮我识别小鸟的声音', '进入鸟声识别', '打开鸟叫agent', '识别一下鸟类的声音',
  ])('routes %s', text => expect(birdIntent(text)).toBe('start'));
  it.each(['不要识别鸟叫', '别识鸟', '查天气', '鸟叫很好听', '鸟类的声音很好听',
    '不要打开鸟类声音识别', '别帮我识别鸟的叫声', '不用识别小鸟的声音',
  ])('does not activate for %s', text => expect(birdIntent(text)).toBeNull());
  it.each(['退出识鸟', '关闭鸟类声音识别', '停止识别鸟的叫声'])('keeps explicit exit separate: %s', text => expect(birdIntent(text)).toBe('stop'));
  it('registers the runnable skill with explicit audio/network boundaries', () => {
    expect(validateSkillManifest(BIRD_LISTENER_SKILL).permissions.tools).toEqual(['bird_identify']);
    expect(resolveSkillRunTarget('frost-bird-listener')).toBe('birdlistener');
    expect(skillAvatarFor('frost.bird-listener').badgeIndex).toBe(17);
  });
  it('uses one canonical catalog for native and web and keeps T5 species unique', () => {
    const native = JSON.parse(readFileSync('native/frost-badge/ios/BirdCatalog.json', 'utf8'));
    expect(native).toEqual(BIRD_ASSETS);
    expect(BIRD_ASSETS.map(a => a.index)).toEqual(Array.from({ length: 13 }, (_, i) => i + 17));
    expect(new Set(BIRD_ASSETS.slice(1).map(a => a.id)).size).toBe(12);
    expect(existsSync('src/app/lib/skill/birdCatalog.json')).toBe(false);
  });
  it('streams only verified small JPEGs with a CRC commit receipt', () => {
    for (const asset of BIRD_ASSETS) {
      const path = new URL(asset.jpegUrl).pathname.replace('/pocket-earth/bird-skill/20260828-v1/', 'public/assets/bird-skill/20260828/');
      const bytes = readFileSync(path);
      expect(bytes.length).toBe(asset.bytes);
      expect(bytes.length).toBeLessThanOrEqual(65536);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
      const packets = [...avatarUploadPackets(asset.index, 51, bytes, 244)];
      expect(packets.at(-1)).toMatchObject({ state: 3, value: asset.crc32 });
      expect(Buffer.concat(packets.slice(1, -1).map(p => p.data.subarray(8)))).toEqual(bytes);
    }
  });
  it('preserves each T5 background separately and returns the composed scene', async () => {
    const sceneIds = ['pet-caramel-dachshund', 'alien-02-04', 'puff', 'mossback', 'pet-corgi-koko', 'pet-violet-fluffy', 'pet-v2-001', 'pet-v2-006', 'alien-01-05', 'alien-03-04', 'alien-04-08', 'alien-06-04'];
    for (const [i, asset] of BIRD_ASSETS.slice(1).entries()) {
      expect(asset.jpegUrl).toContain('/pet-birds-v3/scenes/');
      const source = asset.source as { background?: { sceneId: string; pngSha256: string; rgbaSha256: string }; layout?: { stage: number; birdCanvas: number; birdCenterY: number } };
      expect(source.background?.sceneId).toBe(sceneIds[i]);
      expect(source.layout).toMatchObject({ stage: 466, birdCanvas: 224, birdCenterY: -10 });
      const bytes = readFileSync(`public/assets/bird-skill/20260828/t5-scenes-v2/backgrounds/${asset.id}.png`);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.background?.pngSha256);
      const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect([info.width, info.height, info.channels]).toEqual([400, 400, 4]);
      expect(createHash('sha256').update(data).digest('hex')).toBe(source.background?.rgbaSha256);
    }
  });
  it('keeps reusable birds truly transparent and lossless, separate from hardware scenes', async () => {
    for (const asset of BIRD_ASSETS.slice(1)) {
      const source = asset.source as { sprite?: { png: { url: string; sha256: string }; webp: { url: string; sha256: string } } };
      if (!source.sprite) throw Error(`Missing standalone bird: ${asset.id}`);
      const local = (url: string) => new URL(url).pathname.replace('/pocket-earth/bird-skill/20260828-v1/', 'public/assets/bird-skill/20260828/');
      const png = readFileSync(local(source.sprite.png.url));
      const webp = readFileSync(local(source.sprite.webp.url));
      expect(source.sprite.png.url).toContain('/pet-birds-v3/birds/');
      expect(createHash('sha256').update(png).digest('hex')).toBe(source.sprite.png.sha256);
      expect(createHash('sha256').update(webp).digest('hex')).toBe(source.sprite.webp.sha256);
      expect((await sharp(png).metadata()).hasAlpha).toBe(true);
      const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect([info.width, info.height, info.channels]).toEqual([1254, 1254, 4]);
      const decodedWebp = await sharp(webp).ensureAlpha().raw().toBuffer();
      // Lossless WebP may replace invisible RGB at alpha=0; visible RGB and every alpha must match.
      for (let p = 0; p < decodedWebp.length; p += 4) if (!decodedWebp[p + 3]) decodedWebp.fill(0, p, p + 3);
      expect(decodedWebp.equals(data)).toBe(true);
      let transparent = 0, edge = 0;
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        const alpha = data[(y * info.width + x) * 4 + 3];
        transparent += alpha === 0 ? 1 : 0;
        if ((!x || !y || x === info.width - 1 || y === info.height - 1) && alpha) edge++;
      }
      expect(transparent / (info.width * info.height)).toBeGreaterThan(.3);
      expect(transparent / (info.width * info.height)).toBeLessThan(.9);
      expect(edge).toBe(0);
    }
  }, 15000);
  it('retains white wing feathers without filling the real gap between shrike feet', async () => {
    // Vision originally removed these enclosed white wing regions; the shrike gap is real background.
    for (const [id, x, y, alpha] of [
      ['copsychus-saularis', 680, 608, 255],
      ['pica-serica', 744, 574, 255],
      ['lanius-schach', 774, 914, 0],
    ] as const) {
      const { data, info } = await sharp(`public/assets/bird-skill/20260828/pet-birds-v3/birds/${id}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(data[(y * info.width + x) * 4 + 3]).toBe(alpha);
    }
  });
});

describe('direct bird Skill entry', () => {
  const idle: BirdStatus = { enabled: true, active: false, busy: false, state: 'idle', message: '' };
  const connected = { status: 'connected', connectionId: 'b-board:1', endpoints: ['bird_mode_v1'], recording: false, bird: idle };

  it('opens from native status once, without replaying ASR through the main Agent', () => {
    const open = vi.fn(), show = createBirdSessionNavigation({ isActive: () => true, open });
    expect(show(idle)).toBe(false);
    expect(show({ ...idle, active: true, busy: true, state: 'loading' })).toBe(true);
    for (const state of ['ready', 'recording', 'result']) expect(show({ ...idle, active: true, state })).toBe(false);
    expect(open).toHaveBeenCalledExactlyOnceWith('frost-bird-listener');
    expect(show({ ...idle, busy: true })).toBe(false);
    expect(show({ ...idle, active: true, state: 'loading' })).toBe(true);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('defers a background activation until visible, and never opens an already stopped session', () => {
    let visible = false;
    const open = vi.fn(), show = createBirdSessionNavigation({ isActive: () => visible, open });
    const ready = { ...idle, active: true, state: 'ready' };
    expect(show(ready)).toBe(false);
    visible = true;
    expect(show(ready)).toBe(true);
    visible = false;
    expect(show(ready)).toBe(false);
    show(idle); show(ready); show(idle);
    visible = true;
    expect(show(idle)).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('waits for connection, manifest, command release and native cleanup before arming once', () => {
    const start = vi.fn(), enter = createBirdSkillAutoStart(start);
    expect(enter({ ...connected, status: 'disconnected' })).toBe(false);
    expect(enter({ ...connected, connectionId: undefined })).toBe(false);
    expect(enter({ ...connected, endpoints: [] })).toBe(false);
    expect(enter({ ...connected, recording: true })).toBe(false);
    expect(enter({ ...connected, bird: { ...idle, busy: true } })).toBe(false);
    expect(start).not.toHaveBeenCalled();
    // Permission/status callbacks can synchronously re-enter before start resolves.
    start.mockImplementation(() => { expect(enter(connected)).toBe(false); });
    expect(enter(connected)).toBe(true);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('does not retry errors or explicit exits automatically, but arms after a new connection', () => {
    const start = vi.fn(), enter = createBirdSkillAutoStart(start);
    expect(enter(connected)).toBe(true);
    expect(enter({ ...connected, bird: { ...idle, state: 'error' } })).toBe(false);
    expect(enter({ ...connected, bird: { ...idle, active: true, state: 'ready' } })).toBe(false);
    expect(enter(connected)).toBe(false);
    expect(enter({ ...connected, connectionId: 'b-board:2' })).toBe(true);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('keeps native voice entry and recording intact when the page mounts after activation', () => {
    const start = vi.fn(), enter = createBirdSkillAutoStart(start);
    expect(enter({ ...connected, recording: true, bird: { ...idle, active: true, busy: true, state: 'recording' } })).toBe(false);
    expect(enter({ ...connected, bird: { ...idle, active: true, state: 'result' } })).toBe(false);
    expect(enter(connected)).toBe(false); // The user subsequently says “退出识鸟”.
    expect(start).not.toHaveBeenCalled();
  });
});

describe('bird release build gate', () => {
  const root = process.cwd();
  const temporary: string[] = [];
  const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'bird-build-test-')); temporary.push(dir); return dir; };
  const write = (base: string, file: string, content: string | Buffer) => {
    mkdirSync(dirname(join(base, file)), { recursive: true }); writeFileSync(join(base, file), content);
  };
  const canonical = () => readFileSync(BIRD_CATALOG);
  function webFixture() {
    const web = temp();
    const code = `export const birds = ${JSON.stringify(BIRD_ASSETS)};`;
    write(web, 'assets/entry.js', code);
    write(web, 'index.html', '<script type="module" src="/assets/entry.js"></script>');
    write(web, 'bird-release.json', JSON.stringify({ release: BIRD_RELEASE, catalogSha256: BIRD_CATALOG_SHA256,
      entries: ['assets/entry.js'], chunks: [{ file: 'assets/entry.js', sha256: createHash('sha256').update(code).digest('hex') }] }));
    symlinkSync(resolve(root, 'public/assets/bird-skill'), join(web, 'assets/bird-skill'), 'dir');
    return web;
  }
  afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }); });

  it('accepts the current single source and an internally consistent package', () => {
    expect(verifyBirdSource(root).release).toBe(BIRD_RELEASE);
    const app = temp(), web = webFixture();
    write(app, 'BirdCatalog.json', canonical());
    symlinkSync(web, join(app, 'public'), 'dir');
    expect(verifyBirdApp(root, app).catalogSha256).toBe(BIRD_CATALOG_SHA256);
  });
  it('rejects a revived duplicate frontend catalog', () => {
    const stale = temp(); write(stale, 'src/app/lib/skill/birdCatalog.json', canonical());
    expect(() => verifyBirdSource(stale)).toThrow(/重复清单/);
  });
  it('rejects a stale canonical catalog even if twelve species are still present', () => {
    const stale = temp(); write(stale, BIRD_CATALOG, canonical().toString().split('pet-birds-v3/scenes/').join('t5-scenes-v2/'));
    expect(() => verifyBirdSource(stale)).toThrow(/禁止打包旧版/);
  });
  it('rejects old bird files reintroduced into public assets', () => {
    const stale = temp(); write(stale, BIRD_CATALOG, canonical());
    write(stale, 'public/assets/bird-skill/20260828/pycnonotus-sinensis.jpg', 'obsolete');
    expect(() => verifyBirdSource(stale)).toThrow(/已淘汰鸟图/);
  });
  it('rejects old Web output without a release stamp', () => {
    expect(() => verifyBirdWeb(root, temp())).toThrow(/没有新版识鸟构建凭据/);
  });
  it('rejects old JS copied over a newer stamped Web directory', () => {
    const web = webFixture(); write(web, 'assets/entry.js', 'export const birds = [];');
    expect(() => verifyBirdWeb(root, web)).toThrow(/JS 被替换/);
  });
  it('rejects an HTML entry left pointing at a previous build', () => {
    const web = webFixture(); write(web, 'index.html', '<script src="/assets/old.js"></script>');
    expect(() => verifyBirdWeb(root, web)).toThrow(/HTML 仍指向旧入口/);
  });
  it('rejects an old native catalog inside an otherwise current App', () => {
    const app = temp(); write(app, 'BirdCatalog.json', '[]');
    expect(() => verifyBirdApp(root, app)).toThrow(/App 内嵌的原生鸟图清单/);
  });
  it('runs the package gate on every Xcode build after resources are copied', () => {
    const project = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
    const phases = project.match(/504EC3031FED79650016851F \/\* App \*\/ = \{[\s\S]*?buildPhases = \(([\s\S]*?)\);/)?.[1] || '';
    expect(phases.indexOf('Verify Packaged Bird Release')).toBeGreaterThan(phases.indexOf('/* Resources */'));
    const gate = project.match(/FB1D20260828000000000007 \/\* Verify Packaged Bird Release \*\/ = \{([\s\S]*?)\n\t\t\};/)?.[1] || '';
    expect(gate).toContain('alwaysOutOfDate = 1');
    expect(gate).toContain('check-xcode-bird-release.sh');
  });
});
