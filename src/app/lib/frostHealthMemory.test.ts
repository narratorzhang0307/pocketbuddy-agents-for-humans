import { beforeEach, describe, expect, it } from 'vitest';
import { ensureBuiltinSkills, resetSkillRegistryForTests } from './skill';
import { isHealthAdviceRequest, readHealthMemory, validWorkoutResult } from './frostHealthMemory';
import { validPhoneSteps } from './frostPhoneHealth';
import { isHealthAdviceAcceptance, planFrostWorkspaceLaunch } from './frostConversation';
import { localHealthDay } from '../../../frost-agent/taskmaster/summary';
describe('shared health decision and sensor boundaries', () => {
  beforeEach(() => { resetSkillRegistryForTests(); ensureBuiltinSkills(); });
  it('routes personal today questions without stealing direct camera commands', () => {
    expect(isHealthAdviceRequest('今天还适合吃什么？')).toBe(true);
    expect(isHealthAdviceRequest('我今天走了多少步，还适合锻炼吗')).toBe(true);
    expect(isHealthAdviceRequest('调用女性运动')).toBe(false);
    expect(planFrostWorkspaceLaunch('调用女性运动')?.steps[0].skillId).toBe('pocket.her-motion');
    expect(planFrostWorkspaceLaunch('调用练了吗')?.steps[0].skillId).toBe('pocket.lianlema');
    expect(isHealthAdviceAcceptance('开始这个训练')).toBe(true);
    expect(isHealthAdviceAcceptance('不要开始这个训练')).toBe(false);
    expect(isHealthAdviceAcceptance('开始这个训练？')).toBe(false);
  });
  it('does not treat uploaded videos or zero observed time as completed exercise', () => {
    const workout = { input_mode: 'live' as const, duration_sec: 60, exercise_name: 'squat', total_reps: 10, observed_frames: 25 };
    expect(validWorkoutResult(workout)).toBe(true);
    expect(validWorkoutResult({ ...workout, duration_sec: 0 })).toBe(false);
    expect(validWorkoutResult({ ...workout, observed_frames: 0 })).toBe(false);
    expect(validWorkoutResult({ ...workout, input_mode: 'video' as 'live' })).toBe(false);
  });
  it('does not coerce denied/unknown, stale or wrong-day steps to a fresh number', () => {
    const now = new Date(), start = new Date(now); start.setHours(0, 0, 0, 0);
    const value = { status: 'ok' as const, steps: 1000, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      day: localHealthDay(now), as_of: now.toISOString(), window_start: start.toISOString() };
    expect(validPhoneSteps(value, now)).toBe(true);
    expect(validPhoneSteps({ ...value, steps: undefined }, now)).toBe(false);
    expect(validPhoneSteps({ ...value, status: 'no_data' }, now)).toBe(false);
    expect(validPhoneSteps({ ...value, as_of: '2020-01-01T00:00:00Z' }, now)).toBe(false);
    expect(validPhoneSteps({ ...value, day: '2020-01-01' }, now)).toBe(false);
  });
  it('has a stable evidence revision and does not fill missing days with zero', async () => {
    const a = await readHealthMemory(), b = await readHealthMemory();
    expect(a.revision).toBe(b.revision);
    expect(a.history).toEqual([]);
    expect(a.today.workout.steps).toBeUndefined();
    expect(a.missing.length).toBeGreaterThan(0);
  });
});
