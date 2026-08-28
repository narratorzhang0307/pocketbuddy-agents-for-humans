import { afterEach, describe, expect, it, vi } from 'vitest';
import { FROST_AGENT_EVENT_PROTOCOL, type FrostAgentEvent } from '../../../frost-agent/runtime/contracts';
import type { JsonObject } from '../../../frost-agent/taskmaster';
import { FrostCompanion } from './frostCompanion';
import type { BadgeStatus } from './frostBadge';
import { BADGE_AVATAR_ENDPOINT } from './skill/avatars';

function event(seq: number, type: FrostAgentEvent['type'], data: JsonObject, session = 'session-a'): FrostAgentEvent {
  return { protocol: FROST_AGENT_EVENT_PROTOCOL, event_id: `${session}:${seq}`, session_id: session, seq,
    type, data, occurred_at: '2026-08-27T00:00:00Z' };
}
const created = event(1, 'session.created', { user_id: 'local-user', status: 'idle' });
function task(seq: number, status: string, user = 'local-user', id = 'task-a') {
  return event(seq, 'tool.result', { tool: 'taskmaster.get', result: { status: 'success',
    data: { task: { task_id: id, status, request: { user_id: user } } } } });
}
function setup(history = [created]) {
  const listeners = new Set<(event: FrostAgentEvent) => void>(), badgeListeners = new Set<() => void>();
  let badge: BadgeStatus = { status: 'connected', connectionId: 'badge:a', devices: [], endpoints: [], recording: false, receivedBytes: 0 };
  const ports = { history: vi.fn(async () => history), observe: (fn: (event: FrostAgentEvent) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    record: vi.fn(async () => {}), badge: { snapshot: () => badge, subscribe: (fn: () => void) => { badgeListeners.add(fn); return () => { badgeListeners.delete(fn); }; },
      projectPose: vi.fn(async () => {}), projectAvatar: vi.fn(async () => {}), testSpeaker: vi.fn(async () => {}) } };
  const companion = new FrostCompanion(ports);
  const stop = companion.start();
  return { companion, ports, stop, emit: (item: FrostAgentEvent) => { listeners.forEach(fn => fn(item)); },
    patchBadge: (patch: Partial<BadgeStatus>) => { badge = { ...badge, ...patch }; badgeListeners.forEach(fn => fn()); } };
}
afterEach(() => vi.useRealTimers());

describe('app-scoped Frost companion', () => {
  it('switches portraits on real dispatch, supports page selection, and resets for a new user message', async () => {
    const { companion, emit, patchBadge, ports, stop } = setup(); await Promise.resolve();
    expect(ports.badge.projectAvatar).not.toHaveBeenCalled();
    patchBadge({ endpoints: [BADGE_AVATAR_ENDPOINT] });
    expect(ports.badge.projectAvatar).toHaveBeenLastCalledWith('frost');
    emit(event(2, 'assistant.message', { text: '我要调用睡眠侦探' }));
    expect(companion.snapshot().avatarId).toBe('frost');
    emit(event(3, 'skill.dispatched', { run_id: 'run-1', skill_id: 'frost.sleep-detective', target: 'frost-sleep-detective' }));
    expect(ports.badge.projectAvatar).toHaveBeenLastCalledWith('frost.sleep-detective');
    companion.setActiveSkill('her-motion');
    expect(ports.badge.projectAvatar).toHaveBeenLastCalledWith('pocket.her-motion');
    emit(event(4, 'user.message', { source: 'user', content: { text: '换个任务' } }));
    expect(companion.snapshot().avatarId).toBe('frost');
    expect(ports.badge.projectAvatar).toHaveBeenLastCalledWith('frost');
    stop();
  });
  it('defers portrait switching during recording and sends only the latest portrait after the tail', async () => {
    const { companion, patchBadge, ports, stop } = setup(); await Promise.resolve();
    patchBadge({ endpoints: [BADGE_AVATAR_ENDPOINT], recording: true });
    companion.setActiveSkill('frost.run-route');
    companion.setActiveSkill('frost.meal-lens');
    expect(ports.badge.projectAvatar).not.toHaveBeenCalled();
    patchBadge({ recording: false, receivedBytes: 3200 });
    expect(ports.badge.projectAvatar).not.toHaveBeenCalled();
    patchBadge({ pcm: new Uint8Array(3200), pcmId: 'current-pcm' });
    expect(ports.badge.projectAvatar).toHaveBeenCalledExactlyOnceWith('frost.meal-lens');
    companion.setActiveSkill('unknown-skill');
    expect(ports.badge.projectAvatar).toHaveBeenLastCalledWith('frost');
    stop();
  });
  it('shows the actual read-only skill or delegated skill without treating a proposed plan as dispatch', async () => {
    const { companion, emit, patchBadge, ports, stop } = setup(); await Promise.resolve();
    patchBadge({ endpoints: [BADGE_AVATAR_ENDPOINT] });
    emit(event(2, 'tool.result', { tool: 'frost.skill_plan', result: { status: 'success', data: {
      plan: { steps: [{ skillId: 'frost.sleep-detective' }] },
    } } }));
    expect(companion.snapshot().avatarId).toBe('frost');
    emit(event(3, 'tool.result', { tool: 'frost.skill_answer', result: { status: 'success', data: {
      answerSkillId: 'frost.outdoor-window', reply: '还需要你提供城市。', needsInput: true,
    } } }));
    expect(ports.badge.projectAvatar).toHaveBeenLastCalledWith('frost.outdoor-window');
    expect(companion.snapshot().pose).not.toBe('celebrate');
    emit(event(4, 'tool.result', { tool: 'frost.task_delegate', result: { status: 'success', data: {
      skill_id: 'pocket.her-motion', status: 'waiting_user',
    } } }));
    expect(companion.snapshot().avatarId).toBe('pocket.her-motion');
    emit(event(5, 'tool.result', { tool: 'frost.skill_plan', result: { status: 'success', data: {
      delegations: [{ skill_id: 'frost.mealie-kitchen', run_id: 'kitchen', status: 'waiting_external', reply: '等待打开页面' }],
    } } }));
    expect(companion.snapshot().avatarId).toBe('frost.mealie-kitchen');
    stop();
  });
  it('shares identity/session and observes real task results, not assistant claims or unrelated users', async () => {
    const { companion, emit, ports, stop } = setup(); await Promise.resolve();
    expect(companion.snapshot()).toMatchObject({ sessionId: 'session-a', userId: 'local-user' });
    emit(event(2, 'assistant.message', { text: '我完成了' }));
    emit(task(3, 'completed', 'another-user'));
    expect(companion.snapshot().task).toBeUndefined();
    expect(ports.badge.testSpeaker).not.toHaveBeenCalled();
    emit(task(4, 'waiting_external'));
    expect(companion.snapshot().task?.status).toBe('waiting_external');
    emit(task(5, 'completed'));
    expect(companion.snapshot()).toMatchObject({ pose: 'celebrate', task: { id: 'task-a', status: 'completed' } });
    expect(ports.badge.testSpeaker).not.toHaveBeenCalled(); // opt-in, never auto paid TTS
    emit(event(99, 'session.status_changed', { status: 'running' }, 'other-session'));
    expect(companion.snapshot().sessionId).toBe('session-a');
    stop();
  });
  it('never replays historical or duplicate completion sounds, and respects foreground and recording', async () => {
    vi.useFakeTimers();
    const { companion, emit, patchBadge, ports, stop } = setup([created, task(2, 'completed')]);
    companion.setResultTone(true); await Promise.resolve();
    expect(ports.badge.testSpeaker).not.toHaveBeenCalled();
    emit(task(3, 'completed'));
    expect(ports.badge.testSpeaker).not.toHaveBeenCalled();
    emit(task(4, 'completed', 'local-user', 'task-b'));
    expect(ports.badge.testSpeaker).toHaveBeenCalledTimes(1);
    companion.setForeground(false);
    emit(task(5, 'completed', 'local-user', 'task-c'));
    companion.setForeground(true);
    patchBadge({ recording: true });
    emit(task(6, 'completed', 'local-user', 'task-d'));
    expect(ports.badge.testSpeaker).toHaveBeenCalledTimes(1);
    expect(companion.snapshot().pose).toBe('busy');
    patchBadge({ recording: false });
    vi.advanceTimersByTime(2600);
    expect(companion.snapshot().pose).toBe('idle');
    stop();
  });
  it('logs each touch/recording once as metadata and never treats a touch as authorization', async () => {
    const { companion, patchBadge, ports, stop } = setup(); await Promise.resolve();
    const touch = { count: 1, x: 5, y: 7 };
    patchBadge({ lastTouch: touch }); patchBadge({ lastTouch: touch });
    expect(ports.record).toHaveBeenCalledTimes(1);
    expect(ports.record).toHaveBeenCalledWith({ id: 'badge:a:touch:1', kind: 'touch', count: 1 });
    patchBadge({ pcm: Uint8Array.of(0, 0), pcmId: 'badge:a:recording:1' });
    patchBadge({ receivedBytes: 2 });
    expect(ports.record).toHaveBeenCalledTimes(2);
    expect(ports.record).toHaveBeenLastCalledWith({ id: 'badge:a:recording:1', kind: 'recording_ready', bytes: 2 });
    expect(companion.snapshot().task).toBeUndefined();
    patchBadge({ connectionId: 'badge:b', lastTouch: undefined });
    expect(ports.record).toHaveBeenCalledTimes(2); // previous PCM is not a new input on reconnect
    patchBadge({ lastTouch: touch });
    expect(ports.record).toHaveBeenCalledTimes(3);
    stop();
  });
  it('projects page-based subagents as waiting, never as task success', async () => {
    const { companion, emit, ports, stop } = setup(); await Promise.resolve(); companion.setResultTone(true);
    emit(event(2, 'tool.result', { tool: 'frost.skill_plan', result: { status: 'success', data: {
      delegations: [{ run_id: 'child-a', status: 'waiting_external', reply: '已准备好打开页面' }],
    } } }));
    expect(companion.snapshot().task).toMatchObject({ id: 'child-a', status: 'waiting_external' });
    expect(companion.snapshot().task?.message).toContain('尚未完成');
    expect(companion.snapshot().pose).toBe('attention');
    expect(ports.badge.testSpeaker).not.toHaveBeenCalled();
    stop();
  });
  it('only projects a page result after a matching dispatch in the same main session', async () => {
    const { companion, emit, stop } = setup(); await Promise.resolve();
    const data = { run_id: 'page:1', skill_id: 'frost.openfoodfacts', target: 'frost-openfoodfacts' };
    emit(event(2, 'skill.result', { ...data, status: 'completed', summary: '无交接的结果' }));
    expect(companion.snapshot().task).toBeUndefined();
    emit(event(3, 'skill.dispatched', data));
    emit(event(4, 'skill.result', { ...data, status: 'completed', summary: '真实查询返回2项' }));
    expect(companion.snapshot()).toMatchObject({ pose: 'celebrate', task: { status: 'completed', message: '真实查询返回2项' } }); stop();
  });
  it('does not let Bluetooth errors change task status or flood retries', async () => {
    const { companion, emit, patchBadge, ports, stop } = setup(); await Promise.resolve();
    ports.badge.projectPose.mockRejectedValue(new Error('transport unavailable'));
    emit(event(2, 'session.status_changed', { status: 'running' })); await Promise.resolve();
    await vi.waitFor(() => expect(companion.snapshot()).toMatchObject({ status: 'running', projectionError: 'Error: transport unavailable' }));
    expect(companion.snapshot().error).toBeUndefined();
    const calls = ports.badge.projectPose.mock.calls.length;
    patchBadge({ receivedBytes: 64 }); patchBadge({ receivedBytes: 128 });
    expect(ports.badge.projectPose).toHaveBeenCalledTimes(calls);
    stop();
  });
  it('defers avatar control during microphone capture and tail delivery, then sends only the current state', async () => {
    const { companion, patchBadge, ports, stop } = setup(); await Promise.resolve();
    ports.badge.projectPose.mockClear();
    patchBadge({ recording: true });
    expect(companion.snapshot().pose).toBe('busy');
    patchBadge({ receivedBytes: 3200 });
    patchBadge({ recording: false, captureStats: { samples: 3200, peak: 100, dropped: 0, reason: 1, complete: false } });
    expect(ports.badge.projectPose).not.toHaveBeenCalled();
    patchBadge({ pcm: new Uint8Array(6400), pcmId: 'badge:a:recording:tail', receivedBytes: 6400,
      captureStats: { samples: 3200, peak: 100, dropped: 0, reason: 1, complete: true } });
    expect(ports.badge.projectPose).toHaveBeenCalledExactlyOnceWith('attention');
    stop();
  });
  it('clears only a recovered avatar error and ignores a late failure from a previous connection', async () => {
    const { companion, emit, patchBadge, ports, stop } = setup(); await Promise.resolve();
    ports.badge.projectPose.mockRejectedValueOnce(new Error('reply lost'));
    emit(event(2, 'session.status_changed', { status: 'running' }));
    await Promise.resolve(); await Promise.resolve();
    expect(companion.snapshot().projectionError).toContain('reply lost');
    emit(event(3, 'session.status_changed', { status: 'idle' }));
    await Promise.resolve(); await Promise.resolve();
    expect(companion.snapshot().projectionError).toBeUndefined();
    let reject!: (reason: Error) => void;
    ports.badge.projectPose.mockImplementationOnce(() => new Promise((_resolve, failed) => { reject = failed; }));
    emit(event(4, 'session.status_changed', { status: 'running' }));
    patchBadge({ connectionId: 'badge:b' });
    reject(new Error('old connection timeout'));
    await Promise.resolve(); await Promise.resolve();
    expect(companion.snapshot().projectionError).toBeUndefined();
    stop();
  });
  it('clears old completion state when the main runtime creates a new session and releases observers', async () => {
    const { companion, emit, ports, stop } = setup(); await Promise.resolve();
    emit(task(2, 'completed'));
    emit(event(1, 'session.created', { user_id: 'local-user', status: 'idle' }, 'session-b'));
    expect(companion.snapshot()).toMatchObject({ sessionId: 'session-b', pose: 'idle' });
    expect(companion.snapshot().task).toBeUndefined();
    stop(); const calls = ports.badge.projectPose.mock.calls.length;
    emit(event(2, 'session.status_changed', { status: 'running' }, 'session-b'));
    expect(ports.badge.projectPose).toHaveBeenCalledTimes(calls);
  });
});
