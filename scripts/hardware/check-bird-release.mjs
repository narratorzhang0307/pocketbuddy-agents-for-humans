import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BIRD_CATALOG = 'native/frost-badge/ios/BirdCatalog.json';
export const BIRD_RELEASE = 'bird-skill-pet-birds-v3';
export const BIRD_CATALOG_SHA256 = 'b7503839d862be192d70b4f909b61ec919c6d304d1b58ec13d46c528fcf2831c';
const assetRoot = 'assets/bird-skill/20260828';
const ossRoot = 'https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/bird-skill/20260828-v1/';
const sha = data => createHash('sha256').update(data).digest('hex');
function requireThat(ok, message) { if (!ok) throw Error(`识鸟构建拒绝：${message}`); }
const json = file => JSON.parse(readFileSync(file, 'utf8'));

function legacyPaths(catalog) {
  return catalog.slice(1).flatMap(bird => ['', 't5-scenes-v2/'].flatMap(dir =>
    ['jpg', 'webp'].map(ext => `${dir}${bird.id}.${ext}`)));
}

function verifyPublic(catalog, publicDir) {
  for (const relative of legacyPaths(catalog)) {
    requireThat(!existsSync(path.join(publicDir, assetRoot, relative)), `仍存在已淘汰鸟图 ${relative}`);
  }
  const manifest = json(path.join(publicDir, assetRoot, 'pet-birds-v3/manifest.json'));
  requireThat(manifest.release === BIRD_RELEASE && manifest.birds?.length === 12, '缺少完整的新版图片发布清单');
  const assets = catalog.flatMap(bird => [
    { url: bird.jpegUrl, sha256: bird.sha256, bytes: bird.bytes },
    ...(bird.source.sprite ? [bird.source.sprite.png, bird.source.sprite.webp,
      { url: bird.source.background.pngUrl, sha256: bird.source.background.pngSha256 }] : []),
  ]);
  for (const bird of catalog.slice(1)) {
    const published = manifest.birds.find(item => item.id === bird.id);
    requireThat(published?.scene?.webp?.url === bird.webUrl, `发布清单与 ${bird.name} 不一致`);
    assets.push(published.scene.webp);
  }
  for (const asset of assets) {
    requireThat(asset.url.startsWith(ossRoot), '图片不在固定 OSS 目录内');
    const file = path.join(publicDir, assetRoot, asset.url.slice(ossRoot.length));
    requireThat(existsSync(file), `缺少新版素材 ${file}`);
    const bytes = readFileSync(file);
    requireThat(sha(bytes) === asset.sha256 && (!asset.bytes || bytes.length === asset.bytes), `素材哈希不符 ${file}`);
  }
}

export function verifyBirdSource(root) {
  requireThat(!existsSync(path.join(root, 'src/app/lib/skill/birdCatalog.json')), '网页重复清单已废弃；只能使用 native/frost-badge/ios/BirdCatalog.json');
  requireThat(!existsSync(path.join(root, 'scripts/hardware/build-bird-assets.mjs')), '旧 T5 鸟图生成器已废弃');
  const bytes = readFileSync(path.join(root, BIRD_CATALOG));
  requireThat(sha(bytes) === BIRD_CATALOG_SHA256, '清单不是已核验的十二鸟宠物版，禁止打包旧版或未审查版本');
  const catalog = JSON.parse(bytes);
  verifyPublic(catalog, path.join(root, 'public'));
  return { catalog, release: BIRD_RELEASE, catalogSha256: sha(bytes) };
}

function verifyCode(catalog, code) {
  for (const bird of catalog.slice(1)) {
    requireThat(code.includes(bird.jpegUrl) && code.includes(bird.webUrl), `实际 JS 中缺少新版 ${bird.name}`);
  }
  for (const relative of legacyPaths(catalog)) {
    requireThat(!code.includes(ossRoot + relative), `实际 JS 仍引用旧鸟图 ${relative}`);
  }
}

// The Vite build stamps hashes of its actual JS output, including the catalog module.
// Xcode verifies these bytes again; copying only a new manifest over old JS cannot pass.
export function birdReleasePlugin(root) {
  let source;
  return {
    name: 'pocketbuddy-current-bird-release',
    apply: 'build',
    buildStart() { source = verifyBirdSource(root); },
    writeBundle: {
      order: 'post', sequential: true,
      handler(options, bundle) {
        const chunks = Object.values(bundle).filter(item => item.type === 'chunk');
        const catalogPath = path.resolve(root, BIRD_CATALOG);
        requireThat(chunks.some(chunk => chunk.moduleIds.includes(catalogPath)), '构建没有使用唯一鸟图清单');
        // Vite finalizes preload/import code after generateBundle. Bind final bytes on disk.
        const directory = path.resolve(root, options.dir);
        const actual = chunks.map(chunk => ({ chunk, bytes: readFileSync(path.join(directory, chunk.fileName)) }));
        verifyCode(source.catalog, actual.map(item => item.bytes.toString('utf8')).join('\n'));
        const stamp = { release: source.release, catalogSha256: source.catalogSha256,
          entries: chunks.filter(chunk => chunk.isEntry).map(chunk => chunk.fileName),
          chunks: actual.map(({ chunk, bytes }) => ({ file: chunk.fileName, sha256: sha(bytes) })) };
        writeFileSync(path.join(directory, 'bird-release.json'), JSON.stringify(stamp, null, 2) + '\n');
      },
    },
  };
}

export function verifyBirdWeb(root, webDir) {
  const source = verifyBirdSource(root);
  const stampPath = path.join(webDir, 'bird-release.json');
  requireThat(existsSync(stampPath), 'Web 包没有新版识鸟构建凭据，请重新运行 npm run ios:prepare');
  const stamp = json(stampPath);
  requireThat(stamp.release === source.release && stamp.catalogSha256 === source.catalogSha256, 'Web 包与当前原生鸟图清单不一致');
  requireThat(Array.isArray(stamp.chunks) && stamp.chunks.length > 0 && Array.isArray(stamp.entries) && stamp.entries.length > 0, 'Web 包构建凭据不完整');
  const scripts = [...readFileSync(path.join(webDir, 'index.html'), 'utf8').matchAll(/<script\b[^>]*\bsrc="([^"?#]+\.js)"/g)]
    .map(match => match[1].replace(/^\//, ''));
  requireThat(stamp.entries.every(entry => scripts.includes(entry)), 'HTML 仍指向旧入口 JS');
  const code = [];
  for (const chunk of stamp.chunks) {
    requireThat(/^assets\/[A-Za-z0-9_.-]+\.js$/.test(chunk.file), '非法 JS 资源路径');
    const bytes = readFileSync(path.join(webDir, chunk.file));
    requireThat(sha(bytes) === chunk.sha256, `JS 被替换或混入旧文件 ${chunk.file}`);
    code.push(bytes.toString('utf8'));
  }
  requireThat(stamp.entries.every(entry => stamp.chunks.some(chunk => chunk.file === entry)), '入口 JS 没有纳入哈希核验');
  verifyCode(source.catalog, code.join('\n'));
  // Detect leftover old chunks, even if the new entry no longer references them.
  for (const name of readdirSync(path.join(webDir, 'assets')).filter(name => name.endsWith('.js'))) {
    const text = readFileSync(path.join(webDir, 'assets', name), 'utf8');
    requireThat(!legacyPaths(source.catalog).some(relative => text.includes(ossRoot + relative)), `遗留旧鸟图 JS ${name}`);
  }
  verifyPublic(source.catalog, webDir);
  return { release: source.release, catalogSha256: source.catalogSha256, chunks: stamp.chunks.length, webDir };
}

export function verifyBirdApp(root, appDir) {
  const source = verifyBirdSource(root);
  const bytes = readFileSync(path.join(appDir, 'BirdCatalog.json'));
  requireThat(sha(bytes) === source.catalogSha256, 'App 内嵌的原生鸟图清单不是当前版本');
  return { ...verifyBirdWeb(root, path.join(appDir, 'public')), appDir };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const [flag, target] = process.argv.slice(2);
  try {
    let result;
    if (flag === '--source-only') { const source = verifyBirdSource(root); result = { release: source.release, catalogSha256: source.catalogSha256 }; }
    else if (flag === '--app' && target) result = verifyBirdApp(root, path.resolve(target));
    else if (flag === '--web-dir' && target) result = verifyBirdWeb(root, path.resolve(target));
    else throw Error('Usage: check-bird-release.mjs --source-only | --web-dir DIRECTORY | --app APP_PATH');
    console.log(JSON.stringify({ verified: true, ...result }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
