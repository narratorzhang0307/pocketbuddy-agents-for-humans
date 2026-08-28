import { describe, expect, it } from 'vitest';
import { hasUsableLoopGeometry, joinWalkingLegs, parseAmapWalkingResult, routePlaceAvailable, scoreRunRoute, toAmapPosition } from './amapRunRoute';

describe('AMap run route adapter', () => {
  it('rejects retraced roads posing as loops and excludes explicitly closed places', () => {
    expect(hasUsableLoopGeometry([[120, 30], [120, 30.001], [120.001, 30.001], [120.001, 30], [120, 30]])).toBe(true);
    expect(hasUsableLoopGeometry([[120, 30], [120, 30.001], [120.001, 30.001], [120, 30.001], [120, 30]])).toBe(false);
    expect(routePlaceAvailable('杭州西湖风景名胜区(暂停开放)')).toBe(false);
    expect(routePlaceAvailable('杭州西湖·柳浪闻莺')).toBe(true);
  });
  it('preserves turn instructions at real step endpoints and counts explicit crossing evidence', () => {
    const leg = parseAmapWalkingResult({ routes: [{ distance: 200, steps: [
      { path: [[120, 30], [120, 30.001]], instruction: '步行110米左转', action: '左转' },
      { path: [[120, 30.001], [120.001, 30.001]], instruction: '通过人行横道' },
    ] }] });
    expect(leg?.cues).toEqual([{ id: 'step-0', point_index: 1, instruction: '左转', source: 'amap' }]);
    expect(leg?.crossings).toBe(1);
    expect(leg?.distance_m).toBe(200);
    expect(joinWalkingLegs([leg!])?.cues.at(-1)?.source).toBe('arrival');
    expect(scoreRunRoute(leg!, 200, true)).toBeGreaterThan(scoreRunRoute({ ...leg!, crossings: 0 }, 200, true));
  });
  it('rejects broken geometry and refuses to invent a connector between disconnected legs', () => {
    expect(parseAmapWalkingResult({ routes: [{ steps: [{ path: [[120, 30], [NaN, 30]] }] }] })).toBeNull();
    const leg = parseAmapWalkingResult({ routes: [{ steps: [{ path: [[120, 30], [120, 30.001]] }] }] })!;
    expect(joinWalkingLegs([leg, { ...leg, points: [[121, 30], [121, 30.001]] }])).toBeNull();
    const back = { ...leg, points: [...leg.points].reverse(), cues: [] };
    const joined = joinWalkingLegs([leg, back]);
    expect(joined?.cues[0]).toMatchObject({ point_index: 1, source: 'geometry' });
    expect(joined?.cues.filter(c => c.source === 'arrival')).toHaveLength(1);
  });
  it('converts browser WGS84 GPS points before putting them on the AMap route', async () => {
    const AMap = {
      convertFrom(_point: [number, number], type: string, callback: (status: string, result: unknown) => void) {
        expect(type).toBe('gps');
        callback('complete', { locations: [{ getLng: () => 120.01, getLat: () => 30.02 }] });
      },
    };
    await expect(toAmapPosition(AMap as never, [120, 30])).resolves.toEqual([120.01, 30.02]);
  });

  it('fails closed instead of drawing unconverted GPS coordinates', async () => {
    await expect(toAmapPosition({} as never, [120, 30])).rejects.toThrow('坐标转换不可用');
  });
});
