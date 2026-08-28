import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root,
  base: '/her-motion/',
  plugins: [react(), {
    name: 'her-motion-package-identity',
    generateBundle() {
      const model = readFileSync(path.join(root, 'public/models/pose_landmarker_lite.task'));
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: JSON.stringify({
        app: 'HerMotion', protocol: 'pocket-her-motion-bridge/v1', version: 1,
        poseModelSha256: createHash('sha256').update(model).digest('hex'),
      }) });
    },
  }],
  build: { outDir: path.resolve(root, '../../public/her-motion'), emptyOutDir: true },
});
