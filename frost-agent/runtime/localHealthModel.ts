import type { FrostTaskKind, JsonObject } from '../taskmaster/contracts';
import {
  FROST_AGENT_DECISION_PROTOCOL,
  type FrostAgentDecision,
  type FrostAgentEvent,
  type FrostAgentModelAdapter,
  type FrostAgentModelContext,
  type NextAction,
} from './contracts';
import { isExplicitTaskConfirmation } from './turnContext';

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function decision(action: NextAction, goal: string, observations: string[]): FrostAgentDecision {
  return {
    protocol: FROST_AGENT_DECISION_PROTOCOL,
    goal,
    observations,
    next_action: action,
    confidence: 1,
    risk: action.type === 'safe_stop' ? 'high' : action.type === 'call_tool' || action.type === 'start_task' ? 'medium' : 'low',
    success_condition: goal,
  };
}

function userText(events: FrostAgentEvent[]): string {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type !== 'user.message') continue;
    const content = record(event.data.content) ? event.data.content : event.data;
    if (typeof content.text === 'string' && content.text.trim()) return content.text.trim();
    if (typeof content.objective === 'string' && content.objective.trim()) return content.objective.trim();
  }
  return '';
}

function taskResult(event: FrostAgentEvent): Record<string, unknown> | null {
  if (event.type !== 'tool.result' || !record(event.data.result)) return null;
  const result = event.data.result;
  if (!record(result.data) || !record(result.data.task)) return null;
  return result.data.task;
}

function relevantTask(events: FrostAgentEvent[], text: string): Record<string, unknown> | null {
  let inputSeq = 0;
  let inputHasSignal = false;
  let signalTaskId: string | undefined;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type !== 'user.message' && event.type !== 'context.injected') continue;
    inputSeq = event.seq;
    const content = record(event.data.content) ? event.data.content : event.data;
    inputHasSignal = typeof content.signal_id === 'string';
    signalTaskId = typeof content.task_id === 'string' ? content.task_id : undefined;
    break;
  }
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].seq <= inputSeq) break;
    const task = taskResult(events[index]);
    if (task) return task;
  }
  if (!inputHasSignal && !isExplicitTaskConfirmation(text)) return null;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const task = taskResult(events[index]);
    if (task && (!signalTaskId || task.task_id === signalTaskId)
      && (task.status === 'waiting_confirmation' || task.status === 'waiting_external' || task.status === 'running')) return task;
  }
  return null;
}

function taskId(task: Record<string, unknown>): string {
  return typeof task.task_id === 'string' ? task.task_id : '';
}

function waitingAction(task: Record<string, unknown>): Record<string, unknown> | null {
  if (!Array.isArray(task.actions) || typeof task.next_action_index !== 'number') return null;
  const action = task.actions[task.next_action_index];
  return record(action) ? action : null;
}

function hasSkillResult(events: FrostAgentEvent[], skillId: string): boolean {
  return events.some((event) => event.type === 'tool.result'
    && event.data.tool === 'skill.load'
    && record(event.data.result)
    && record(event.data.result.data)
    && record(event.data.result.data.skill)
    && event.data.result.data.skill.skill_id === skillId);
}

function hasSignalAfterTask(events: FrostAgentEvent[]): boolean {
  let lastTaskResultSeq = 0;
  let lastSignalSeq = 0;
  for (const event of events) {
    if (taskResult(event)) lastTaskResultSeq = event.seq;
    if ((event.type === 'context.injected' || event.type === 'user.message') && record(event.data.content)
      && typeof event.data.content.signal_id === 'string') lastSignalSeq = event.seq;
  }
  return lastSignalSeq > lastTaskResultSeq;
}

export function routeHealthIntent(text: string): { kind: FrostTaskKind; skill: string; input: JsonObject; goal: string } | null {
  const minutes = Number(text.match(/(\d{1,3})\s*分钟/)?.[1] || 10);
  if (/(胸痛|眩晕|呼吸困难|剧烈疼痛|晕厥)/.test(text)) {
    return { kind: 'start_workout', skill: 'frost.her-motion-warmup', input: {}, goal: 'safe_stop' };
  }
  if (/(跑完|完成跑步|同步跑步|跑步记录)/.test(text)) {
    return { kind: 'complete_run', skill: 'frost.phone-free-run', input: { user_text: text.slice(0, 240) }, goal: '完成跑步记录' };
  }
  if (!/(热身|瑜伽|普拉提)/.test(text) && /(带我跑|开始跑步|慢跑|跑到|跑去|跑步路线|跑步导航|规划.*跑)/.test(text)) {
    const km = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:公里|km|千米)/i)?.[1] || 0);
    const meters = Number(text.match(/(\d{3,5})\s*米/)?.[1] || 0);
    const destination = text.match(/(?:跑到|跑去|慢跑到)\s*([^\s，。！？]{2,24})/)?.[1];
    const input: JsonObject = {
      user_text: text.slice(0, 240),
      shape: destination ? 'one_way' : /(往返|原路返回)/.test(text) ? 'out_and_back' : 'loop',
      preferences: [
        ...(/(风景|好看|公园|绿道)/.test(text) ? ['scenic'] : []),
        ...(/(平坦|少爬坡)/.test(text) ? ['flat'] : []),
        ...(/(沿湖|沿江|沿河|水边)/.test(text) ? ['lakeside'] : []),
      ],
    };
    if (destination) { input.goal_type = 'destination'; input.destination = destination; }
    else if (km || meters) { input.goal_type = 'distance'; input.distance_m = km ? km * 1000 : meters; }
    else if (/\d{1,3}\s*分钟/.test(text)) { input.goal_type = 'duration'; input.duration_min = minutes; }
    else { input.goal_type = 'distance'; input.distance_m = 5000; }
    return { kind: 'plan_run_route', skill: 'frost.run-route', input, goal: '生成跑步路线并打开行动地图' };
  }
  if (/(瑜伽|普拉提|热身|健身|训练|运动)/.test(text)) {
    const exercise = text.includes('普拉提') ? '普拉提' : text.includes('瑜伽') ? '瑜伽' : '热身';
    return { kind: 'start_workout', skill: 'frost.her-motion-warmup', input: { exercise, duration_sec: Math.max(60, Math.min(minutes, 120) * 60) }, goal: `完成${exercise}` };
  }
  if (/(记录|识别|拍|热量|营养).*(饭|餐|食物|饮食)|(饭|餐).*(记录|识别|热量|营养)/.test(text)) {
    return { kind: 'log_meal', skill: 'frost.nutrition-log', input: { user_text: text.slice(0, 240) }, goal: '记录当前餐食' };
  }
  if (/(记录|拍|识别).*(鸟|花|树|植物|自然|声音)/.test(text)) {
    return { kind: 'capture_nature', skill: 'frost.nature-moment', input: { user_text: text.slice(0, 240) }, goal: '记录自然时刻' };
  }
  if (/(今日|每日|健康).*(总结|回顾)|(总结|回顾).*(今日|健康)/.test(text)) {
    return { kind: 'daily_review', skill: 'frost.daily-review', input: { day: new Date().toISOString().slice(0, 10) }, goal: '生成今日健康总结' };
  }
  return null;
}

/** Deterministic offline control plane. It never invents observations and only emits Taskmaster-safe actions. */
export class LocalHealthFallbackModel implements FrostAgentModelAdapter {
  async decide(context: FrostAgentModelContext): Promise<FrostAgentDecision> {
    const text = userText(context.events);
    const routed = context.task_intent || routeHealthIntent(text);
    if (routed?.goal === 'safe_stop') return decision({ type: 'safe_stop', reason: '检测到危险身体信号，不开始运动。' }, '安全停止', ['用户文本包含危险信号']);

    const task = relevantTask(context.events, text);
    if (task) {
      const id = taskId(task);
      if (task.status === 'completed') {
        const evidence = Array.isArray(task.source_event_ids) ? task.source_event_ids.filter((item): item is string => typeof item === 'string') : [];
        return decision({ type: 'complete', summary: `${routed?.goal || '任务'}已由 Taskmaster 完成。`, evidence_ids: evidence }, routed?.goal || '完成任务', [`Taskmaster ${id} completed`]);
      }
      if (task.status === 'waiting_confirmation') {
        const action = waitingAction(task);
        if (isExplicitTaskConfirmation(text) && action && typeof action.action_id === 'string') {
          return decision({ type: 'call_tool', tool: 'taskmaster.confirm', arguments: { task_id: id, action_id: action.action_id } }, routed?.goal || '确认任务', ['用户已明确确认']);
        }
        return decision({ type: 'ask_user', question: '任务已准备好，是否确认继续？', reason: 'taskmaster_waiting_confirmation' }, routed?.goal || '等待确认', ['Taskmaster 需要确认']);
      }
      if (task.status === 'waiting_external') {
        if (hasSignalAfterTask(context.events)) return decision({ type: 'call_tool', tool: 'taskmaster.get', arguments: { task_id: id } }, routed?.goal || '恢复任务', ['收到外部 Skill 完成信号']);
        return decision({ type: 'wait_external', reason: 'Taskmaster 正在等待 Skill 或设备结果。' }, routed?.goal || '等待外部结果', ['Taskmaster waiting_external']);
      }
      if (task.status === 'failed' || task.status === 'safe_stopped') {
        return decision({ type: 'safe_stop', reason: typeof task.error === 'string' ? task.error : String(task.status) }, routed?.goal || '停止任务', ['Taskmaster 拒绝继续']);
      }
      return decision({ type: 'call_tool', tool: 'taskmaster.get', arguments: { task_id: id } }, routed?.goal || '检查任务', ['任务状态需要刷新']);
    }

    if (!routed) return decision({
      type: 'ask_user',
      question: '请说明你要记录饮食、开始运动、完成跑步、记录自然，还是生成今日总结。',
      reason: 'offline_route_unknown',
    }, '明确健康任务', ['本地规则无法确定任务类型']);
    if (!hasSkillResult(context.events, routed.skill)) {
      return decision({ type: 'load_skill', skill_id: routed.skill }, routed.goal, [`选择 ${routed.skill}`]);
    }
    return decision({ type: 'start_task', task_kind: routed.kind, input: routed.input }, routed.goal, [`${routed.skill} 已加载`]);
  }
}
