import { describe, expect, it } from 'vitest';
// @ts-expect-error Plain ESM server module intentionally has no client-facing types.
import { normalizeOpenFoodFactsProduct } from './health-skill-bridge.mjs';
// @ts-expect-error server-only ESM
import { readOutdoorWindow } from './outdoor-window.mjs';

describe('health skill server bridge', () => {
  it('normalizes only declared per-100g nutrition fields and keeps unknowns explicit', () => {
    expect(normalizeOpenFoodFactsProduct({
      code: '3017620422003',
      product_name: 'Test food',
      brands: 'Frost',
      nutriments: { 'energy-kcal_100g': 210, proteins_100g: 5, fat_100g: 'unknown' },
    })).toMatchObject({
      barcode: '3017620422003',
      nutritionPer100g: { energyKcal: 210, proteinG: 5, fatG: null },
      missing: expect.arrayContaining(['fatG', 'carbsG']),
      source: 'Open Food Facts',
    });
  });

  it('rejects non-product payloads', () => {
    expect(normalizeOpenFoodFactsProduct(null)).toBeNull();
  });
});

describe('weather Skill evidence', () => {
  const place = { name: '杭州', latitude: 30.2, longitude: 120.1, country: '中国', country_code: 'CN', admin1: '浙江', feature_code: 'PPLA' };
  const weather = { timezone: 'Asia/Shanghai', current: { time: '2026-08-27T12:00', temperature_2m: 26, apparent_temperature: 27, precipitation: 0, wind_speed_10m: 5, weather_code: 0 },
    daily: { time: ['2026-08-27', '2026-08-28', '2026-08-29'], temperature_2m_min: [23,24,24], temperature_2m_max: [29,30,30], weather_code: [0,95,1] } };
  it('chooses a city over a homonymous village and never converts missing AQI to zero', async () => {
    const fetcher = async (url: string) => Response.json(url.includes('geocoding') ? { results: [place, { ...place, feature_code: 'PPL', admin1: '四川' }] }
      : url.includes('air-quality') ? { current: { us_aqi: null, uv_index: null } } : weather);
    const result = await readOutdoorWindow('杭州', { fetcher });
    expect(result.city).toContain('浙江'); expect(result.current.us_aqi).toBeNull();
    expect(result.gate).toBe('caution'); expect(result.mandatory).toContain('缺失');
  });
  it('does not use current AQI for future forecasts, and keeps thunderstorm stop rules', async () => {
    const fetcher = async (url: string) => Response.json(url.includes('geocoding') ? { results: [place] }
      : url.includes('air-quality') ? { current: { us_aqi: 20 } } : weather);
    const result = await readOutdoorWindow('杭州', { fetcher, dayOffset: 1 });
    expect(result.current).toBeUndefined(); expect(result.date).toBe('2026-08-28');
    expect(result.gate).toBe('red'); expect(result.mandatory).toContain('雷暴');
  });
  it('requires clarification for two cities and restricts caller parameters', async () => {
    const fetcher = async () => Response.json({ results: [place, { ...place, admin1: 'other' }] });
    expect((await readOutdoorWindow('杭州', { fetcher })).needsInput).toBe(true);
    await expect(readOutdoorWindow('', { fetcher })).rejects.toThrow('invalid_outdoor_query');
    await expect(readOutdoorWindow('杭州', { fetcher, dayOffset: 5 })).rejects.toThrow('invalid_outdoor_query');
  });
  it('does not let a currently clear sky override a thunderstorm forecast for today', async () => {
    const fetcher = async (url: string) => Response.json(url.includes('geocoding') ? { results: [place] }
      : url.includes('air-quality') ? { current: { us_aqi: 20 } }
        : { ...weather, daily: { ...weather.daily, weather_code: [96,95,1] } });
    const result = await readOutdoorWindow('杭州', { fetcher });
    expect(result.current.weather_code).toBe(0);
    expect(result.gate).toBe('red'); expect(result.mandatory).toContain('所查日期');
  });
});
