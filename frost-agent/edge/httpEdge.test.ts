import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('shared edge transport', () => {
  it('checks native runtime status and never asks the online shell for /api/edge', async () => {
    const callNativeMnn = vi.fn().mockResolvedValue({
      backend: 'mnn',
      runtime: { engine: 'mnn', textReady: true, visionReady: true, nativeBridge: true },
    });
    vi.doMock('./capacitorMnnEdge', () => ({ isNativeMnnPlatform: () => true, callNativeMnn }));
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);

    const { httpEdge } = await import('./httpEdge');
    await expect(httpEdge.available()).resolves.toBe(true);
    expect(callNativeMnn).toHaveBeenCalledWith({ task: 'runtime_status' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('routes generic Skill vision through the Capacitor MNN bridge', async () => {
    const callNativeMnn = vi.fn().mockResolvedValue({ backend: 'mnn', text: '端侧识读结果' });
    vi.doMock('./capacitorMnnEdge', () => ({ isNativeMnnPlatform: () => true, callNativeMnn }));
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);

    const { httpEdge } = await import('./httpEdge');
    await expect(httpEdge.vision('data:image/jpeg;base64,AA==', '逐字识读')).resolves.toBe('端侧识读结果');
    expect(callNativeMnn).toHaveBeenCalledWith(expect.objectContaining({ task: 'vision', prompt: '逐字识读' }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('routes travel LoRA status and inference through the same native bridge', async () => {
    const callNativeMnn = vi.fn()
      .mockResolvedValueOnce({
        backend: 'mnn',
        runtime: { engine: 'mnn', textReady: true, adapters: { 'travel-planner': { installed: true } }, nativeBridge: true },
      })
      .mockResolvedValueOnce({ backend: 'mnn', text: '{"pace":"slow"}' });
    vi.doMock('./capacitorMnnEdge', () => ({ isNativeMnnPlatform: () => true, callNativeMnn }));
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);

    const { getTravelPlannerRuntimeStatus, runQwenAdapter } = await import('./httpQwenEdge');
    await expect(getTravelPlannerRuntimeStatus()).resolves.toMatchObject({ phase: 'ready', baseReady: true, adapterReady: true });
    await expect(runQwenAdapter('规划两天行程', { adapter: 'travel-planner', json: true })).resolves.toMatchObject({ backend: 'mnn' });
    expect(callNativeMnn).toHaveBeenLastCalledWith(expect.objectContaining({ task: 'chat', adapter: 'travel-planner' }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('runs the explicit travel Base side of A/B without an adapter', async () => {
    const callNativeMnn = vi.fn().mockResolvedValue({ backend: 'mnn', text: '{"next_action":"call_tools"}', stats: { elapsedMs: 23 } });
    vi.doMock('./capacitorMnnEdge', () => ({ isNativeMnnPlatform: () => true, callNativeMnn }));
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);

    const { runQwenBase } = await import('./httpQwenEdge');
    await expect(runQwenBase('解析旅行要求', { json: true })).resolves.toMatchObject({ backend: 'mnn', elapsedMs: 23 });
    expect(callNativeMnn).toHaveBeenCalledWith(expect.objectContaining({ task: 'chat' }));
    expect(callNativeMnn.mock.calls[0][0].adapter).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps /api/edge only as the ordinary-browser fallback', async () => {
    vi.doMock('./capacitorMnnEdge', () => ({ isNativeMnnPlatform: () => false, callNativeMnn: vi.fn() }));
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ backend: 'mnn' }) });
    vi.stubGlobal('fetch', fetch);

    const { httpEdge } = await import('./httpEdge');
    await expect(httpEdge.available()).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith('/api/edge', expect.objectContaining({ method: 'POST' }));
  });
});
