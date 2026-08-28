import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Frost native MNN planner', () => {
  afterEach(() => {
    vi.doUnmock('../edge/capacitorMnnEdge');
    vi.resetModules();
  });

  it('uses Android Qwen/MNN before the cloud brain for a long-tail task', async () => {
    const nativeRun = vi.fn(async () => ({
      backend: 'mnn' as const,
      text: JSON.stringify({
        mode: 'single',
        summary: '端侧选择睡眠观察能力',
        steps: [{ skillId: 'frost.sleep-detective', objective: '观察一个生活习惯与身体状态的关系', reason: '需要保留样本不足和非因果边界' }],
      }),
      stats: { elapsedMs: 87 },
    }));
    vi.doMock('../edge/capacitorMnnEdge', () => ({
      isNativeMnnPlatform: () => true,
      callNativeMnn: nativeRun,
      subscribeNativeAssetProgress: async () => async () => {},
    }));

    const registry = await import('../../src/app/lib/skill');
    registry.resetSkillRegistryForTests();
    registry.ensureBuiltinSkills();
    const { setFrostBrain } = await import('./brain');
    let cloudCalls = 0;
    setFrostBrain({ complete: async () => { cloudCalls += 1; return ''; } });
    const { planFrostTask } = await import('./skillRouter');

    const { plan, trace } = await planFrostTask({ now: new Date(), surface: 'frost', userText: '帮我审慎观察一个生活习惯与身体状态的关系' });
    expect(plan?.source).toBe('mnn');
    expect(plan?.steps[0].skillId).toBe('frost.sleep-detective');
    expect(cloudCalls).toBe(0);
    expect(nativeRun).toHaveBeenCalledTimes(1);
    expect(trace.join('\n')).toContain('MNN 规划 · 端侧严格 JSON 契约通过');
  });

  it('does not upload sensitive text when native MNN cannot provide a valid plan', async () => {
    vi.doMock('../edge/capacitorMnnEdge', () => ({
      isNativeMnnPlatform: () => true,
      callNativeMnn: async () => ({ backend: 'stub' as const, error: 'model_not_installed' }),
      subscribeNativeAssetProgress: async () => async () => {},
    }));
    const registry = await import('../../src/app/lib/skill');
    registry.resetSkillRegistryForTests();
    registry.ensureBuiltinSkills();
    const { setFrostBrain } = await import('./brain');
    let cloudCalls = 0;
    setFrostBrain({ complete: async () => { cloudCalls += 1; return ''; } });
    const { planFrostTask } = await import('./skillRouter');

    const { trace } = await planFrostTask({ now: new Date(), surface: 'frost', userText: '根据身份证和家庭住址替我选择一个能力' });
    expect(cloudCalls).toBe(0);
    expect(trace.join('\n')).toContain('原文全程留在本机');
  });
});
