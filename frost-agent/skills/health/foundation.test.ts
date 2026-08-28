import { describe, expect, it } from 'vitest';
import {
  QWEN4B_HEALTH_CONTROL_PLANE,
  assessReadiness,
  assessReadinessFromPersonalBaseline,
  auditEndurancePrescription,
  buildGarminReadCommand,
  buildHealthsyncImportCommand,
  buildHealthsyncReadCommand,
  buildOpenFoodFactsRequest,
  confirmPoseSignal,
  validateTrainingPrescription,
} from './foundation';

describe('Frost health foundation skills', () => {
  it('keeps Qwen3-4B as a control plane instead of a source of health facts', () => {
    expect(QWEN4B_HEALTH_CONTROL_PLANE.assetStatus).toBe('installable-device-validation-required');
    expect(QWEN4B_HEALTH_CONTROL_PLANE.forbidden).toContain('invent-health-facts');
    expect(QWEN4B_HEALTH_CONTROL_PLANE.forbidden).toContain('override-safety-gate');
  });

  it('safe-stops on danger and caps a conflicting prescription', () => {
    const readiness = assessReadiness({ sleepHours: 7.5, hrvDeltaPct: 2, restingHeartRateDeltaBpm: 0, pain: 8 });
    expect(readiness).toMatchObject({ band: 'red', maxIntensity: 'rest' });
    const result = validateTrainingPrescription({
      intensity: 'hard', durationMin: 60, stopRules: [], evidenceIds: ['health-1'],
    }, readiness);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining(['stop_rules_required', 'intensity_exceeds_red_cap']));
    expect(result.conservative.intensity).toBe('rest');
    expect(result.conservative.stopRules).toHaveLength(1);
  });

  it('requires corroborating recovery signals before a red readiness decision', () => {
    expect(assessReadiness({ sleepHours: 4.5, hrvDeltaPct: 1, restingHeartRateDeltaBpm: 0 }).band).toBe('yellow');
    expect(assessReadiness({ sleepHours: 4.5, hrvDeltaPct: -23, restingHeartRateDeltaBpm: 0 }).band).toBe('red');
    expect(assessReadiness({ sleepHours: 7.5, hrvDeltaPct: 3, restingHeartRateDeltaBpm: -1 }).band).toBe('green');
  });

  it('derives readiness deltas from a robust personal baseline only after seven observations', () => {
    const result = assessReadinessFromPersonalBaseline({
      sleepHours: [7, 7.2, 7.5, 7, 7.4, 7.1, 7.3],
      hrvMs: [50, 51, 49, 50, 52, 48, 50],
      restingHeartRateBpm: [55, 54, 55, 56, 54, 55, 55],
      today: { sleepHours: 4.5, hrvMs: 37, restingHeartRateBpm: 66, fatigue: 8, pain: 0 },
    });
    expect(result.baseline).toMatchObject({ hrvMs: 50, restingHeartRateBpm: 55 });
    expect(result.readinessInput).toMatchObject({ hrvDeltaPct: -26, restingHeartRateDeltaBpm: 11 });
    expect(result.decision.band).toBe('red');
  });

  it('audits current evidence and one-variable progression before publishing a prescription', () => {
    const readiness = assessReadiness({ sleepHours: 7.5, hrvDeltaPct: 1, restingHeartRateDeltaBpm: 0 });
    const result = auditEndurancePrescription({
      prescription: { intensity: 'moderate', durationMin: 45, stopRules: ['异常即停'], evidenceIds: ['event-1'] },
      readiness,
      dataReadAt: '2026-08-19T08:00:00.000Z',
      sourceEventIds: ['event-1'],
      progressionVariables: ['duration', 'intensity'],
      thresholdChangeSource: 'estimate',
      now: new Date('2026-08-19T10:00:00.000Z'),
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining(['multiple_progression_variables', 'estimated_threshold_change_forbidden']));
    expect(result.dataAgeHours).toBe(2);
  });

  it('builds only read-only healthsync commands and applies deduplicated totals', () => {
    expect(buildHealthsyncReadCommand({ metric: 'steps', from: '2026-08-01', limit: 31 })).toEqual([
      'healthsync', 'query', 'steps', '--format', 'json', '--limit', '31', '--total', '--from', '2026-08-01',
    ]);
    expect(buildHealthsyncReadCommand({ metric: 'sleep' })).toContain('--total');
    expect(() => buildHealthsyncReadCommand({ metric: 'steps; DROP TABLE sleep' })).toThrow('healthsync_metric_not_allowed');
    expect(buildHealthsyncImportCommand('/tmp/frost/export.zip')).toEqual(['healthsync', 'parse', '/tmp/frost/export.zip']);
    expect(() => buildHealthsyncImportCommand('/tmp/frost/export.sqlite')).toThrow('invalid_health_export');
  });

  it('exposes a Garmin read allowlist without upload, delete or weight writes', () => {
    const commands = [
      buildGarminReadCommand({ operation: 'activities', limit: 5 }),
      buildGarminReadCommand({ operation: 'splits', activityId: '12345' }),
      buildGarminReadCommand({ operation: 'training-readiness', date: '2026-08-19' }),
    ];
    const text = commands.flat().join(' ');
    expect(text).not.toMatch(/upload|delete|weight log|--force/);
    expect(() => buildGarminReadCommand({ operation: 'activity', activityId: '1;rm' })).toThrow('invalid_activity_id');
    expect(() => buildGarminReadCommand({ operation: 'activities-delete' as never })).toThrow('garmin_operation_not_allowed');
  });

  it('pins Open Food Facts requests to the declared host and distinguishes barcode lookup', () => {
    const product = buildOpenFoodFactsRequest({ barcode: '3017620422003' });
    expect(product.hostname).toBe('world.openfoodfacts.org');
    expect(product.pathname).toContain('/api/v3/product/3017620422003.json');
    expect(buildOpenFoodFactsRequest({ query: '无糖酸奶' }).searchParams.get('search_terms')).toBe('无糖酸奶');
  });

  it('requires confidence, landmark coverage and consecutive frames for pose confirmation', () => {
    expect(confirmPoseSignal({ confidence: 0.92, consecutiveFrames: 1, visibleLandmarks: 24 })).toMatchObject({ accepted: false, reason: 'awaiting_consecutive_frames' });
    expect(confirmPoseSignal({ confidence: 0.92, consecutiveFrames: 5, visibleLandmarks: 24 })).toMatchObject({ accepted: true });
  });
});
