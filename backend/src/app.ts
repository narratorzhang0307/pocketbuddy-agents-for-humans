import Fastify, { type FastifyInstance } from 'fastify';
import { sendError } from './lib/errors.js';
import type { TokenVerifier } from './plugins/auth.js';
import { registerHealthEventRoutes } from './routes/healthEvents.js';
import { registerLlmRoute } from './routes/llm.js';
import type { HealthEventRepository } from './services/healthEvents.js';
import type { LlmService } from './services/llm.js';

export interface PocketBuddyApiDependencies {
  verifyToken: TokenVerifier;
  healthEvents: HealthEventRepository;
  llm: LlmService;
  logger?: boolean;
}

export function createPocketBuddyApi(dependencies: PocketBuddyApiDependencies): FastifyInstance {
  const app = Fastify({ logger: dependencies.logger ?? false, bodyLimit: 1_000_000 });
  app.get('/v1/healthz', async () => ({ ok: true, service: 'pocketbuddy-api', version: '0.1.0' }));
  registerLlmRoute(app, dependencies.verifyToken, dependencies.llm);
  registerHealthEventRoutes(app, dependencies.verifyToken, dependencies.healthEvents);
  app.setNotFoundHandler((_request, reply) => sendError(reply, 404, 'not_found', 'route not found'));
  app.setErrorHandler((error, _request, reply) => {
    if (reply.sent) return;
    return sendError(reply, 500, 'internal', error instanceof Error ? error.message : 'internal error');
  });
  return app;
}
