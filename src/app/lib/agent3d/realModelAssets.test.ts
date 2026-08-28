import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Shared build-only ESM validator.
import { verifyAvatarAssets } from '../../../../scripts/verify-avatar-assets.mjs';

describe('bundled real 3D characters', () => {
  it('includes the existing human and pet GLBs, with their textures embedded', () => {
    const urls = verifyAvatarAssets(fileURLToPath(new URL('../../../../', import.meta.url)));
    expect(urls).toHaveLength(9);
    expect(urls).toContain('/assets/tripo/city-courier-v1/city-courier-rigged-walk-v1.glb');
    expect(urls).toContain('/assets/tripo/city-walker-female-v1/city-walker-female-rigged-walk-v1.glb');
  });
});
