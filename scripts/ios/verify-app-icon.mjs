// User-approved Frost wink artwork, restored from the verified 2026082810 release.
// These pins deliberately do not accept an arbitrary matching public/native icon:
// that allowed the old globe to pass in 2026082822. No old app is a build input.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WINK_ICONS = Object.freeze({
  'apple-touch-icon.png': '0ae75f9b5f9e381ed4144292f1be1885e52d724a10ae302b3beb3d4fdd561df1',
  'favicon-32.png': '27d49d719bc2a16d5e3d70bf0e17b670caaafb7bb6b9f9787286943bb93560cd',
  'icon-1024.png': '871c1ada3fcc6ba0b3d1e0b8954a45edd6780f57296a3e554a2e87c664520000',
  'icon-120.png': '7a425362aa4e0c0a812c2197241bc8f0f2a6f96e6639ea3ca42cf689c4b7b935',
  'icon-152.png': '7bfe3f1419c6c70f94672db7e8477e73e12ed8864a32c4d3b8664dd064c36813',
  'icon-167.png': '344f6bde2c6aa2d2c269612b64990aaf2112efec9ca41ff5a14e8b1e9604fb38',
  'icon-180.png': '0ae75f9b5f9e381ed4144292f1be1885e52d724a10ae302b3beb3d4fdd561df1',
  'icon-192-maskable.png': 'b7977c28cfb7affba940e487b280d793e532d7070c8d71121e58fe1a0beac316',
  'icon-192.png': 'b7977c28cfb7affba940e487b280d793e532d7070c8d71121e58fe1a0beac316',
  'icon-512-maskable.png': '07cb7cf7ec383673e8012118799dd1b1ea0e64da5177ec343cc252be0cf97833',
  'icon-512.png': '07cb7cf7ec383673e8012118799dd1b1ea0e64da5177ec343cc252be0cf97833',
});
// Apple-optimized icon PNGs from the approved release (same Xcode toolchain).
// An optimizer change requires visual review and a deliberate baseline update,
// never bypassing this check or copying compiled icons into a newly signed app.
export const COMPILED_WINK_ICONS = Object.freeze({
  'AppIcon60x60@2x.png': 'f6f60b7b557cac74130dc61c57813eb63c92d5ef844a38afd399384a890450bb',
  'AppIcon76x76@2x~ipad.png': '8d5137fdc87a9fb23bd6aedae16ad97364ee87440c7fc934fd3b1ab4f1720b2f',
});
function verifyFiles(directory, expected) {
  for (const [name, digest] of Object.entries(expected)) {
    let bytes;
    try { bytes = readFileSync(path.join(directory, name)); }
    catch { throw new Error(`缺少已确认的小狗图标：${path.join(directory, name)}`); }
    if (createHash('sha256').update(bytes).digest('hex') !== digest) {
      throw new Error(`小狗图标回退或被替换：${path.join(directory, name)}；停止发布，不接受旧地球图标。`);
    }
  }
}
export function verifyPublicAppIcon(root) {
  verifyFiles(path.join(root, 'public/icons'), WINK_ICONS);
}
export function verifySourceAppIcon(root) {
  verifyPublicAppIcon(root);
  const directory = path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
  verifyFiles(directory, { 'AppIcon-512@2x.png': WINK_ICONS['icon-1024.png'] });
  const catalog = JSON.parse(readFileSync(path.join(directory, 'Contents.json'), 'utf8'));
  if (catalog.images?.length !== 1 || catalog.images[0].filename !== 'AppIcon-512@2x.png') {
    throw new Error('AppIcon 资源目录不再指向已确认的小狗图标。');
  }
}
export function verifyPackagedAppIcon(root, app) {
  verifySourceAppIcon(root);
  verifyPublicAppIcon(app);
  verifyFiles(app, COMPILED_WINK_ICONS);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  try {
    if (process.argv.length === 2) verifySourceAppIcon(root);
    else if (process.argv.length === 4 && process.argv[2] === '--app') verifyPackagedAppIcon(root, path.resolve(process.argv[3]));
    else throw new Error('用法：node scripts/ios/verify-app-icon.mjs [--app /path/App.app]');
    console.log('OK 已确认的小狗眨眼图标，无地球图标回退');
  } catch (error) { console.error(`error: ${error.message}`); process.exitCode = 1; }
}
