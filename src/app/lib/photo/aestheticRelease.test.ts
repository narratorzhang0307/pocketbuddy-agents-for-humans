import { describe, expect, it } from 'vitest';
import { AESTHETIC_CANDIDATE_EVIDENCE, aestheticReleaseStatus } from './aestheticRelease';

describe('aesthetic adapter release gate', () => {
  it('keeps v3 out of the production route because the frozen blind accuracy gate failed', () => {
    expect(aestheticReleaseStatus()).toBe('research-candidate');
    expect(AESTHETIC_CANDIDATE_EVIDENCE.accuracyGainVsBestBaseline).toBeLessThan(AESTHETIC_CANDIDATE_EVIDENCE.requiredAccuracyGain);
  });

  it('promotes only a leakage-safe, position-stable and statistically supported adapter', () => {
    const passing = {
      canonicalPairs: 174,
      evaluationRows: 348,
      accuracyGainVsBestBaseline: 0.07,
      pairSymmetricGainVsBestBaseline: 0.08,
      requiredAccuracyGain: 0.05,
      strictChoiceRate: 1,
      positionAPredictionRate: 0.48,
      pairedBootstrap95CI: [0.02, 0.11] as const,
      mcnemarP: 0.02,
      languageTensors: 0,
      leakageGatePassed: true,
      regressionNonDegradationPassed: true,
      mnnArtifactValidated: true,
    };
    expect(aestheticReleaseStatus(passing)).toBe('release-ready');
    expect(aestheticReleaseStatus({ ...passing, evaluationRows: 64 })).toBe('research-candidate');
    expect(aestheticReleaseStatus({ ...passing, pairedBootstrap95CI: [-0.01, 0.12] })).toBe('research-candidate');
    expect(aestheticReleaseStatus({ ...passing, positionAPredictionRate: 0.82 })).toBe('research-candidate');
    expect(aestheticReleaseStatus({ ...passing, languageTensors: 4 })).toBe('research-candidate');
    expect(aestheticReleaseStatus({ ...passing, leakageGatePassed: false })).toBe('research-candidate');
    expect(aestheticReleaseStatus({ ...passing, regressionNonDegradationPassed: false })).toBe('research-candidate');
    expect(aestheticReleaseStatus({ ...passing, mnnArtifactValidated: false })).toBe('research-candidate');
  });
});
