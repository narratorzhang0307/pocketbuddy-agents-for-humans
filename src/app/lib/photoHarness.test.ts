import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { editedMealCandidate, analyzeFoodPhoto } from './photoHarness';
const meal = { title: '米饭', dishes: ['米饭'], calories_kcal_range: [100, 300] as [number, number], protein_g: 2, carbs_g: 50, fat_g: 1, uncertainty: '估算', model: 'test' };

describe('Photos meal consistency', () => {
  it('preserves the original candidate when the user does not edit it', () => {
    expect(editedMealCandidate(meal, '米饭', [100, 300])).toEqual(meal);
  });
  it('does not attach the old dishes or macros to a renamed meal', () => {
    const value = editedMealCandidate(meal, '鸡蛋', [80, 180]);
    expect(value.dishes).toEqual(['鸡蛋']);
    expect([value.protein_g, value.carbs_g, value.fat_g]).toEqual([null, null, null]);
    expect(value.uncertainty).toContain('用户修改');
  });
  it('clears stale macros when the calorie estimate is edited', () => {
    expect(editedMealCandidate(meal, '米饭', [50, 150]).carbs_g).toBeNull();
  });
  it('preserves the manual-record path without invented nutrients', () => {
    const value = editedMealCandidate(undefined, '手写餐食', [100, 200]);
    expect(value.model).toBe('user-confirmed/manual'); expect(value.protein_g).toBeNull();
  });
  it('does not initiate cloud analysis after cancellation', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController(); controller.abort();
    await expect(analyzeFoodPhoto('unused', controller.signal)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled(); vi.unstubAllGlobals();
  });
  it('keeps stable confirmed meal IDs, time, portion and the memory entry in the actual left tab', () => {
    const source = readFileSync(new URL('../components/FoodPhotosTab.tsx', import.meta.url), 'utf8');
    expect(source).toContain('recordConfirmedMeal({ id: id.current, candidate: value, portion, consumedAt: new Date(at).toISOString(), note })');
    expect(source).toContain('setConfirmed(true)'); expect(source).toContain('disabled={busy || confirmed}');
    expect(source).toContain('<HealthMemoryPanel />');
    expect(source).toContain('analyzeFoodPhoto(image, controller.signal)');
    expect(source).not.toContain("healthPost<MealCandidate>('meal'");
    const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    expect(app).toContain("import('./components/FoodPhotosTab')");
  });
});
