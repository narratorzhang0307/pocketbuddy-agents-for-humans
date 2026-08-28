import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyHerMotionBridgeMessage,
  cancelAbandonedHerMotionSessions,
  createHerMotionSession,
  HER_MOTION_BRIDGE_PROTOCOL,
  listHerMotionHealthEvents,
  listHerMotionSessions,
} from './herMotionSession';

const values = new Map<string, string>();

beforeEach(() => {
  values.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
});

describe('Her Motion skill session', () => {
  it('creates a running session and writes a confirmed result into health memory', () => {
    const session = createHerMotionSession();
    applyHerMotionBridgeMessage({
      protocol: HER_MOTION_BRIDGE_PROTOCOL,
      sessionId: session.sessionId,
      type: 'workout-started',
      at: '2026-08-19T09:00:00.000Z',
      domain: 'yoga',
      exerciseId: 'tree',
      exerciseName: '树式',
    });
    const completed = applyHerMotionBridgeMessage({
      protocol: HER_MOTION_BRIDGE_PROTOCOL,
      sessionId: session.sessionId,
      type: 'completed',
      at: '2026-08-19T09:02:05.000Z',
      domain: 'yoga',
      exerciseId: 'tree',
      exerciseName: '树式',
      durationSec: 125,
      poseConfirmed: true,
      confidence: 0.91,
    });

    expect(completed).toMatchObject({
      status: 'completed', domain: 'yoga', exerciseId: 'tree', exerciseName: '树式',
      durationSec: 125, poseConfirmed: true, confidence: 0.91,
    });
    expect(listHerMotionSessions()).toHaveLength(1);
    expect(listHerMotionHealthEvents()).toEqual([
      expect.objectContaining({
        protocol: 'health_event/v1',
        event_id: `health:${session.sessionId}`,
        domain: 'skill',
        type: 'skill_completed',
        visibility: 'private',
        facts: expect.objectContaining({ exercise_id: 'tree', pose_confirmed: true }),
      }),
    ]);
  });

  it('ignores results for unknown sessions', () => {
    expect(applyHerMotionBridgeMessage({
      protocol: HER_MOTION_BRIDGE_PROTOCOL,
      sessionId: 'missing',
      type: 'completed',
      at: new Date().toISOString(),
    })).toBeNull();
  });

  it('leaves Taskmaster-linked completion for Taskmaster instead of double-writing local health memory', () => {
    const session = createHerMotionSession(null, 'health-task-1');
    applyHerMotionBridgeMessage({
      protocol: HER_MOTION_BRIDGE_PROTOCOL,
      sessionId: session.sessionId,
      type: 'completed',
      at: '2026-08-19T09:02:05.000Z',
      exerciseName: '树式',
      durationSec: 125,
      poseConfirmed: true,
    });
    expect(listHerMotionSessions()[0]).toMatchObject({ status: 'completed', taskmasterTaskId: 'health-task-1' });
    expect(listHerMotionHealthEvents()).toEqual([]);
  });

  it('keeps a cancelled session without creating a completed health event', () => {
    const session = createHerMotionSession();
    const cancelled = applyHerMotionBridgeMessage({
      protocol: HER_MOTION_BRIDGE_PROTOCOL,
      sessionId: session.sessionId,
      type: 'cancelled',
      at: '2026-08-19T09:01:00.000Z',
      stopReason: 'user_stop',
    });

    expect(cancelled).toMatchObject({ status: 'cancelled', stopReason: 'user_stop' });
    expect(listHerMotionHealthEvents()).toEqual([]);
  });

  it('safe-stops orphaned running sessions after the host reloads', () => {
    createHerMotionSession();
    expect(cancelAbandonedHerMotionSessions()).toBe(1);
    expect(listHerMotionSessions()[0]).toMatchObject({ status: 'cancelled', stopReason: 'host_recovered' });
    expect(listHerMotionHealthEvents()).toEqual([]);
  });
});
