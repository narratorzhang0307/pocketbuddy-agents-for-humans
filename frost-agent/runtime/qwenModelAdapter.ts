import type { JsonObject } from '../taskmaster/contracts';
import type { EdgeModel } from '../edge/types';
import {
  FROST_AGENT_DECISION_PROTOCOL,
  type FrostAgentDecision,
  type FrostAgentEvent,
  type FrostAgentModelAdapter,
  type FrostAgentModelContext,
} from './contracts';
import type { FrostSkillProvider } from './skillCatalog';
import type { FrostAgentToolRegistry } from './toolRegistry';

const VISIBLE_EVENT_TYPES = new Set<FrostAgentEvent['type']>([
  'session.created', 'session.restored', 'user.message', 'context.injected', 'assistant.message',
  'decision.recorded', 'decision.invalid', 'tool.called', 'tool.result', 'session.status_changed',
]);

export interface FrostQwenCompletion {
  complete(prompt: string, signal: AbortSignal): Promise<string>;
}

export interface FrostQwenModelOptions {
  max_events?: number;
  max_context_chars?: number;
  fallback?: FrostAgentModelAdapter;
}

function safeDecision(question: string, reason: string): FrostAgentDecision {
  return {
    protocol: FROST_AGENT_DECISION_PROTOCOL,
    goal: '等待可靠的本地决策',
    observations: [reason],
    next_action: { type: 'ask_user', question, reason },
    confidence: 1,
    risk: 'low',
    success_condition: '本地 Qwen 恢复后重试，或用户给出更明确的任务。',
  };
}

function stripModelEnvelope(text: string): string {
  const withoutThinking = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fenced = withoutThinking.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || withoutThinking;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  return start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
}

function visibleEvents(events: FrostAgentEvent[], limit: number, maxChars: number): JsonObject[] {
  const visible = events.filter((event) => VISIBLE_EVENT_TYPES.has(event.type));
  const selected = new Map<string, FrostAgentEvent>();
  let used = 0;
  for (let index = visible.length - 1; index >= 0 && selected.size < limit; index -= 1) {
    const event = visible[index];
    const group = [event];
    const callId = typeof event.data.call_id === 'string' ? event.data.call_id : '';
    if (callId && (event.type === 'tool.called' || event.type === 'tool.result')) {
      const pairType = event.type === 'tool.called' ? 'tool.result' : 'tool.called';
      const pair = visible.find((candidate) => candidate.type === pairType && candidate.data.call_id === callId);
      if (pair) group.push(pair);
    }
    const fresh = group.filter((item) => !selected.has(item.event_id));
    const size = fresh.reduce((sum, item) => sum + JSON.stringify(item).length, 0);
    if (selected.size > 0 && used + size > maxChars) break;
    for (const item of fresh) selected.set(item.event_id, item);
    used += size;
  }
  return [...selected.values()]
    .sort((left, right) => left.seq - right.seq)
    .map((event) => ({ event_id: event.event_id, seq: event.seq, type: event.type, data: event.data }));
}

export function buildFrostDecisionPrompt(
  context: FrostAgentModelContext,
  tools: FrostAgentToolRegistry,
  skills: FrostSkillProvider,
  options: FrostQwenModelOptions = {},
): string {
  const eventLimit = options.max_events ?? 48;
  const maxChars = options.max_context_chars ?? 18_000;
  const payload = {
    session: context.session,
    turn: context.turn,
    step: context.step,
    ...(context.task_intent ? { task_intent: context.task_intent } : {}),
    tools: tools.list(),
    skill_catalog: skills.catalog(),
    events: visibleEvents(context.events, eventLimit, maxChars),
  };
  return [
    '你是 Frost 主 Agent 的本地决策器。Taskmaster 是你的任务执行器，不是另一个主 Agent。你只决定下一个可验证动作，不直接执行副作用。',
    '规则：',
    '1. 先根据 skill_catalog 选择能力；需要该 Skill 正文时先返回 load_skill。',
    '2. 健康任务通过 start_task 交给 Taskmaster；你只填 task_kind 和事实 input，不生成 ID、时间或 user_id。',
    '3. 只能调用 tools 中出现的工具；工具结果是新观察，不得伪造成功。',
    '4. 有疼痛、胸痛、眩晕、呼吸困难或其他危险信号时 safe_stop。',
    '5. 需要用户表态时 ask_user；需要设备或 Skill 回调时 wait_external。',
    '6. 成功条件有事件或工具证据才 complete。',
    `7. 只输出一个 ${FROST_AGENT_DECISION_PROTOCOL} JSON 对象，不要 Markdown，不要输出思维过程。`,
    '允许的 next_action 结构：',
    '{"type":"load_skill","skill_id":"..."}',
    '{"type":"call_tool","tool":"...","arguments":{}}',
    '{"type":"start_task","task_kind":"log_meal|start_workout|plan_run_route|complete_run|capture_nature|daily_review","input":{}}',
    '{"type":"ask_user","question":"...","reason":"..."}',
    '{"type":"wait_external","reason":"..."}',
    '{"type":"complete","summary":"...","evidence_ids":["..."]}',
    '{"type":"safe_stop","reason":"..."}',
    '当前可见状态：',
    JSON.stringify(payload),
  ].join('\n');
}

export class QwenFrostModelAdapter implements FrostAgentModelAdapter {
  constructor(
    private readonly qwen: FrostQwenCompletion,
    private readonly tools: FrostAgentToolRegistry,
    private readonly skills: FrostSkillProvider,
    private readonly options: FrostQwenModelOptions = {},
  ) {}

  async decide(context: FrostAgentModelContext): Promise<unknown> {
    const prompt = buildFrostDecisionPrompt(context, this.tools, this.skills, this.options);
    const text = await this.qwen.complete(prompt, context.signal);
    if (!text.trim()) return this.options.fallback?.decide(context)
      ?? safeDecision('本地 Qwen 尚未就绪。请稍后重试。', 'local_qwen_unavailable');
    try { return JSON.parse(stripModelEnvelope(text)); }
    catch { return this.options.fallback?.decide(context)
      ?? safeDecision('这次本地决策没有通过结构校验，请重试。', 'invalid_qwen_decision_json'); }
  }
}

export function edgeQwenCompletion(edge: EdgeModel): FrostQwenCompletion {
  return {
    async complete(prompt, signal) {
      if (signal.aborted) return '';
      return edge.chat(prompt, { json: true, maxTokens: 768, model: 'health-qwen3-4b' });
    },
  };
}
