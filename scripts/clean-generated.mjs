import { existsSync, lstatSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const checkOnly = process.argv.includes('--check');
const webOnly = process.argv.includes('--web');

const webTargets = [
  'dist',
  'public/lianlema',
  'public/her-motion',
];

const nativeAndLocalTargets = [
  'dist-ios',
  'ios/App/App/public',
  'ios/App/App/capacitor.config.json',
  'ios/App/App/config.xml',
  'ios/App/build',
  'ios/DerivedData',
  'ios/capacitor-cordova-ios-plugins',
  'android/app/build',
  'android/build',
  'android/capacitor-cordova-android-plugins/build',
  '.ios-build',
  'coverage',
  '.vite',
  'deploy/all-things-agentic/runtime/node_modules',
];

const hardwareRoot = path.join(root, 'hardware/ojbadge-agent-link');
const hardwareTargets = existsSync(hardwareRoot)
  ? readdirSync(hardwareRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('build-'))
    .map((entry) => `hardware/ojbadge-agent-link/${entry.name}`)
  : [];

const targets = webOnly
  ? webTargets
  : [...webTargets, ...nativeAndLocalTargets, ...hardwareTargets];

const installLock = path.join(root, '.ios-build/install.lock');
if (!webOnly && existsSync(installLock)) {
  throw new Error('Refusing to clean while .ios-build/install.lock exists. Finish the active iOS operation first.');
}

const present = targets.filter((relative) => existsSync(path.join(root, relative)));
if (checkOnly) {
  console.log(JSON.stringify({ clean: present.length === 0, mode: webOnly ? 'web' : 'all', generated: present }, null, 2));
  process.exitCode = present.length === 0 ? 0 : 1;
} else {
  for (const relative of present) {
    const target = path.resolve(root, relative);
    if (target === root || !target.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Refusing to clean unsafe path: ${relative}`);
    }
    const entry = lstatSync(target);
    rmSync(target, { recursive: entry.isDirectory() && !entry.isSymbolicLink(), force: false });
  }
  console.log(JSON.stringify({ cleaned: present, mode: webOnly ? 'web' : 'all' }, null, 2));
}
