import { Capacitor, registerPlugin } from '@capacitor/core';
import { localHealthDay } from '../../../frost-agent/taskmaster/summary';
import { getFrostHealthRuntime } from './frostHealthTaskmaster';
import { HEALTH_USER } from './frostHealthMemory';
export interface PhoneSteps { status: 'ok' | 'no_data' | 'locked' | 'unavailable'; steps?: number; day?: string; timezone?: string; as_of?: string; window_start?: string }
const native = registerPlugin<{ requestReadPermission(): Promise<void>; readTodaySteps(): Promise<PhoneSteps> }>('FrostHealth');
export function validPhoneSteps(value: PhoneSteps, now = new Date()): boolean {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return value.status === 'ok' && Number.isInteger(value.steps) && value.steps! >= 0 && value.steps! <= 200000
    && value.timezone === timezone && value.day === localHealthDay(now, timezone)
    && Number.isFinite(Date.parse(value.as_of || '')) && Date.parse(value.as_of!) <= now.getTime() + 60000
    && Date.parse(value.as_of!) >= now.getTime() - 600000
    && Number.isFinite(Date.parse(value.window_start || '')) && Date.parse(value.window_start!) <= Date.parse(value.as_of!)
    && localHealthDay(value.window_start!, timezone) === value.day;
}
export async function syncPhoneSteps(requestPermission = false): Promise<string> {
  if (Capacitor.getPlatform() !== 'ios' || !Capacitor.isPluginAvailable('FrostHealth')) throw new Error('需要安装包含 HealthKit 插件的新版 iPhone App；网页和旧安装包无法直接读取手机健康步数。');
  if (requestPermission) await native.requestReadPermission();
  const value = await native.readTodaySteps();
  if (value.status !== 'ok') return value.status === 'locked' ? '手机锁定，健康数据暂不可读；保留上次时间戳，不当作最新数据。'
    : '当前没有可读取的健康步数。可能尚无数据或未授权；不能把它当成 0 步。';
  if (!validPhoneSteps(value)) throw new Error('步数时间、时区或范围异常，未写入记忆。');
  const store = getFrostHealthRuntime().store;
  if (await store.persistence() !== 'indexeddb') throw new Error('本机持久存储不可用，未保存步数。');
  const id = `healthkit:steps:${value.day}:${value.timezone}:${value.as_of}`;
  await store.appendHealthEvent({ protocol: 'health_event/v1', event_id: id, user_id: HEALTH_USER, occurred_at: value.as_of!,
    domain: 'device', type: 'device_state_changed', source: { device_id: 'iphone', provider: 'apple-health' },
    facts: { kind: 'steps_snapshot', day: value.day!, timezone: value.timezone!, steps: value.steps!, window_start: value.window_start! },
    confidence: 1, provenance: { model_version: 'none', tool_version: 'healthkit-statistics/v1', input_hash: id },
    visibility: 'private', sync: { state: 'local', revision: 1 } });
  return `已读取 ${value.steps} 步。采用 HealthKit 今日累计值，不再叠加跑步步数。`;
}

/** Refresh on a user's advice request only after a previous explicit successful read. Never open a permission dialog here. */
export async function refreshPhoneStepsForAdvice(): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios' || !Capacitor.isPluginAvailable('FrostHealth')) return;
  const events = await getFrostHealthRuntime().store.listHealthEvents(HEALTH_USER);
  if (!events.some(event => event.source.provider === 'apple-health' && event.facts.kind === 'steps_snapshot')) return;
  try { await syncPhoneSteps(false); } catch { /* Preserve the actual previous timestamp and unknown/missing data, not a fabricated fresh zero. */ }
}
