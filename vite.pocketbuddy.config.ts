import { answerSpeechTicket } from './server/frost-voice-ticket.mjs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { frostEdge } from './frost-agent/edge/viteEdge';
// @ts-expect-error Build-only ESM asset validation.
import { verifyAvatarAssets } from './scripts/verify-avatar-assets.mjs';
// @ts-expect-error Build-only ESM verifies the canonical native/Web bird release.
import { birdReleasePlugin } from './scripts/hardware/check-bird-release.mjs';
// @ts-expect-error Build-only ESM binds the approved Canvas to actual output bytes.
import { skillCanvasReleasePlugin } from './scripts/ios/verify-skill-canvas.mjs';
// @ts-expect-error Plain ESM is shared with the production Node server.
import { buildQwenChatBody, createQwenProvider, qwenModelForTask } from './server/qwen-health-provider.mjs';
// @ts-expect-error Server-only Google agent provider for local competition verification.
import { createGoogleAgentProvider, selectFrostAgentBackend } from './server/google-agent-provider.mjs';
// @ts-expect-error Plain ESM is shared with the production Node server.
import { createHealthSkillBridge } from './server/health-skill-bridge.mjs';
// @ts-expect-error Plain ESM is shared with the production Node server.
import { createFrostVoiceHandler } from './server/minimax-voice.mjs';
// @ts-expect-error Plain ESM is shared with the production Node server.
import { createHospitalAgentHandler } from './server/hospital-agent.mjs';
// @ts-expect-error Shared server-only ESM; no provider keys enter the client bundle.
import { createHealthMemoryHandler } from './server/health-memory.mjs';
// @ts-expect-error Server-only real SAM gateway.
import { createPhotoHarnessHandler } from './server/photo-harness.mjs';

function hospitalAgentDev(env: Record<string, string>): Plugin {
  return {
    name: 'hospital-agent-health',
    configureServer(server) {
      const handle = createHospitalAgentHandler({ env: { ...env, ...process.env } });
      const healthMemory = createHealthMemoryHandler({ env: { ...env, ...process.env }, localDev: true });
      const photoHarness = createPhotoHarnessHandler({ env: { ...env, ...process.env }, localDev: true });
      server.middlewares.use(async (req, res, next) => {
        if (await healthMemory(req, res)) return;
        if (await photoHarness(req, res)) return;
        if (!await handle(req, res) && !res.writableEnded) next();
      });
    },
  };
}

function frostVoiceDev(env: Record<string, string>): Plugin {
  return {
    name: 'frost-minimax-voice',
    configureServer(server) {
      const handle = createFrostVoiceHandler({ env: { ...env, ...process.env }, localDev: true });
      server.middlewares.use(async (req, res, next) => {
        if (!await handle(req, res) && !res.writableEnded) next();
      });
    },
  };
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
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

function qwenChatDev(env: Record<string, string>): Plugin {
  const qwen = createQwenProvider(env);
  const google = createGoogleAgentProvider(env);
  const backend = selectFrostAgentBackend(env, { google: google.configured, qwen: Boolean(qwen.key) });
  return {
    name: 'frost-agent-chat',
    configureServer(server) {
      server.middlewares.use('/api/frost-llm', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        const send = (value: unknown, status = 200) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(value));
        };
        try {
          const { prompt, system, json, task } = JSON.parse(await readBody(req) || '{}');
          const taskName = String(task || 'default');
          if (backend === 'gemini') {
            if (!google.configured) { send({ text: '', error: 'google_agent_not_configured' }, 503); return; }
            const result = await google.complete({
              prompt, system, task: taskName, json: Boolean(json), signal: AbortSignal.timeout(60_000),
            });
            send({
              text: result.text,
              ...answerSpeechTicket(taskName, result.text),
              model: google.model,
              provider: google.provider,
              modelOwner: google.owner,
              transport: google.transport,
              framework: google.framework,
            });
            return;
          }
          if (!qwen.key) { send({ text: '', error: 'no_qwen_key' }, 503); return; }
          const upstream = await fetch(qwen.url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${qwen.key}` },
            body: JSON.stringify(buildQwenChatBody(qwen, {
              prompt, system, task: taskName, json: !!json, temperature: json ? 0 : 0.55,
            })),
            signal: AbortSignal.timeout(60_000),
          });
          const data = await upstream.json();
          if (!upstream.ok) { send({ text: '', error: data?.error || `upstream_${upstream.status}` }, upstream.status); return; }
          send({
            text: data?.choices?.[0]?.message?.content || '',
            ...answerSpeechTicket(taskName, data?.choices?.[0]?.message?.content || ''),
            model: qwenModelForTask(qwen, taskName),
            provider: qwen.provider,
            modelOwner: qwen.owner,
            transport: qwen.transport,
          });
        } catch (error) {
          send({ text: '', error: error instanceof Error ? error.message : String(error) }, 502);
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  verifyAvatarAssets(__dirname);
  const env = loadEnv(mode, '.', '');
  return {
    base: '/',
    server: { port: process.env.PORT ? Number(process.env.PORT) : 5173 },
    plugins: [skillCanvasReleasePlugin(__dirname), birdReleasePlugin(__dirname), react(), tailwindcss(), petForgeApi(env), healthSkillsDev(env), hospitalAgentDev(env), frostVoiceDev(env), frostEdge(env), qwenChatDev(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        'frost-agent': path.resolve(__dirname, './frost-agent'),
      },
    },
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/scheduler/')) return 'react';
            return 'vendor';
          },
        },
      },
    },
  };
});
