import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localHealthDay } from '../../../frost-agent/taskmaster/summary';
const fixture = vi.hoisted(() => ({ hardware: true, connection: 'test-badge', listeners: new Set<() => void>(), read: vi.fn(), project: vi.fn() }));
vi.mock('./frostHealthMemory', () => ({ healthSettings: () => ({ hardware: fixture.hardware }), readHealthMemory: fixture.read,
  subscribeHealthMemory: (callback: () => void) => { fixture.listeners.add(callback); return () => fixture.listeners.delete(callback); } }));
vi.mock('./frostBadge', () => ({ frostBadge: { snapshot: () => ({ connectionId: fixture.connection, status: 'connected' }), projectHealthSummary: fixture.project } }));
const memory = () => ({ day: localHealthDay(), revision: 'a'.repeat(64), today: { meals: { count: 1 }, calories_kcal_range: [400, 600], workout: { sessions: 0 } },
  profile: { constraints: 'PRIVATE_HEALTH_CONDITION' } });
beforeEach(() => {
  vi.resetModules(); fixture.hardware = true; fixture.connection = 'test-badge'; fixture.listeners.clear();
  fixture.read.mockReset().mockResolvedValue(memory()); fixture.project.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('document', { visibilityState: 'visible' });
});
afterEach(() => vi.unstubAllGlobals());
describe('low-priority health display projection', () => {
  it('sends only a compact summary, keeping unknown quantities and excluding profile details', async () => {
    const { syncHealthBadge } = await import('./frostHealthBadge');
    expect(await syncHealthBadge()).toContain('不代表语音');
    const text = fixture.project.mock.calls[0][0];
    expect(text).toContain('Kcal ~400-600'); expect(text).toContain('Steps ?'); expect(text).not.toContain('PRIVATE_');
    await syncHealthBadge(true); expect(fixture.project).toHaveBeenCalledTimes(1);
  });
  it('locks before the asynchronous memory read, preventing concurrent writes', async () => {
    let finish!: (value: unknown) => void;
    fixture.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { syncHealthBadge } = await import('./frostHealthBadge');
    const first = syncHealthBadge();
    await expect(syncHealthBadge()).rejects.toThrow('正在处理');
    finish(memory()); await first;
    expect(fixture.project).toHaveBeenCalledTimes(1);
  });
  it.each(['memory', 'consent', 'connection', 'background'])('rejects queued stale display output when %s changes', async reason => {
    const { syncHealthBadge } = await import('./frostHealthBadge');
    fixture.project.mockImplementation(async (_text, allowed) => {
      if (reason === 'memory') fixture.listeners.forEach(listener => listener());
      if (reason === 'consent') fixture.hardware = false;
      if (reason === 'connection') fixture.connection = 'other';
      if (reason === 'background') vi.stubGlobal('document', { visibilityState: 'hidden' });
      expect(allowed()).toBe(false);
      throw new Error('queued_projection_cancelled');
    });
    await expect(syncHealthBadge()).rejects.toThrow('cancelled');
    expect(fixture.listeners.size).toBe(0);
  });
});
