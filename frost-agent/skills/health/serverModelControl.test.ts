import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildHealthDecisionExplanationPrompt, explainHealthDecisionWithServerModel } from './serverModelControl';

function explanationInput() {
  return {
    skillId: 'frost.running-coach' as const,
    readiness: { band: 'yellow' as const, maxIntensity: 'easy' as const, confidence: 0.8, reasons: ['sleep low'], missing: [] },
    validation: {
      ok: false,
      errors: ['intensity_exceeds_yellow_cap'],
      conservative: { intensity: 'easy' as const, durationMin: 40, stopRules: ['stop on pain'], evidenceIds: ['event-1'] },
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('服务端健康解释控制面', () => {
  it('binds explanation to the already-gated prescription', () => {
    const prompt = buildHealthDecisionExplanationPrompt(explanationInput());
    expect(prompt).toContain('只能解释，不能更改');
    expect(prompt).toContain('"intensity":"easy"');
    expect(prompt).toContain('"stopRules":["stop on pain"]');
    expect(prompt).not.toContain('药物建议');
  });

  it('uses the authenticated server API for explanations', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: '保持轻松跑。' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { __POCKET_BUDDY_GET_ID_TOKEN__: async () => 'health-token' });
    const signal = new AbortController().signal;

    await expect(explainHealthDecisionWithServerModel(explanationInput(), signal)).resolves.toEqual({
      backend: 'server',
      text: '保持轻松跑。',
    });
    expect(fetchMock).toHaveBeenCalledWith('/v1/llm/generate', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ authorization: 'Bearer health-token' }),
      body: expect.stringContaining('"task":"health-decision-explanation"'),
      signal,
    }));
  });

  it('fails closed when the server model is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'model_unavailable', message: '模型未配置' } }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })));
    vi.stubGlobal('window', { __POCKET_BUDDY_GET_ID_TOKEN__: async () => 'health-token' });

    const result = await explainHealthDecisionWithServerModel(explanationInput());
    expect(result.backend).toBe('fallback');
    expect(result.text).toBe('');
    expect(result.error).toContain('模型未配置');
  });
});
