import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HEALTH_EVENT_PROTOCOL, TASK_SIGNAL_PROTOCOL, type HealthEvent } from '../../../frost-agent/taskmaster';

vi.mock('../../../frost-agent/edge/contract', () => ({
  edgeSafe: { async chat() { return ''; } },
}));

import { getFrostHealthRuntime } from './frostHealthTaskmaster';
import { getActiveRunRouteSessionId, readRunRouteSession } from './runRouteSkill';
import {
  readFrostAgentEvents,
  resumeFrostAgentFromTaskSignal,
  runFrostGoalDriverOnce,
  scheduleFrostAgentGoal,
  sendFrostAgentMessage,
} from './frostAgentRuntime';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key) { return values.get(key) ?? null; },
    key(index) { return [...values.keys()][index] ?? null; },
    removeItem(key) { values.delete(key); },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

describe('PWA Frost Agent Runtime', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });

  it('autonomously loads Her Motion, starts Taskmaster, and resumes from its completion signal', async () => {
    const started = await sendFrostAgentMessage('带我做 10 分钟瑜伽');
    expect(started.session.status).toBe('waiting_external');
    expect(started.task).toEqual(expect.objectContaining({
      skill_id: 'frost.her-motion-warmup',
      status: 'waiting_external',
      request: expect.objectContaining({ source: 'agent', kind: 'start_workout' }),
    }));
    if (!started.task) throw new Error('task_missing');

    const action = started.task.actions[started.task.next_action_index];
    const event: HealthEvent = {
      protocol: HEALTH_EVENT_PROTOCOL,
      event_id: `${started.task.task_id}:skill_completed`,
      user_id: started.task.request.user_id,
      occurred_at: new Date().toISOString(),
      domain: 'skill',
      type: 'skill_completed',
      source: { device_id: 'pwa', provider: 'her-motion' },
      facts: { exercise: '瑜伽', duration_sec: 600 },
      confidence: 1,
      provenance: { model_version: 'her-motion/test', tool_version: 'adapter/test', input_hash: 'pwa-motion-test' },
      visibility: 'private',
      sync: { state: 'pending', revision: 1 },
    };
    const signalId = `${started.task.task_id}:signal:test`;
    await getFrostHealthRuntime().taskmaster.signal({
      protocol: TASK_SIGNAL_PROTOCOL,
      signal_id: signalId,
      task_id: started.task.task_id,
      run_id: started.task.run_id,
      action_id: action.action_id,
      correlation_id: action.correlation_id,
      kind: 'tool_result',
      occurred_at: new Date().toISOString(),
      actor: 'skill',
      payload: { exercise: '瑜伽', duration_sec: 600 },
      events: [event],
    });

    await resumeFrostAgentFromTaskSignal({ signal_id: signalId, task_id: started.task.task_id });

    const events = await readFrostAgentEvents();
    expect(events.some((item) => item.type === 'assistant.message' && String(item.data.text).includes('Taskmaster 完成'))).toBe(true);
    await expect(getFrostHealthRuntime().store.listHealthEvents('local-user')).resolves.toHaveLength(1);
    expect(events.filter((item) => item.type === 'tool.called').map((item) => item.data.tool)).toEqual([
      'skill.load', 'taskmaster.start_intent', 'taskmaster.get',
    ]);

    const goalId = await scheduleFrostAgentGoal({ objective: '生成今日健康总结' });
    await expect(runFrostGoalDriverOnce()).resolves.toEqual([goalId]);
    const afterGoal = await readFrostAgentEvents();
    expect(afterGoal.some((item) => item.type === 'user.message' && item.data.source === 'goal')).toBe(true);
    expect(afterGoal.some((item) => item.type === 'assistant.message' && String(item.data.text).includes('今日健康总结'))).toBe(true);

    const nextTask = await sendFrostAgentMessage('帮我记录一餐');
    expect(nextTask.task).toEqual(expect.objectContaining({
      status: 'waiting_external',
      request: expect.objectContaining({ kind: 'log_meal' }),
    }));
    expect(nextTask.task?.task_id).not.toBe(started.task.task_id);
  });

  it('lets Frost plan a real route session and hand it to the Earth tab without logging a fake run', async () => {
    const healthEventsBefore = await getFrostHealthRuntime().store.listHealthEvents('local-user');
    const planned = await sendFrostAgentMessage('帮我规划一条 5 公里沿湖、少爬坡的跑步路线');
    expect(planned.task).toEqual(expect.objectContaining({
      skill_id: 'frost.run-route',
      status: 'completed',
      request: expect.objectContaining({
        source: 'agent',
        kind: 'plan_run_route',
        input: expect.objectContaining({ distance_m: 5000, shape: 'loop' }),
      }),
    }));
    const sessionId = getActiveRunRouteSessionId();
    expect(sessionId).toBeTruthy();
    expect(readRunRouteSession(sessionId!)).toEqual(expect.objectContaining({
      status: 'created',
      input: expect.objectContaining({ source: 'taskmaster', preferences: expect.arrayContaining(['lakeside', 'flat']) }),
      planned_path: [],
      actual_track: [],
    }));
    await expect(getFrostHealthRuntime().store.listHealthEvents('local-user')).resolves.toHaveLength(healthEventsBefore.length);
  });
});
