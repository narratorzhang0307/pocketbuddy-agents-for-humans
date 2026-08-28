import { describe, expect, it } from 'vitest';
import { ensureBuiltinSkills, resetSkillRegistryForTests } from '../../src/app/lib/skill';
import { delegateSkillTask } from '../../frost-agent/taskmaster/subagentDelegation';
import { listFrostSkillSubagents } from '../../frost-agent/subagents/registry';
import { InMemoryFrostSessionLog } from '../../frost-agent/runtime/sessionLog';

// Explicit opt-in only. Synthetic text, no camera, Bluetooth, user health data or device effects.
describe.skipIf(process.env.FROST_SUBAGENT_LIVE !== '1')('live Qwen Skill subagent via the existing local server', () => {
  it('makes a genuine flagship decision and prepares a bounded page handoff', async () => {
    resetSkillRegistryForTests(); ensureBuiltinSkills();
    const result = await delegateSkillTask({
      skillId: 'pocket.lianlema', objective: '打开练了吗页面，稍后由用户授权摄像头，再做深蹲动作纠正；现在只准备交接，不要执行。',
      runId: `live-subagent-${Date.now()}`, userId: 'synthetic-test-user', signal: new AbortController().signal,
    }, {
      log: new InMemoryFrostSessionLog(),
      completion: { async complete({ agent, prompt, signal }) {
        const response = await fetch(`${process.env.FROST_SUBAGENT_BASE_URL || 'http://127.0.0.1:5179'}/api/frost-llm`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal,
          body: JSON.stringify({ prompt, system: agent.instruction, json: true, task: `subagent:${agent.skill.id}` }),
        });
        if (!response.ok) throw new Error(`live_subagent_http_${response.status}`);
        return response.json();
      } },
    });
    console.info(JSON.stringify({ registered_agents: listFrostSkillSubagents().length, model: result.model, status: result.status, model_calls: result.model_calls, evidence_count: result.evidence_ids.length }));
    expect(result).toMatchObject({ model: 'qwen3.8-max', status: 'waiting_external' });
    expect(result.model_calls).toBeLessThanOrEqual(3);
  }, 50000);
});
