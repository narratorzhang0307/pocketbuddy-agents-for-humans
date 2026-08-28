import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { fetchVerifiedMappingDemoPdf, MAPPING_DEMO_PDF } from './demoAsset';

describe('Mapping OSS demo asset', () => {
  it('is isolated to the Mapping path and records an immutable hash', () => {
    expect(MAPPING_DEMO_PDF.url).toContain('/mapping-demo/');
    expect(MAPPING_DEMO_PDF.url).not.toContain('digital-conservation');
    expect(MAPPING_DEMO_PDF.pages).toBe(10);
    expect(MAPPING_DEMO_PDF.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects bytes that do not match the immutable OSS manifest', async () => {
    const bytes = Buffer.alloc(MAPPING_DEMO_PDF.bytes, 0);
    bytes.write('%PDF-', 0, 'ascii');
    expect(createHash('sha256').update(bytes).digest('hex')).not.toBe(MAPPING_DEMO_PDF.sha256);
    const fetcher = vi.fn(async () => new Response(bytes, { status: 200, headers: { 'content-type': 'application/pdf' } })) as unknown as typeof fetch;
    await expect(fetchVerifiedMappingDemoPdf(fetcher)).rejects.toThrow('完整性校验失败');
  });
});
