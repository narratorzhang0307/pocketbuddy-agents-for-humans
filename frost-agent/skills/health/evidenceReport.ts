export const APPLE_HEALTH_FIELD_MAP = {
  HKQuantityTypeIdentifierBodyMass: { metric: 'body-mass', canonicalUnit: 'kg' },
  HKQuantityTypeIdentifierBodyFatPercentage: { metric: 'body-fat', canonicalUnit: '%' },
  HKQuantityTypeIdentifierHeight: { metric: 'height', canonicalUnit: 'cm' },
  HKQuantityTypeIdentifierWaistCircumference: { metric: 'waist', canonicalUnit: 'cm' },
  HKQuantityTypeIdentifierStepCount: { metric: 'steps', canonicalUnit: 'count' },
  HKQuantityTypeIdentifierActiveEnergyBurned: { metric: 'active-energy', canonicalUnit: 'kcal' },
  HKQuantityTypeIdentifierBasalEnergyBurned: { metric: 'basal-energy', canonicalUnit: 'kcal' },
  HKQuantityTypeIdentifierAppleExerciseTime: { metric: 'exercise-minutes', canonicalUnit: 'min' },
  HKQuantityTypeIdentifierHeartRate: { metric: 'heart-rate', canonicalUnit: 'bpm' },
  HKQuantityTypeIdentifierRestingHeartRate: { metric: 'resting-heart-rate', canonicalUnit: 'bpm' },
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: { metric: 'hrv-sdnn', canonicalUnit: 'ms' },
  HKQuantityTypeIdentifierWalkingHeartRateAverage: { metric: 'walking-heart-rate', canonicalUnit: 'bpm' },
  HKCategoryTypeIdentifierSleepAnalysis: { metric: 'sleep', canonicalUnit: 'hours' },
} as const;

export type AppleHealthType = keyof typeof APPLE_HEALTH_FIELD_MAP;

export interface AppleHealthRecordInput {
  type: string;
  value: number;
  unit: string;
  startDate: string;
  endDate?: string;
  sourceName?: string;
}

export interface NormalizedAppleHealthRecord {
  metric: (typeof APPLE_HEALTH_FIELD_MAP)[AppleHealthType]['metric'];
  value: number;
  unit: string;
  canonicalUnit: string;
  startDate: string;
  endDate?: string;
  sourceName: string;
  originalType: AppleHealthType;
}

export function normalizeAppleHealthRecord(input: AppleHealthRecordInput): NormalizedAppleHealthRecord | null {
  if (!(input.type in APPLE_HEALTH_FIELD_MAP) || !Number.isFinite(input.value) || Number.isNaN(Date.parse(input.startDate))) return null;
  if (input.endDate && Number.isNaN(Date.parse(input.endDate))) return null;
  const originalType = input.type as AppleHealthType;
  const field = APPLE_HEALTH_FIELD_MAP[originalType];
  return {
    metric: field.metric,
    value: input.value,
    unit: input.unit,
    canonicalUnit: field.canonicalUnit,
    startDate: input.startDate,
    endDate: input.endDate,
    sourceName: input.sourceName || 'Apple Health',
    originalType,
  };
}

export type WeeklyMetric = 'steps' | 'sleep-hours' | 'exercise-minutes' | 'workout' | 'hrv-ms' | 'resting-heart-rate-bpm' | 'body-mass-kg' | 'active-energy-kcal';

export interface ConfirmedWeeklyEvent {
  id: string;
  occurredAt: string;
  metric: WeeklyMetric;
  value: number;
  unit: string;
  confirmed: boolean;
}

export interface WeeklyMetricSummary {
  metric: WeeklyMetric;
  aggregation: 'average' | 'total' | 'count';
  value: number;
  unit: string;
  eventIds: string[];
}

const TOTAL_METRICS = new Set<WeeklyMetric>(['exercise-minutes', 'active-energy-kcal']);

export function buildEvidenceBoundWeeklyReport(events: ConfirmedWeeklyEvent[], weekStart: string): {
  weekStart: string;
  weekEnd: string;
  coverageDays: number;
  metrics: WeeklyMetricSummary[];
  sourceEventIds: string[];
  ignoredEventCount: number;
} {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) throw new Error('invalid_week_start');
  const start = new Date(`${weekStart}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) throw new Error('invalid_week_start');
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  const valid = events.filter((event) => event.confirmed && Number.isFinite(event.value) && !Number.isNaN(Date.parse(event.occurredAt))
    && Date.parse(event.occurredAt) >= start.getTime() && Date.parse(event.occurredAt) < end.getTime());
  const groups = new Map<WeeklyMetric, ConfirmedWeeklyEvent[]>();
  for (const event of valid) groups.set(event.metric, [...(groups.get(event.metric) || []), event]);
  const metrics = [...groups.entries()].map(([metric, group]): WeeklyMetricSummary => {
    const aggregation = metric === 'workout' ? 'count' : TOTAL_METRICS.has(metric) ? 'total' : 'average';
    const sum = group.reduce((total, event) => total + event.value, 0);
    return {
      metric,
      aggregation,
      value: aggregation === 'count' ? group.length : aggregation === 'total' ? sum : sum / group.length,
      unit: aggregation === 'count' ? 'sessions' : group[0].unit,
      eventIds: group.map((event) => event.id),
    };
  }).sort((left, right) => left.metric.localeCompare(right.metric));
  return {
    weekStart,
    weekEnd: new Date(end.getTime() - 1).toISOString().slice(0, 10),
    coverageDays: new Set(valid.map((event) => event.occurredAt.slice(0, 10))).size,
    metrics,
    sourceEventIds: valid.map((event) => event.id),
    ignoredEventCount: events.length - valid.length,
  };
}
