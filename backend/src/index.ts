import { createPocketBuddyApi } from './app.js';
import { configuredTokenVerifier } from './plugins/auth.js';
import { FirestoreHealthEventRepository, InMemoryHealthEventRepository } from './services/healthEvents.js';
import { configuredLlmService } from './services/llm.js';

const useDevelopmentStore = process.env.NODE_ENV !== 'production' && process.env.SKILL_DEV_STORE === 'memory';
const app = createPocketBuddyApi({
  verifyToken: configuredTokenVerifier(),
  healthEvents: useDevelopmentStore ? new InMemoryHealthEventRepository() : new FirestoreHealthEventRepository(),
  llm: configuredLlmService(),
  logger: true,
});

const port = Number(process.env.API_PORT || process.env.PORT || 8080);
await app.listen({ host: '0.0.0.0', port });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
