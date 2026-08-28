import type { PhotoAestheticSource, PhotoRadarAnalysis } from './radarTypes';

export interface PhotoAestheticJudgment {
  score: number;
  confidence: number;
  reasons: string[];
  source: Exclude<PhotoAestheticSource, 'technical-fallback'>;
}

const clamp = (value: number, min = 0, max = 100): number => Math.max(min, Math.min(max, value));

export const isVisualPhoto = (analysis: PhotoRadarAnalysis): boolean => (
  analysis.photoType === 'place' || analysis.photoType === 'life' || analysis.photoType === 'place_nogps'
);

/**
 * Cheap technical screening always runs first. Qwen/LoRA only refines real-photo
 * candidates, and personal preference is confidence-gated so cold start is neutral.
 * This function never changes verdict, duplicate state, or any explicit user choice.
 */
export function withCurationScore(analysis: PhotoRadarAnalysis): PhotoRadarAnalysis {
  const technical = clamp(analysis.technicalQuality);
  const hasAesthetic = isVisualPhoto(analysis) && Number.isFinite(analysis.universalAesthetic);
  const aestheticConfidence = hasAesthetic ? clamp(analysis.aestheticConfidence ?? 0, 0, 1) : 0;
  const aestheticWeight = hasAesthetic ? 0.72 * aestheticConfidence : 0;
  const aesthetic = hasAesthetic ? clamp(analysis.universalAesthetic!) : technical;
  const visualScore = technical * (1 - aestheticWeight) + aesthetic * aestheticWeight;
  const hasPreference = isVisualPhoto(analysis) && Number.isFinite(analysis.personalAffinity);
  const personalWeight = hasPreference ? 0.25 * clamp(analysis.preferenceConfidence, 0, 1) : 0;
  const personal = hasPreference ? clamp(analysis.personalAffinity!) : visualScore;
  const curationScore = Math.round(visualScore * (1 - personalWeight) + personal * personalWeight);
  return {
    ...analysis,
    curationScore,
    curationBreakdown: {
      technical,
      ...(hasAesthetic ? { universalAesthetic: aesthetic } : {}),
      aestheticWeight,
      ...(hasPreference ? { personalAffinity: personal } : {}),
      personalWeight,
    },
    aestheticSource: hasAesthetic ? (analysis.aestheticSource || 'qwen3-vl-2b-base') : 'technical-fallback',
  };
}

export function applyAestheticJudgment(
  analysis: PhotoRadarAnalysis,
  judgment: PhotoAestheticJudgment,
): PhotoRadarAnalysis {
  if (!isVisualPhoto(analysis)) return withCurationScore(analysis);
  return withCurationScore({
    ...analysis,
    universalAesthetic: clamp(judgment.score),
    aestheticConfidence: clamp(judgment.confidence, 0, 1),
    aestheticReasons: [...new Set(judgment.reasons.map((reason) => reason.trim()).filter(Boolean))].slice(0, 3),
    aestheticSource: judgment.source,
  });
}

export function curationScoreOf(analysis: PhotoRadarAnalysis): number {
  return Number.isFinite(analysis.curationScore)
    ? clamp(analysis.curationScore!)
    : withCurationScore(analysis).curationScore!;
}
