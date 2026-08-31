import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrostPlan, FrostPlanStep } from '../../../frost-agent/harness/skillRouter';
import { acceptTaskHandoff } from '../../../frost-agent/harness/taskHandoff';
import { getFrostHealthRuntime } from './frostHealthTaskmaster';
import { readFrostAgentEvents, reportFrostSkillPageResult, stageFrostAgentHandoff, subscribeFrostAgentRuns } from './frostAgentRuntime';

vi.mock('../../../frost-agent/edge/contract', () => ({ edgeSafe: { chat: vi.fn(async () => { throw new Error('No model should be called for a verified page result'); }) } }));
const storage = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) || null,
  setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) }; };
let count = 0;
function plan() {
  const step: FrostPlanStep = { id: 'step', skillId: 'frost.openfoodfacts', skillName: '包装食品', target: 'frost-openfoodfacts',
    objective: '查询商品', reason: '查询', availability: 'equipped', permissions: [], requiresConfirmation: false };
  const plan: FrostPlan = { id: `plan-${++count}`, mode: 'single', source: 'local-rule', summary: '查询', steps: [step], ready: true, createdAt: new Date().toISOString() };
  return { step, plan };
}
beforeAll(() => { vi.stubGlobal('localStorage', storage()); });
beforeEach(() => { vi.stubGlobal('sessionStorage', storage()); });

describe('page results return to the same Frost, without inventing Taskmaster facts', () => {
  it('carries a session and run correlation, records usage once and never invents meal or workout facts', async () => {
    const fixture = plan(); const notice = vi.fn(); const release = subscribeFrostAgentRuns(notice);
    const eventsBefore = await getFrostHealthRuntime().store.listHealthEvents('local-user');
    const staged = await stageFrostAgentHandoff(fixture.plan, fixture.step, '查询商品');
    const handoff = await acceptTaskHandoff('frost-openfoodfacts');
    expect(handoff?.agentSessionId).toBe(staged.agentSessionId);
    await reportFrostSkillPageResult(handoff!, { status: 'completed', summary: '查询返回2项，没有保存餐食。' });
    await reportFrostSkillPageResult(handoff!, { status: 'completed', summary: '重复结果' });
    const events = await readFrostAgentEvents();
    expect(events.filter(event => event.type === 'skill.result' && event.data.run_id === staged.runId)).toHaveLength(1);
    expect(events.at(-1)?.session_id).toBe(staged.agentSessionId);
    expect(events.some(event => event.type === 'assistant.message' && String(event.data.text).includes('查询返回2项'))).toBe(true);
    expect(notice).toHaveBeenCalledTimes(1);
    expect(notice.mock.calls[0][0].result.task).toBeNull();
    const eventsAfter = await getFrostHealthRuntime().store.listHealthEvents('local-user');
    const added = eventsAfter.filter(event => !eventsBefore.some(previous => previous.event_id === event.event_id));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ domain: 'skill', type: 'skill_completed', visibility: 'private' });
    expect(added[0].facts).toEqual({ skill_id: fixture.step.skillId, status: 'completed' });
    expect(eventsAfter.filter(event => event.domain !== 'skill')).toEqual(eventsBefore.filter(event => event.domain !== 'skill'));
    release();
  });
  it('rejects another target/session, forged run, and attempts to bypass a Taskmaster result validator', async () => {
    const fixture = plan(); const handoff = await stageFrostAgentHandoff(fixture.plan, fixture.step, '查询商品');
    const result = { status: 'completed' as const, summary: '真实查询' };
    await expect(reportFrostSkillPageResult({ ...handoff, target: 'other' }, result)).rejects.toThrow('匹配');
    await expect(reportFrostSkillPageResult({ ...handoff, runId: 'invented' }, result)).rejects.toThrow('匹配');
    await expect(reportFrostSkillPageResult({ ...handoff, agentSessionId: 'other' }, result)).rejects.toThrow('会话');
    await expect(reportFrostSkillPageResult({ ...handoff, taskmasterTaskId: 'health-task' }, result)).rejects.toThrow('会话');
    await expect(reportFrostSkillPageResult(handoff, { ...result, summary: '字'.repeat(501) })).rejects.toThrow('invalid');
  });
  it('returns an unavailable connector as waiting for the user, not a completed capability', async () => {
    const fixture = plan(); const handoff = await stageFrostAgentHandoff(fixture.plan, fixture.step, '查询商品');
    await reportFrostSkillPageResult(handoff, { status: 'blocked', summary: '尚未配置服务' });
    const events = await readFrostAgentEvents();
    expect(events.filter(event => event.type === 'skill.result').at(-1)?.data.status).toBe('blocked');
    expect(events.filter(event => event.type === 'assistant.message').at(-1)?.data.text).toContain('is not finished yet');
  });
});
