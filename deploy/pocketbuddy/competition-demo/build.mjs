// Fresh Web-only build for the competition hostname. Never prepares or installs iOS.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadEnv } from 'vite';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const [output, configDirectory] = process.argv.slice(2);
if (!output || !configDirectory || !path.isAbsolute(output) || !path.isAbsolute(configDirectory) ||
    !existsSync(output) || !existsSync(configDirectory)) {
  throw new Error('Usage: node deploy/pocketbuddy/competition-demo/build.mjs /existing/output /private/config-directory');
}
const origin = 'https://pocket-buddy.throughtheglass.art';
const config = loadEnv('production', configDirectory, '');
if (!config.VITE_AMAP_KEY || !/^[a-f0-9]{32}$/i.test(config.VITE_AMAP_SECURITY_JSCODE || '')) {
  throw new Error('Configured AMap browser key and security code are required; values are never logged.');
}
const env = { ...process.env };
for (const key of Object.keys(env)) if (/^(?:VITE_|EXPO_PUBLIC_)/.test(key)) delete env[key];
mkdirSync(path.join(output, 'tmp'), { recursive: true, mode: 0o700 });
Object.assign(env, {
  TMPDIR: path.join(output, 'tmp'), POCKET_BUDDY_BUILD_TARGET: 'web',
  POCKET_BUDDY_PUBLIC_ORIGIN: origin, VITE_LIANLEMA_URL: origin + '/lianlema/',
  VITE_AMAP_KEY: config.VITE_AMAP_KEY, VITE_AMAP_SERVICE_HOST: origin + '/_AMapService',
  VITE_AMAP_SECURITY_JSCODE: '', VITE_MAP_PROVIDER: 'amap',
  VITE_MAPBOX_TOKEN: config.VITE_MAPBOX_TOKEN?.startsWith('pk.') ? config.VITE_MAPBOX_TOKEN : '',
});
const template = readFileSync(new URL('./amap-proxy.conf.template', import.meta.url), 'utf8');
writeFileSync(path.join(output, 'amap-proxy.conf'),
  template.replaceAll('__AMAP_SECURITY_JSCODE__', config.VITE_AMAP_SECURITY_JSCODE), { flag: 'wx', mode: 0o600 });
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error('Build step failed: ' + args[0]);
}
run(['deploy/pocketbuddy/build-coach-web.mjs', path.join(output, 'coach')]);
run(['node_modules/vite/bin/vite.js', 'build', '--config', 'vendor/her-motion/vite.config.ts']);
run(['deploy/pocketbuddy/stage.mjs', output, path.join(output, 'coach')]);
