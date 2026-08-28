import { describe, expect, it } from 'vitest';
import { frostBus, startAgentRun } from './bus';

describe('RunTrace public evidence', () => {
  it('does not expose internal recovery labels as a visible tag', () => {
    const run = startAgentRun('审查运行');
    run.phase('云脑补全', '云脑不可用→保留已有');
    run.end(true);
    const phase = frostBus.recent(run.runId).find((event) => event.parentId === run.runId);
    expect(phase?.tags).toBeUndefined();
  });
});
