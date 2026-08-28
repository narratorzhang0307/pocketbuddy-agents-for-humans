export {
  buildGarminReadCommand,
  buildHealthsyncImportCommand,
  buildHealthsyncReadCommand,
  buildOpenFoodFactsRequest,
} from '../../../server/health-skill-policy.mjs';
export type { GarminReadOperation, GarminReadQuery, HealthsyncQuery } from '../../../server/health-skill-policy.mjs';

export const QWEN4B_HEALTH_CONTROL_PLANE = {
  protocol: 'frost-qwen-control/v1' as const,
  model: 'Qwen/Qwen3-4B',
  license: 'Apache-2.0',
  role: 'intent-routing-and-evidence-synthesis' as const,
  runtime: 'MNN-compatible-contract' as const,
  assetStatus: 'installable-device-validation-required' as const,
  allowed: ['route-skill', 'summarize-tool-results', 'draft-prescription', 'explain-uncertainty'] as const,
  forbidden: ['invent-health-facts', 'read-raw-video', 'execute-provider-writes', 'override-safety-gate'] as const,
};

export type ReadinessBand = 'green' | 'yellow' | 'red' | 'insufficient';
export type TrainingIntensity = 'rest' | 'recovery' | 'easy' | 'moderate' | 'hard';

export interface ReadinessInput {
  sleepHours?: number;
  hrvDeltaPct?: number;
  restingHeartRateDeltaBpm?: number;
  fatigue?: number;
  pain?: number;
  dangerSignals?: Array<'chest_pain' | 'fainting' | 'severe_shortness_of_breath' | 'heat_illness'>;
}

export interface ReadinessDecision {
  band: ReadinessBand;
  maxIntensity: TrainingIntensity;
  confidence: number;
  reasons: string[];
  missing: string[];
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function assessReadiness(input: ReadinessInput): ReadinessDecision {
  const reasons: string[] = [];
  const missing: string[] = [];
  const dangerSignals = input.dangerSignals || [];
  if (dangerSignals.length || (finite(input.pain) && input.pain >= 7)) {
    if (dangerSignals.length) reasons.push(`安全停止信号：${dangerSignals.join(', ')}`);
    if (finite(input.pain) && input.pain >= 7) reasons.push(`疼痛 ${input.pain}/10`);
    return { band: 'red', maxIntensity: 'rest', confidence: 1, reasons, missing };
  }

  const severe: string[] = [];
  const caution: string[] = [];
  if (!finite(input.sleepHours)) missing.push('sleepHours');
  else if (input.sleepHours < 5) severe.push(`睡眠 ${input.sleepHours.toFixed(1)}h < 5h`);
  else if (input.sleepHours < 7) caution.push(`睡眠 ${input.sleepHours.toFixed(1)}h < 7h`);

  if (!finite(input.hrvDeltaPct)) missing.push('hrvDeltaPct');
  else if (input.hrvDeltaPct <= -20) severe.push(`HRV 低于个人基线 ${Math.abs(input.hrvDeltaPct).toFixed(0)}%`);
  else if (input.hrvDeltaPct <= -10) caution.push(`HRV 低于个人基线 ${Math.abs(input.hrvDeltaPct).toFixed(0)}%`);

  if (!finite(input.restingHeartRateDeltaBpm)) missing.push('restingHeartRateDeltaBpm');
  else if (input.restingHeartRateDeltaBpm >= 10) severe.push(`静息心率高于基线 ${input.restingHeartRateDeltaBpm.toFixed(0)} bpm`);
  else if (input.restingHeartRateDeltaBpm >= 5) caution.push(`静息心率高于基线 ${input.restingHeartRateDeltaBpm.toFixed(0)} bpm`);

  if (finite(input.fatigue)) {
    if (input.fatigue >= 8) severe.push(`主观疲劳 ${input.fatigue}/10`);
    else if (input.fatigue >= 5) caution.push(`主观疲劳 ${input.fatigue}/10`);
  }
  if (finite(input.pain)) {
    if (input.pain >= 5) severe.push(`疼痛 ${input.pain}/10`);
    else if (input.pain >= 3) caution.push(`疼痛 ${input.pain}/10`);
  }

  reasons.push(...severe, ...caution);
  const measured = 3 - missing.length;
  const confidence = Math.max(0.25, Math.min(1, (measured + (finite(input.fatigue) ? 1 : 0) + (finite(input.pain) ? 1 : 0)) / 5));
  if (severe.length >= 2) return { band: 'red', maxIntensity: 'recovery', confidence, reasons, missing };
  if (severe.length === 1 || caution.length >= 2) return { band: 'yellow', maxIntensity: 'easy', confidence, reasons, missing };
  if (measured < 2) return { band: 'insufficient', maxIntensity: 'easy', confidence, reasons: reasons.length ? reasons : ['个人基线信号不足'], missing };
  return { band: 'green', maxIntensity: 'hard', confidence, reasons: reasons.length ? reasons : ['恢复信号未触发降级门'], missing };
}

export interface PersonalBaselineInput {
  sleepHours: number[];
  hrvMs: number[];
  restingHeartRateBpm: number[];
  today: { sleepHours?: number; hrvMs?: number; restingHeartRateBpm?: number; fatigue?: number; pain?: number };
}

export interface PersonalBaselineAssessment {
  baseline: { sleepHours?: number; hrvMs?: number; restingHeartRateBpm?: number };
  dataPoints: { sleep: number; hrv: number; restingHeartRate: number };
  readinessInput: ReadinessInput;
  decision: ReadinessDecision;
}

function robustBaseline(values: number[]): { value?: number; count: number } {
  const clean = values.filter((value) => finite(value) && value > 0).slice(-28).sort((left, right) => left - right);
  if (clean.length < 7) return { count: clean.length };
  const middle = Math.floor(clean.length / 2);
  return { value: clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2, count: clean.length };
}

export function assessReadinessFromPersonalBaseline(input: PersonalBaselineInput): PersonalBaselineAssessment {
  const sleep = robustBaseline(input.sleepHours);
  const hrv = robustBaseline(input.hrvMs);
  const restingHeartRate = robustBaseline(input.restingHeartRateBpm);
  const readinessInput: ReadinessInput = {
    sleepHours: input.today.sleepHours,
    hrvDeltaPct: finite(input.today.hrvMs) && finite(hrv.value) ? ((input.today.hrvMs - hrv.value) / hrv.value) * 100 : undefined,
    restingHeartRateDeltaBpm: finite(input.today.restingHeartRateBpm) && finite(restingHeartRate.value) ? input.today.restingHeartRateBpm - restingHeartRate.value : undefined,
    fatigue: input.today.fatigue,
    pain: input.today.pain,
  };
  return {
    baseline: { sleepHours: sleep.value, hrvMs: hrv.value, restingHeartRateBpm: restingHeartRate.value },
    dataPoints: { sleep: sleep.count, hrv: hrv.count, restingHeartRate: restingHeartRate.count },
    readinessInput,
    decision: assessReadiness(readinessInput),
  };
}

export interface TrainingPrescription {
  intensity: TrainingIntensity;
  durationMin: number;
  stopRules: string[];
  evidenceIds: string[];
}

export interface PrescriptionValidation {
  ok: boolean;
  errors: string[];
  conservative: TrainingPrescription;
}

const INTENSITY_RANK: Record<TrainingIntensity, number> = { rest: 0, recovery: 1, easy: 2, moderate: 3, hard: 4 };

function capFor(readiness: ReadinessDecision): TrainingIntensity {
  if (readiness.band === 'red') return readiness.maxIntensity === 'rest' ? 'rest' : 'recovery';
  if (readiness.band === 'yellow' || readiness.band === 'insufficient') return 'easy';
  return readiness.maxIntensity;
}

export function validateTrainingPrescription(prescription: TrainingPrescription, readiness: ReadinessDecision): PrescriptionValidation {
  const errors: string[] = [];
  const cap = capFor(readiness);
  if (!finite(prescription.durationMin) || prescription.durationMin < 0 || prescription.durationMin > 300) errors.push('duration_out_of_range');
  if (!prescription.stopRules.length) errors.push('stop_rules_required');
  if (!prescription.evidenceIds.length) errors.push('evidence_required');
  if (INTENSITY_RANK[prescription.intensity] > INTENSITY_RANK[cap]) errors.push(`intensity_exceeds_${readiness.band}_cap`);
  const conservative: TrainingPrescription = {
    ...prescription,
    intensity: INTENSITY_RANK[prescription.intensity] > INTENSITY_RANK[cap] ? cap : prescription.intensity,
    durationMin: finite(prescription.durationMin) ? Math.max(0, Math.min(300, prescription.durationMin)) : 0,
    stopRules: prescription.stopRules.length ? [...prescription.stopRules] : ['出现胸痛、眩晕、异常呼吸困难或影响步态的疼痛时立即停止'],
    evidenceIds: [...prescription.evidenceIds],
  };
  return { ok: errors.length === 0, errors, conservative };
}

export type ProgressionVariable = 'duration' | 'intensity' | 'density' | 'environment' | 'fueling';

export interface EnduranceAuditInput {
  prescription: TrainingPrescription;
  readiness: ReadinessDecision;
  dataReadAt: string;
  sourceEventIds: string[];
  progressionVariables?: ProgressionVariable[];
  thresholdChangeSource?: 'none' | 'validated-test' | 'estimate';
  now?: Date;
}

export interface EnduranceAuditResult extends PrescriptionValidation {
  warnings: string[];
  dataAgeHours: number | null;
}

export function auditEndurancePrescription(input: EnduranceAuditInput): EnduranceAuditResult {
  const base = validateTrainingPrescription(input.prescription, input.readiness);
  const errors = [...base.errors];
  const warnings: string[] = [];
  const dataReadAt = new Date(input.dataReadAt);
  const now = input.now || new Date();
  const dataAgeHours = Number.isFinite(dataReadAt.getTime()) ? (now.getTime() - dataReadAt.getTime()) / 3_600_000 : null;
  if (dataAgeHours === null || dataAgeHours < -0.1) errors.push('invalid_data_read_time');
  else if (dataAgeHours > 36) errors.push('evidence_not_current');
  const sourceIds = new Set(input.sourceEventIds);
  if (input.prescription.evidenceIds.some((id) => !sourceIds.has(id))) errors.push('prescription_evidence_not_read');
  if ((input.progressionVariables?.length || 0) > 1) errors.push('multiple_progression_variables');
  if (input.thresholdChangeSource === 'estimate') errors.push('estimated_threshold_change_forbidden');
  if (input.readiness.band === 'insufficient') warnings.push('insufficient_readiness_data');
  return { ...base, ok: errors.length === 0, errors, warnings, dataAgeHours };
}

export interface PoseSignalInput {
  confidence: number;
  consecutiveFrames: number;
  visibleLandmarks: number;
}

export function confirmPoseSignal(input: PoseSignalInput): { accepted: boolean; reason: string } {
  if (!finite(input.confidence) || input.confidence < 0 || input.confidence > 1) return { accepted: false, reason: 'invalid_confidence' };
  if (!Number.isInteger(input.consecutiveFrames) || input.consecutiveFrames < 0) return { accepted: false, reason: 'invalid_frame_count' };
  if (!Number.isInteger(input.visibleLandmarks) || input.visibleLandmarks < 0 || input.visibleLandmarks > 33) return { accepted: false, reason: 'invalid_landmark_count' };
  if (input.visibleLandmarks < 12) return { accepted: false, reason: 'insufficient_visible_landmarks' };
  if (input.confidence < 0.7) return { accepted: false, reason: 'confidence_below_gate' };
  if (input.consecutiveFrames < 5) return { accepted: false, reason: 'awaiting_consecutive_frames' };
  return { accepted: true, reason: 'pose_confirmed' };
}
