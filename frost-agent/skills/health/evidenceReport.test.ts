import { describe, expect, it } from 'vitest';
import { buildEvidenceBoundWeeklyReport, normalizeAppleHealthRecord } from './evidenceReport';

describe('health-coach selected parsers and evidence report', () => {
  it('maps only known Apple Health fields and preserves original units', () => {
    expect(normalizeAppleHealthRecord({
      type: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', value: 48, unit: 'ms', startDate: '2026-08-19T07:00:00Z', sourceName: 'Apple Watch',
    })).toMatchObject({ metric: 'hrv-sdnn', canonicalUnit: 'ms', sourceName: 'Apple Watch' });
    expect(normalizeAppleHealthRecord({ type: 'HKUnknown', value: 1, unit: 'x', startDate: '2026-08-19T07:00:00Z' })).toBeNull();
  });

  it('builds a weekly report from confirmed in-window events only', () => {
    const report = buildEvidenceBoundWeeklyReport([
      { id: 'sleep-1', occurredAt: '2026-08-17T07:00:00Z', metric: 'sleep-hours', value: 7, unit: 'h', confirmed: true },
      { id: 'sleep-2', occurredAt: '2026-08-18T07:00:00Z', metric: 'sleep-hours', value: 8, unit: 'h', confirmed: true },
      { id: 'draft', occurredAt: '2026-08-18T10:00:00Z', metric: 'steps', value: 999999, unit: 'count', confirmed: false },
      { id: 'old', occurredAt: '2026-08-01T10:00:00Z', metric: 'steps', value: 5000, unit: 'count', confirmed: true },
    ], '2026-08-17');
    expect(report.metrics).toContainEqual(expect.objectContaining({ metric: 'sleep-hours', aggregation: 'average', value: 7.5 }));
    expect(report.sourceEventIds).toEqual(['sleep-1', 'sleep-2']);
    expect(report.ignoredEventCount).toBe(2);
    expect(report.coverageDays).toBe(2);
  });
});
