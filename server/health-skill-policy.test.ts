import { describe, expect, it } from 'vitest';
// @ts-expect-error Plain ESM server module intentionally has no client-facing types.
import { buildGarminReadCommand, buildHealthsyncReadCommand } from './health-skill-policy.mjs';

describe('health skill command policy', () => {
  it('keeps healthsync reads allowlisted and makes the end day inclusive', () => {
    expect(buildHealthsyncReadCommand({ metric: 'steps', from: '2026-08-18', to: '2026-08-18', limit: 10 })).toEqual([
      'healthsync', 'query', 'steps', '--format', 'json', '--limit', '10', '--total',
      '--from', '2026-08-18', '--to', '2026-08-18 23:59:59',
    ]);
  });

  it('rejects command and activity-id injection', () => {
    expect(() => buildHealthsyncReadCommand({ metric: 'steps; rm', limit: 10 })).toThrow('healthsync_metric_not_allowed');
    expect(() => buildGarminReadCommand({ operation: 'activity', activityId: '1;whoami' })).toThrow('invalid_activity_id');
  });

  it('exposes Garmin reads without write operations', () => {
    expect(buildGarminReadCommand({ operation: 'training-readiness', date: '2026-08-18' })).toEqual([
      'garmin-connect', '--format', 'json', 'training', 'readiness', '--date', '2026-08-18',
    ]);
    expect(() => buildGarminReadCommand({ operation: 'upload' })).toThrow('garmin_operation_not_allowed');
  });
});
