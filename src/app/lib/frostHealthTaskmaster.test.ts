import { describe, expect, it, vi } from 'vitest';
import { completeHerMotionTask, getFrostHealthRuntime, recordMealWithTaskmaster, startHerMotionTask, startMealTask, startRunRouteTask } from './frostHealthTaskmaster';
import { getActiveRunRouteSessionId, readRunRouteSession, subscribeRunRouteOpen } from './runRouteSkill';

describe('local Frost Taskmaster runtime', () => {
  it('resumes a Her Motion task and writes its health event exactly once', async () => {
    const taskId = 'health-her-motion-integration-1';
    const prepared = await startHerMotionTask({ taskId, objective: '做一组瑜伽热身' });
    expect(prepared.status).toBe('waiting_confirmation');
    const waiting = await startHerMotionTask({ taskId, confirmCamera: true });
    expect(waiting.status).toBe('waiting_external');
    expect(waiting.task_id).toBe(prepared.task_id);

    const observation = {
      facts: { exercise_name: '树式', duration_sec: 90, pose_confirmed: true },
      confidence: 0.91,
      model_version: 'mediapipe-pose+yoga-82',
      tool_version: 'her-motion-frost-adapter/1.1.0',
      input_hash: 'session-1',
    };
    const completed = await completeHerMotionTask(taskId, observation);
    expect(completed.status).toBe('completed');
    await completeHerMotionTask(taskId, observation);

    const events = await getFrostHealthRuntime().store.listHealthEvents('local-user');
    expect(events.filter((event) => event.event_id === `${taskId}:skill_completed`)).toHaveLength(1);
  });

  it('lets Frost start Meal Lens and lets the skill finish the same task through a signal', async () => {
    const taskId = 'health-meal-lens-integration-1';
    const waiting = await startMealTask({ taskId, planId: 'plan-1', stepId: 'step-1', objective: '记录午餐' });
    expect(waiting.status).toBe('waiting_external');
    const completed = await recordMealWithTaskmaster({
      facts: { dishes: ['宫保鸡丁'], calories_kcal: 520 },
      confidence: 0.82,
      model_version: 'cn-food-library/no-model',
      tool_version: 'meal-lens-taskmaster-adapter/1.0.0',
      input_hash: 'meal-1',
    }, taskId);
    expect(completed.status).toBe('completed');
    expect(completed.request.input.plan_id).toBe('plan-1');
    const runtime = getFrostHealthRuntime();
    expect((await runtime.store.listTaskSignals(taskId))).toHaveLength(1);
    expect((await runtime.store.getEffect(`effect:${completed.actions[1].action_id}`))?.status).toBe('committed');
    expect((await runtime.traces.list(completed.run_id)).some((entry) => entry.type === 'signal.received')).toBe(true);
  });

  it('routes the Skill form through Taskmaster before opening the Earth execution surface', async () => {
    const task = await startRunRouteTask({
      activity: 'running', start: 'current_location',
      goal: { type: 'distance', distance_m: 5000 }, shape: 'loop',
      preferences: ['scenic', 'flat'], source: 'user',
      request_text: '帮我规划一条 5 公里风景好、少爬坡的跑步路线',
    }, 'health-route-skill-form-integration-1');
    expect(task).toMatchObject({ skill_id: 'frost.run-route', status: 'completed' });
    const routeSessionId = getActiveRunRouteSessionId();
    expect(routeSessionId).toBeTruthy();
    expect(readRunRouteSession(routeSessionId!)).toMatchObject({
      status: 'created',
      input: {
        source: 'taskmaster', source_task_id: task.task_id,
        request_text: '帮我规划一条 5 公里风景好、少爬坡的跑步路线',
      },
    });
    const open = vi.fn(); const release = subscribeRunRouteOpen(open);
    open.mockClear();
    try {
      const reused = await startRunRouteTask(readRunRouteSession(routeSessionId!)!.input, task.task_id);
      expect(reused.task_id).toBe(task.task_id);
      expect(open).toHaveBeenCalledExactlyOnceWith(routeSessionId);
    } finally { release(); }
  });
});
