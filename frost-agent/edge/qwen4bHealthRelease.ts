import type { EdgeAssetId, EdgeAssetInstallSource } from './types';

export const QWEN4B_HEALTH_ASSET: EdgeAssetId = 'qwen3-4b-health-mnn';
export const QWEN4B_HEALTH_REVISION = 'b6a176e85c3dc8ddf18038154c609452afd7c7d8';

/**
 * Official MNN 4-bit Qwen3-4B release from ModelScope. The native installer
 * verifies this immutable repository descriptor and all five runtime files.
 */
export const QWEN4B_HEALTH_RELEASE: EdgeAssetInstallSource = {
  url: `https://modelscope.cn/api/v1/models/MNN/Qwen3-4B-MNN/repo/files?Revision=${QWEN4B_HEALTH_REVISION}&Recursive=true`,
  // SHA-256 of the canonical five-file path/size/hash descriptor. ModelScope's
  // API adds mutable response metadata, so hashing the raw JSON would be unstable.
  sha256: '5b96c5e7943c35e597529d3aa53199cba591c6931f8b1f58a44b989270d90cb9',
  bytes: 2713763864,
};

export const QWEN4B_HEALTH_REQUIREMENTS = {
  minimumAvailableStorageBytes: QWEN4B_HEALTH_RELEASE.bytes + 512 * 1024 * 1024,
  minimumAvailableMemoryBytes: 3328 * 1024 * 1024,
  quantization: 'MNN 4-bit / block64',
  maxOutputTokens: 512,
} as const;
