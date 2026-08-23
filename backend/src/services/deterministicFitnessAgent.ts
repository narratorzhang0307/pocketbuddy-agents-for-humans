import type { LlmGenerateInput } from '../schemas/llm.js';

const DECISION_PROTOCOL = 'frost-agent-decision/v1';

type JsonRecord = Record<string, unknown>;

interface Route {
  skillId: string;
  taskKind: 'log_meal' | 'start_workout' | 'plan_run_route' | 'complete_run' | 'capture_nature' | 'daily_review' | 'run_skill';
  input: JsonRecord;
  goal: string;
}

function record(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function decision(nextAction: JsonRecord, goal: string, observations: string[]): string {
  return JSON.stringify({
    protocol: DECISION_PROTOCOL,
    goal,
    observations,
    next_action: nextAction,
    confidence: 1,
    risk: nextAction.type === 'safe_stop' ? 'high' : nextAction.type === 'start_task' || nextAction.type === 'call_tool' ? 'medium' : 'low',
    success_condition: goal,
  });
}

function promptPayload(prompt: string): JsonRecord | null {
  const marker = '当前可见状态：';
  const start = prompt.lastIndexOf(marker);
  if (start < 0) return null;
  try {
    const value = JSON.parse(prompt.slice(start + marker.length).trim());
    return record(value) ? value : null;
  } catch {
    return null;
  }
}

function eventData(event: JsonRecord): JsonRecord {
  return record(event.data) ? event.data : {};
}

function eventContent(event: JsonRecord): JsonRecord {
  const data = eventData(event);
  return record(data.content) ? data.content : data;
}

function latestUserText(events: JsonRecord[]): string {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.type !== 'user.message') continue;
    const content = eventContent(events[index]);
    if (typeof content.text === 'string' && content.text.trim()) return content.text.trim();
    if (typeof content.objective === 'string' && content.objective.trim()) return content.objective.trim();
  }
  return '';
}

function taskFromEvent(event: JsonRecord): JsonRecord | null {
  if (event.type !== 'tool.result') return null;
  const result = eventData(event).result;
  if (!record(result) || !record(result.data) || !record(result.data.task)) return null;
  return result.data.task;
}

function relevantTask(events: JsonRecord[], text: string): JsonRecord | null {
  let inputSeq = 0;
  let inputHasSignal = false;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type !== 'user.message' && event.type !== 'context.injected') continue;
    inputSeq = typeof event.seq === 'number' ? event.seq : 0;
    inputHasSignal = typeof eventContent(event).signal_id === 'string';
    break;
  }
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const seq = typeof events[index].seq === 'number' ? events[index].seq as number : 0;
    if (seq <= inputSeq) break;
    const task = taskFromEvent(events[index]);
    if (task) return task;
  }
  if (!inputHasSignal && !/(确认|同意|开始|可以|继续)/.test(text)) return null;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const task = taskFromEvent(events[index]);
    if (task && ['waiting_confirmation', 'waiting_external', 'running'].includes(String(task.status))) return task;
  }
  return null;
}

function hasSignalAfterTask(events: JsonRecord[]): boolean {
  let taskSeq = 0;
  let signalSeq = 0;
  for (const event of events) {
    const seq = typeof event.seq === 'number' ? event.seq : 0;
    if (taskFromEvent(event)) taskSeq = seq;
    if ((event.type === 'context.injected' || event.type === 'user.message')
      && typeof eventContent(event).signal_id === 'string') signalSeq = seq;
  }
  return signalSeq > taskSeq;
}

function hasLoadedSkill(events: JsonRecord[], skillId: string): boolean {
  return events.some((event) => {
    if (event.type !== 'tool.result' || eventData(event).tool !== 'skill.load') return false;
    const result = eventData(event).result;
    return record(result) && record(result.data) && record(result.data.skill)
      && result.data.skill.skill_id === skillId;
  });
}

function route(text: string, catalog: JsonRecord[]): Route | null {
  const minutes = Math.max(1, Math.min(120, Number(text.match(/(\d{1,3})\s*分钟/)?.[1] || 10)));
  if (/(跑完|完成跑步|同步跑步|跑步记录)/.test(text)) {
    return { skillId: 'frost.phone-free-run', taskKind: 'complete_run', input: { user_text: text.slice(0, 240) }, goal: '完成跑步记录' };
  }
  if (!/(热身|瑜伽|普拉提)/.test(text) && /(带我跑|开始跑步|慢跑|跑到|跑去|跑步路线|跑步导航|规划.*跑)/.test(text)) {
    const km = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:公里|km|千米)/i)?.[1] || 0);
    const meters = Number(text.match(/(\d{3,5})\s*米/)?.[1] || 0);
    const destination = text.match(/(?:跑到|跑去|慢跑到)\s*([^\s，。！？]{2,24})/)?.[1];
    const input: JsonRecord = {
      user_text: text.slice(0, 240),
      shape: destination ? 'one_way' : /(往返|原路返回)/.test(text) ? 'out_and_back' : 'loop',
      preferences: [
        ...(/(风景|好看|公园|绿道)/.test(text) ? ['scenic'] : []),
        ...(/(平坦|少爬坡)/.test(text) ? ['flat'] : []),
        ...(/(沿湖|沿江|沿河|水边)/.test(text) ? ['lakeside'] : []),
      ],
    };
    if (destination) Object.assign(input, { goal_type: 'destination', destination });
    else if (km || meters) Object.assign(input, { goal_type: 'distance', distance_m: km ? km * 1000 : meters });
    else if (/\d{1,3}\s*分钟/.test(text)) Object.assign(input, { goal_type: 'duration', duration_min: minutes });
    else Object.assign(input, { goal_type: 'distance', distance_m: 5000 });
    return { skillId: 'frost.run-route', taskKind: 'plan_run_route', input, goal: '生成跑步路线并打开行动地图' };
  }
  if (/(轻松跑|恢复跑|跑步处方|安全强度|训练强度|今天.*(?:能不能|适不适合).*跑|安排.*跑)/.test(text)) {
    return { skillId: 'frost.running-coach', taskKind: 'run_skill', input: { skill_id: 'frost.running-coach', user_text: text.slice(0, 240) }, goal: '生成安全跑步处方' };
  }
  if (/(瑜伽|普拉提|热身|健身|训练|运动)/.test(text)) {
    const exercise = text.includes('普拉提') ? '普拉提' : text.includes('瑜伽') ? '瑜伽' : '热身';
    return { skillId: 'frost.her-motion-warmup', taskKind: 'start_workout', input: { exercise, duration_sec: minutes * 60 }, goal: `完成${exercise}` };
  }
  if (/(记录|识别|拍|热量|营养).*(饭|餐|食物|饮食)|(饭|餐).*(记录|识别|热量|营养)/.test(text)) {
    return { skillId: 'frost.nutrition-log', taskKind: 'log_meal', input: { user_text: text.slice(0, 240) }, goal: '记录当前餐食' };
  }
  if (/(记录|拍|识别).*(鸟|花|树|植物|自然|声音)/.test(text)) {
    return { skillId: 'frost.nature-moment', taskKind: 'capture_nature', input: { user_text: text.slice(0, 240) }, goal: '记录自然时刻' };
  }
  if (/(今日|每日|健康).*(总结|回顾)|(总结|回顾).*(今日|健康)/.test(text)) {
    return { skillId: 'frost.daily-review', taskKind: 'daily_review', input: { day: new Date().toISOString().slice(0, 10) }, goal: '生成今日健康总结' };
  }
  const normalized = text.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
  const match = catalog.find((item) => {
    if (item.task_kind !== 'run_skill') return false;
    const title = typeof item.title === 'string' ? item.title.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '') : '';
    const phrases = Array.isArray(item.when_to_use) ? item.when_to_use.filter((value): value is string => typeof value === 'string') : [];
    return (title.length >= 3 && normalized.includes(title))
      || phrases.some((phrase) => {
        const value = phrase.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
        return value.length >= 3 && normalized.includes(value);
      });
  });
  const skillId = typeof match?.skill_id === 'string' ? match.skill_id : '';
  if (!skillId) return null;
  return { skillId, taskKind: 'run_skill', input: { skill_id: skillId, user_text: text.slice(0, 240) }, goal: `运行${String(match?.title || skillId)}` };
}

/** Development-only server control plane used to exercise the real HTTP → Agent → Taskmaster chain. */
export function deterministicFitnessAgentDecision(input: LlmGenerateInput): string | null {
  if (input.task !== 'fitness-agent-decision' || !input.json) return null;
  const payload = promptPayload(input.prompt);
  const events = Array.isArray(payload?.events) ? payload.events.filter(record) : [];
  const catalog = Array.isArray(payload?.skill_catalog) ? payload.skill_catalog.filter(record) : [];
  const text = latestUserText(events);
  if (/(胸痛|眩晕|呼吸困难|剧烈疼痛|晕厥)/.test(text)) {
    return decision({ type: 'safe_stop', reason: '检测到危险身体信号，不开始运动。' }, '安全停止', ['用户文本包含危险信号']);
  }
  const selected = route(text, catalog);
  const task = relevantTask(events, text);
  if (task) {
    const taskId = typeof task.task_id === 'string' ? task.task_id : '';
    if (task.status === 'completed') {
      const evidenceIds = Array.isArray(task.source_event_ids) ? task.source_event_ids.filter((value): value is string => typeof value === 'string') : [];
      return decision({ type: 'complete', summary: `${selected?.goal || '任务'}已由 Taskmaster 完成。`, evidence_ids: evidenceIds }, selected?.goal || '完成任务', [`Taskmaster ${taskId} completed`]);
    }
    if (task.status === 'waiting_external') {
      if (hasSignalAfterTask(events)) return decision({ type: 'call_tool', tool: 'taskmaster.get', arguments: { task_id: taskId } }, selected?.goal || '恢复任务', ['收到外部 Skill 完成信号']);
      if (/(重试|恢复|继续|已连接|已授权|好了|可以了)/.test(text)) return decision({ type: 'call_tool', tool: 'taskmaster.resume', arguments: { task_id: taskId } }, selected?.goal || '恢复任务', ['用户确认外部条件已恢复']);
      return decision({ type: 'wait_external', reason: 'Taskmaster 正在等待 Skill 或设备结果。' }, selected?.goal || '等待外部结果', ['Taskmaster waiting_external']);
    }
    if (task.status === 'waiting_confirmation') {
      const actions = Array.isArray(task.actions) ? task.actions.filter(record) : [];
      const nextIndex = typeof task.next_action_index === 'number' ? task.next_action_index : -1;
      const actionId = typeof actions[nextIndex]?.action_id === 'string' ? actions[nextIndex].action_id as string : '';
      if (actionId && /(确认|同意|开始|可以|继续)/.test(text)) {
        return decision({ type: 'call_tool', tool: 'taskmaster.confirm', arguments: { task_id: taskId, action_id: actionId } }, selected?.goal || '确认任务', ['用户已明确确认']);
      }
      return decision({ type: 'ask_user', question: '任务已准备好，是否确认继续？', reason: 'taskmaster_waiting_confirmation' }, selected?.goal || '等待确认', ['Taskmaster 需要确认']);
    }
    if (task.status === 'failed' || task.status === 'safe_stopped') {
      return decision({ type: 'safe_stop', reason: typeof task.error === 'string' ? task.error : String(task.status) }, selected?.goal || '停止任务', ['Taskmaster 拒绝继续']);
    }
    return decision({ type: 'call_tool', tool: 'taskmaster.get', arguments: { task_id: taskId } }, selected?.goal || '检查任务', ['任务状态需要刷新']);
  }
  if (!selected) {
    return decision({ type: 'ask_user', question: '请说明你要记录饮食、开始运动、规划跑步、记录自然，还是生成今日总结。', reason: 'server_route_unknown' }, '明确健康任务', ['服务端规则无法确定任务类型']);
  }
  if (!hasLoadedSkill(events, selected.skillId)) {
    return decision({ type: 'load_skill', skill_id: selected.skillId }, selected.goal, [`选择 ${selected.skillId}`]);
  }
  return decision({ type: 'start_task', task_kind: selected.taskKind, input: selected.input }, selected.goal, [`${selected.skillId} 已加载`]);
}
