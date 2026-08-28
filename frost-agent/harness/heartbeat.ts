// Frost Harness · agent 主动性（P2-H）：后台 heartbeat
// 开着应用就定期跑一遍：读你的长期画像 → 产出一条「今日推荐 / 候选动作」。
// 关键原则 suggest-then-confirm：只给建议，你一键采纳才落地，绝不偷改你的数据。
// 纯前端 + localStorage pub/sub；无画像 / 无网络都安全降级（产不出建议就不产）。
import { getProfile } from './profile';
import { recordHealth } from './health';

export interface Suggestion {
  id: string;
  text: string;        // 给用户看的一句话建议
  target?: string;     // 采纳后导航到的可运行健康 Skill
  cta?: string;        // 采纳按钮文案
  createdAt: string;   // ISO
}

const KEY = 'pe.heartbeat.v1';
interface State { current: Suggestion | null; dismissed: string[]; cursor: number }

function load(): State {
  try {
    if (typeof localStorage !== 'undefined') {
      const r = localStorage.getItem(KEY);
      if (r) { const s = JSON.parse(r); return { current: s.current || null, dismissed: Array.isArray(s.dismissed) ? s.dismissed : [], cursor: Math.max(0, Math.floor(Number(s.cursor) || 0)) }; }   // cursor 规整为非负整数：防手改成负/NaN/浮点 → pool[负/NaN]=undefined 渲染空建议
    }
  } catch { /* 隐私模式：内存仍可用 */ }
  return { current: null, dismissed: [], cursor: 0 };
}

let state: State = load();
const subs = new Set<() => void>();
function persist() { try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } }
function emit() { subs.forEach((fn) => fn()); }

export function subscribeHeartbeat(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }
export function getSuggestion(): Suggestion | null { return state.current; }

function topTag(domain: string, field: string): string | null {
  const list = getProfile().domains?.[domain]?.[field];
  return list && list.length ? list[0].tag : null;
}

// 候选建议池：按本机健康画像生成，没有数据时仍给出可选的低风险入口。
function candidates(): Suggestion[] {
  const out: Suggestion[] = [];
  const mk = (id: string, text: string, target: string, cta: string): Suggestion => ({ id, text, target, cta, createdAt: '' });
  const activity = topTag('training', 'activities');
  if (activity) out.push(mk('training-baseline', `根据近期基线，检查今天的${activity}安排`, 'frost-running-coach', '评估'));
  const sleepSignal = topTag('recovery', 'sleep');
  if (sleepSignal) out.push(mk('sleep-review', `看看“${sleepSignal}”与近期恢复的关系`, 'frost-sleep-detective', '观察'));
  const mealGoal = topTag('nutrition', 'goals');
  if (mealGoal) out.push(mk('meal-goal', `围绕“${mealGoal}”记录下一餐`, 'frost-meal-lens', '记录'));
  out.push(mk('run-route', '规划今天的跑步路线，出发前再确认状态', 'frost-run-route', '规划'));
  out.push(mk('motion-reset', '做一次温和的热身或恢复动作', 'her-motion', '开始'));
  return out;
}

/** 跑一次心跳：按 cursor 轮换选一条没被忽略过的建议，写进 store。 */
export function tick(): void {
  try {
    const cs = candidates();
    if (!cs.length) { state.current = null; persist(); emit(); recordHealth('heartbeat', true); return; }
    const fresh = cs.filter((c) => !state.dismissed.includes(c.id));
    const pool = fresh.length ? fresh : cs;             // 都忽略过就重新轮换
    const pick = pool[state.cursor % pool.length];
    state.current = { ...pick, createdAt: new Date().toISOString() };
    persist(); emit();
    recordHealth('heartbeat', true);
  } catch (e) {
    recordHealth('heartbeat', false, String(e));
  }
}

/** 采纳当前建议：清掉它、游标 +1（下次换一条），返回它给调用方去执行（如导航到 target）。 */
export function adoptSuggestion(): Suggestion | null {
  const s = state.current;
  state.current = null; state.cursor += 1; persist(); emit();
  tick();   // 备好下一条，回到控制台时显示新的
  return s;
}

let timer: ReturnType<typeof setInterval> | null = null;
/** 启动 heartbeat：先跑一次，再每隔 intervalMs 跑一次。重复调用安全（只起一个定时器）。 */
export function startHeartbeat(intervalMs = 120000): () => void {
  if (timer) return () => {};
  if (!state.current) tick();
  timer = setInterval(tick, intervalMs);
  return () => { if (timer) { clearInterval(timer); timer = null; } };
}
