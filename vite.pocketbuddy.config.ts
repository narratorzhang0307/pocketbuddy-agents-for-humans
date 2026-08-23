import { defineConfig, loadEnv, type Plugin } from 'vite';
import path from 'node:path';
import { createReadStream, existsSync, stat } from 'node:fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { frostEdge } from './frost-agent/edge/viteEdge';
// @ts-expect-error Plain ESM is shared with the production Node server.
import { createHealthSkillBridge } from './server/health-skill-bridge.mjs';

const publishPublic = path.resolve(__dirname, 'public');

const STATIC_CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

/**
 * The publish worktree owns new Skill assets; the Pocket Earth workspace owns
 * the established SOUND WALK media library. During local integration, serve a
 * missing asset from the latter without copying or overwriting either library.
 */
function pocketEarthPublicFallback(pocketEarthPublic: string | null): Plugin {
  return {
    name: 'pocket-earth-public-fallback',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!pocketEarthPublic) {
          next();
          return;
        }
        const pathname = decodeURIComponent(new URL(request.url || '/', 'http://local').pathname);
        const relativePath = pathname.replace(/^\/+/, '');
        const localCandidate = path.resolve(publishPublic, relativePath);
        const sharedCandidate = path.resolve(pocketEarthPublic, relativePath);
        if (
          !localCandidate.startsWith(`${publishPublic}${path.sep}`)
          || !sharedCandidate.startsWith(`${pocketEarthPublic}${path.sep}`)
        ) {
          next();
          return;
        }
        stat(localCandidate, (localError, localInfo) => {
          if (!localError && localInfo.isFile()) {
            next();
            return;
          }
          stat(sharedCandidate, (error, info) => {
            if (error || !info.isFile()) {
              next();
              return;
            }
            const contentType = STATIC_CONTENT_TYPES[path.extname(sharedCandidate).toLowerCase()];
            if (contentType) response.setHeader('content-type', contentType);
            createReadStream(sharedCandidate).pipe(response);
          });
        });
      });
    },
  };
}

function petForgeApi(env: Record<string, string>): Plugin {
  for (const key of ['DASHSCOPE_API_KEY', 'QWEN_API_KEY', 'QWEN_PET_IMAGE_MODEL']) {
    if (!process.env[key] && env[key]) process.env[key] = env[key];
  }
  return {
    name: 'pocket-buddy-photo-api',
    async configureServer(server) {
      // @ts-expect-error Node-only ESM module intentionally has no client types.
      const { createPetApi } = await import('./server/pet-api.mjs');
      const handlePetApi = await createPetApi({
        dataDir: path.join(__dirname, '.agent-forge-data'),
        projectRoot: __dirname,
      });
      server.middlewares.use(async (req, res, next) => {
        const handled = await handlePetApi(req, res);
        if (!handled && !res.writableEnded) next();
      });
    },
  };
}

function healthSkillsDev(env: Record<string, string>): Plugin {
  return {
    name: 'frost-health-skills-local-bridge',
    configureServer(server) {
      const handle = createHealthSkillBridge({
        env: { ...env, ...process.env },
        localBridgeEnabled: true,
        projectRoot: __dirname,
      });
      server.middlewares.use(async (req, res, next) => {
        const handled = await handle(req, res);
        if (!handled && !res.writableEnded) next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const configuredSoundWalkRoot = process.env.SOUND_WALK_ROOT?.trim()
    || env.SOUND_WALK_ROOT?.trim();
  const soundWalkRoot = configuredSoundWalkRoot
    ? path.resolve(configuredSoundWalkRoot)
    : null;
  const soundWalkEntry = soundWalkRoot
    ? path.join(soundWalkRoot, 'src/app/components/MyMapTab.tsx')
    : '';
  const hasSoundWalkWorkspace = !!soundWalkRoot && existsSync(soundWalkEntry);
  const configuredPocketEarthPublic = process.env.POCKET_EARTH_PUBLIC_ROOT?.trim()
    || env.POCKET_EARTH_PUBLIC_ROOT?.trim();
  const pocketEarthPublic = configuredPocketEarthPublic
    ? path.resolve(configuredPocketEarthPublic)
    : null;
  const soundWalkAlias = hasSoundWalkWorkspace
    ? soundWalkEntry
    : path.resolve(__dirname, './src/app/integrations/SoundWalkUnavailable.tsx');

  return {
    base: '/',
    server: {
      host: process.env.DEV_HOST || '127.0.0.1',
      port: process.env.PORT ? Number(process.env.PORT) : 5173,
      hmr: { host: process.env.DEV_HOST || '127.0.0.1' },
      fs: { allow: [__dirname, ...(hasSoundWalkWorkspace ? [soundWalkRoot!] : [])] },
      proxy: {
        '/v1': { target: env.POCKETBUDDY_API_DEV_URL || 'http://127.0.0.1:8787', changeOrigin: true },
      },
    },
    plugins: [react(), tailwindcss(), petForgeApi(env), healthSkillsDev(env), frostEdge(env), pocketEarthPublicFallback(pocketEarthPublic)],
    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(__dirname, './src') },
        { find: '@soundwalk/app/components/MyMapTab', replacement: soundWalkAlias },
        { find: 'frost-agent', replacement: path.resolve(__dirname, './frost-agent') },
      ],
      dedupe: ['react', 'react-dom'],
    },
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('/react') || id.includes('react-dom') || id.includes('scheduler')) return 'react';
            return 'vendor';
          },
        },
      },
    },
  };
});
