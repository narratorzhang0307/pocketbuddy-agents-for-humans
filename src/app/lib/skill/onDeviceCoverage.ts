export type OnDeviceCapability = 'local-data' | 'mnn-text' | 'mnn-vision' | 'mnn-tool';
export type MobileSemanticRuntime = 'qwen3-4b-health-mnn' | 'not-required';

export interface OnDeviceSkillCoverage {
  manifestId: string;
  label: string;
  capabilities: OnDeviceCapability[];
  semanticRuntime: MobileSemanticRuntime;
  semanticTasks: string[];
  deterministicTasks: string[];
  proof: string;
}

const QWEN4B: MobileSemanticRuntime = 'qwen3-4b-health-mnn';

// Every built-in in the health edition declares its local execution boundary.
export const ON_DEVICE_SKILL_COVERAGE: OnDeviceSkillCoverage[] = [
  { manifestId: 'frost.health-consultation', label: 'Health Consultation Agent', capabilities: ['local-data'], semanticRuntime: 'not-required', semanticTasks: [], deterministicTasks: ['On-device ASR and direct voice entry', 'Text RAG retrieval and session isolation', 'On-device TTS and Bluetooth audio return'], proof: 'The device only does text retrieval and voice mediation; the consultation you submit goes explicitly to the server-configured Qwen. No on-device medical inference is claimed, and unverified material is never used for diagnosis or prescription' },
  { manifestId: 'frost.bird-listener', label: 'Bird ID', capabilities: ['local-data'], semanticRuntime: 'not-required', semanticTasks: [], deterministicTasks: ['On-device ASR and command routing', 'Complete-recording check and T5 window selection', 'OSS image check and BLE return'], proof: 'The iPhone native coordinator handles Bluetooth and on-device ASR; species inference runs explicitly on the existing HearNature server, and no on-device bird ID model is claimed' },
  { manifestId: 'pocket.her-motion', label: 'HER MOTION', capabilities: ['mnn-vision', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['Movement intent understanding', 'Training feedback explanation'], deterministicTasks: ['Pose keypoints', 'Multi-frame confirmation', 'Confidence gating'], proof: 'Local pose pipeline + a Qwen3-4B health explanation layer; the camera feed is not a medical diagnosis' },
  { manifestId: 'pocket.lianlema', label: 'Lianlema', capabilities: ['mnn-vision', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['Movement feedback explanation'], deterministicTasks: ['RTMPose keypoints', 'ST-GCN move classification', 'Rep counting'], proof: 'The local movement service produces reviewable keypoints and counts; Qwen3-4B only handles the wording' },
  { manifestId: 'frost.run-route', label: 'RUN ROUTE', capabilities: ['local-data'], semanticRuntime: 'not-required', semanticTasks: [], deterministicTasks: ['AMap walking routing', 'GPS coordinate conversion', 'Off-route recalculation', 'Track deduplication'], proof: 'Deterministic AMap route results and an on-device RouteSession; the planned line and the real track are stored separately' },
  { manifestId: 'frost.running-coach', label: 'RUNNING COACH', capabilities: ['mnn-text', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['Readiness explanation', 'Prescription explanation', 'Training review'], deterministicTasks: ['Personal baselines', 'Stop rules', 'Load ceilings'], proof: 'Rules decide the safety boundary first, then Qwen3-4B explains the structured result' },
  { manifestId: 'frost.healthsync', label: 'HEALTHSYNC', capabilities: ['mnn-text', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['Trend summary'], deterministicTasks: ['Apple Health import', 'Deduplication', 'Sleep, steps and HRV queries'], proof: 'Raw health data is parsed on the device, and the model receives only the minimum aggregated fields' },
  { manifestId: 'frost.mediapipe-motion', label: 'MEDIAPIPE MOTION', capabilities: ['mnn-vision'], semanticRuntime: QWEN4B, semanticTasks: ['Movement cue wording'], deterministicTasks: ['Keypoint extraction', 'Video throttling', 'Multi-frame and confidence gating'], proof: 'Movement decisions come from reviewable keypoint rules; Qwen3-4B never guesses the pose directly' },
  { manifestId: 'frost.endurance-guard', label: 'ENDURANCE GUARD', capabilities: ['mnn-text', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['Prescription explanation'], deterministicTasks: ['Load progression check', 'Intensity ceiling', 'Audit evidence'], proof: 'Deterministic safety checks run first; when one fails the model cannot override the stop result' },
  { manifestId: 'frost.openfoodfacts', label: 'OPEN FOOD FACTS', capabilities: ['mnn-text', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['Nutrition field explanation'], deterministicTasks: ['Barcode lookup', 'Per-100 g normalisation', 'Data completeness'], proof: 'Public food data is structured before it reaches Qwen3-4B, and missing fields are never invented' },
  { manifestId: 'frost.garmin-readonly', label: 'GARMIN READONLY', capabilities: ['mnn-text', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['Training status summary'], deterministicTasks: ['Read-only activity, sleep and HRV queries', 'FIT/GPX metadata'], proof: 'The connector exposes read commands only; write operations never enter the Skill permission table' },
  { manifestId: 'frost.cn-health-library', label: 'CN HEALTH LIBRARY', capabilities: ['mnn-text', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['Chinese meal nutrition explanation', 'Weekly report summary'], deterministicTasks: ['Chinese food lookup', 'Apple Health field mapping'], proof: 'The local food table is bound to field-level evidence, and Qwen3-4B never replaces a source value' },
  { manifestId: 'frost.outdoor-window', label: 'OUTDOOR WINDOW', capabilities: ['mnn-text', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['Outdoor window explanation'], deterministicTasks: ['Weather, AQI, UV and thunderstorm gating'], proof: 'Live environment metrics pass threshold rules first; the model only explains whether outdoor training fits' },
  { manifestId: 'frost.strava-replay', label: 'STRAVA REPLAY', capabilities: ['mnn-text', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['Training review'], deterministicTasks: ['Activity read', 'Split and pace computation'], proof: 'Raw activities are imported read-only, and split metrics are computed by deterministic code' },
  { manifestId: 'frost.sleep-detective', label: 'SLEEP DETECTIVE', capabilities: ['mnn-text', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['Sleep factor summary'], deterministicTasks: ['Time window alignment', 'Correlation computation', 'Missing value gating'], proof: 'Only observable correlations are reported; a correlation is never written up as medical causation' },
  { manifestId: 'frost.meal-lens', label: 'MEAL LENS', capabilities: ['mnn-vision', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['Meal candidate recognition', 'Portion uncertainty note'], deterministicTasks: ['Image quality gate', 'User confirmation', 'Nutrition range computation'], proof: 'A photo only produces candidates; the record is written after the user confirms the food and the portion' },
  { manifestId: 'frost.wger-planner', label: 'WGER', capabilities: ['mnn-text', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['Training plan explanation'], deterministicTasks: ['Exercise read', 'Training progress', 'Same-day intensity re-check'], proof: 'Plans come from auditable training data, and a completion must be confirmed before it is recorded' },
  { manifestId: 'frost.mealie-kitchen', label: 'MEALIE', capabilities: ['mnn-text', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['Recovery meal choice explanation'], deterministicTasks: ['Recipe read', 'Meal plan filtering', 'Shopping item generation'], proof: 'Choices come only from your own recipe library, and Qwen3-4B never invents stock' },
];

export function onDeviceCoverage(manifestId: string): OnDeviceSkillCoverage | undefined {
  return ON_DEVICE_SKILL_COVERAGE.find((item) => item.manifestId === manifestId);
}
