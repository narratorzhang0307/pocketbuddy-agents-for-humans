import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { PhotoAssetIndex, PhotoLibraryAsset } from './libraryTypes';

export interface NativePhotoSemanticStatus {
  available: boolean;
  bundled: boolean;
  installed: boolean;
  ready: boolean;
  count: number;
  modelId: string;
  version: string;
  backend: 'android-ort-int8';
  dimension: number;
  imageInput: string;
  textTokens: number;
  imageSha256: string;
  textSha256: string;
  originalsCopied: false;
  networkRequired: false;
}

interface NativeBuildResult extends NativePhotoSemanticStatus {
  indexed: number;
  reused: number;
  failed: number;
  cancelled: boolean;
  durationMs: number;
}

interface NativeReconciliationResult {
  indexed: number;
  availableAssets: number;
  orphaned: number;
  orphanRatio: number;
  removed: number;
  retainedForSafety: boolean;
}

interface PocketPhotoSemanticPlugin {
  status(): Promise<NativePhotoSemanticStatus>;
  install(): Promise<NativePhotoSemanticStatus>;
  buildIndex(options: { assets: Array<{ key: string; assetId: string; sourceModifiedAt: number }> }): Promise<NativeBuildResult>;
  cancel(): Promise<{ cancelled: boolean }>;
  search(options: { query: string; limit: number }): Promise<{ matches: Array<{ key: string; score: number }> }>;
  remove(options: { key: string }): Promise<{ removed: boolean; count: number }>;
  reconcile(options: { availableKeys: string[]; prune: boolean }): Promise<NativeReconciliationResult>;
  clear(): Promise<{ count: number }>;
  addListener(
    eventName: 'photoSemanticProgress',
    listener: (event: { done: number; total: number; phase: string; version: string }) => void,
  ): Promise<PluginListenerHandle>;
}

const PocketPhotoSemantic = registerPlugin<PocketPhotoSemanticPlugin>('PocketPhotoSemantic');

export const usesNativePhotoSemantic = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export async function nativePhotoSemanticStatus(): Promise<NativePhotoSemanticStatus> {
  return PocketPhotoSemantic.status();
}

export async function buildNativePhotoSemanticIndex(
  assets: PhotoLibraryAsset[],
  options: {
    onProgress?: (done: number, total: number, phase: string) => void;
    shouldCancel?: () => boolean;
  } = {},
): Promise<NativeBuildResult> {
  const candidates = assets.filter((asset) =>
    asset.source === 'native-library'
    && asset.mediaType === 'image'
    && asset.sourceState !== 'missing'
    && asset.sourceState !== 'permission-revoked',
  );
  options.onProgress?.(0, candidates.length, '校验 Android 双塔与模型哈希');
  await PocketPhotoSemantic.install();
  const listener = await PocketPhotoSemantic.addListener('photoSemanticProgress', (event) => {
    options.onProgress?.(event.done, event.total, event.phase);
    if (options.shouldCancel?.()) void PocketPhotoSemantic.cancel();
  });
  try {
    return await PocketPhotoSemantic.buildIndex({
      assets: candidates.map((asset) => ({
        key: asset.key,
        assetId: asset.assetId,
        sourceModifiedAt: asset.modificationTime || 0,
      })),
    });
  } finally {
    await listener.remove();
  }
}

export async function searchNativePhotoSemantic(query: string, limit: number) {
  return (await PocketPhotoSemantic.search({ query, limit })).matches;
}

export async function removeNativePhotoSemanticEmbedding(key: string): Promise<void> {
  await PocketPhotoSemantic.remove({ key });
}

export async function reconcileNativePhotoSemanticIndex(
  assets: PhotoAssetIndex[],
  prune: boolean,
): Promise<NativeReconciliationResult> {
  const availableKeys = assets
    .filter((asset) => asset.sourceState !== 'missing' && asset.sourceState !== 'permission-revoked')
    .map((asset) => asset.key);
  return PocketPhotoSemantic.reconcile({ availableKeys, prune });
}

export async function clearNativePhotoSemanticIndex(): Promise<void> {
  await PocketPhotoSemantic.clear();
}
