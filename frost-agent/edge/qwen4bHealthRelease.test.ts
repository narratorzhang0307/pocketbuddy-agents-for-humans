import { describe, expect, it } from 'vitest';
import {
  QWEN4B_HEALTH_ASSET,
  QWEN4B_HEALTH_RELEASE,
  QWEN4B_HEALTH_REQUIREMENTS,
  QWEN4B_HEALTH_REVISION,
} from './qwen4bHealthRelease';

describe('Qwen3-4B health MNN release contract', () => {
  it('pins the official immutable ModelScope revision and canonical manifest', () => {
    expect(QWEN4B_HEALTH_ASSET).toBe('qwen3-4b-health-mnn');
    expect(QWEN4B_HEALTH_REVISION).toHaveLength(40);
    expect(QWEN4B_HEALTH_RELEASE.url).toContain(`Revision=${QWEN4B_HEALTH_REVISION}`);
    expect(QWEN4B_HEALTH_RELEASE.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(QWEN4B_HEALTH_RELEASE.bytes).toBe(2_713_763_864);
  });

  it('reserves storage headroom and bounds health explanation output', () => {
    expect(QWEN4B_HEALTH_REQUIREMENTS.minimumAvailableStorageBytes)
      .toBe(QWEN4B_HEALTH_RELEASE.bytes + 512 * 1024 * 1024);
    expect(QWEN4B_HEALTH_REQUIREMENTS.minimumAvailableMemoryBytes).toBe(3328 * 1024 * 1024);
    expect(QWEN4B_HEALTH_REQUIREMENTS.maxOutputTokens).toBe(512);
  });
});
