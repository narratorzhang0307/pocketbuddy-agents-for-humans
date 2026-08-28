import type { HealthEvent, JsonObject } from './contracts';

export interface DailySummary {
  protocol: 'frost-daily-summary/v1';
  user_id: string;
  day: string;
  timezone: string;
  meals: { count: number; calories_kcal?: number; protein_g?: number; carbs_g?: number; fat_g?: number };
  workout: { sessions: number; distance_m?: number; duration_s?: number; steps?: number };
  nature: Array<{ label: string; confidence: number; event_id: string }>;
  next_action: string;
  source_event_ids: string[];
  disclaimer: string;
  calories_kcal_range?: [number, number];
  nutrition_coverage: { meals_with_calories: number; estimated: boolean };
  steps_as_of?: string;
}

function number(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined; }
function add(target: JsonObject, key: string, value: unknown): void {
  const numeric = number(value);
  if (numeric !== undefined) target[key] = Number(target[key] || 0) + numeric;
}

export function localHealthDay(at: Date | string = new Date(), timezone = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(at));
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}

export function isDemoHealthFact(facts: JsonObject, model = ''): boolean {
  return facts.demo === true || /demo|sample|ui-observation/i.test(`${facts.source || ''} ${model}`);
}

/** Apply corrections across dates before selecting a local calendar day. */
export function activeHealthEvents(userId: string, events: HealthEvent[]): HealthEvent[] {
  const own = [...new Map(events.filter(event => event.user_id === userId).map(event => [event.event_id, event])).values()];
  const superseded = new Set(own.map(event => event.supersedes_event_id).filter(Boolean));
  return own.filter(event => !superseded.has(event.event_id) && event.facts.retracted !== true
    && !isDemoHealthFact(event.facts, event.provenance.model_version) && Number.isFinite(Date.parse(event.occurred_at)));
}

export function compileDailySummary(userId: string, day: string, events: HealthEvent[], timezone = Intl.DateTimeFormat().resolvedOptions().timeZone): DailySummary {
  const active = activeHealthEvents(userId, events).filter(event => localHealthDay(event.occurred_at, timezone) === day);
  const mealTotals: JsonObject = {};
  const workoutTotals: JsonObject = {};
  let meals = 0;
  let sessions = 0;
  const nature: DailySummary['nature'] = [];
  let calorieMin = 0, calorieMax = 0, withCalories = 0, estimated = false;
  let stepSnapshot: HealthEvent | undefined;

  for (const event of active) {
    if (event.type === 'meal_confirmed' && event.facts.confirmed !== false) {
      meals += 1;
      add(mealTotals, 'calories_kcal', event.facts.calories_kcal);
      const range = event.facts.calories_kcal_range;
      if (Array.isArray(range) && range.length === 2 && number(range[0]) !== undefined && number(range[1]) !== undefined && Number(range[1]) >= Number(range[0])) {
        calorieMin += Number(range[0]); calorieMax += Number(range[1]); withCalories++; estimated = true;
      } else if (number(event.facts.calories_kcal) !== undefined) {
        calorieMin += Number(event.facts.calories_kcal); calorieMax += Number(event.facts.calories_kcal); withCalories++;
      }
      estimated ||= event.facts.estimated === true;
      const macros = event.facts.macros_g as JsonObject | undefined;
      for (const key of ['protein', 'carbs', 'fat']) add(mealTotals, `${key}_g`, event.facts[`${key}_g`] ?? macros?.[key]);
    }
    if (event.type === 'skill_completed' && event.facts.pose_confirmed === true
      && ['her-motion', 'pocket.lianlema'].includes(event.source.provider) && number(event.facts.duration_sec) && event.facts.input_mode !== 'video') {
      sessions++;
      add(workoutTotals, 'duration_s', event.facts.duration_sec);
    }
    if (event.facts.kind === 'steps_snapshot' && event.facts.day === day && event.facts.timezone === timezone
      && number(event.facts.steps) !== undefined && (!stepSnapshot || event.occurred_at > stepSnapshot.occurred_at)) stepSnapshot = event;
    if (event.type === 'run_completed') {
      sessions += 1;
      add(workoutTotals, 'distance_m', event.facts.distance_m);
      add(workoutTotals, 'duration_s', event.facts.duration_s);
      add(workoutTotals, 'steps', event.facts.steps);
    }
    if (event.type === 'nature_captured') {
      const rawLabel = typeof event.facts.label === 'string' ? event.facts.label : 'unknown';
      nature.push({ label: event.confidence >= 0.7 ? rawLabel : '待确认的自然时刻', confidence: event.confidence, event_id: event.event_id });
    }
  }
  // A HealthKit cumulative total already includes walking/running samples. Never add them again.
  if (stepSnapshot) workoutTotals.steps = stepSnapshot.facts.steps;

  const nextAction = sessions === 0
    ? '如果身体状态合适，明天安排一次轻量步行或短时活动。'
    : meals === 0 ? '明天可补记一餐，让 Frost 的饮食与运动建议更完整。' : '保持今天的节奏，并根据身体感受安排恢复。';
  return {
    protocol: 'frost-daily-summary/v1', user_id: userId, day, timezone,
    meals: { count: meals, ...mealTotals },
    workout: { sessions, ...workoutTotals },
    nature,
    next_action: nextAction,
    source_event_ids: active.map((event) => event.event_id),
    ...(withCalories ? { calories_kcal_range: [calorieMin, calorieMax] } : {}),
    nutrition_coverage: { meals_with_calories: withCalories, estimated },
    ...(stepSnapshot ? { steps_as_of: stepSnapshot.occurred_at } : {}),
    disclaimer: '仅作生活运动记录与一般性建议，不构成医疗诊断或治疗意见。',
  } as DailySummary;
}
