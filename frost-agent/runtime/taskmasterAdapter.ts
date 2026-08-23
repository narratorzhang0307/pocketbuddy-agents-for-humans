import type { JsonObject, FrostTaskKind, FrostTaskRequest, FrostTaskSession } from '../taskmaster/contracts';
import type { FrostHealthTaskmaster } from '../taskmaster/orchestrator';
import type { FrostAgentEvent, FrostAgentToolDefinition, FrostAgentToolResult } from './contracts';

function taskData(session: FrostTaskSession): JsonObject {
  return structuredClone(session) as unknown as JsonObject;
}

function resultFor(session: FrostTaskSession): FrostAgentToolResult {
  const data = { task: taskData(session) };
  if (session.status === 'waiting_confirmation') return { status: 'waiting_user', data, message: 'taskmaster_waiting_confirmation' };
  if (session.status === 'waiting_external') return { status: 'waiting_external', data, message: 'taskmaster_waiting_external' };
  if (session.status === 'failed' || session.status === 'safe_stopped') return { status: 'error', data, message: session.error || session.status };
  return { status: 'success', data };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function taskRequest(value: unknown): FrostTaskRequest {
  if (!record(value)) throw new Error('taskmaster_request_required');
  const request = value as unknown as FrostTaskRequest;
  if (!request.task_id || !request.user_id || !request.kind || !request.requested_at || !record(request.input)) {
    throw new Error('invalid_taskmaster_request');
  }
  return structuredClone(request);
}

const TASK_KINDS = new Set<FrostTaskKind>(['log_meal', 'start_workout', 'plan_run_route', 'complete_run', 'capture_nature', 'daily_review', 'run_skill']);

function taskKind(value: unknown): FrostTaskKind {
  if (typeof value !== 'string' || !TASK_KINDS.has(value as FrostTaskKind)) throw new Error('invalid_taskmaster_kind');
  return value as FrostTaskKind;
}

function intentTaskId(sessionId: string, callId: string): string {
  const suffix = callId.split(':').pop() || '1';
  return `${sessionId}:task:${suffix}`;
}

function latestUserText(events: FrostAgentEvent[]): string {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type !== 'user.message') continue;
    const content = record(event.data.content) ? event.data.content : event.data;
    if (typeof content.text === 'string') return content.text.trim();
  }
  return '';
}

function hasExecutionConsent(events: FrostAgentEvent[], kind: FrostTaskKind): boolean {
  const text = latestUserText(events);
  if (!text) return false;
  const explicitAction = /(打开|开始|带我|直接|帮我|给我|记录|拍|运行|执行|做\s*\d*|来一组)/i.test(text);
  if (!explicitAction) return false;
  if (kind === 'run_skill') return true;
  if (kind === 'start_workout') return /(瑜伽|普拉提|热身|运动|健身|训练)/i.test(text);
  if (kind === 'plan_run_route') return /(跑步|慢跑|路线|导航|公里|分钟)/i.test(text);
  if (kind === 'log_meal') return /(饭|餐|食物|饮食|热量|营养)/i.test(text);
  if (kind === 'complete_run') return /(跑步|跑完|路线|运动记录)/i.test(text);
  if (kind === 'capture_nature') return /(鸟|花|树|植物|自然|声音)/i.test(text);
  return /(总结|回顾|今日|每日)/i.test(text);
}

export function createTaskmasterAgentTools(taskmaster: FrostHealthTaskmaster): FrostAgentToolDefinition[] {
  return [
    {
      name: 'taskmaster.start_intent',
      description: '把模型选定的健康任务意图转为标准、幂等的 Taskmaster 请求。',
      read_only: false,
      risk: 'medium',
      async execute(input, context) {
        if (!record(input.input)) throw new Error('taskmaster_intent_input_required');
        const kind = taskKind(input.kind);
        const request: FrostTaskRequest = {
          task_id: intentTaskId(context.session.session_id, context.call_id),
          user_id: context.session.user_id,
          kind,
          requested_at: new Date().toISOString(),
          input: structuredClone(input.input) as JsonObject,
          source: 'agent',
        };
        let session = await taskmaster.start(request);
        if (session.status === 'waiting_confirmation' && hasExecutionConsent(context.events, kind)) {
          const action = session.actions[session.next_action_index];
          if (action?.status === 'waiting_confirmation') session = await taskmaster.confirm(session.task_id, action.action_id);
        }
        return resultFor(session);
      },
    },
    {
      name: 'taskmaster.start',
      description: '创建或恢复一个幂等 Frost 健康任务；确认和外部等待由 Taskmaster 返回。',
      read_only: false,
      risk: 'medium',
      model_visible: false,
      async execute(input) {
        const requestValue = record(input.request) ? input.request : input.input;
        return resultFor(await taskmaster.start(taskRequest(requestValue)));
      },
    },
    {
      name: 'taskmaster.get',
      description: '读取 Taskmaster 当前任务 checkpoint。',
      read_only: true,
      risk: 'low',
      async execute(input): Promise<FrostAgentToolResult> {
        if (typeof input.task_id !== 'string' || !input.task_id) throw new Error('task_id_required');
        const session = await taskmaster.get(input.task_id);
        if (session) return { status: 'success', data: { task: taskData(session) } };
        return { status: 'error', data: { task_id: input.task_id }, message: 'task_not_found' };
      },
    },
    {
      name: 'taskmaster.resume',
      description: '在 Provider、网络或权限恢复后，从原 Taskmaster checkpoint 重试当前动作。',
      read_only: false,
      risk: 'medium',
      async execute(input): Promise<FrostAgentToolResult> {
        if (typeof input.task_id !== 'string' || !input.task_id) throw new Error('task_id_required');
        return resultFor(await taskmaster.resume(input.task_id));
      },
    },
    {
      name: 'taskmaster.confirm',
      description: '在用户确认已被 Harness 记录后，确认 Taskmaster 的单个动作。',
      read_only: false,
      risk: 'high',
      requires_approval: true,
      async execute(input) {
        if (typeof input.task_id !== 'string' || typeof input.action_id !== 'string') throw new Error('task_id_and_action_id_required');
        return resultFor(await taskmaster.confirm(input.task_id, input.action_id));
      },
    },
  ];
}
