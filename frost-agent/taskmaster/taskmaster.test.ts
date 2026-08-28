import { describe, expect, it } from 'vitest';
import { DEVICE_EVENT_PROTOCOL, HEALTH_EVENT_PROTOCOL, TASK_SIGNAL_PROTOCOL, type FrostTaskRequest, type HealthEvent, type TaskSignal } from './contracts';
import { replayDeviceEvents } from './deviceGateway';
import { transitionDevice } from './deviceState';
import { FrostHealthTaskmaster } from './orchestrator';
import { planHealthMessage } from './planner';
import { HealthSkillRegistry } from './registry';
import { InMemoryTaskmasterStore } from './store';
import { compileDailySummary } from './summary';
import { createDefaultTools } from './tools';
import { InMemoryTraceSink, PersistentTraceSink } from './trace';

const at = '2026-08-19T10:00:00.000Z';

function request(kind: FrostTaskRequest['kind'], input: FrostTaskRequest['input'] = {}): FrostTaskRequest {
  return { task_id: `task-${kind}`, user_id: 'user-1', kind, requested_at: at, input, source: 'user' };
}

function event(id: string, type: HealthEvent['type'], facts: HealthEvent['facts'], confidence = 1): HealthEvent {
  const domain = type === 'meal_confirmed' ? 'meal' : type === 'run_completed' ? 'workout' : type === 'nature_captured' ? 'nature' : 'skill';
  return {
    protocol: HEALTH_EVENT_PROTOCOL, event_id: id, user_id: 'user-1', occurred_at: at,
    domain, type, source: { device_id: 'test', provider: 'test' }, facts, confidence,
    provenance: { model_version: 'test', tool_version: 'test', input_hash: id },
    visibility: 'private', sync: { state: 'pending', revision: 1 },
  };
}

describe('Frost Health Taskmaster', () => {
  it('routes obvious health language locally without persisting the raw message', async () => {
    const planned = await planHealthMessage('我跑完了，帮我同步路线并种棵树', { user_id: 'user-1', input: { device_id: 'esp32-1' }, now: new Date(at) });
    expect(planned.source).toBe('local-rule');
    expect(planned.request?.kind).toBe('complete_run');
    expect(planned.request?.input).toEqual({ device_id: 'esp32-1' });
    expect(JSON.stringify(planned.request)).not.toContain('我跑完了');
  });

  it('routes a requested run plan into the dedicated route-planning task', async () => {
    const planned = await planHealthMessage('带我跑 5 公里，规划一条沿湖路线', { user_id: 'user-1', now: new Date(at) });
    expect(planned.request?.kind).toBe('plan_run_route');
  });

  it('does not send ambiguous health language to a cloud planner without consent', async () => {
    let calls = 0;
    const planned = await planHealthMessage('帮我安排一下', { user_id: 'user-1' }, {
      location: 'cloud', classify: async () => { calls += 1; return { kind: 'start_workout', confidence: 0.9 }; },
    });
    expect(planned.reason).toBe('cloud_planner_requires_consent');
    expect(calls).toBe(0);
  });

  it('uses progressive disclosure for health skills', () => {
    const registry = new HealthSkillRegistry();
    const catalog = registry.catalog();
    expect(catalog.length).toBeGreaterThanOrEqual(5);
    expect(catalog[0]).not.toHaveProperty('steps');
    expect(registry.forTask('log_meal').steps.map((step) => step.tool)).toEqual(['meal.observe', 'meal.commit']);
  });

  it('observes a meal, waits for explicit confirmation, then commits evidence', async () => {
    const store = new InMemoryTaskmasterStore();
    const traces = new PersistentTraceSink(store);
    const taskmaster = new FrostHealthTaskmaster(store, createDefaultTools({
      observeMeal: async () => ({
        facts: { dishes: ['番茄炒蛋'], calories_kcal: 420, protein_g: 22 }, confidence: 0.84,
        model_version: 'qwen-vl-food-lora/1', tool_version: 'food-pipeline/1', input_hash: 'photo-1',
      }),
    }), traces);
    const started = await taskmaster.start(request('log_meal', { photo_id: 'photo-1' }));
    expect(started.status).toBe('waiting_confirmation');
    expect(started.actions[1].status).toBe('waiting_confirmation');
    const completed = await taskmaster.confirm(started.task_id, started.actions[1].action_id);
    expect(completed.status).toBe('completed');
    expect(completed.source_event_ids).toEqual(['task-log_meal:meal_confirmed']);
    expect((await store.listHealthEvents('user-1'))[0].facts.confirmed).toBe(true);
  });

  it('checkpoints while an external model is absent and resumes without repeating completed work', async () => {
    const store = new InMemoryTaskmasterStore();
    let ready = false;
    const tools = createDefaultTools({
      observeMeal: async () => ready ? {
        facts: { dishes: ['青菜'], calories_kcal: 80 }, confidence: 0.9,
        model_version: 'qwen-food/1', tool_version: 'food/1', input_hash: 'photo-2',
      } : null,
    });
    const taskmaster = new FrostHealthTaskmaster(store, tools, new InMemoryTraceSink());
    const waiting = await taskmaster.start(request('log_meal'));
    expect(waiting.status).toBe('waiting_external');
    expect(waiting.next_action_index).toBe(0);
    ready = true;
    const resumed = await taskmaster.resume(waiting.task_id);
    expect(resumed.status).toBe('waiting_confirmation');
    expect(resumed.next_action_index).toBe(1);
    expect(resumed.counters.tool_calls).toBe(2);
  });

  it('finishes a device-backed run without inventing a route and plants a private tree', async () => {
    const store = new InMemoryTaskmasterStore();
    const taskmaster = new FrostHealthTaskmaster(store, createDefaultTools(), new InMemoryTraceSink());
    const completed = await taskmaster.start(request('complete_run', { device_fact: { distance_m: 3020, duration_s: 1220, steps: 3880 } }));
    expect(completed.status).toBe('completed');
    expect(completed.actions[0].result).not.toHaveProperty('route_points');
    expect(completed.actions[1].result?.visibility).toBe('private');
  });

  it('creates a route session handoff without pretending that a run was completed', async () => {
    const store = new InMemoryTaskmasterStore();
    const taskmaster = new FrostHealthTaskmaster(store, createDefaultTools({
      planRoute: async () => ({
        route_session_id: 'route-1',
        status: 'created',
        ui_action: { tab: 'earth', mode: 'route_preview', session_id: 'route-1' },
      }),
    }), new InMemoryTraceSink());
    const completed = await taskmaster.start(request('plan_run_route', { goal_type: 'distance', distance_m: 5000 }));
    expect(completed.status).toBe('completed');
    expect(completed.skill_id).toBe('frost.run-route');
    expect(completed.actions[0].result).toMatchObject({ route_session_id: 'route-1' });
    expect(completed.source_event_ids).toEqual([]);
    await expect(store.listHealthEvents('user-1')).resolves.toEqual([]);
  });

  it('safe-stops before any tool call when danger markers are present', async () => {
    const store = new InMemoryTaskmasterStore();
    const traces = new InMemoryTraceSink();
    const taskmaster = new FrostHealthTaskmaster(store, createDefaultTools(), traces);
    const stopped = await taskmaster.start(request('start_workout', { safety: { chest_pain: true } }));
    expect(stopped.status).toBe('safe_stopped');
    expect(stopped.counters.tool_calls).toBe(0);
  });

  it('keeps a low-confidence nature label unknown', async () => {
    const store = new InMemoryTaskmasterStore();
    const taskmaster = new FrostHealthTaskmaster(store, createDefaultTools({
      observeNature: async () => ({ facts: { label: '白头鹎' }, confidence: 0.42, model_version: 'bird/1', tool_version: 'nature/1', input_hash: 'audio-1' }),
    }), new InMemoryTraceSink());
    const completed = await taskmaster.start(request('capture_nature', { media_id: 'audio-1' }));
    expect(completed.status).toBe('completed');
    expect((await store.listHealthEvents('user-1'))[0].facts.label).toBe('unknown');
  });

  it('accepts a correlated external signal once and commits its effect and trace', async () => {
    const store = new InMemoryTaskmasterStore();
    const traces = new PersistentTraceSink(store);
    const taskmaster = new FrostHealthTaskmaster(store, createDefaultTools(), traces);
    const waiting = await taskmaster.start(request('start_workout'));
    expect(waiting.status).toBe('waiting_confirmation');
    const confirmed = await taskmaster.confirm(waiting.task_id, waiting.actions[0].action_id);
    expect(confirmed.status).toBe('waiting_external');
    expect(confirmed.actions[0].status).toBe('waiting_external');
    const action = confirmed.actions[0];
    const completedEvent = event(`${confirmed.task_id}:skill_completed`, 'skill_completed', { exercise_name: '瑜伽', duration_sec: 90 });
    const signal: TaskSignal = {
      protocol: TASK_SIGNAL_PROTOCOL,
      signal_id: 'signal-motion-1',
      task_id: confirmed.task_id,
      run_id: confirmed.run_id,
      action_id: action.action_id,
      correlation_id: action.correlation_id,
      kind: 'tool_result',
      occurred_at: at,
      actor: 'skill',
      payload: { exercise_name: '瑜伽', duration_sec: 90 },
      events: [completedEvent],
    };
    const completed = await taskmaster.signal(signal);
    expect(completed.status).toBe('completed');
    expect((await taskmaster.signal(signal)).status).toBe('completed');
    expect(await store.listTaskSignals(completed.task_id)).toHaveLength(1);
    expect(await store.listHealthEvents('user-1')).toHaveLength(1);
    expect((await store.getEffect(`effect:${action.action_id}`))?.status).toBe('committed');
    const persistedTrace = await store.listTraces(completed.run_id);
    expect(persistedTrace.map((item) => item.type)).toContain('effect.committed');
  });

  it('rejects a signal whose correlation id does not match the waiting action', async () => {
    const store = new InMemoryTaskmasterStore();
    const taskmaster = new FrostHealthTaskmaster(store, createDefaultTools(), new InMemoryTraceSink());
    let waiting = await taskmaster.start(request('start_workout'));
    waiting = await taskmaster.confirm(waiting.task_id, waiting.actions[0].action_id);
    const action = waiting.actions[0];
    await expect(taskmaster.signal({
      protocol: TASK_SIGNAL_PROTOCOL,
      signal_id: 'bad-signal', task_id: waiting.task_id, run_id: waiting.run_id,
      action_id: action.action_id, correlation_id: 'wrong', kind: 'tool_result',
      occurred_at: at, actor: 'skill', payload: {},
    })).rejects.toThrow('signal_correlation_mismatch');
    expect(await store.listTaskSignals(waiting.task_id)).toHaveLength(0);
  });
});

describe('device, event and evidence boundaries', () => {
  it('replays ESP32 events idempotently', async () => {
    const store = new InMemoryTaskmasterStore();
    const deviceEvent = {
      protocol: DEVICE_EVENT_PROTOCOL, event_id: 'device-1', user_id: 'user-1', device_id: 'esp32-1', occurred_at: at,
      kind: 'workout_completed', payload: { distance_m: 1000, duration_s: 400 }, sync: { state: 'pending', revision: 1 },
    };
    const first = await replayDeviceEvents(store, [deviceEvent]);
    const second = await replayDeviceEvents(store, [deviceEvent]);
    expect(first.accepted).toBe(1);
    expect(second.duplicates).toBe(1);
    expect((await store.listHealthEvents('user-1'))).toHaveLength(1);
  });

  it('rejects invalid coordinates instead of repairing them into fake GPS', async () => {
    const store = new InMemoryTaskmasterStore();
    const result = await replayDeviceEvents(store, [{
      protocol: DEVICE_EVENT_PROTOCOL, event_id: 'bad-gps', user_id: 'user-1', device_id: 'esp32-1', occurred_at: at,
      kind: 'nature_capture', geo: { latitude: 130, longitude: 20 }, payload: {}, sync: { state: 'pending', revision: 1 },
    }]);
    expect(result.rejected).toHaveLength(1);
    expect(await store.listHealthEvents('user-1')).toHaveLength(0);
  });

  it('enforces the ESP32 state machine', () => {
    expect(transitionDevice('BOOT', 'booted')).toBe('PAIRING');
    expect(transitionDevice('WORKOUT_RUNNING', 'long_press')).toBe('NATURE_CAPTURE');
    expect(() => transitionDevice('READY', 'capture_saved')).toThrow('invalid_device_transition');
  });

  it('builds daily summaries only from active evidence and never asserts low-confidence species', () => {
    const events = [
      event('meal-old', 'meal_confirmed', { confirmed: true, calories_kcal: 900 }),
      { ...event('meal-fixed', 'meal_confirmed', { confirmed: true, calories_kcal: 600, protein_g: 30 }), supersedes_event_id: 'meal-old' },
      event('run-1', 'run_completed', { distance_m: 5000, duration_s: 1800, steps: 6200 }),
      event('nature-1', 'nature_captured', { label: '赤腹鹰' }, 0.51),
    ];
    const summary = compileDailySummary('user-1', '2026-08-19', events);
    expect(summary.meals.calories_kcal).toBe(600);
    expect(summary.workout.distance_m).toBe(5000);
    expect(summary.nature[0].label).toBe('待确认的自然时刻');
    expect(summary.source_event_ids).toEqual(['meal-fixed', 'run-1', 'nature-1']);
  });
});
