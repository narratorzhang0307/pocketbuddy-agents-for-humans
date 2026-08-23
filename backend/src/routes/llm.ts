import type { FastifyInstance } from 'fastify';
import { sendError, ServiceError } from '../lib/errors.js';
import { authenticate, type TokenVerifier } from '../plugins/auth.js';
import { llmGenerateSchema } from '../schemas/llm.js';
import type { LlmService } from '../services/llm.js';

export function registerLlmRoute(app: FastifyInstance, verifyToken: TokenVerifier, llm: LlmService): void {
  const requests = new Map<string, number[]>();
  app.post('/v1/llm/generate', async (request, reply) => {
    const identity = await authenticate(request, reply, verifyToken);
    if (!identity) return;
    const parsed = llmGenerateSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, 'invalid_argument', 'LLM request is invalid', parsed.error.flatten());

    const now = Date.now();
    const recent = (requests.get(identity.uid) || []).filter((timestamp) => now - timestamp < 60_000);
    if (recent.length >= 30) return sendError(reply, 429, 'rate_limited', '30 requests per minute exceeded');
    recent.push(now);
    requests.set(identity.uid, recent);

    try {
      let result = await llm.generate(parsed.data, identity.uid);
      if (parsed.data.json) {
        try { JSON.parse(result.text); } catch {
          result = await llm.generate(parsed.data, identity.uid);
          try { JSON.parse(result.text); } catch { return sendError(reply, 502, 'bad_model_output', 'Gemma did not return valid JSON'); }
        }
      }
      return reply.send({ text: result.text });
    } catch (error) {
      if (error instanceof ServiceError) return sendError(reply, error.status, error.code, error.message);
      return sendError(reply, 502, 'model_upstream_failed', error instanceof Error ? error.message : 'Gemma request failed');
    }
  });
}
