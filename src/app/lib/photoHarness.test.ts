import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { editedMealCandidate, analyzeFoodPhoto } from './photoHarness';
const meal = { title: '米饭', dishes: ['米饭'], calories_kcal_range: [100, 300] as [number, number], protein_g: 2, carbs_g: 50, fat_g: 1, uncertainty: '估算', model: 'test' };
const image = 'data:image/jpeg;base64,/9j/test-image-pixels';

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
  it('submits the selected image bytes with explicit consent and accepts only the versioned real result', async () => {
    const result = {
      version: 'photos-harness/v1', meal,
      segmentation: { version: 'photos-harness/v1', model: 'sam-test', backend: 'cpu', checkpointSha256: 'a'.repeat(64),
        width: 320, height: 240, expected_count: 1, status: 'ok', elapsedMs: 20,
        regions: [{ region_id: 'r001', category: '米饭', sam_score: .9, mask_uri: 'data:image/png;base64,mask' }], rejected: [] },
      groundingModel: 'vision-test', tunedModelUsed: false, imageSha256: 'b'.repeat(64), imagePersisted: false,
    };
    let requestInit: RequestInit | undefined;
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => { requestInit = init; return Response.json(result); });
    vi.stubGlobal('fetch', fetcher);
    await expect(analyzeFoodPhoto(image)).resolves.toEqual(result);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url] = fetcher.mock.calls[0];
    expect(url).toBe('/api/photos-harness/analyze');
    expect(requestInit?.method).toBe('POST');
    expect(requestInit?.cache).toBe('no-store');
    expect(requestInit?.redirect).toBe('error');
    expect(JSON.parse(String(requestInit?.body))).toMatchObject({ image, consent: true });
    expect(JSON.parse(String(requestInit?.body)).requestId).toMatch(/^[0-9a-f-]{36}$/i);
    vi.unstubAllGlobals();
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
