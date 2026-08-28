import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FrostAgentLoop } from '../../../frost-agent/runtime/agentLoop';
import type { FrostAgentEvent, FrostAgentToolContext } from '../../../frost-agent/runtime/contracts';
import { InMemoryFrostGoalStore } from '../../../frost-agent/runtime/goalDriver';
import { createFrostConversationTools } from './frostConversation';
import { ensureBuiltinSkills, resetSkillRegistryForTests } from './skill';
const fixture = vi.hoisted(() => ({ cloud: true, revision: 'a'.repeat(64), ask: vi.fn() }));
vi.mock('./frostHealthMemory', () => ({
  askHealthAdvice: fixture.ask, healthSettings: () => ({ cloud: fixture.cloud }),
  readHealthMemory: async () => ({ revision: fixture.revision }), isHealthAdviceRequest: () => true,
}));
const tool = () => createFrostConversationTools(new InMemoryFrostGoalStore()).find(item => item.name === 'frost.health_advice')!;
function context(text: string, previous?: Record<string, unknown>, extra?: FrostAgentEvent): FrostAgentToolContext {
  const session = FrostAgentLoop.createSession('health-advice-test', 'local-user');
  const event = (seq: number, type: FrostAgentEvent['type'], data: Record<string, unknown>) => ({ protocol: 'frost-agent-event/v1',
    event_id: `event-${seq}`, session_id: session.session_id, seq, type, occurred_at: new Date().toISOString(), data } as FrostAgentEvent);
  return { session, call_id: 'call', signal: new AbortController().signal, events: [
    ...(previous ? [event(1, 'tool.result', { tool: 'frost.health_advice', result: { data: { healthDecision: previous } } })] : []),
    ...(extra ? [extra] : []), event(3, 'user.message', { source: 'user', text }),
  ] };
}
const decision = () => ({ revision: fixture.revision, expires_at: new Date(Date.now() + 60000).toISOString(), next_skill: 'pocket.her-motion', evidence_ids: [] });
beforeEach(() => { fixture.cloud = true; fixture.revision = 'a'.repeat(64); fixture.ask.mockReset(); resetSkillRegistryForTests(); ensureBuiltinSkills(); });
describe('health advice is a read-only proposal until explicitly accepted', () => {
  it('uses the real inbox question, returns speech and evidence, and does not auto-launch a suggested skill', async () => {
    fixture.ask.mockResolvedValue({ ...decision(), reply: '建议先确认身体状态。', speech: '先确认身体状态。', speechTicket: 'test-ticket', model: 'qwen-test' });
    const result = await tool().execute({ question: '模型替换的问题' }, context('今天怎么运动？'));
    expect(fixture.ask.mock.calls[0][0]).toBe('今天怎么运动？');
    expect(result.data.plan).toBeUndefined();
    expect(result.data.speech).toEqual({ text: '先确认身体状态。', ticket: 'test-ticket' });
    expect(result.data.healthDecision).toMatchObject({ revision: fixture.revision });
  });
  it.each(['pocket.her-motion', 'pocket.lianlema', 'frost.run-route'])('accepts only a current proposal and preserves the original %s handoff', async skill => {
    const result = await tool().execute({}, context('开始这个训练', { ...decision(), next_skill: skill }));
    expect(result.data.plan).toMatchObject({ steps: [expect.objectContaining({ skillId: skill })] });
    expect(fixture.ask).not.toHaveBeenCalled();
  });
  it.each(['expired', 'invalid_expiry', 'changed', 'revoked', 'unsupported', 'intervening_result'])('does not launch a %s proposal', async reason => {
    const proposal = decision();
    if (reason === 'expired') proposal.expires_at = '2020-01-01T00:00:00Z';
    if (reason === 'invalid_expiry') proposal.expires_at = 'not-a-date';
    if (reason === 'changed') fixture.revision = 'b'.repeat(64);
    if (reason === 'revoked') fixture.cloud = false;
    if (reason === 'unsupported') proposal.next_skill = 'purchase';
    const extra = reason === 'intervening_result' ? { protocol: 'frost-agent-event/v1', event_id: 'result', session_id: 'health-advice-test', seq: 2,
      type: 'skill.result', occurred_at: new Date().toISOString(), data: { status: 'completed' } } as FrostAgentEvent : undefined;
    const result = await tool().execute({}, context('开始这个训练', proposal, extra));
    expect(result.data.plan).toBeUndefined();
    expect(result.data.reply).toContain('没有打开摄像头');
  });
});
