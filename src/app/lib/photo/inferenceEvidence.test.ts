import { describe, expect, it, vi } from 'vitest';
import { createPhotoInferenceEvidence, serializePhotoInferenceEvidence } from './inferenceEvidence';

describe('photo inference evidence', () => {
  it('asserts zero network only for a native MNN bridge response', async () => {
    const native = await createPhotoInferenceEvidence({
      id: 'native-1', now: 1, task: 'photo-router', assetKey: 'media:42',
      modelRevision: 'qwen', promptRevision: 'router-v1', qualityGate: 'passed', output: '{"cat":true}',
      response: { backend: 'mnn', runtime: { engine: 'mnn', nativeBridge: true, version: '3.6.1' } },
    });
    const preview = await createPhotoInferenceEvidence({
      id: 'preview-1', now: 2, task: 'photo-router', assetKey: 'session:42',
      modelRevision: 'qwen', promptRevision: 'router-v1', qualityGate: 'passed', output: '{"cat":true}',
      response: { backend: 'mnn', runtime: { engine: 'mnn', nativeBridge: false, version: '3.6.1' } },
    });
    expect(native.networkRequests).toBe(0);
    expect(preview.networkRequests).toBeNull();
  });

  it('stores only a digest, never model output or image bytes', async () => {
    vi.stubGlobal('crypto', { subtle: { digest: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer) } });
    const secret = 'PRIVATE_OCR_BODY_892341';
    const event = await createPhotoInferenceEvidence({
      id: 'private-1', now: 3, task: 'ocr-base', assetKey: 'media:9',
      modelRevision: 'qwen', promptRevision: 'ocr-v1', qualityGate: 'base-accepted', output: secret,
      response: { backend: 'mnn', runtime: { engine: 'mnn', nativeBridge: true } },
    });
    const exported = serializePhotoInferenceEvidence([event]);
    expect(event.outputSha256).toBe('010203');
    expect(exported).not.toContain(secret);
    expect(exported).not.toContain('data:image');
    expect(Object.keys(event)).not.toContain('output');
  });
});
