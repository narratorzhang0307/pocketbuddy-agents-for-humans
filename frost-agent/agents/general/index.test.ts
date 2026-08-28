import { afterEach, describe, expect, it } from 'vitest';
import { setFrostBrain, stubBrain } from '../../harness/brain';
import { runGeneral } from './index';

describe('Frost general fallback', () => {
  afterEach(() => setFrostBrain(stubBrain));

  it('uses the Qwen Taskmaster model through the local proxy when the input is non-sensitive', async () => {
    let task = '';
    setFrostBrain({ complete: async (_prompt, options) => { task = options?.task || ''; return '可以，先从十分钟轻运动开始。'; } });
    const result = await runGeneral({ now: new Date(), surface: 'frost', userText: '给我一个轻量建议' });
    expect(task).toBe('taskmaster');
    expect(result.data.source).toBe('qwen');
  });

  it('never sends private identifiers to the cloud fallback', async () => {
    let calls = 0;
    setFrostBrain({ complete: async () => { calls += 1; return '不应调用'; } });
    const result = await runGeneral({ now: new Date(), surface: 'frost', userText: '这是我的身份证和家庭住址' });
    expect(calls).toBe(0);
    expect(result.data.source).toBe('fallback');
  });
});
