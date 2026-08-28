import type { EdgeResponse } from '../../../../frost-agent/edge/types';
import { keyedStore } from '../skills/keyedStore';

export const PHOTO_INFERENCE_EVIDENCE_SCHEMA = 'pocket-earth.photo-inference-evidence/v1' as const;

export type PhotoInferenceTask = 'photo-router' | 'aesthetic-base' | 'ocr-base' | 'ocr-lora';
export type PhotoInferenceQualityGate = 'passed' | 'failed' | 'base-accepted' | 'base-kept' | 'lora-accepted' | 'manual-review';

export interface PhotoInferenceEvidenceEvent {
  id: string;
  schema: typeof PHOTO_INFERENCE_EVIDENCE_SCHEMA;
  createdAt: number;
  task: PhotoInferenceTask;
  /** Stable MediaStore/PhotoKit key. It is not an original filename or image payload. */
  assetKey: string;
  modelRevision: string;
  promptRevision: string;
  adapterRevision: string | null;
  backend: EdgeResponse['backend'];
  nativeBridge: boolean;
  /** Zero is asserted only when the Android native bridge answered a real MNN request. */
  networkRequests: 0 | null;
  runtimeVersion?: string;
  model?: string;
  cpuTarget?: number;
  mnnEnabled?: boolean;
  sme2Requested?: boolean;
  sme2Effective?: boolean;
  hardwareSme2?: boolean;
  acceleration: string[];
  metrics: {
    elapsedMs?: number;
    modelLoadMs?: number;
    ttfaMs?: number;
    prefillMs?: number;
    decodeMs?: number;
    decodeTokensPerSecond?: number;
    currentRssMb?: number;
    peakRssMb?: number;
    appPssMb?: number;
    thermalStatus?: number;
    batteryTemperatureC?: number;
    batteryPercent?: number;
  };
  qualityGate: PhotoInferenceQualityGate;
  /** Digest of model output for reproducibility. The output itself is deliberately not stored. */
  outputSha256?: string;
  errorCode?: string;
}

export interface AppendPhotoInferenceEvidenceInput {
  task: PhotoInferenceTask;
  assetKey?: string;
  modelRevision: string;
  promptRevision: string;
  adapterRevision?: string | null;
  response: Pick<EdgeResponse, 'backend' | 'model' | 'stats' | 'runtime' | 'error'>;
  qualityGate: PhotoInferenceQualityGate;
  output?: string;
  now?: number;
  id?: string;
}

const store = keyedStore<PhotoInferenceEvidenceEvent>('pe-photo-inference-evidence-v1', 'id');
const fallbackId = (now: number): string => `${now}-${Math.random().toString(36).slice(2, 10)}`;

async function sha256(value: string): Promise<string | undefined> {
  if (!value || typeof crypto === 'undefined' || !crypto.subtle) return undefined;
  try {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch { return undefined; }
}

const errorCode = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  return value.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 96) || 'unknown_error';
};

export async function createPhotoInferenceEvidence(input: AppendPhotoInferenceEvidenceInput): Promise<PhotoInferenceEvidenceEvent> {
  const createdAt = input.now ?? Date.now();
  const runtime = input.response.runtime;
  const stats = input.response.stats;
  const nativeBridge = runtime?.nativeBridge === true;
  const realNativeMnn = input.response.backend === 'mnn' && nativeBridge;
  const id = input.id || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : fallbackId(createdAt));
  return {
    id,
    schema: PHOTO_INFERENCE_EVIDENCE_SCHEMA,
    createdAt,
    task: input.task,
    assetKey: input.assetKey || 'session-asset',
    modelRevision: input.modelRevision,
    promptRevision: input.promptRevision,
    adapterRevision: input.adapterRevision ?? null,
    backend: input.response.backend,
    nativeBridge,
    networkRequests: realNativeMnn ? 0 : null,
    runtimeVersion: runtime?.version || stats?.runtime,
    model: input.response.model || stats?.model,
    cpuTarget: stats?.cpuTarget ?? runtime?.cpuTarget,
    mnnEnabled: stats?.mnnEnabled ?? runtime?.mnnEnabled,
    sme2Requested: stats?.sme2Requested ?? runtime?.sme2Requested,
    sme2Effective: stats?.sme2Effective ?? runtime?.sme2Effective,
    hardwareSme2: stats?.hardwareSme2 ?? runtime?.hardware?.sme2,
    acceleration: [...new Set([...(stats?.acceleration || []), ...(runtime?.acceleration || [])])],
    metrics: {
      elapsedMs: stats?.elapsedMs,
      modelLoadMs: stats?.modelLoadMs,
      ttfaMs: stats?.ttfaMs,
      prefillMs: stats?.prefillMs,
      decodeMs: stats?.decodeMs,
      decodeTokensPerSecond: stats?.decodeTokensPerSecond,
      currentRssMb: stats?.currentRssMb,
      peakRssMb: stats?.peakRssMb,
      appPssMb: stats?.appPssMb,
      thermalStatus: stats?.thermalStatus,
      batteryTemperatureC: stats?.batteryTemperatureC,
      batteryPercent: stats?.batteryPercent,
    },
    qualityGate: input.qualityGate,
    outputSha256: await sha256(input.output || ''),
    errorCode: errorCode(input.response.error),
  };
}

/** One inference result is committed immediately so a crash cannot erase earlier samples. */
export async function appendPhotoInferenceEvidence(input: AppendPhotoInferenceEvidenceInput): Promise<PhotoInferenceEvidenceEvent> {
  const event = await createPhotoInferenceEvidence(input);
  await store.put(event);
  return event;
}

export async function getPhotoInferenceEvidence(): Promise<PhotoInferenceEvidenceEvent[]> {
  const events = await store.all();
  return events
    .filter((event) => event?.schema === PHOTO_INFERENCE_EVIDENCE_SCHEMA)
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
}

export function serializePhotoInferenceEvidence(events: PhotoInferenceEvidenceEvent[]): string {
  return JSON.stringify({
    schema: PHOTO_INFERENCE_EVIDENCE_SCHEMA,
    exportedAt: new Date().toISOString(),
    privacy: 'derived runtime evidence only; no original image bytes; no thumbnails; no OCR body text',
    networkZeroRule: 'networkRequests=0 only when backend=mnn and runtime.nativeBridge=true',
    events,
  }, null, 2);
}

export async function clearPhotoInferenceEvidence(): Promise<void> {
  const events = await store.all();
  await store.delMany(events.map((event) => event.id));
}
