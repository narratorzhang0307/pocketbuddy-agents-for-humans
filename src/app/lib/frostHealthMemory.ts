import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { nativeApiEndpoint } from '../../native/apiOrigin';
import { activeHealthEvents, compileDailySummary, localHealthDay, type DailySummary } from '../../../frost-agent/taskmaster/summary';
import { HEALTH_MEMORY_CHANGED, notifyHealthMemoryChanged } from '../../../frost-agent/taskmaster/indexedDbStore';
import type { JsonObject } from '../../../frost-agent/taskmaster';
import type { FrostSkillPageResult } from '../../../frost-agent/harness/skillPageResult';
import { getFrostHealthRuntime, recordMealWithTaskmaster } from './frostHealthTaskmaster';

export const HEALTH_USER = 'local-user';
const SETTINGS = `pe.frost.health-memory.v1:${HEALTH_USER}`;
export interface HealthSettings { goals: string; preferences: string; constraints: string; cloud: boolean; hardware: boolean; updatedAt?: string }
export function healthSettings(): HealthSettings {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS) || '{}');
    return { goals: String(value.goals || '').slice(0, 500), preferences: String(value.preferences || '').slice(0, 500),
      constraints: String(value.constraints || '').slice(0, 1000), cloud: value.cloud === true, hardware: value.hardware === true, updatedAt: value.updatedAt };
  } catch { return { goals: '', preferences: '', constraints: '', cloud: false, hardware: false }; }
}
export function saveHealthSettings(value: HealthSettings): void {
  localStorage.setItem(SETTINGS, JSON.stringify({ goals: value.goals.trim().slice(0, 500), preferences: value.preferences.trim().slice(0, 500),
    constraints: value.constraints.trim().slice(0, 1000), cloud: value.cloud === true, hardware: value.hardware === true, updatedAt: new Date().toISOString() }));
  notifyHealthMemoryChanged();
}
export function subscribeHealthMemory(listener: () => void): () => void {
  const storage = (event: StorageEvent) => { if (event.key === SETTINGS || event.key === null) listener(); };
  window.addEventListener(HEALTH_MEMORY_CHANGED, listener); window.addEventListener('storage', storage);
  return () => { window.removeEventListener(HEALTH_MEMORY_CHANGED, listener); window.removeEventListener('storage', storage); };
}
export interface HealthMemoryContext {
  protocol: 'frost-health-context/v1'; day: string; timezone: string; revision: string;
  today: DailySummary; history: DailySummary[];
  profile: { goals: string; preferences: string; constraints: string; confirmed_at: string | null };
  records: Array<{ id: string; at: string; type: string; provider: string; title: string; estimated: boolean }>;
  missing: string[];
}
export async function readHealthMemory(now = new Date()): Promise<HealthMemoryContext> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone, day = localHealthDay(now, timezone);
  const events = (await getFrostHealthRuntime().store.listHealthEvents(HEALTH_USER)).filter(event => Date.parse(event.occurred_at) <= now.getTime());
  const active = activeHealthEvents(HEALTH_USER, events).filter(event => Date.parse(event.occurred_at) <= now.getTime());
  const today = compileDailySummary(HEALTH_USER, day, events, timezone);
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 28);
  const days = [...new Set(active.filter(event => Date.parse(event.occurred_at) >= cutoff.getTime()).map(event => localHealthDay(event.occurred_at, timezone)))].filter(value => value < day).sort();
  const profile = healthSettings();
  const context = {
    protocol: 'frost-health-context/v1' as const, day, timezone, today,
    history: days.map(value => compileDailySummary(HEALTH_USER, value, events, timezone)),
    profile: { goals: profile.goals, preferences: profile.preferences, constraints: profile.constraints, confirmed_at: profile.updatedAt || null },
    records: active.filter(event => Date.parse(event.occurred_at) >= cutoff.getTime()).slice(-400).map(event => ({
      id: event.event_id, at: event.occurred_at, type: event.type, provider: event.source.provider,
      title: String(event.facts.title || event.facts.exercise_name || event.facts.skill_id || event.facts.kind || event.type).slice(0, 120),
      estimated: event.facts.estimated === true || Array.isArray(event.facts.calories_kcal_range),
    })),
    missing: [!today.meals.count && '今天没有已确认餐食（不代表没吃）',
      today.nutrition_coverage.meals_with_calories < today.meals.count && '部分餐食缺少热量',
      !today.steps_as_of && '没有今天的手机累计步数（不代表零步）',
      today.steps_as_of && now.getTime() - Date.parse(today.steps_as_of) > 10 * 60000 && `手机步数不是当前实时值，上次读取为 ${today.steps_as_of}`,
      !today.workout.sessions && '今天没有已完成运动记录（不代表没有运动）',
      !profile.goals && !profile.preferences && !profile.constraints && '长期健康目标和限制尚未填写',
      '未记录日期视为未知；热量为估算，不是全天摄入完整测量'].filter(Boolean) as string[],
  };
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(context)));
  return { ...context, revision: [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('') };
}

export async function healthPost<T>(kind: 'meal' | 'advice', body: unknown, signal?: AbortSignal): Promise<T> {
  const path = `/api/health-memory/${kind}`;
  signal?.throwIfAborted();
  let status: number, data: any;
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.post({ url: nativeApiEndpoint(path, `https://pocketbuddy.throughtheglass.art${path}`), headers: { 'content-type': 'application/json' }, data: body,
      connectTimeout: 10000, readTimeout: 75000, responseType: 'json', disableRedirects: true });
    status = response.status; data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  } else {
    const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(75000)]) : AbortSignal.timeout(75000), redirect: 'error', cache: 'no-store' });
    status = response.status; data = await response.json();
  }
  signal?.throwIfAborted();
  if (status < 200 || status >= 300) throw new Error(`云端分析未完成（${String(data?.error || status)}），未自动重试，也未生成健康事实。`);
  return data as T;
}
export interface MealCandidate { title: string; dishes: string[]; calories_kcal_range: [number, number]; protein_g: number | null; carbs_g: number | null; fat_g: number | null; uncertainty: string; model: string }
export async function recordConfirmedMeal(input: { id: string; candidate: MealCandidate; portion: number; consumedAt: string; note: string }): Promise<void> {
  const { candidate: meal, portion } = input;
  const boundedNutrient = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 8000;
  if (!input.id || input.id.length > 200 || !meal || typeof meal.title !== 'string' || meal.title.length > 100
    || !Array.isArray(meal.dishes) || !meal.dishes.length || meal.dishes.length > 12 || !meal.dishes.every(dish => typeof dish === 'string' && dish.trim() && dish.length <= 80)
    || !Array.isArray(meal.calories_kcal_range) || meal.calories_kcal_range.length !== 2 || !meal.calories_kcal_range.every(boundedNutrient)
    || meal.calories_kcal_range[0] > meal.calories_kcal_range[1]
    || !['protein_g', 'carbs_g', 'fat_g'].every(key => meal[key as keyof MealCandidate] === null || boundedNutrient(meal[key as keyof MealCandidate]))) throw new Error('餐食候选或营养估算不完整，未记录。');
  if (!Number.isFinite(portion) || portion <= 0 || portion > 1 || !Number.isFinite(Date.parse(input.consumedAt))
    || Date.parse(input.consumedAt) > Date.now() + 60000 || !meal.title.trim()) throw new Error('请确认餐食、食用比例和实际时间');
  if (await getFrostHealthRuntime().store.persistence() !== 'indexeddb') throw new Error('本机持久存储不可用，未记录，请先恢复存储权限和空间。');
  const facts: JsonObject = { title: meal.title, dishes: meal.dishes, consumed_at: input.consumedAt, portion,
    calories_kcal_range: meal.calories_kcal_range.map(value => Math.round(value * portion)),
    estimated: true, source: 'photos-confirmed', uncertainty: meal.uncertainty, note: input.note.slice(0, 300) };
  for (const key of ['protein_g', 'carbs_g', 'fat_g'] as const) if (meal[key] !== null) facts[key] = Math.round(meal[key]! * portion);
  const task = await recordMealWithTaskmaster({ facts, confidence: 0.6, model_version: meal.model,
    tool_version: 'photos-health-memory/v1', input_hash: input.id }, `photos-meal:${input.id}`);
  if (task.status !== 'completed') throw new Error('餐食确认尚未完成，请检查 Taskmaster 状态');
}
export async function withdrawHealthEvent(id: string): Promise<void> {
  const store = getFrostHealthRuntime().store, event = await store.getHealthEvent(id);
  if (!event || event.user_id !== HEALTH_USER) throw new Error('未找到本机用户的记录');
  const retractId = `withdraw:${id}`;
  if (await store.getHealthEvent(retractId)) return;
  await store.appendHealthEvent({ ...event, event_id: retractId, occurred_at: new Date().toISOString(),
    facts: { retracted: true }, supersedes_event_id: id, sync: { state: 'local', revision: event.sync.revision + 1 } });
}
export async function recordSkillUsage(id: string, skill: string, status: string, at: string): Promise<void> {
  const store = getFrostHealthRuntime().store;
  if (await store.getHealthEvent(id)) return;
  await store.appendHealthEvent({ protocol: 'health_event/v1', event_id: id, user_id: HEALTH_USER, occurred_at: at,
    type: status === 'completed' ? 'skill_completed' : 'device_state_changed', domain: 'skill', source: { provider: skill, device_id: 'pwa' }, facts: { skill_id: skill, status },
    confidence: 1, provenance: { model_version: 'none', tool_version: 'frost-skill-usage/v1', input_hash: id },
    visibility: 'private', sync: { state: 'local', revision: 1 } });
}
export function validWorkoutResult(value: FrostSkillPageResult['workout']): boolean {
  return !!value && value.input_mode === 'live' && Number.isInteger(value.duration_sec) && value.duration_sec > 0 && value.duration_sec <= 7200
    && typeof value.exercise_name === 'string' && value.exercise_name.length > 0 && value.exercise_name.length <= 80
    && Number.isInteger(value.total_reps) && value.total_reps >= 0 && value.total_reps <= 2000
    && Number.isInteger(value.observed_frames) && value.observed_frames >= 2 && value.observed_frames <= 20000;
}
export async function recordCompletedWorkout(id: string, workout: NonNullable<FrostSkillPageResult['workout']>, at: string): Promise<void> {
  if (!validWorkoutResult(workout)) throw new Error('invalid_live_workout_evidence');
  const store = getFrostHealthRuntime().store;
  if (await store.getHealthEvent(id)) return;
  await store.appendHealthEvent({ protocol: 'health_event/v1', event_id: id, user_id: HEALTH_USER, occurred_at: at,
    type: 'skill_completed', domain: 'workout', source: { provider: 'pocket.lianlema', device_id: 'pwa' },
    facts: { ...workout, pose_confirmed: true, duration_basis: 'observed_active_frames' }, confidence: 1,
    provenance: { model_version: 'lianlema-server-pose', tool_version: 'lianlema-workout-memory/v1', input_hash: id },
    visibility: 'private', sync: { state: 'local', revision: 1 } });
}
export function isHealthAdviceRequest(text: string): boolean {
  return !/^(?:不要|取消|停止|删除|打开|调用|启动)/.test(text.trim()) &&
    /今天|今日|现在|接下来|晚餐|晚饭|还适合|还能|接着/.test(text) &&
    /吃|饮食|热量|卡路里|锻炼|运动|训练|步数|走了|走多少|健康建议/.test(text);
}
export interface HealthAdvice {
  reply: string; speech: string; evidence_ids: string[]; next_skill: 'pocket.lianlema' | 'pocket.her-motion' | 'frost.run-route' | null;
  revision: string; expires_at: string; model: string; speechTicket: string;
}
export async function askHealthAdvice(question: string, signal?: AbortSignal): Promise<HealthAdvice> {
  if (!healthSettings().cloud) throw new Error('请先在 Photos → 今天记忆中同意把健康摘要交给 Qwen 分析。原始照片不会随摘要上传。');
  await (await import('./frostPhoneHealth')).refreshPhoneStepsForAdvice();
  signal?.throwIfAborted();
  if (!healthSettings().cloud) throw new Error('健康分析授权已关闭，未上传摘要。');
  const context = await readHealthMemory();
  const answer = await healthPost<HealthAdvice>('advice', { question, context, consent: true }, signal);
  if (!healthSettings().cloud || answer.revision !== context.revision || (await readHealthMemory()).revision !== context.revision)
    throw new Error('分析期间记忆或授权已改变，请重新提问。');
  return answer;
}
