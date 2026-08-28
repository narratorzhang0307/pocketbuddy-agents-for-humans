import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('photo edge transport', () => {
  it('uses the Capacitor PocketMnn bridge on packaged Android instead of fetching /api/edge', async () => {
    const callNativeMnn = vi.fn().mockResolvedValue({
      backend: 'mnn', text: 'native-photo-result',
      runtime: { engine: 'mnn', visionReady: true, acceleration: ['arm82'] },
    });
    vi.doMock('./capacitorMnnEdge', () => ({ isNativeMnnPlatform: () => true, callNativeMnn }));
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const { runPhotoVision } = await import('./httpPhotoEdge');
    await expect(runPhotoVision('data:image/jpeg;base64,AA==', '看图')).resolves.toMatchObject({ backend: 'mnn', text: 'native-photo-result' });
    expect(callNativeMnn).toHaveBeenCalledWith(expect.objectContaining({ task: 'vision', prompt: '看图' }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads native runtime capabilities so SME2 can only come from JNI evidence', async () => {
    const callNativeMnn = vi.fn().mockResolvedValue({
      backend: 'mnn',
      runtime: { engine: 'mnn', visionReady: true, adapters: { 'general-ocr-vision': { installed: true } }, acceleration: ['sme2-active'], nativeBridge: true },
    });
    vi.doMock('./capacitorMnnEdge', () => ({ isNativeMnnPlatform: () => true, callNativeMnn }));
    const { getPhotoRuntimeStatus } = await import('./httpPhotoEdge');
    await expect(getPhotoRuntimeStatus()).resolves.toMatchObject({ baseReady: true, ocrAdapterReady: true, sme2Verified: true });
  });

  it('runs the same two-image prompt through Base when no aesthetic adapter is requested', async () => {
    const callNativeMnn = vi.fn().mockResolvedValue({ backend: 'mnn', text: 'A', stats: { elapsedMs: 12 } });
    vi.doMock('./capacitorMnnEdge', () => ({ isNativeMnnPlatform: () => true, callNativeMnn }));
    const { runPhotoVisionPair } = await import('./httpPhotoEdge');
    await expect(runPhotoVisionPair(['data:image/jpeg;base64,AA==', 'data:image/jpeg;base64,BB=='], '只输出 A 或 B'))
      .resolves.toMatchObject({ backend: 'mnn', text: 'A' });
    expect(callNativeMnn).toHaveBeenCalledWith(expect.objectContaining({ task: 'vision', images: expect.any(Array), adapter: undefined }));
  });

  it('returns promptly on user cancellation even if native inference cannot be interrupted inside JNI yet', async () => {
    vi.doMock('./capacitorMnnEdge', () => ({
      isNativeMnnPlatform: () => true,
      callNativeMnn: () => new Promise(() => {}),
    }));
    const { runPhotoVision } = await import('./httpPhotoEdge');
    const controller = new AbortController();
    const request = runPhotoVision('data:image/jpeg;base64,AA==', '看图', { signal: controller.signal });
    controller.abort();
    await expect(request).resolves.toMatchObject({ backend: 'stub', error: 'aborted' });
  });

  it('retries an explicit UTF decode-boundary failure with a bounded smaller token budget', async () => {
    const callNativeMnn = vi.fn()
      .mockResolvedValueOnce({ backend: 'stub', error: "'utf-8' codec can't decode byte" })
      .mockResolvedValueOnce({ backend: 'mnn', text: '完整转录' });
    vi.doMock('./capacitorMnnEdge', () => ({ isNativeMnnPlatform: () => true, callNativeMnn }));
    const { runPhotoVision } = await import('./httpPhotoEdge');
    await expect(runPhotoVision('data:image/jpeg;base64,AA==', '逐字转录', { maxTokens: 256 }))
      .resolves.toMatchObject({ backend: 'mnn', text: '完整转录' });
    expect(callNativeMnn).toHaveBeenNthCalledWith(1, expect.objectContaining({ maxTokens: 256 }));
    expect(callNativeMnn).toHaveBeenNthCalledWith(2, expect.objectContaining({ maxTokens: 255 }));
  });
});
