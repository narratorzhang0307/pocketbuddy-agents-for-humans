import type { FrostTaskSession, JsonObject } from '../taskmaster/contracts';
import type { FrostAgentEvent } from './contracts';

function record(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Inbox input, not model text or a tool observation, determines the current request. */
export function latestFrostInput(events: FrostAgentEvent[]): { event: FrostAgentEvent; content: JsonObject } | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === 'user.message' || event.type === 'context.injected') {
      return { event, content: record(event.data.content) ? event.data.content : event.data };
    }
  }
  return null;
}

export function taskFromEvents(events: FrostAgentEvent[], taskId?: string): FrostTaskSession | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type !== 'tool.result' || !record(event.data.result)) continue;
    const result = event.data.result;
    if (!record(result.data) || !record(result.data.task)) continue;
    if (taskId && result.data.task.task_id !== taskId) continue;
    return structuredClone(result.data.task) as unknown as FrostTaskSession;
  }
  return null;
}

/** Only a standalone affirmative approves the pending action; “不可以/先别确认” never does. */
export function isExplicitTaskConfirmation(text: string): boolean {
  return /^(?:确认|同意|可以|好的?|开始|继续)(?:(?:确认|开始|继续|执行|记录|保存)(?:任务)?)?$/.test(text.replace(/[\s，。！？,.!?]/g, ''));
}

/** A later conversation/Skill result ends the implicit confirmation target of an older task. */
export function pendingFrostTask(events: FrostAgentEvent[]): FrostTaskSession | null {
  const latest = [...events].reverse().find((event) => event.type === 'tool.result');
  const task = latest ? taskFromEvents([latest]) : null;
  return task && ['waiting_confirmation', 'waiting_external', 'running'].includes(task.status) ? task : null;
}

export function pendingTaskConfirmation(events: FrostAgentEvent[]): FrostTaskSession | null {
  const task = pendingFrostTask(events);
  return task?.status === 'waiting_confirmation' ? task : null;
}
