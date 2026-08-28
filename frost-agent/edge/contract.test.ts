import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doUnmock('./httpEdge');
  vi.doUnmock('@capacitor/core');
});

const edgeDouble = () => ({
  available: vi.fn().mockResolvedValue(true),
  chat: vi.fn().mockResolvedValue('edge-chat'),
  classify: vi.fn().mockResolvedValue('edge-classify'),
  rank: vi.fn().mockResolvedValue([0.8]),
  embed: vi.fn().mockResolvedValue([[1]]),
  vision: vi.fn().mockResolvedValue('edge-vision'),
});

describe('edgeSafe unified runtime boundary', () => {
  it('routes every semantic capability through the shared edge transport', async () => {
    const edge = edgeDouble();
    vi.doMock('./httpEdge', () => ({ httpEdge: edge }));

    const { edgeSafe } = await import('./contract');
    await expect(edgeSafe.chat('hello', { model: 'health-qwen3-4b' })).resolves.toBe('edge-chat');
    await expect(edgeSafe.classify('x', ['a'])).resolves.toBe('edge-classify');
    await expect(edgeSafe.rank('x', ['a'])).resolves.toEqual([0.8]);
    await expect(edgeSafe.embed(['x'])).resolves.toEqual([[1]]);
    await expect(edgeSafe.vision('image', 'prompt')).resolves.toBe('edge-vision');
  });

  it('falls back safely when the runtime throws', async () => {
    const edge = edgeDouble();
    edge.chat.mockRejectedValueOnce(new Error('offline'));
    vi.doMock('./httpEdge', () => ({ httpEdge: edge }));
    const { edgeSafe } = await import('./contract');
    await expect(edgeSafe.chat('hello')).resolves.toBe('');
  });
});

describe('native response normalization', () => {
  it('rejects non-MNN semantic backends on Android', async () => {
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
      registerPlugin: () => ({ run: vi.fn(), addListener: vi.fn() }),
    }));
    const { normalizeNativeMnnResponse } = await import('./capacitorMnnEdge');
    expect(normalizeNativeMnnResponse({ task: 'chat', prompt: 'x' }, { backend: 'ollama', text: 'wrong' }))
      .toMatchObject({ backend: 'stub', error: 'unexpected_android_ollama_backend' });
    expect(normalizeNativeMnnResponse({ task: 'chat', prompt: 'x' }, { backend: 'mnn', text: 'ok' }))
      .toMatchObject({ backend: 'mnn', text: 'ok' });
  });
});
