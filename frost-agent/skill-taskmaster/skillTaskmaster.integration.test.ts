import { afterEach, describe, expect, it } from 'vitest';
import { createPocketBuddyApi } from '../../backend/src/app';
import { InMemoryHealthEventRepository } from '../../backend/src/services/healthEvents';
import type { LlmService } from '../../backend/src/services/llm';
import {
  compileSkillDraft,
  createPocketBuddyApiClient,
  executeStoredSkillGraph,
  listSkillEvidence,
  persistCompiledGraph,
  resetCanvasSkillsForTests,
  type SkillCanvasDraft,
} from '.';

const openApps: Array<ReturnType<typeof createPocketBuddyApi>> = [];
afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
  resetCanvasSkillsForTests();
});

function executableDraft(): SkillCanvasDraft {
  const now = '2026-08-23T08:00:00.000Z';
  return {
    id: 'city-observer',
    title: '城市观察伙伴',
    prompt: '读取位置后给我一条安全的城市观察建议',
    nodes: [
      { id: 'start', capability: 'trigger.manual', label: '手动启动', detail: 'Manual Trigger', x: 0, y: 0 },
      { id: 'location', capability: 'sensor.location', label: '位置数据', detail: 'Location Input', x: 0, y: 0 },
      { id: 'gemma', capability: 'model.gemma', label: '语义决策', detail: 'Gemma Processor', x: 0, y: 0 },
      { id: 'voice', capability: 'action.voice', label: '语音通知', detail: 'Voice Action', x: 0, y: 0 },
      { id: 'state', capability: 'state.skill_completed', label: '完成与证据', detail: 'Completion State', x: 0, y: 0 },
    ],
    edges: [],
    created_at: now,
    updated_at: now,
  };
}

describe('Skill Canvas frontend/backend vertical slice', () => {
  it('executes the exact compiled graph through LLM and idempotent health sync', async () => {
    const repository = new InMemoryHealthEventRepository();
    const llm: LlmService = { generate: async () => ({ text: '往公园方向慢走五分钟，注意路口。', model_version: 'gemma-e2e' }) };
    const app = createPocketBuddyApi({
      verifyToken: async (token) => token === 'e2e-token' ? { uid: 'user-e2e' } : Promise.reject(new Error('invalid')),
      healthEvents: repository,
      llm,
    });
    openApps.push(app);
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const api = createPocketBuddyApiClient({ baseUrl: address, getIdToken: async () => 'e2e-token' });

    const compiled = compileSkillDraft(executableDraft());
    expect(compiled.ok).toBe(true);
    expect(compiled.graph?.graph_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    await persistCompiledGraph(compiled.graph!);
    const spoken: string[] = [];
    let sequence = 0;
    const trace = await executeStoredSkillGraph(compiled.graph!.graph_id, compiled.graph!.graph_hash, {
      userId: 'user-e2e',
      deviceId: 'vitest-web',
      createId: (prefix) => `${prefix}:e2e-${sequence += 1}`,
      now: () => new Date('2026-08-23T08:00:00.000Z'),
      readLocation: async () => ({ latitude: 30.2741, longitude: 120.1551, accuracy_m: 8, captured_at: '2026-08-23T08:00:00.000Z' }),
      generateText: async (input) => ({ ...(await api.generate(input)), model_version: 'gemma-e2e' }),
      speak: async (text) => { spoken.push(text); },
      syncHealthEvent: async (event) => (await api.syncHealthEvents([event])).results[0],
    });

    expect(trace.status).toBe('completed');
    expect(trace.graph_hash).toBe(compiled.graph!.graph_hash);
    expect(trace.steps.every((step) => step.status === 'completed')).toBe(true);
    expect(spoken).toEqual(['往公园方向慢走五分钟，注意路口。']);
    expect(await listSkillEvidence(trace.run_id)).toHaveLength(1);
    expect([...repository.events.values()][0]).toMatchObject({
      user_id: 'user-e2e',
      domain: 'skill',
      type: 'skill_completed',
      facts: { session_id: trace.run_id, skill_id: 'city-observer' },
    });
  });
});
