import type { PhotoRuntimeStatus } from '../../../../frost-agent/edge/httpPhotoEdge';
import { runScreen } from './screen';
import { patchIndexedAssets, upsertIndexedAssets } from './libraryStore';
import { resolveThumbnailUrl } from './libraryBridge';
import type { PhotoAssetIndex, PhotoLibraryAsset } from './libraryTypes';
import { applyAestheticJudgment, withCurationScore } from './curation';
import { getPhotoPreferenceModel, preferenceVector, scorePreference } from './preference';
import { putRadarAnalyses, putRadarAnalysis } from './radarStore';
import type { PhotoRadarAnalysis } from './radarTypes';
import type { PhotoResult } from './types';
import { extractDocumentWithQualityGate, understandPhotoWithQwen } from './understanding';

export type PhotoRadarPhase = '读取缩略图' | '端侧技术分析' | '相似与事件聚类' | '保存本地索引';
export type PhotoRadarProgress = (done: number, total: number, phase: PhotoRadarPhase | string) => void;

export const PHOTO_RADAR_ALGORITHM_VERSION = 'photo-radar-dhash-phash-v3' as const;

export type PhotoReadPurpose = 'screen' | 'vision' | 'ocr';

/** Bulk screening stays cheap; only selected images receive a larger derived JPEG. */
export function photoReadProfile(purpose: PhotoReadPurpose): { maxEdge: number; quality: number } {
  if (purpose === 'ocr') return { maxEdge: 1440, quality: 0.9 };
  if (purpose === 'vision') return { maxEdge: 1024, quality: 0.84 };
  return { maxEdge: 320, quality: 0.66 };
}

export function needsPhotoRadarAnalysis(asset: PhotoLibraryAsset, analysis?: PhotoRadarAnalysis): boolean {
  return asset.mediaType === 'image' && (!analysis || analysis.algorithmVersion !== PHOTO_RADAR_ALGORITHM_VERSION);
}

/**
 * Promote trustworthy metadata recovered while decoding a thumbnail into the
 * lightweight asset index. The image bytes remain session-only; only EXIF time,
 * location and dimensions are persisted.
 */
export function photoResultAssetMetadataPatch(
  result: Pick<PhotoResult, 'date' | 'hasGPS' | 'lat' | 'lng' | 'w' | 'h'>,
  asset?: Pick<PhotoAssetIndex, 'source' | 'width' | 'height'>,
): Partial<PhotoAssetIndex> {
  const capturedAt = result.date?.getTime();
  const patch: Partial<PhotoAssetIndex> = {};
  if (capturedAt != null && Number.isFinite(capturedAt)) patch.creationTime = capturedAt;
  const dimensionsMissing = !asset || asset.source === 'web-picker' || asset.width <= 0 || asset.height <= 0;
  if (dimensionsMissing && Number.isFinite(result.w) && result.w > 0) patch.width = result.w;
  if (dimensionsMissing && Number.isFinite(result.h) && result.h > 0) patch.height = result.h;
  if (result.hasGPS && result.lat != null && result.lng != null
    && Number.isFinite(result.lat) && Number.isFinite(result.lng)) {
    patch.latitude = result.lat;
    patch.longitude = result.lng;
  }
  return patch;
}

async function analysisFile(asset: PhotoLibraryAsset, purpose: PhotoReadPurpose = 'screen'): Promise<File | null> {
  try {
    if (asset.localFile) {
      return new File([asset.localFile], asset.key, { type: asset.localFile.type, lastModified: asset.localFile.lastModified });
    }
    const profile = photoReadProfile(purpose);
    const thumbnailUrl = await resolveThumbnailUrl(asset, {
      width: profile.maxEdge, height: profile.maxEdge, quality: profile.quality,
    });
    if (!thumbnailUrl) return null;
    const response = await fetch(thumbnailUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new File([blob], asset.key, { type: blob.type || asset.mimeType, lastModified: asset.modificationTime || asset.creationTime || Date.now() });
  } catch { return null; }
}

export async function photoImageDataUrl(asset: PhotoLibraryAsset, purpose: PhotoReadPurpose = 'vision'): Promise<string> {
  const file = await analysisFile(asset, purpose);
  if (!file) return '';
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

export async function analyzePhotoAssets(
  assets: PhotoLibraryAsset[],
  options: { useLocalClip?: boolean; onProgress?: PhotoRadarProgress } = {},
): Promise<PhotoRadarAnalysis[]> {
  const images = assets.filter((asset) => asset.mediaType === 'image');
  await upsertIndexedAssets(images);
  const files: File[] = [];
  const failedAssetKeys: string[] = [];
  const assetByKey = new Map(images.map((asset) => [asset.key, asset]));
  const hints: NonNullable<Parameters<typeof runScreen>[1]['assetHints']> = {};
  for (let index = 0; index < images.length; index++) {
    options.onProgress?.(index, images.length, '读取缩略图');
    const asset = images[index];
    const file = await analysisFile(asset);
    if (!file) { failedAssetKeys.push(asset.key); continue; }
    files.push(file);
    hints[file.name] = {
      // Native PhotoKit/MediaStore metadata is authoritative. Browser-selected
      // Files have no capture-time API, so let readExif use DateTimeOriginal.
      ...(asset.source !== 'web-picker' && asset.creationTime ? { capDate: new Date(asset.creationTime) } : {}),
      latitude: asset.latitude,
      longitude: asset.longitude,
    };
  }
  await patchIndexedAssets(failedAssetKeys.map((key) => ({ key, patch: { analysisState: 'failed' } })));
  options.onProgress?.(files.length, images.length, '端侧技术分析');
  const results = await runScreen(files, {
    maxAnalyze: 256,
    useModel: options.useLocalClip === true,
    modelTopN: 32,
    assetHints: hints,
  }, (done, total, phase) => options.onProgress?.(done, total, phase));
  options.onProgress?.(0, 1, '相似与事件聚类');
  const preference = getPhotoPreferenceModel();
  const analyses: PhotoRadarAnalysis[] = [];
  const analyzedAssetKeys: string[] = [];
  const assetMetadataPatches = new Map<string, Partial<PhotoAssetIndex>>();
  const batchId = images[0]?.assetId || String(Date.now());
  for (const result of results) {
    const asset = assetByKey.get(result.name);
    try { URL.revokeObjectURL(result.url); } catch { /* non-blob URL */ }
    if (!asset) continue;
    const metadataPatch = photoResultAssetMetadataPatch(result, asset);
    Object.assign(asset, metadataPatch);
    assetMetadataPatches.set(asset.key, metadataPatch);
    const base: PhotoRadarAnalysis = {
      key: asset.key,
      assetId: asset.assetId,
      contentHash: result.id,
      perceptualHash: result.perceptualHash,
      photoType: result.photoType,
      technicalQuality: result.technicalQuality,
      sharpness: result.sharpness,
      exposure: result.exposure,
      colorful: result.colorful,
      contrast: result.contrast,
      preferenceConfidence: 0,
      confidence: result.confidence,
      similarRepresentative: result.similarRepresentative,
      duplicateOf: result.dupOf,
      clusterId: result.clusterId ? `${batchId}:${result.clusterId}` : undefined,
      verdict: result.verdict,
      pinnable: result.pinnable,
      needPlace: result.needPlace,
      tags: result.tags,
      reasons: result.reasons,
      visionBackend: options.useLocalClip ? 'local-clip' : 'local-features',
      algorithmVersion: PHOTO_RADAR_ALGORITHM_VERSION,
      analyzedAt: Date.now(),
    };
    const scored = scorePreference(preference, preferenceVector(base, asset.latitude != null && asset.longitude != null));
    base.personalAffinity = scored.affinity;
    base.preferenceConfidence = scored.confidence;
    analyses.push(withCurationScore(base));
    analyzedAssetKeys.push(asset.key);
  }
  await putRadarAnalyses(analyses);
  const completedAt = Date.now();
  await patchIndexedAssets(analyzedAssetKeys.map((key) => ({
    key,
    patch: { ...assetMetadataPatches.get(key), analysisState: 'analyzed', lastSeenAt: completedAt },
  })));
  options.onProgress?.(analyses.length, analyses.length, '保存本地索引');
  return analyses;
}

export async function enrichRadarWithQwen(asset: PhotoLibraryAsset, analysis: PhotoRadarAnalysis, signal?: AbortSignal): Promise<PhotoRadarAnalysis> {
  const image = await photoImageDataUrl(asset, 'vision');
  if (signal?.aborted) throw new DOMException('照片理解已取消', 'AbortError');
  if (!image) return analysis;
  const response = await understandPhotoWithQwen(image, signal, { assetKey: asset.key });
  if (signal?.aborted) throw new DOMException('照片理解已取消', 'AbortError');
  if (response.backend !== 'mnn' || !response.result) return analysis;
  const result = response.result;
  const tags = [...new Set([...analysis.tags, ...result.tags, ...result.content,
    ...(result.hasPeople ? ['人物'] : []), ...(result.hasPet ? ['宠物'] : []), ...(result.hasQrCode ? ['二维码'] : [])])];
  const hasGps = asset.latitude != null && asset.longitude != null;
  const modelPhotoType = result.needsOcr || result.route === 'ocr' || result.documentKind !== 'none' || result.photoCategory === 'document' ? 'document'
    : result.photoCategory === 'screenshot' ? 'screenshot'
      : result.photoCategory === 'real-life' ? 'life'
        : result.photoCategory === 'real-scene' ? (hasGps ? 'place' : 'place_nogps')
          : analysis.photoType;
  const hasExplicitOverride = analysis.tags.includes('已按你的纠正')
    || analysis.reasons.some((reason) => reason.includes('应用历史纠正'));
  const photoType = hasExplicitOverride ? analysis.photoType : modelPhotoType;
  const realPhoto = photoType === 'place' || photoType === 'life' || photoType === 'place_nogps';
  const routed: PhotoRadarAnalysis = {
    ...analysis,
    photoType,
    verdict: hasExplicitOverride ? analysis.verdict : realPhoto && analysis.technicalQuality >= 58 ? 'keep' : photoType === 'junk' ? 'clean' : 'review',
    pinnable: hasExplicitOverride ? analysis.pinnable : realPhoto && hasGps && analysis.technicalQuality >= 50,
    needPlace: hasExplicitOverride ? analysis.needPlace : realPhoto && !hasGps,
    tags,
    understanding: {
      sourceType: result.sourceType,
      content: result.content,
      documentType: result.documentType,
      needsOcr: result.needsOcr,
      privacyRisk: result.privacyRisk,
      route: result.route,
      description: result.description,
      hardDocument: result.hardDocument,
      confidence: result.confidence,
    },
    confidence: Math.max(analysis.confidence, result.confidence),
    reasons: [...analysis.reasons, `Qwen3-VL：${result.description || tags.join('、')}`],
    visionBackend: 'qwen3-vl-mnn',
    analyzedAt: Date.now(),
  };
  const next = result.aestheticScore != null && realPhoto
    ? applyAestheticJudgment(routed, {
      score: result.aestheticScore,
      confidence: result.aestheticConfidence,
      reasons: result.aestheticReasons,
      source: 'qwen3-vl-2b-base',
    })
    : withCurationScore({
      ...routed,
      universalAesthetic: undefined,
      aestheticConfidence: undefined,
      aestheticReasons: undefined,
      aestheticSource: undefined,
    });
  await putRadarAnalysis(next);
  return next;
}

export async function extractRadarDocument(
  asset: PhotoLibraryAsset,
  analysis: PhotoRadarAnalysis,
  runtime: PhotoRuntimeStatus,
  signal?: AbortSignal,
): Promise<{ analysis: PhotoRadarAnalysis; adapterAttempted: boolean }> {
  const image = await photoImageDataUrl(asset, 'ocr');
  if (signal?.aborted) throw new DOMException('票据识别已取消', 'AbortError');
  if (!image || runtime.engine !== 'mnn') return { analysis, adapterAttempted: false };
  const hardDocument = analysis.understanding?.hardDocument === true
    || analysis.reasons.some((reason) => /反光|小字|划痕|倾斜|难读/.test(reason));
  const result = await extractDocumentWithQualityGate(image, {
    hardDocument, adapterReady: runtime.ocrAdapterReady, assetKey: asset.key, signal,
  });
  if (signal?.aborted) throw new DOMException('票据识别已取消', 'AbortError');
  if (result.backend !== 'mnn') return { analysis, adapterAttempted: result.adapterAttempted };
  const next: PhotoRadarAnalysis = {
    ...analysis,
    photoType: 'document',
    document: result.evidence,
    tags: [...new Set([...analysis.tags, result.evidence.kind, '票据'])],
    reasons: [...analysis.reasons, `OCR ${result.evidence.qualityGate} · ${result.evidence.route}`],
    visionBackend: 'qwen3-vl-mnn',
    analyzedAt: Date.now(),
  };
  await putRadarAnalysis(next);
  return { analysis: next, adapterAttempted: result.adapterAttempted };
}
