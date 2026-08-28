export type HeritageMaterial = 'guji' | 'rubbing';
export type HeritageSkillId = 'guji-reading' | 'rubbing-reading' | 'digital-reconstruction';
export type HeritageScope = 'private' | 'public-draft';

export interface HeritageRuntimeStatus {
  engine: 'mnn' | 'ollama' | 'stub';
  platform: 'android-native' | 'web-cloud';
  nativeBridge: boolean;
  model: string;
  textReady: boolean;
  visionReady: boolean;
  adapters: Record<string, { installed: boolean; file?: string }>;
  restorer: { installed: boolean; file?: string };
  acceleration: string[];
}

export interface HeritageVisionResult {
  transcription: string;
  layout: string;
  uncertain: string[];
  excluded: string[];
  confidence: number | null;
  raw: string;
}

export interface HeritageRunResult {
  visual: HeritageVisionResult;
  punctuated: string;
  modernText: string;
  adapter: 'guji-vision' | 'rubbing-vision';
  visualSource: 'lora' | 'native-mnn' | 'base-fallback' | 'cloud-base' | 'verified-reference';
  gateReason?: string;
}

export interface HeritageRecord {
  id: string;
  skillId: HeritageSkillId;
  material: HeritageMaterial;
  title: string;
  city: string;
  createdAt: string;
  scope: HeritageScope;
  imageUrl: string;
  enhancedUrl: string;
  result: HeritageRunResult;
  geo?: { lng: number; lat: number };
  locationLabel?: string;
  locationNote?: string;
  sourceTitle?: string;
  sourcePage?: string;
  sourceUrl?: string;
  sourceLicense?: string;
  evidenceMethod?: string;
}
