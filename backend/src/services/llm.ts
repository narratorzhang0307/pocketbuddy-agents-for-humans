import type { LlmGenerateInput } from '../schemas/llm.js';
import { ServiceError } from '../lib/errors.js';

export interface LlmResult { text: string; model_version: string }
export interface LlmService {
  generate(input: LlmGenerateInput, uid: string): Promise<LlmResult>;
  readiness?(): { ready: boolean; provider: string; reason?: string };
}

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  model?: string;
  error?: { message?: string };
}

export function configuredLlmService(env: NodeJS.ProcessEnv = process.env): LlmService {
  if (env.NODE_ENV !== 'production' && env.SKILL_DEV_LLM_MODE === 'deterministic') {
    return {
      readiness: () => ({ ready: true, provider: 'dev-deterministic' }),
      async generate(input) {
        const location = input.prompt.match(/\u4f4d\u7f6e\uff1a([^\n]+)/)?.[1];
        return {
          text: location ? `已读取位置 ${location}。请按照你定义的目标安全开始。` : '请按照你定义的目标安全开始。',
          model_version: 'dev-deterministic/1',
        };
      },
    };
  }

  const baseUrl = String(env.GEMMA_BASE_URL || '').replace(/\/+$/, '');
  const token = String(env.GEMMA_API_TOKEN || '');
  const model = String(env.GEMMA_MODEL || 'gemma-3-4b-pocketbuddy');
  return {
    readiness: () => ({
      ready: !!baseUrl && !!token,
      provider: 'gemma-openai-compatible',
      ...(!baseUrl || !token ? { reason: 'GEMMA_BASE_URL or GEMMA_API_TOKEN is missing' } : {}),
    }),
    async generate(input) {
      if (!baseUrl || !token) throw new ServiceError('model_unavailable', 'Gemma service is not configured', 503);
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          model,
          temperature: input.json ? 0 : 0.35,
          messages: [
            ...(input.system ? [{ role: 'system', content: input.system }] : []),
            { role: 'user', content: input.prompt },
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const body = await response.json() as OpenAiChatResponse;
      if (!response.ok) throw new ServiceError('model_upstream_failed', body.error?.message || `Gemma returned ${response.status}`, 502);
      const text = body.choices?.[0]?.message?.content?.trim() || '';
      if (!text) throw new ServiceError('bad_model_output', 'Gemma returned empty output', 502);
      return { text, model_version: body.model || model };
    },
  };
}
