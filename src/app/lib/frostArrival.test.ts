import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { FROST_ARRIVAL_DURATION, frostArrivalAt, frostArrivalPosition } from './frostArrival';

describe('Frost arrival film', () => {
  it('runs, wags, approaches, greets, settles, then stops', () => {
    expect([0, 1_600, 2_900, 3_800, 4_450, 5_000].map(t => frostArrivalAt(t).phase))
      .toEqual(['run', 'wag', 'approach', 'greet', 'settle', 'done']);
    expect(FROST_ARRIVAL_DURATION).toBe(5_000);
  });
  it('uses actual gait and tail frames and stops translating at the centre', () => {
    expect([0, 100, 200, 300].map(t => frostArrivalAt(t).frame)).toEqual([0, 1, 2, 3]);
    expect([1_600, 1_760, 1_920, 2_080].map(t => frostArrivalAt(t).frame)).toEqual([4, 5, 6, 7]);
    expect(frostArrivalAt(0).travel).toBe(1);
    expect(frostArrivalAt(800).travel).toBeGreaterThan(0);
    expect(frostArrivalAt(1_600).travel).toBe(0);
  });
  it('uses all four approach poses and finishes on the unchanged portrait', () => {
    expect([2_900, 3_125, 3_350, 3_575].map(t => frostArrivalAt(t).frame)).toEqual([8, 9, 10, 11]);
    expect(frostArrivalAt(4_000).frame).toBe(13);
    expect(frostArrivalAt(4_100).frame).toBe(14);
    expect(frostArrivalAt(4_250).frame).toBe(15);
    expect(frostArrivalAt(5_000).frame).toBe(12);
    expect(frostArrivalAt(1_000_000).phase).toBe('done');
  });
  it('never points outside the atlas or produces invalid styles', () => {
    for (let t = 0; t < 7_000; t += 17) {
      const pose = frostArrivalAt(t);
      expect(pose.frame).toBeGreaterThanOrEqual(0);
      expect(pose.frame).toBeLessThan(16);
      expect(pose.travel).toBeGreaterThanOrEqual(0);
      expect(pose.travel).toBeLessThanOrEqual(1);
    }
    expect(frostArrivalAt(-10)).toEqual(frostArrivalAt(0));
    expect(frostArrivalAt(NaN)).toEqual(frostArrivalAt(0));
    expect(frostArrivalPosition(0)).toBe('0% 0%');
    expect(frostArrivalPosition(15)).toBe('100% 100%');
    expect(frostArrivalPosition(NaN)).toBe('0% 100%');
  });
  it('packages 16 bounded frames and leaves the original portraits unchanged', () => {
    const manifest = JSON.parse(readFileSync('public/assets/frost-arrival/20260828-v1/manifest.json', 'utf8'));
    expect(manifest.frames).toHaveLength(16);
    expect(manifest.cellSize).toBe(256);
    expect(manifest.atlas.bytes).toBeLessThan(500_000);
    const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
    expect(hash('public/assets/frost-arrival/20260828-v1/atlas.webp')).toBe(manifest.atlas.sha256);
    for (const source of manifest.referenceHashes) expect(hash(source.path)).toBe(source.sha256);
    for (const frame of manifest.frames) expect(hash(`public/assets/frost-arrival/20260828-v1/${frame.file}`)).toBe(frame.sha256);
  });
});
