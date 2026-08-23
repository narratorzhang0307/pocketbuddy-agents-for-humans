import type { JsonObject } from '../taskmaster/contracts';
import {
  FROST_AGENT_DECISION_PROTOCOL,
  FROST_AGENT_SESSION_PROTOCOL,
  validateFrostAgentDecision,
  type FrostAgentDecision,
  type FrostAgentModelAdapter,
  type FrostAgentSession,
  type FrostAgentStatus,
  type FrostAgentToolResult,
  type NextAction,
} from './contracts';
import { FrostInbox, type FrostInboxItem, type FrostInboxMode, type FrostInboxSource } from './inbox';
import type { FrostSessionLog } from './sessionLog';
import { FrostAgentToolRegistry } from './toolRegistry';

export interface FrostAgentLoopOptions {
  max_steps?: number;
  max_tool_calls?: number;
  deadline_ms?: number;
  now?: () => Date;
}

function asJsonObject(value: unknown): JsonObject {
  return structuredClone(value) as JsonObject;
}

function actionToolCall(action: NextAction): { name: string; input: JsonObject } | null {
  if (action.type === 'call_tool') return { name: action.tool, input: structuredClone(action.arguments) };
  if (action.type === 'load_skill') return { name: 'skill.load', input: { skill_id: action.skill_id } };
  if (action.type === 'start_task') return { name: 'taskmaster.start_intent', input: { kind: action.task_kind, input: structuredClone(action.input) } };
  return null;
}

export class FrostAgentLoop {
  readonly inbox = new FrostInbox();
  private readonly maxSteps: number;
  private readonly maxToolCalls: number;
  private readonly deadlineMs: number;
  private readonly now: () => Date;
  private driver: Promise<void> | null = null;
  private wakeLatched = false;
  private currentAbort: AbortController | null = null;
  private cancelledReason: string | null = null;
  private initialized = false;
  private readonly idleWaiters = new Set<() => void>();

  constructor(
    private readonly session: FrostAgentSession,
    private readonly model: FrostAgentModelAdapter,
    private readonly tools: FrostAgentToolRegistry,
    private readonly log: FrostSessionLog,
    options: FrostAgentLoopOptions = {},
  ) {
    this.maxSteps = options.max_steps ?? 12;
    this.maxToolCalls = options.max_tool_calls ?? 12;
    this.deadlineMs = options.deadline_ms ?? 5 * 60 * 1000;
    this.now = options.now || (() => new Date());
  }

  static createSession(sessionId: string, userId: string, now = new Date()): FrostAgentSession {
    const at = now.toISOString();
    return {
      protocol: FROST_AGENT_SESSION_PROTOCOL,
      session_id: sessionId,
      user_id: userId,
      status: 'idle',
      created_at: at,
      updated_at: at,
      counters: { turns: 0, steps: 0, tool_calls: 0 },
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const existing = await this.log.list(this.session.session_id);
    if (existing.length > 0) {
      this.inbox.resumeSequence(existing.length);
      const created = existing.find((event) => event.type === 'session.created');
      if (created && typeof created.data.user_id === 'string' && created.data.user_id !== this.session.user_id) {
        throw new Error('agent_session_user_mismatch');
      }
      const statusEvents = existing.filter((event) => event.type === 'session.status_changed' && typeof event.data.status === 'string');
      const lastStatus = statusEvents[statusEvents.length - 1]?.data.status;
      if (typeof lastStatus === 'string') this.session.status = lastStatus as FrostAgentStatus;
      this.session.counters.turns = existing.reduce((max, event) => event.type === 'turn.started' && typeof event.data.turn === 'number' ? Math.max(max, event.data.turn) : max, 0);
      this.session.counters.steps = existing.reduce((max, event) => event.type === 'step.started' && typeof event.data.step === 'number' ? Math.max(max, event.data.step) : max, 0);
      this.session.counters.tool_calls = existing.filter((event) => event.type === 'tool.called').length;
      this.session.updated_at = existing[existing.length - 1]?.occurred_at || this.session.updated_at;
      const recoveredFrom = this.session.status;
      if (this.session.status === 'running') await this.setStatus('waiting_user');
      await this.log.append({
        session_id: this.session.session_id,
        type: 'session.restored',
        data: {
          recovered_from: recoveredFrom,
          status: this.session.status,
          review_required: recoveredFrom === 'running',
        },
      });
      this.initialized = true;
      return;
    }
    await this.log.append({
      session_id: this.session.session_id,
      event_id: `${this.session.session_id}:created`,
      type: 'session.created',
      occurred_at: this.session.created_at,
      data: asJsonObject(this.session),
    });
    this.initialized = true;
  }

  getSession(): FrostAgentSession { return structuredClone(this.session); }

  async followup(content: JsonObject, source: FrostInboxSource = 'user'): Promise<FrostInboxItem> {
    return this.enqueue('followup', content, source, true);
  }

  async steer(content: JsonObject, source: FrostInboxSource = 'user'): Promise<FrostInboxItem> {
    return this.enqueue('steer', content, source, true);
  }

  async inject(content: JsonObject, source: FrostInboxSource = 'system'): Promise<FrostInboxItem> {
    return this.enqueue('inject', content, source, false);
  }

  async cancel(reason = 'cancelled_by_user'): Promise<void> {
    if (this.session.status === 'stopped') return;
    this.cancelledReason = reason;
    this.currentAbort?.abort(reason);
    const removed = this.inbox.clear();
    for (const item of removed) {
      await this.log.append({
        session_id: this.session.session_id,
        type: 'inbox.discarded',
        data: { message_id: item.message_id, reason },
      });
    }
    if (!this.driver) await this.stopSession(reason, 'stopped');
  }

  whenIdle(): Promise<void> {
    if (!this.driver) return Promise.resolve();
    return new Promise((resolve) => { this.idleWaiters.add(resolve); });
  }

  private async enqueue(mode: FrostInboxMode, content: JsonObject, source: FrostInboxSource, wake: boolean): Promise<FrostInboxItem> {
    if (this.session.status === 'stopped' || this.session.status === 'failed') throw new Error(`agent_session_closed:${this.session.status}`);
    const item = this.inbox.enqueue({ mode, source, content });
    await this.log.append({
      session_id: this.session.session_id,
      event_id: `${this.session.session_id}:${item.message_id}:queued`,
      type: 'inbox.queued',
      data: asJsonObject(item),
    });
    if (wake) this.wake();
    return item;
  }

  private wake(): void {
    this.wakeLatched = true;
    if (this.driver) return;
    this.driver = this.drive().finally(() => {
      this.driver = null;
      if (this.wakeLatched || this.inbox.hasWakingInput()) this.wake();
      else {
        for (const resolve of this.idleWaiters) resolve();
        this.idleWaiters.clear();
      }
    });
  }

  private async drive(): Promise<void> {
    while (!this.cancelledReason) {
      this.wakeLatched = false;
      let input = this.inbox.claim('next-turn');
      if (input.length === 0) input = this.inbox.claim('next-step');
      if (input.length === 0) break;
      await this.claimed(input);
      await this.runTurn(input);
      if (!this.inbox.hasWakingInput()) break;
    }
  }

  private async runTurn(initialInput: FrostInboxItem[]): Promise<void> {
    const startedAt = this.now().getTime();
    this.session.counters.turns += 1;
    const turn = this.session.counters.turns;
    await this.setStatus('running');
    await this.log.append({ session_id: this.session.session_id, type: 'turn.started', data: { turn } });
    await this.recordInputs(initialInput);
    const turnBudget = { toolCalls: 0 };

    for (let localStep = 1; localStep <= this.maxSteps; localStep += 1) {
      if (this.cancelledReason) return this.endCancelledTurn(turn, this.cancelledReason);
      if (this.now().getTime() - startedAt > this.deadlineMs) return this.failTurn(turn, 'agent_deadline_exceeded');

      const injected = this.inbox.claim('next-step');
      if (injected.length > 0) {
        await this.claimed(injected);
        await this.recordInputs(injected);
      }

      this.session.counters.steps += 1;
      const step = this.session.counters.steps;
      await this.log.append({ session_id: this.session.session_id, type: 'step.started', data: { turn, step } });
      this.currentAbort = new AbortController();

      let rawDecision: unknown;
      try {
        rawDecision = await this.model.decide({
          session: this.getSession(),
          events: await this.log.list(this.session.session_id),
          turn,
          step,
          signal: this.currentAbort.signal,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'model_decision_failed';
        if (this.cancelledReason) return this.endCancelledTurn(turn, this.cancelledReason);
        return this.failTurn(turn, message);
      }

      const validation = validateFrostAgentDecision(rawDecision);
      if (!validation.ok || !validation.value) {
        await this.log.append({
          session_id: this.session.session_id,
          type: 'decision.invalid',
          data: { turn, step, errors: validation.errors },
        });
        return this.failTurn(turn, 'invalid_model_decision');
      }
      const decision = validation.value;
      await this.log.append({
        session_id: this.session.session_id,
        type: 'decision.recorded',
        data: asJsonObject({ turn, step, decision }),
      });

      const outcome = await this.applyDecision(turn, step, decision, turnBudget);
      if (outcome !== 'continue') return;
    }
    await this.failTurn(turn, 'max_steps_exceeded');
  }

  private async applyDecision(
    turn: number,
    step: number,
    decision: FrostAgentDecision,
    turnBudget: { toolCalls: number },
  ): Promise<'continue' | 'ended'> {
    const action = decision.next_action;
    const call = actionToolCall(action);
    if (call) {
      if (turnBudget.toolCalls >= this.maxToolCalls) {
        await this.failTurn(turn, 'max_tool_calls_exceeded');
        return 'ended';
      }
      turnBudget.toolCalls += 1;
      this.session.counters.tool_calls += 1;
      const callId = `${this.session.session_id}:tool:${this.session.counters.tool_calls}`;
      await this.log.append({
        session_id: this.session.session_id,
        type: 'tool.called',
        data: { turn, step, call_id: callId, tool: call.name, arguments: structuredClone(call.input) },
      });
      const result = await this.executeTool(call.name, call.input, callId);
      await this.log.append({
        session_id: this.session.session_id,
        type: 'tool.result',
        data: asJsonObject({ turn, step, call_id: callId, tool: call.name, result }),
      });
      await this.log.append({ session_id: this.session.session_id, type: 'step.ended', data: { turn, step, outcome: result.status } });
      if (result.status === 'waiting_user') {
        await this.setStatus('waiting_user');
        await this.log.append({ session_id: this.session.session_id, type: 'turn.ended', data: { turn, outcome: 'waiting_user' } });
        return 'ended';
      }
      if (result.status === 'waiting_external') {
        await this.setStatus('waiting_external');
        await this.log.append({ session_id: this.session.session_id, type: 'turn.ended', data: { turn, outcome: 'waiting_external' } });
        return 'ended';
      }
      if (result.status === 'cancelled') {
        await this.endCancelledTurn(turn, result.message || 'tool_cancelled');
        return 'ended';
      }
      return 'continue';
    }

    if (action.type === 'ask_user') {
      await this.log.append({ session_id: this.session.session_id, type: 'assistant.message', data: { turn, step, text: action.question, reason: action.reason } });
      await this.log.append({ session_id: this.session.session_id, type: 'step.ended', data: { turn, step, outcome: 'waiting_user' } });
      await this.setStatus('waiting_user');
      await this.log.append({ session_id: this.session.session_id, type: 'turn.ended', data: { turn, outcome: 'waiting_user' } });
      return 'ended';
    }
    if (action.type === 'wait_external') {
      await this.log.append({ session_id: this.session.session_id, type: 'step.ended', data: { turn, step, outcome: 'waiting_external', reason: action.reason } });
      await this.setStatus('waiting_external');
      await this.log.append({ session_id: this.session.session_id, type: 'turn.ended', data: { turn, outcome: 'waiting_external' } });
      return 'ended';
    }
    if (action.type === 'complete') {
      await this.log.append({
        session_id: this.session.session_id,
        type: 'assistant.message',
        data: { turn, step, text: action.summary, evidence_ids: action.evidence_ids },
      });
      await this.log.append({ session_id: this.session.session_id, type: 'step.ended', data: { turn, step, outcome: 'completed' } });
      await this.setStatus('idle');
      await this.log.append({ session_id: this.session.session_id, type: 'turn.ended', data: { turn, outcome: 'completed' } });
      return 'ended';
    }
    if (action.type === 'safe_stop') {
      await this.log.append({ session_id: this.session.session_id, type: 'step.ended', data: { turn, step, outcome: 'safe_stopped', reason: action.reason } });
      await this.stopSession(action.reason, 'stopped');
      await this.log.append({ session_id: this.session.session_id, type: 'turn.ended', data: { turn, outcome: 'safe_stopped' } });
      return 'ended';
    }
    return 'continue';
  }

  private async executeTool(name: string, input: JsonObject, callId: string): Promise<FrostAgentToolResult> {
    if (!this.currentAbort) this.currentAbort = new AbortController();
    try {
      return await this.tools.execute(name, input, {
        session: this.getSession(),
        call_id: callId,
        signal: this.currentAbort.signal,
        events: await this.log.list(this.session.session_id),
      });
    } catch (error) {
      if (this.currentAbort.signal.aborted) return { status: 'cancelled', data: {}, message: this.cancelledReason || 'tool_cancelled' };
      return { status: 'error', data: { tool: name }, message: error instanceof Error ? error.message : 'tool_execution_failed' };
    } finally {
      this.currentAbort = null;
    }
  }

  private async recordInputs(items: FrostInboxItem[]): Promise<void> {
    for (const item of items) {
      await this.log.append({
        session_id: this.session.session_id,
        type: item.mode === 'inject' ? 'context.injected' : 'user.message',
        data: asJsonObject(item),
      });
    }
  }

  private async claimed(items: FrostInboxItem[]): Promise<void> {
    for (const item of items) {
      await this.log.append({
        session_id: this.session.session_id,
        event_id: `${this.session.session_id}:${item.message_id}:claimed`,
        type: 'inbox.claimed',
        data: { message_id: item.message_id, target: item.target, mode: item.mode },
      });
    }
  }

  private async setStatus(status: FrostAgentStatus): Promise<void> {
    if (this.session.status === status) return;
    const previous = this.session.status;
    this.session.status = status;
    this.session.updated_at = this.now().toISOString();
    await this.log.append({
      session_id: this.session.session_id,
      type: 'session.status_changed',
      data: { previous, status },
    });
  }

  private async stopSession(reason: string, status: 'stopped' | 'failed'): Promise<void> {
    await this.setStatus(status);
    await this.log.append({ session_id: this.session.session_id, type: 'session.stopped', data: { reason, status } });
  }

  private async endCancelledTurn(turn: number, reason: string): Promise<void> {
    await this.stopSession(reason, 'stopped');
    await this.log.append({ session_id: this.session.session_id, type: 'turn.ended', data: { turn, outcome: 'cancelled', reason } });
  }

  private async failTurn(turn: number, reason: string): Promise<void> {
    await this.stopSession(reason, 'failed');
    await this.log.append({ session_id: this.session.session_id, type: 'turn.ended', data: { turn, outcome: 'failed', reason } });
  }
}

export function completeDecision(summary: string, evidenceIds: string[] = []): FrostAgentDecision {
  return {
    protocol: FROST_AGENT_DECISION_PROTOCOL,
    goal: summary,
    observations: [],
    next_action: { type: 'complete', summary, evidence_ids: evidenceIds },
    confidence: 1,
    risk: 'low',
    success_condition: summary,
  };
}
