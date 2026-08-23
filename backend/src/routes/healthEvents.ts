import type { FastifyInstance } from 'fastify';
import { sendError } from '../lib/errors.js';
import { authenticate, type TokenVerifier } from '../plugins/auth.js';
import { healthEventBatchSchema, healthEventSchema } from '../schemas/healthEvent.js';
import type { HealthEventRepository } from '../services/healthEvents.js';

export function registerHealthEventRoutes(app: FastifyInstance, verifyToken: TokenVerifier, repository: HealthEventRepository): void {
  app.post('/v1/health-events:batchSync', async (request, reply) => {
    const identity = await authenticate(request, reply, verifyToken);
    if (!identity) return;
    const batch = healthEventBatchSchema.safeParse(request.body);
    if (!batch.success) return sendError(reply, 400, 'invalid_argument', 'events must contain 1..100 items', batch.error.flatten());

    const results = await Promise.all(batch.data.events.map(async (candidate, index) => {
      const source = candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : {};
      const parsed = healthEventSchema.safeParse({ ...source, user_id: identity.uid });
      if (!parsed.success) {
        return {
          event_id: typeof source.event_id === 'string' ? source.event_id : `invalid-${index}`,
          status: 'invalid' as const,
          revision: 0,
          error: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
        };
      }
      return repository.sync(identity.uid, parsed.data);
    }));
    return reply.send({ results });
  });
}
