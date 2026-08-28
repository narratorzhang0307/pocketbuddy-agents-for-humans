import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync, statSync } from 'node:fs';
import FoodPhotoDemo from './FoodPhotoDemo';
import { FOOD_PHOTO_DEMOS } from '../data/foodPhotoDemo';
import { readFoodDemoVisible, saveFoodDemoVisible } from '../lib/foodPhotoDemo';

afterEach(() => vi.unstubAllGlobals());
describe('Photos sample preview', () => {
  it('shows the sample by default and persists only its removable display preference', () => {
    const values = new Map([['real-health-record', 'keep']]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    expect(readFoodDemoVisible()).toBe(true);
    expect(saveFoodDemoVisible(false)).toBe(true);
    expect(readFoodDemoVisible()).toBe(false);
    expect(saveFoodDemoVisible(true)).toBe(true);
    expect(readFoodDemoVisible()).toBe(true);
    expect(values.get('real-health-record')).toBe('keep');
    expect([...values.keys()]).toEqual(['real-health-record', 'pocketbuddy.photos.food-demo.v1']);
  });
  it('reports when storage cannot persist the preference', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } });
    expect(readFoodDemoVisible()).toBe(true);
    expect(saveFoodDemoVisible(false)).toBe(false);
  });
  it('renders the requested Cobb bowl, example nutrition and clearly labelled non-SAM boxes', () => {
    const html = renderToStaticMarkup(createElement(FoodPhotoDemo, { onRemove: () => {} }));
    for (const label of ['香草鸡肉考伯碗', '示例能量账本', '480–590', '非 SAM 分割结果', '不会写入健康记忆', '移除示例', '餐食记录示例']) expect(html).toContain(label);
    expect(html).toContain('data-food-demo="preview-only"');
    expect(html).not.toContain('确认实际吃过，记入对应日期');
  });
  it('renders all four sample meals and sample week, never a real-time health total', () => {
    const html = renderToStaticMarkup(createElement(FoodPhotoDemo, { initialView: 'records', onRemove: () => {} }));
    expect(html).toContain('示例周报');
    expect(html).toContain('非真实记忆');
    for (const meal of FOOD_PHOTO_DEMOS) {
      expect(meal.kind).toBe('ui-demo-only');
      expect(html).toContain(meal.title);
      const file = new URL(`../../../public${meal.image}`, import.meta.url);
      expect(existsSync(file)).toBe(true);
      expect(statSync(file).size).toBeGreaterThan(1000);
    }
  });
  it('keeps the preview outside the inference, candidate and health-write path', () => {
    const preview = readFileSync(new URL('./FoodPhotoDemo.tsx', import.meta.url), 'utf8');
    expect(preview).not.toMatch(/frostHealthMemory|photoHarness|recordConfirmedMeal|MealCandidate|fetch\(|indexedDB|localStorage/);
    const parent = readFileSync(new URL('./FoodPhotosTab.tsx', import.meta.url), 'utf8');
    expect(parent).toContain('useState(readFoodDemoVisible)');
    expect(parent).toContain('!manual && (demoVisible ? <FoodPhotoDemo');
    expect(parent).toContain('恢复餐食示例预览');
    expect(parent).toContain('if (busy || confirmed || (!candidate && !manual)) return;');
    expect(parent).toContain('await analyzeFoodPhoto(image, controller.signal)');
  });
});
