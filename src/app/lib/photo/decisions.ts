import type { PhotoDecisionGroups, PhotoRadarAnalysis } from './radarTypes';
import { curationScoreOf } from './curation';

const byCuration = (left: PhotoRadarAnalysis, right: PhotoRadarAnalysis): number =>
  curationScoreOf(right) - curationScoreOf(left) || right.technicalQuality - left.technicalQuality || left.key.localeCompare(right.key);

export function buildPhotoDecisionGroups(analyses: PhotoRadarAnalysis[]): PhotoDecisionGroups {
  const clusters = new Map<string, PhotoRadarAnalysis[]>();
  for (const item of analyses) {
    if (!item.clusterId) continue;
    const group = clusters.get(item.clusterId) || [];
    group.push(item);
    clusters.set(item.clusterId, group);
  }
  const isDocument = (item: PhotoRadarAnalysis) => item.photoType === 'document' || item.photoType === 'screenshot';
  const hasTechnicalConcern = (item: PhotoRadarAnalysis) => item.reasons.some((reason) =>
    /清晰度|低对比|欠曝|过曝|高光|阴影裁切|反光/.test(reason));
  return {
    // A two-item component that collapses to one representative is presented as
    // a duplicate pair. Three or more time-local frames form a burst decision.
    bursts: [...clusters.values()].filter((group) => group.length >= 3)
      .map((group) => group.slice().sort(byCuration))
      .sort((a, b) => curationScoreOf(b[0]) - curationScoreOf(a[0])),
    duplicates: analyses.filter((item) => !!item.duplicateOf),
    technicalIssues: analyses.filter((item) => !item.clusterId && !isDocument(item)
      && (item.photoType === 'junk' || item.technicalQuality < 24 || hasTechnicalConcern(item))),
    documents: analyses.filter((item) => item.photoType === 'document' || item.tags.some((tag) => /票据|发票|登机牌|二维码|document|receipt/i.test(tag))),
    earthCandidates: analyses.filter((item) => item.pinnable).sort(byCuration),
  };
}
