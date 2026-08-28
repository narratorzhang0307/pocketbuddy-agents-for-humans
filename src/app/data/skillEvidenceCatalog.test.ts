import { describe, expect, it } from 'vitest';
import { SKILL_EVIDENCE_CATALOG } from './skillEvidenceCatalog';

describe('competition Skill evidence catalog', () => {
  it('covers every non-system built-in Skill exactly once', () => {
    expect(SKILL_EVIDENCE_CATALOG).toHaveLength(13);
    expect(new Set(SKILL_EVIDENCE_CATALOG.map((item) => item.skillId)).size).toBe(13);
  });

  it('states a claim boundary and traceable artifact for every Skill', () => {
    for (const item of SKILL_EVIDENCE_CATALOG) {
      expect(item.claimBoundary.length).toBeGreaterThan(20);
      expect(item.artifacts.length).toBeGreaterThan(0);
      expect(item.artifacts.every((artifact) => artifact.source.length > 8)).toBe(true);
    }
  });

  it('does not label a LoRA as broadly proven when its own boundary says otherwise', () => {
    const rawLoraFailure = SKILL_EVIDENCE_CATALOG.find((item) => item.skillId === 'pocket.guji-reading');
    const travel = SKILL_EVIDENCE_CATALOG.find((item) => item.skillId === 'pocket.travel');
    expect(rawLoraFailure?.claimBoundary).toContain('原始 LoRA CER 75.64%');
    expect(travel?.verdict).toBe('conditional');
    expect(travel?.claimBoundary).toContain('未证明广泛胜出');
  });
});
