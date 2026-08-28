import type { PhotoType, Verdict } from './types';

export type PhotoDocumentKind = 'receipt' | 'boarding-pass' | 'ticket' | 'qr-code' | 'document' | 'none';
export type PhotoSourceType = 'real_photo' | 'screenshot' | 'document_photo' | 'artwork' | 'uncertain';
export type PhotoRouterDocumentType = 'receipt' | 'ticket' | 'menu' | 'id' | 'other' | 'none';
export type PhotoPrivacyRisk = 'face' | 'id_number' | 'address' | 'qr';
export type PhotoRouterRoute = 'semantic_index' | 'ocr' | 'geo_pin' | 'review';
export type PhotoAestheticSource = 'qwen3-vl-2b-base' | 'aesthetic-lora' | 'technical-fallback';

export interface PhotoCurationBreakdown {
  technical: number;
  universalAesthetic?: number;
  aestheticWeight: number;
  personalAffinity?: number;
  personalWeight: number;
}

export interface PhotoRouterEvidence {
  sourceType: PhotoSourceType;
  content: string[];
  documentType: PhotoRouterDocumentType;
  needsOcr: boolean;
  privacyRisk: PhotoPrivacyRisk[];
  route: PhotoRouterRoute;
  description: string;
  hardDocument: boolean;
  confidence: number;
}

export interface PhotoDocumentEvidence {
  kind: PhotoDocumentKind;
  text: string;
  merchant?: string;
  amount?: string;
  date?: string;
  identifiers: string[];
  confidence: number;
  route: 'base' | 'general-ocr-vision' | 'manual';
  qualityScore: number;
  qualityGate: 'base-accepted' | 'lora-accepted' | 'base-kept' | 'manual-review';
  /** Critical fields that disagree between Base and LoRA. Never auto-resolve a close conflict. */
  conflicts?: Array<'merchant' | 'amount' | 'date'>;
  /** Compact local-only comparison evidence; OCR body text is intentionally not duplicated. */
  candidates?: {
    base: PhotoDocumentCandidate;
    enhanced?: PhotoDocumentCandidate;
  };
}

export interface PhotoDocumentCandidate {
  merchant?: string;
  amount?: string;
  date?: string;
  confidence: number;
  qualityScore: number;
}

export interface PhotoRadarAnalysis {
  key: string;
  assetId: string;
  contentHash: string;
  /** DCT 感知哈希；仅与时间/GPS/dHash 联合作为相似证据。 */
  perceptualHash?: string;
  photoType: PhotoType;
  technicalQuality: number;
  /** 基座/未来 LoRA 给出的通用视觉审美分；不混入用户个人偏好。 */
  universalAesthetic?: number;
  aestheticConfidence?: number;
  aestheticReasons?: string[];
  aestheticSource?: PhotoAestheticSource;
  /** 宿主侧最终排序分；技术、通用审美和有置信度的个人偏好在这里组合。 */
  curationScore?: number;
  curationBreakdown?: PhotoCurationBreakdown;
  personalAffinity?: number;
  preferenceConfidence: number;
  confidence: number;
  similarRepresentative?: boolean;
  duplicateOf?: string;
  clusterId?: string;
  verdict: Verdict;
  pinnable: boolean;
  needPlace: boolean;
  /** Only explicit user confirmation may set this flag. */
  chronicleIncluded?: boolean;
  tags: string[];
  reasons: string[];
  sharpness?: number;
  exposure?: number;
  colorful?: number;
  contrast?: number;
  document?: PhotoDocumentEvidence;
  /** Structured Qwen routing evidence. Never contains OCR body text. */
  understanding?: PhotoRouterEvidence;
  visionBackend: 'local-features' | 'local-clip' | 'qwen3-vl-mnn' | 'fallback';
  /** Cheap-analysis algorithm version. Old dHash records remain readable and fall back safely. */
  algorithmVersion?: 'photo-radar-dhash-v2' | 'photo-radar-dhash-phash-v3';
  analyzedAt: number;
}

export interface PhotoDecisionGroups {
  bursts: PhotoRadarAnalysis[][];
  duplicates: PhotoRadarAnalysis[];
  technicalIssues: PhotoRadarAnalysis[];
  documents: PhotoRadarAnalysis[];
  earthCandidates: PhotoRadarAnalysis[];
}
