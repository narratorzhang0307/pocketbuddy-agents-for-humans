import { describe, expect, it } from 'vitest';
import { isPlausibleMappingGeocode } from './geocodeGuard';

const nanjing = [
  { lat: 31.88, lng: 118.65 },
  { lat: 32.05, lng: 118.79 },
  { lat: 32.16, lng: 119.05 },
];

describe('Mapping geocode guard', () => {
  it('rejects an unrelated business even when the query included the target city', () => {
    expect(isPlausibleMappingGeocode('古越城', '湖南精斯诚智能科技有限公司', 28.4854, 113.14687, nanjing)).toBe(false);
  });

  it('rejects a same-name result far outside the target-city envelope', () => {
    expect(isPlausibleMappingGeocode('清凉寺', '清凉寺', 23.1, 113.3, nanjing)).toBe(false);
  });

  it('accepts a name-matched result inside the target-city envelope', () => {
    expect(isPlausibleMappingGeocode('清凉寺', '清凉寺遗址', 32.06, 118.75, nanjing)).toBe(true);
  });

  it('rejects a short historical name expanded into another same-city POI', () => {
    expect(isPlausibleMappingGeocode('石头', '石头河', 32.1824757, 118.7387103, nanjing)).toBe(false);
  });
});
