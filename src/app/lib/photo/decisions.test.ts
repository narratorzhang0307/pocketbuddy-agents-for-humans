import { describe, expect, it } from 'vitest';
import { buildPhotoDecisionGroups } from './decisions';
import type { PhotoRadarAnalysis } from './radarTypes';

function analysis(key: string, photoType: PhotoRadarAnalysis['photoType'], reasons: string[]): PhotoRadarAnalysis {
  return {
    key, assetId: key, contentHash: key.padEnd(16, '0'), photoType, technicalQuality: 70,
    preferenceConfidence: 0, confidence: 0.8, verdict: 'review', pinnable: false,
    needPlace: false, tags: [], reasons, visionBackend: 'local-features', analyzedAt: 1,
  };
}

describe('photo decision groups', () => {
  it('surfaces explainable low-contrast and glare concerns', () => {
    const groups = buildPhotoDecisionGroups([
      analysis('low', 'place_nogps', ['低对比风险（对比度 10/100）']),
      analysis('glare', 'place_nogps', ['高光或阴影裁切风险（曝光可用性 20/100）']),
    ]);
    expect(groups.technicalIssues.map((item) => item.key)).toEqual(['low', 'glare']);
  });

  it('keeps document exposure warnings in the document workflow', () => {
    const groups = buildPhotoDecisionGroups([
      analysis('receipt', 'document', ['过曝风险（平均亮度 230/255）']),
    ]);
    expect(groups.documents).toHaveLength(1);
    expect(groups.technicalIssues).toHaveLength(0);
  });

  it('does not duplicate a burst candidate in the standalone technical queue', () => {
    const burst = { ...analysis('burst-soft', 'place', ['清晰度偏低（10/100）']), clusterId: 'event:burst' };
    expect(buildPhotoDecisionGroups([burst]).technicalIssues).toHaveLength(0);
  });

  it('keeps exact pairs in duplicate review and reserves burst cards for three or more frames', () => {
    const pair = ['a', 'b'].map((key) => ({ ...analysis(key, 'place', []), clusterId: 'event:pair' }));
    const burst = ['c', 'd', 'e'].map((key) => ({ ...analysis(key, 'place', []), clusterId: 'event:burst' }));
    expect(buildPhotoDecisionGroups([...pair, ...burst]).bursts.map((group) => group.map((item) => item.key))).toEqual([['c', 'd', 'e']]);
  });
});
