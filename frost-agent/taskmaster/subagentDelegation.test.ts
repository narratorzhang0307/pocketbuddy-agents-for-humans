import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureBuiltinSkills, resetSkillRegistryForTests, disableSkill, BUILTIN_SKILLS } from '../../src/app/lib/skill';
import { listFrostSkillSubagents } from '../subagents/registry';
import { httpSubagentCompletion, type SubagentCompletion } from '../subagents/qwen';
import { completeDecision } from '../runtime/agentLoop';
import { InMemoryFrostSessionLog } from '../runtime/sessionLog';
import { delegateSkillTask, delegateSkillPlan } from './subagentDelegation';

function response(action = { type: 'call_tool', tool: 'skill.prepare_handoff', arguments: { note: '打开页面后申请授权并读取真实数据。' } } as Record<string, unknown>) {
  return { text: JSON.stringify({ ...completeDecision('准备本次 Skill'), next_action: action }), model: 'qwen3.8-max' };
}

function input(skillId = 'pocket.lianlema', runId = 'child-1') {
  return { skillId, runId, objective: '用练了吗纠正深蹲', userId: 'user-1', signal: new AbortController().signal };
}

describe('Taskmaster supervision of independently addressed server-model Skill agents', () => {
  beforeEach(() => { resetSkillRegistryForTests(); ensureBuiltinSkills(); });
  afterEach(() => vi.unstubAllGlobals());

  it('registers only runnable Skills once without changing the underlying Skill ids', () => {
    const agents = listFrostSkillSubagents();
    expect(agents.map((agent) => agent.skill.id)).toEqual(BUILTIN_SKILLS
      .map((skill) => skill.identity.id)
      .filter((id) => !['frost.healthsync', 'frost.garmin-readonly', 'frost.wger-planner', 'frost.mealie-kitchen', 'frost.health-consultation'].includes(id)));
    expect(new Set(agents.map((agent) => agent.agent_id)).size).toBe(agents.length);
  });

  it('runs real decisions and fixed tools in isolated child sessions, not a renamed router plan', async () => {
    const log = new InMemoryFrostSessionLog();
    const prompts: string[] = [];
    const completion: SubagentCompletion = { async complete({ agent, prompt }) {
      prompts.push(prompt);
      expect(prompt).toContain(agent.agent_id);
      return prompt.includes('"tool.result"') ? response() : response({ type: 'call_tool', tool: 'skill.describe', arguments: {} });
    } };
    const result = await delegateSkillTask(input(), { completion, log });
    expect(result).toMatchObject({ agent_id: 'skill:pocket.lianlema', status: 'waiting_external', model: 'qwen3.8-max', model_calls: 2 });
    expect(prompts).toHaveLength(2);
    expect((await log.list('child-1')).filter((event) => event.type === 'tool.called').map((event) => event.data.tool)).toEqual(['skill.describe', 'skill.prepare_handoff']);
    const second = await delegateSkillTask({ ...input('frost.openfoodfacts', 'child-2'), objective: '扫描食品条码' }, { completion, log });
    expect(second.run_id).not.toBe(result.run_id);
    expect(prompts.slice(2).join('\n')).not.toContain('用练了吗纠正深蹲');
    expect(result.evidence_ids.length).toBeGreaterThan(0);
  });

  it('replays a recorded result without another paid call and rejects conflicting reuse', async () => {
    const log = new InMemoryFrostSessionLog();
    const complete = vi.fn(async () => response());
    const first = await delegateSkillTask(input(), { completion: { complete }, log });
    const replay = await delegateSkillTask(input(), { completion: { complete }, log });
    expect(replay).toEqual(first);
    expect(complete).toHaveBeenCalledTimes(1);
    await expect(delegateSkillTask({ ...input(), objective: 'different' }, { completion: { complete }, log })).rejects.toThrow('subagent_run_request_conflict');
  });

  it('resumes a child question with its own history, not the parent conversation', async () => {
    const log = new InMemoryFrostSessionLog();
    const complete = vi.fn(async () => response({ type: 'ask_user', question: '需要纠正哪个动作？', reason: 'need_exercise' }));
    const first = await delegateSkillTask(input(), { completion: { complete }, log });
    expect(first.status).toBe('waiting_user');
    complete.mockImplementation(async ({ prompt }: { prompt: string }) => {
      expect(prompt).toContain('需要纠正哪个动作'); expect(prompt).toContain('做深蹲'); return response();
    });
    const resumed = await delegateSkillTask({ ...input(), followup: '做深蹲' }, { completion: { complete }, log });
    expect(resumed).toMatchObject({ run_id: first.run_id, status: 'waiting_external' });
  });

  it.each(['unknown.skill', 'pocket.lianlema'])('does not call an unregistered or disabled agent: %s', async (skillId) => {
    disableSkill('pocket.lianlema');
    const complete = vi.fn(async () => response());
    const result = await delegateSkillTask(input(skillId), { completion: { complete } });
    expect(result.status).toBe('unavailable'); expect(complete).not.toHaveBeenCalled();
  });

  it('does not upload sensitive objectives or pretend an unavailable model succeeded', async () => {
    const complete = vi.fn(async () => { throw new Error('offline'); });
    const blocked = await delegateSkillTask({ ...input(), objective: '我的医疗记录和病历' }, { completion: { complete } });
    expect(blocked.status).toBe('blocked'); expect(complete).not.toHaveBeenCalled();
    const failed = await delegateSkillTask(input(), { completion: { complete }, log: new InMemoryFrostSessionLog() });
    expect(failed).toMatchObject({ status: 'failed', model: null });
  });

  it('bounds repeated unknown tools and forbids fake completed actions or recursive spawning', async () => {
    const complete = vi.fn(async () => response({ type: 'call_tool', tool: 'spawn_agent', arguments: {} }));
    const result = await delegateSkillTask(input(), { completion: { complete }, log: new InMemoryFrostSessionLog() });
    expect(result.status).toBe('failed'); expect(complete.mock.calls.length).toBeLessThanOrEqual(3);
    const fake = await delegateSkillTask(input('pocket.lianlema', 'fake'), { completion: { complete: async () => response({ type: 'complete', summary: '已经做完', evidence_ids: [] }) } });
    expect(fake.status).toBe('failed');
  });

  it('requires a bounded parent plan before starting any child', async () => {
    const plan = { steps: Array.from({ length: 4 }, () => ({})) } as Parameters<typeof delegateSkillPlan>[0];
    await expect(delegateSkillPlan(plan, { runId: 'parent', userId: 'u', signal: new AbortController().signal })).rejects.toThrow('subagent_delegation_budget_exceeded');
  });

  it('calls the existing local API with a per-agent task name and no browser key', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => response() }));
    vi.stubGlobal('fetch', fetch);
    const agent = listFrostSkillSubagents()[0];
    await httpSubagentCompletion.complete({ agent, prompt: 'synthetic task', signal: new AbortController().signal });
    expect(fetch.mock.calls[0][0]).toBe('/api/frost-llm');
    const init = fetch.mock.calls[0][1] as RequestInit;
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(String(init.body))).toMatchObject({ task: `subagent:${agent.skill.id}`, system: agent.instruction, json: true });
  });
});
