import { describe, expect, it } from 'vitest';
import { buildPhotoDecisionGroups } from './decisions';
import { applyAestheticJudgment, curationScoreOf, withCurationScore } from './curation';
import type { PhotoRadarAnalysis } from './radarTypes';

function photo(key: string, technicalQuality = 70): PhotoRadarAnalysis {
  return {
    key, assetId: key, contentHash: key.padEnd(16, '0'), photoType: 'life', technicalQuality,
    preferenceConfidence: 0, confidence: 0.8, verdict: 'keep', pinnable: true, needPlace: false,
    tags: [], reasons: [], visionBackend: 'local-features', analyzedAt: 1,
  };
}

describe('photo curation reranker', () => {
  it('uses technical quality as a deterministic fallback before Qwen runs', () => {
    const result = withCurationScore(photo('fallback', 73));
    expect(result).toMatchObject({ curationScore: 73, aestheticSource: 'technical-fallback' });
    expect(result.curationBreakdown).toMatchObject({ technical: 73, aestheticWeight: 0, personalWeight: 0 });
  });

  it('keeps base aesthetics separate, then confidence-gates the personal layer', () => {
    const judged = applyAestheticJudgment(photo('judged', 70), {
      score: 90, confidence: 1, reasons: ['主体清楚', '光线自然'], source: 'qwen3-vl-2b-base',
    });
    expect(judged.curationScore).toBe(84);
    expect(judged.universalAesthetic).toBe(90);

    const cold = withCurationScore({ ...judged, personalAffinity: 100, preferenceConfidence: 0 });
    const learned = withCurationScore({ ...judged, personalAffinity: 100, preferenceConfidence: 1 });
    expect(cold.curationScore).toBe(84);
    expect(learned.curationScore).toBe(88);
    expect(learned.universalAesthetic).toBe(90);
  });

  it('never lets aesthetic or preference scoring rewrite hard routing decisions', () => {
    const junk = { ...photo('junk', 18), photoType: 'junk' as const, verdict: 'clean' as const, pinnable: false };
    const result = applyAestheticJudgment({ ...junk, personalAffinity: 100, preferenceConfidence: 1 }, {
      score: 100, confidence: 1, reasons: ['错误的模型高分'], source: 'qwen3-vl-2b-base',
    });
    expect(result).toMatchObject({ verdict: 'clean', pinnable: false, curationScore: 18, aestheticSource: 'technical-fallback' });
    expect(result.universalAesthetic).toBeUndefined();
  });

  it('accepts a future LoRA judgment through the same interface', () => {
    const result = applyAestheticJudgment(photo('future'), {
      score: 92, confidence: 0.9, reasons: ['瞬间感强'], source: 'aesthetic-lora',
    });
    expect(result).toMatchObject({ universalAesthetic: 92, aestheticSource: 'aesthetic-lora' });
  });

  it('orders an event by final curation score instead of technical quality alone', () => {
    const technicalWinner = applyAestheticJudgment({ ...photo('technical', 90), clusterId: 'event:one' }, {
      score: 40, confidence: 1, reasons: [], source: 'qwen3-vl-2b-base',
    });
    const aestheticWinner = applyAestheticJudgment({ ...photo('aesthetic', 75), clusterId: 'event:one' }, {
      score: 95, confidence: 1, reasons: [], source: 'qwen3-vl-2b-base',
    });
    const thirdFrame = applyAestheticJudgment({ ...photo('third', 60), clusterId: 'event:one' }, {
      score: 30, confidence: 1, reasons: [], source: 'qwen3-vl-2b-base',
    });
    const decisions = buildPhotoDecisionGroups([technicalWinner, aestheticWinner, thirdFrame]);
    expect(decisions.bursts[0].map((item) => item.key)).toEqual(['aesthetic', 'technical', 'third']);
    expect(curationScoreOf(decisions.bursts[0][0])).toBeGreaterThan(curationScoreOf(decisions.bursts[0][1]));
  });
});
