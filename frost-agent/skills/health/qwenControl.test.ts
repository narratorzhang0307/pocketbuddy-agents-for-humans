import { describe, expect, it, vi } from 'vitest';
import { callEdgeRequest } from '../../edge/httpEdge';
import { buildHealthDecisionExplanationPrompt, explainHealthDecisionWithQwen4B } from './qwenControl';

vi.mock('../../edge/httpEdge', () => ({ callEdgeRequest: vi.fn() }));

describe('Qwen3-4B health control plane', () => {
  it('binds explanation to the already-gated prescription', () => {
    const prompt = buildHealthDecisionExplanationPrompt({
      skillId: 'frost.running-coach',
      readiness: { band: 'yellow', maxIntensity: 'easy', confidence: 0.8, reasons: ['sleep low'], missing: [] },
      validation: {
        ok: false,
        errors: ['intensity_exceeds_yellow_cap'],
        conservative: { intensity: 'easy', durationMin: 40, stopRules: ['stop on pain'], evidenceIds: ['event-1'] },
      },
    });
    expect(prompt).toContain('只能解释，不能更改');
    expect(prompt).toContain('"intensity":"easy"');
    expect(prompt).toContain('"stopRules":["stop on pain"]');
    expect(prompt).not.toContain('药物建议');
  });

  it('accepts only an explicit native Qwen3-4B response', async () => {
    vi.mocked(callEdgeRequest).mockResolvedValueOnce({ backend: 'mnn', model: 'Qwen3-4B 4bit / MNN native', text: '保持轻松跑。' });
    const result = await explainHealthDecisionWithQwen4B({
      skillId: 'frost.endurance-guard',
      readiness: { band: 'green', maxIntensity: 'moderate', confidence: 0.9, reasons: [], missing: [] },
      validation: { ok: true, errors: [], conservative: { intensity: 'easy', durationMin: 30, stopRules: ['疼痛即停'], evidenceIds: [] } },
    });
    expect(callEdgeRequest).toHaveBeenCalledWith(expect.objectContaining({ model: 'health-qwen3-4b', maxTokens: 384 }), 120_000);
    expect(result).toMatchObject({ backend: 'mnn', text: '保持轻松跑。' });
  });

  it('fails closed when another backend or model answers', async () => {
    vi.mocked(callEdgeRequest).mockResolvedValueOnce({ backend: 'mnn', model: 'Qwen3-VL-2B / MNN native', text: '不可信替代结果' });
    const result = await explainHealthDecisionWithQwen4B({
      skillId: 'frost.running-coach',
      readiness: { band: 'red', maxIntensity: 'rest', confidence: 1, reasons: ['pain'], missing: [] },
      validation: { ok: false, errors: ['stop'], conservative: { intensity: 'rest', durationMin: 0, stopRules: ['立即停止'], evidenceIds: [] } },
    });
    expect(result.backend).toBe('stub');
    expect(result.text).toBe('');
  });
});
