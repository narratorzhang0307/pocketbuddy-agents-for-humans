import { describe, expect, it } from 'vitest';
import { activeHealthEvents, compileDailySummary, localHealthDay } from './summary';
import type { HealthEvent } from './contracts';
const event = (id: string, facts: HealthEvent['facts'], extra: Partial<HealthEvent> = {}): HealthEvent => ({
  protocol: 'health_event/v1', event_id: id, user_id: 'u', occurred_at: '2026-08-27T17:00:00Z', domain: 'meal', type: 'meal_confirmed',
  source: { device_id: 'pwa', provider: 'photos' }, facts, confidence: 0.8,
  provenance: { model_version: 'qwen-vision', tool_version: '1', input_hash: id }, visibility: 'private', sync: { state: 'local', revision: 1 }, ...extra,
});
describe('local-day health evidence', () => {
  it('uses local midnight and DST calendar dates', () => {
    expect(localHealthDay('2026-08-27T17:00:00Z', 'Asia/Shanghai')).toBe('2026-08-28');
    expect(localHealthDay('2026-03-08T07:00:00Z', 'America/New_York')).toBe('2026-03-08');
  });
  it('aggregates ranges and marks incomplete nutritional coverage', () => {
    const a = event('a', { confirmed: true, calories_kcal_range: [400, 600], macros_g: { protein: 25 } });
    const b = event('b', { confirmed: true });
    const summary = compileDailySummary('u', '2026-08-28', [a, a, b], 'Asia/Shanghai');
    expect(summary.meals.count).toBe(2);
    expect(summary.calories_kcal_range).toEqual([400, 600]);
    expect(summary.meals.protein_g).toBe(25);
    expect(summary.nutrition_coverage).toEqual({ meals_with_calories: 1, estimated: true });
  });
  it('excludes demos, cross-day corrected facts and withdrawn records', () => {
    const original = event('old', { calories_kcal: 100 });
    const fixed = event('fixed', { calories_kcal: 200 }, { occurred_at: '2026-08-28T17:00:00Z', supersedes_event_id: 'old' });
    expect(compileDailySummary('u', '2026-08-28', [original, fixed], 'Asia/Shanghai').meals.count).toBe(0);
    const demo = event('demo', { source: 'local-photo-ui-observation' });
    const withdrawn = event('withdrawn', { retracted: true }, { supersedes_event_id: 'fixed' });
    expect(activeHealthEvents('u', [original, fixed, demo, withdrawn])).toEqual([]);
  });
  it('uses the latest daily steps total without adding run steps twice', () => {
    const run = event('run', { duration_s: 600, distance_m: 1000, steps: 1500 }, { type: 'run_completed', domain: 'workout' });
    const steps = event('steps', { kind: 'steps_snapshot', steps: 6000, day: '2026-08-28', timezone: 'Asia/Shanghai' }, { type: 'device_state_changed', domain: 'device' });
    const newer = { ...steps, event_id: 'newer', occurred_at: '2026-08-27T18:00:00Z', facts: { ...steps.facts, steps: 7000 } };
    const motion = event('motion', { duration_sec: 300, pose_confirmed: true }, { type: 'skill_completed', domain: 'skill', source: { provider: 'her-motion', device_id: 'pwa' } });
    const video = { ...motion, event_id: 'video', facts: { ...motion.facts, input_mode: 'video' } };
    const summary = compileDailySummary('u', '2026-08-28', [run, newer, steps, motion, video], 'Asia/Shanghai');
    expect(summary.workout).toEqual({ sessions: 2, duration_s: 900, distance_m: 1000, steps: 7000 });
  });
});
