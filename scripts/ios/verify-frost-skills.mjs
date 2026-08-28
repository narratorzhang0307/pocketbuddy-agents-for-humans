import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Check the packaged page, not just the source: stale Capacitor assets must fail.
export function verifyFrostSkillsBundle(webDir) {
  const assets = path.join(webDir, 'assets');
  const bundles = readdirSync(assets).filter(name => /^FrostBuddyPage-[\w-]+\.js$/.test(name));
  if (bundles.length !== 1) {
    throw new Error(`Frost 页面必须只有一份构建产物，实际 ${bundles.length} 份；请清理并重新构建。`);
  }
  const bundle = path.join(assets, bundles[0]);
  const code = readFileSync(bundle, 'utf8');
  const required = ['frost-quick-skills', '调用 Skills', 'group-open:hidden', 'hidden group-open:inline'];
  if (!required.every(marker => code.includes(marker)) || code.includes('调用 Skill →')) {
    throw new Error('Frost 资源包仍是旧版或缺少 Skills 折叠栏；禁止打包，请从当前源码重新构建。');
  }
  return bundle;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  try {
    const bundle = verifyFrostSkillsBundle(path.resolve(root, process.argv[2] || 'ios/App/App/public'));
    console.log(`OK Frost Skills 折叠栏：${bundle}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
