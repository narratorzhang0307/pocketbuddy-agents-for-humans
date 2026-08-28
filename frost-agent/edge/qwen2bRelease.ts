import type { EdgeAssetId, EdgeAssetInstallSource } from './types';

/** The only production Qwen base used by Pocket Earth. */
export const QWEN2B_BASE_ASSET: EdgeAssetId = 'qwen3-vl-2b-mnn';

/**
 * Immutable dual-runtime release: the language bundle handles text Skills and
 * the official vision bundle handles Photos/heritage inputs. Native install
 * still verifies the signed manifest and every expected file before activation.
 */
export const QWEN2B_BASE_RELEASE: EdgeAssetInstallSource = {
  url: 'https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/models/qwen3-vl-2b-dual/pocketearth-qwen3-vl-2b-dual-base-20260811/manifest.json',
  sha256: '1ec84bc53d6a58ce3685419dd0b2ad2bdb289cb18d876deec21634ff68c90313',
  bytes: 3748601738,
};
