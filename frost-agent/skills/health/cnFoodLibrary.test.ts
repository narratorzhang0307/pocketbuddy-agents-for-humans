import { describe, expect, it } from 'vitest';
import { CN_FOOD_LIBRARY, searchCnFoods } from './cnFoodLibrary';

describe('Frost Chinese food reference pack', () => {
  it('parses the selected health-coach reference into local searchable records', () => {
    expect(CN_FOOD_LIBRARY.length).toBeGreaterThan(150);
    expect(searchCnFoods('伯牙绝弦（正常糖）')[0]).toMatchObject({ brand: expect.stringContaining('霸王茶姬'), energyKcal: 400, approximate: true });
  });

  it('searches by Chinese or English brand and keeps serving basis explicit', () => {
    expect(searchCnFoods('Luckin').some((food) => food.name.includes('生椰拿铁'))).toBe(true);
    expect(searchCnFoods('宫保鸡丁')[0]).toMatchObject({ energyBasis: expect.stringContaining('份'), source: 'health-coach/cn-brands' });
  });

  it('does not treat an empty query as a request for the whole dataset', () => {
    expect(searchCnFoods('')).toEqual([]);
  });
});
