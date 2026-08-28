import { frostBadge } from './frostBadge';
import { localHealthDay } from '../../../frost-agent/taskmaster/summary';
import { healthSettings, readHealthMemory, subscribeHealthMemory, type HealthMemoryContext } from './frostHealthMemory';
let idle = () => true;
let started = false, busy = false, lastSent = '';
export function healthBadgeText(memory: HealthMemoryContext): string {
  const day = memory.today, kcal = day.calories_kcal_range;
  // ASCII avoids pretending every firmware font supports CJK. No names/conditions/profile.
  return `${memory.day}\nMeals ${day.meals.count}\nKcal ${kcal ? '~' + kcal.join('-') : '?'}\nSteps ${day.steps_as_of ? day.workout.steps : '?'}\nMove ${day.workout.duration_s === undefined ? '?' : Math.round(day.workout.duration_s / 60)} min`;
}
export async function syncHealthBadge(automatic = false): Promise<string> {
  if (!healthSettings().hardware) throw new Error('请先保存“允许同步到吧唧”的授权。');
  if (busy || !idle()) throw new Error('正在处理语音或训练，稍后再同步摘要。');
  const connection = frostBadge.snapshot().connectionId;
  if (!connection || frostBadge.snapshot().status !== 'connected') throw new Error('吧唧未连接；记忆保留在本机。');
  busy = true;
  let changed = false;
  const unsubscribe = subscribeHealthMemory(() => { changed = true; });
  try {
    const memory = await readHealthMemory(), key = `${connection}:${memory.revision}`;
    const allowed = () => !changed && healthSettings().hardware && idle() && document.visibilityState !== 'hidden'
      && memory.day === localHealthDay() && frostBadge.snapshot().connectionId === connection;
    if (!allowed()) throw new Error('记忆、日期或连接状态已改变，请稍后同步最新摘要。');
    if (automatic && key === lastSent) return '摘要已同步';
    await frostBadge.projectHealthSummary(healthBadgeText(memory), allowed);
    if (!allowed()) throw new Error('同步期间记忆或连接已改变，不能确认硬件显示的是最新摘要。');
    lastSent = key;
    return '吧唧已确认收到今日摘要；不代表语音已经播放或被听到。';
  } finally { unsubscribe(); busy = false; }
}
export function startHealthBadgeSync(isIdle: () => boolean): void {
  idle = isIdle;
  if (started) return;
  started = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (!healthSettings().hardware || document.visibilityState === 'hidden' || !idle()) return;
      void syncHealthBadge(true).catch(() => { /* Explicit sync exposes the reason; no automatic command retries. */ });
    }, 2000);
  };
  subscribeHealthMemory(schedule); frostBadge.subscribe(schedule);
  document.addEventListener('visibilitychange', schedule);
  schedule();
}
