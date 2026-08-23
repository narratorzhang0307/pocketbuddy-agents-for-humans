import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPocketBuddyApi } from '../src/app.js';
import { InMemoryHealthEventRepository } from '../src/services/healthEvents.js';
import { configuredLlmService, type LlmService } from '../src/services/llm.js';

const llm: LlmService = { generate: vi.fn(async () => ({ text: '请安全开始。', model_version: 'gemma-test' })) };
const verifyToken = vi.fn(async (token: string) => {
  if (token !== 'valid-token') throw new Error('invalid');
  return { uid: 'user-1' };
});
let repository: InMemoryHealthEventRepository;
let app: ReturnType<typeof createPocketBuddyApi>;

function headers() { return { authorization: 'Bearer valid-token' }; }

function event(facts: Record<string, unknown> = { session_id: 'run-1', skill_id: 'skill-1' }) {
  return {
    schema_version: 1,
    protocol: 'health_event/v1',
    event_id: 'event-1',
    user_id: 'forged-user',
    occurred_at: '2026-08-23T08:00:00.000Z',
    domain: 'skill',
    type: 'skill_completed',
    source: { device_id: 'web', provider: 'skill-taskmaster' },
    facts,
    confidence: 1,
    provenance: { model_version: 'gemma-test', tool_version: 'skill-runtime/1.0.0', input_hash: 'sha256:abc' },
    visibility: 'private',
    media_ids: [],
    sync: { state: 'pending', revision: 0 },
  };
}

beforeEach(() => {
  repository = new InMemoryHealthEventRepository();
  app = createPocketBuddyApi({ verifyToken, healthEvents: repository, llm });
});

afterEach(async () => { await app.close(); });

describe('pocketbuddy-api Skill Taskmaster slice', () => {
  it('keeps healthz public and protects business routes', async () => {
    const health = await app.inject({ method: 'GET', url: '/v1/healthz' });
    expect(health.statusCode).toBe(200);
    expect(health.json().capabilities).toEqual({
      llm_generate: { ready: true, provider: 'injected' },
      health_event_sync: { ready: true, provider: 'repository' },
    });
    const denied = await app.inject({ method: 'POST', url: '/v1/llm/generate', payload: { prompt: 'hello' } });
    expect(denied.statusCode).toBe(401);
    expect(denied.json().error.code).toBe('unauthenticated');
  });

  it('proxies the approved LLM contract without exposing model internals', async () => {
    const response = await app.inject({ method: 'POST', url: '/v1/llm/generate', headers: headers(), payload: { prompt: '根据位置给出下一步', task: 'skill-canvas' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ text: '请安全开始。' });
  });

  it('drives the Fitness Agent through structured server decisions in deterministic development mode', async () => {
    const deterministicApp = createPocketBuddyApi({
      verifyToken,
      healthEvents: repository,
      llm: configuredLlmService({ NODE_ENV: 'development', SKILL_DEV_LLM_MODE: 'deterministic' }),
    });
    const prompt = (events: unknown[]) => [
      '你是 Frost 的 Taskmaster 决策器。',
      '当前可见状态：',
      JSON.stringify({
        session: { session_id: 'fitness-test' },
        skill_catalog: [],
        events,
      }),
    ].join('\n');
    const initial = await deterministicApp.inject({
      method: 'POST', url: '/v1/llm/generate', headers: headers(),
      payload: {
        prompt: prompt([{ seq: 1, type: 'user.message', data: { content: { text: '带我做 10 分钟瑜伽' } } }]),
        json: true,
        task: 'fitness-agent-decision',
      },
    });
    expect(initial.statusCode).toBe(200);
    expect(JSON.parse(initial.json().text).next_action).toEqual({ type: 'load_skill', skill_id: 'frost.her-motion-warmup' });

    const afterLoad = await deterministicApp.inject({
      method: 'POST', url: '/v1/llm/generate', headers: headers(),
      payload: {
        prompt: prompt([
          { seq: 1, type: 'user.message', data: { content: { text: '带我做 10 分钟瑜伽' } } },
          { seq: 3, type: 'tool.result', data: { tool: 'skill.load', result: { status: 'success', data: { skill: { skill_id: 'frost.her-motion-warmup' } } } } },
        ]),
        json: true,
        task: 'fitness-agent-decision',
      },
    });
    expect(afterLoad.statusCode).toBe(200);
    expect(JSON.parse(afterLoad.json().text).next_action).toEqual({
      type: 'start_task',
      task_kind: 'start_workout',
      input: { exercise: '瑜伽', duration_sec: 600 },
    });
    await deterministicApp.close();
  });

  it('forces Firebase uid and applies per-event idempotency', async () => {
    const first = await app.inject({ method: 'POST', url: '/v1/health-events:batchSync', headers: headers(), payload: { events: [event()] } });
    expect(first.json().results[0]).toMatchObject({ event_id: 'event-1', status: 'synced', revision: 1 });
    expect(repository.events.get('user-1/event-1')?.user_id).toBe('user-1');

    const duplicate = await app.inject({ method: 'POST', url: '/v1/health-events:batchSync', headers: headers(), payload: { events: [event()] } });
    expect(duplicate.json().results[0].status).toBe('duplicate');

    const conflict = await app.inject({ method: 'POST', url: '/v1/health-events:batchSync', headers: headers(), payload: { events: [event({ session_id: 'run-2', skill_id: 'skill-1' })] } });
    expect(conflict.json().results[0].status).toBe('conflict');
  });

  it('returns invalid inside a valid batch instead of rewriting bad facts', async () => {
    const response = await app.inject({ method: 'POST', url: '/v1/health-events:batchSync', headers: headers(), payload: { events: [event({ skill_id: 'skill-1' })] } });
    expect(response.statusCode).toBe(200);
    expect(response.json().results[0].status).toBe('invalid');
  });
});
