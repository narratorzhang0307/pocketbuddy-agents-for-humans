export const AESTHETIC_BASE_REVISION = 'Qwen3-VL-2B-Instruct@ae9985b2' as const;
export const AESTHETIC_CANDIDATE_REVISION = 'choice-v3-hard/checkpoint-568@6228d2b5' as const;

export const AESTHETIC_CANDIDATE_EVIDENCE = {
  evaluationRows: 348,
  canonicalPairs: 174,
  baseAccuracy: 0.6494252873563219,
  markdownAccuracy: 0.603448275862069,
  loraAccuracy: 0.6867816091954023,
  basePairSymmetricAccuracy: 0.42528735632183906,
  markdownPairSymmetricAccuracy: 0.28160919540229884,
  loraPairSymmetricAccuracy: 0.5229885057471264,
  accuracyGainVsBestBaseline: 0.03735632183908044,
  accuracyGainVsMarkdown: 0.08333333333333337,
  pairSymmetricGainVsBestBaseline: 0.09770114942528735,
  requiredAccuracyGain: 0.05,
  strictChoiceRate: 1,
  positionAPredictionRate: 0.49712643678160917,
  pairedBootstrap95CI: [0, 0.07758620689655171] as const,
  mcnemarP: 0.09837064844049181,
  mcnemarVsMarkdownP: 0.005535899104192398,
  fullEvaluationJobId: 'dlc1fgdzwqqp4qjt',
  regressionBaseAccuracy: 0.6293103448275862,
  regressionMarkdownAccuracy: 0.5890804597701149,
  regressionLoraAccuracy: 0.6580459770114943,
  regressionBasePairSymmetricAccuracy: 0.42528735632183906,
  regressionLoraPairSymmetricAccuracy: 0.5229885057471264,
  visualTensors: 204,
  alignerTensors: 4,
  languageTensors: 0,
  adapterSha256: '6228d2b5ac63d0e0824d95de37a1f74548dec49464745e9e770fd7a46f35c1e1',
  mnnAdapterSha256: '5e6f8c0a1432ea437e2ca6e19f4fbcbbaa1b1ebae08c1209d6601c7de97422e8',
  leakageGatePassed: true,
  regressionNonDegradationPassed: true,
  mnnArtifactStructureValidated: true,
  mnnArtifactValidated: false,
} as const;

export type AestheticReleaseStatus = 'research-candidate' | 'release-ready';

export interface AestheticReleaseGateEvidence {
  canonicalPairs: number;
  accuracyGainVsBestBaseline: number;
  pairSymmetricGainVsBestBaseline: number;
  requiredAccuracyGain: number;
  evaluationRows: number;
  strictChoiceRate: number;
  positionAPredictionRate: number;
  pairedBootstrap95CI: readonly [number, number];
  mcnemarP: number;
  languageTensors: number;
  leakageGatePassed: boolean;
  regressionNonDegradationPassed: boolean;
  mnnArtifactValidated: boolean;
}

export function aestheticReleaseStatus(
  evidence: AestheticReleaseGateEvidence = AESTHETIC_CANDIDATE_EVIDENCE,
): AestheticReleaseStatus {
  return evidence.canonicalPairs >= 150
    && evidence.evaluationRows >= 300
    && evidence.accuracyGainVsBestBaseline >= evidence.requiredAccuracyGain
    && evidence.pairSymmetricGainVsBestBaseline >= evidence.requiredAccuracyGain
    && evidence.strictChoiceRate >= 0.95
    && evidence.positionAPredictionRate >= 0.30
    && evidence.positionAPredictionRate <= 0.70
    && evidence.pairedBootstrap95CI[0] > 0
    && evidence.mcnemarP <= 0.05
    && evidence.languageTensors === 0
    && evidence.leakageGatePassed
    && evidence.regressionNonDegradationPassed
    && evidence.mnnArtifactValidated
    ? 'release-ready'
    : 'research-candidate';
}
