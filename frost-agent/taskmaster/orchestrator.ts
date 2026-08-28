import {
  EFFECT_RECORD_PROTOCOL,
  TASK_PROTOCOL,
  type EffectRecord,
  type FrostTaskAction,
  type FrostTaskRequest,
  type FrostTaskSession,
  type HealthSkillDefinition,
  type JsonObject,
  type TaskSignal,
  validateTaskSignal,
} from './contracts';
import { afterToolUse, beforeTaskComplete, beforeToolUse } from './hooks';
import { authorizeTask } from './policy';
import { HealthSkillRegistry } from './registry';
import type { TaskmasterStore } from './store';
import type { TaskmasterToolRegistry, ToolResult } from './tools';
import { createTraceEvent, type TraceSink } from './trace';

export interface TaskmasterOptions {
  max_steps?: number;
  max_tool_calls?: number;
  timeout_ms?: number;
}

const toolsForTask: Record<FrostTaskRequest['kind'], string[]> = {
  log_meal: ['meal.observe', 'meal.commit'],
  start_workout: ['motion.guide'],
  plan_run_route: ['route.plan'],
  complete_run: ['run.finalize', 'map.plant_private_tree'],
  capture_nature: ['nature.observe'],
  daily_review: ['memory.daily_summary'],
};

function requestValid(request: FrostTaskRequest): boolean {
  return Boolean(request.task_id && request.user_id && !Number.isNaN(Date.parse(request.requested_at)) && request.input && typeof request.input === 'object');
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

function effectfulPermission(permission: FrostTaskAction['permission']): boolean {
  return permission.startsWith('write:') || permission.startsWith('publish:') || permission.startsWith('notify:');
}

export class FrostHealthTaskmaster {
  private readonly maxSteps: number;
  private readonly maxToolCalls: number;
  private readonly timeoutMs: number;

  constructor(
    private readonly store: TaskmasterStore,
    private readonly tools: TaskmasterToolRegistry,
    private readonly traces: TraceSink,
    private readonly skills = new HealthSkillRegistry(),
    options: TaskmasterOptions = {},
  ) {
    this.maxSteps = options.max_steps ?? 8;
    this.maxToolCalls = options.max_tool_calls ?? 8;
    this.timeoutMs = options.timeout_ms ?? 5 * 60 * 1000;
  }

  async start(request: FrostTaskRequest): Promise<FrostTaskSession> {
    if (!requestValid(request)) throw new Error('invalid_task_request');
    const existing = await this.store.getTask(request.task_id);
    if (existing) {
      if (canonical(existing.request) !== canonical(request)) throw new Error(`task_request_conflict:${request.task_id}`);
      return existing;
    }
    const skill = this.skills.forTask(request.kind);
    const actions = this.planActions(request, skill);
    const now = new Date().toISOString();
    const session: FrostTaskSession = {
      protocol: TASK_PROTOCOL,
      task_id: request.task_id,
      run_id: `${request.task_id}:${Date.now().toString(36)}`,
      request: structuredClone(request),
      skill_id: skill.skill_id,
      status: 'created',
      actions,
      next_action_index: 0,
      confirmed_action_ids: [],
      source_event_ids: [],
      created_at: now,
      updated_at: now,
      limits: {
        max_steps: this.maxSteps,
        max_tool_calls: this.maxToolCalls,
        deadline_at: new Date(Date.now() + this.timeoutMs).toISOString(),
      },
      counters: { steps: 0, tool_calls: 0 },
    };
    await this.store.saveTask(session);
    await this.trace(session, 'task.created', 'taskmaster', `创建 ${skill.title} 任务`, { skill_id: skill.skill_id });
    const taskPolicy = authorizeTask(request);
    if (!taskPolicy.allowed) {
      session.status = 'safe_stopped';
      session.error = taskPolicy.reason;
      await this.persist(session);
      await this.trace(session, 'task.stopped', 'policy', '安全规则停止任务', { reason: taskPolicy.reason });
      return session;
    }
    session.status = 'planned';
    await this.persist(session);
    await this.trace(session, 'task.planned', 'taskmaster', `已规划 ${actions.length} 个有界动作`, { action_count: actions.length });
    return this.advance(session, skill);
  }

  async confirm(taskId: string, actionId: string): Promise<FrostTaskSession> {
    const session = await this.requireTask(taskId);
    if (session.status === 'completed' || session.status === 'safe_stopped' || session.status === 'failed') return session;
    const action = session.actions.find((item) => item.action_id === actionId);
    if (!action || action.status !== 'waiting_confirmation') throw new Error('action_not_waiting_confirmation');
    if (!session.confirmed_action_ids.includes(actionId)) session.confirmed_action_ids.push(actionId);
    action.status = 'pending';
    const skill = this.requireSkill(session.skill_id);
    return this.advance(session, skill);
  }

  async resume(taskId: string): Promise<FrostTaskSession> {
    const session = await this.requireTask(taskId);
    if (!['waiting_external', 'planned', 'running'].includes(session.status)) return session;
    const action = session.actions[session.next_action_index];
    if (action?.status === 'waiting_external') action.status = 'pending';
    return this.advance(session, this.requireSkill(session.skill_id));
  }

  /** Skill、设备和子 Agent 的唯一异步回传入口。重复 signal_id 只返回当前 checkpoint。 */
  async signal(value: TaskSignal): Promise<FrostTaskSession> {
    const validation = validateTaskSignal(value);
    if (!validation.ok || !validation.value) throw new Error(`invalid_task_signal:${validation.errors.join('|')}`);
    const signal = validation.value;
    const session = await this.requireTask(signal.task_id);
    const existing = await this.store.getTaskSignal(signal.signal_id);
    if (existing) {
      await this.store.appendTaskSignal(signal);
      return session;
    }
    if (session.run_id !== signal.run_id) throw new Error('signal_run_mismatch');
    const action = session.actions.find((item) => item.action_id === signal.action_id);
    if (!action || action.correlation_id !== signal.correlation_id) throw new Error('signal_correlation_mismatch');
    if (session.actions[session.next_action_index]?.action_id !== action.action_id || action.status !== 'waiting_external') {
      throw new Error('signal_action_not_waiting');
    }
    await this.store.appendTaskSignal(signal);
    await this.trace(session, 'signal.received', signal.actor === 'device' ? 'device' : signal.actor === 'user' ? 'user' : 'tool', `收到 ${signal.kind}`, { signal_id: signal.signal_id, action_id: action.action_id });
    if (signal.kind === 'cancel') {
      action.status = 'skipped';
      session.status = 'safe_stopped';
      session.error = 'cancelled_by_signal';
      await this.persist(session);
      await this.trace(session, 'task.stopped', 'user', '任务被取消信号安全停止', { signal_id: signal.signal_id });
      return session;
    }
    if (signal.kind === 'tool_error') {
      const message = typeof signal.payload.error === 'string' ? signal.payload.error : 'external_tool_failed';
      action.status = 'failed';
      action.error = message;
      await this.trace(session, 'tool.failed', 'tool', `${action.tool} 外部执行失败`, { action_id: action.action_id, signal_id: signal.signal_id, error: message });
      return this.fail(session, message);
    }
    await this.completeAction(session, action, { status: 'success', data: signal.payload, events: signal.events }, {});
    return this.advance(session, this.requireSkill(session.skill_id));
  }

  async get(taskId: string): Promise<FrostTaskSession | null> { return this.store.getTask(taskId); }

  private planActions(request: FrostTaskRequest, skill: HealthSkillDefinition): FrostTaskAction[] {
    return toolsForTask[request.kind].map((name, index) => {
      const step = skill.steps.find((item) => item.tool === name);
      const tool = this.tools.get(name);
      if (!step || !tool) throw new Error(`taskmaster_dependency_missing:${name}`);
      return {
        action_id: `${request.task_id}:action:${index + 1}`,
        correlation_id: `${request.task_id}:action:${index + 1}:correlation:v1`,
        tool: name,
        purpose: step.purpose,
        input: structuredClone(request.input),
        permission: tool.permission,
        requires_confirmation: step.requires_confirmation,
        status: 'pending',
      };
    });
  }

  private async advance(session: FrostTaskSession, skill: HealthSkillDefinition): Promise<FrostTaskSession> {
    const priorResults: Record<string, JsonObject> = {};
    for (const action of session.actions) if (action.result) priorResults[action.tool] = action.result;
    session.status = 'running';
    await this.persist(session);

    while (session.next_action_index < session.actions.length) {
      if (Date.now() > Date.parse(session.limits.deadline_at)) return this.fail(session, 'task_deadline_exceeded');
      if (session.counters.steps >= session.limits.max_steps) return this.fail(session, 'max_steps_exceeded');
      if (session.counters.tool_calls >= session.limits.max_tool_calls) return this.fail(session, 'max_tool_calls_exceeded');

      const action = session.actions[session.next_action_index];
      const confirmed = session.confirmed_action_ids.includes(action.action_id);
      const hook = beforeToolUse(skill, action, confirmed);
      if (hook.outcome === 'block') {
        action.status = 'failed'; action.error = hook.reason;
        await this.trace(session, 'tool.blocked', 'policy', `阻止工具 ${action.tool}`, { action_id: action.action_id, reason: hook.reason });
        return this.fail(session, hook.reason);
      }
      if (hook.outcome === 'ask') {
        action.status = 'waiting_confirmation';
        session.status = 'waiting_confirmation';
        await this.persist(session);
        await this.trace(session, 'task.waiting', 'policy', `等待用户确认：${action.purpose}`, { action_id: action.action_id, tool: action.tool });
        return session;
      }

      if (await this.recoverCommittedEffect(session, action, priorResults)) continue;

      const tool = this.tools.get(action.tool);
      if (!tool) return this.fail(session, `tool_not_found:${action.tool}`);
      const effect = await this.prepareEffect(session, action);
      action.status = 'running';
      session.counters.steps += 1;
      session.counters.tool_calls += 1;
      await this.persist(session);
      await this.trace(session, 'tool.requested', 'taskmaster', `调用 ${action.tool}`, { action_id: action.action_id, permission: action.permission });
      try {
        const result = await tool.execute(action.input, {
          request: session.request,
          store: this.store,
          prior_results: priorResults,
          idempotency_key: effect?.idempotency_key || action.correlation_id,
        });
        if (result.status === 'waiting_external') {
          action.status = 'waiting_external';
          session.status = 'waiting_external';
          await this.persist(session);
          await this.trace(session, 'task.waiting', 'tool', result.message || '等待外部适配器', { action_id: action.action_id, tool: action.tool });
          return session;
        }
        await this.completeAction(session, action, result, priorResults);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'tool_execution_failed';
        action.status = 'failed'; action.error = message;
        if (effect) await this.failEffect(effect, message);
        await this.trace(session, 'tool.failed', 'tool', `${action.tool} 执行失败`, { action_id: action.action_id, error: message });
        return this.fail(session, message);
      }
    }

    try {
      beforeTaskComplete(session);
      session.status = 'completed';
      await this.persist(session);
      await this.trace(session, 'task.completed', 'taskmaster', '任务通过证据门并完成', { source_event_count: session.source_event_ids.length });
      return session;
    } catch (error) {
      return this.fail(session, error instanceof Error ? error.message : 'completion_gate_failed');
    }
  }

  private effectId(action: FrostTaskAction): string { return `effect:${action.action_id}`; }

  private async prepareEffect(session: FrostTaskSession, action: FrostTaskAction): Promise<EffectRecord | null> {
    if (!effectfulPermission(action.permission)) return null;
    const id = this.effectId(action);
    const existing = await this.store.getEffect(id);
    if (existing) return existing;
    const now = new Date().toISOString();
    const effect: EffectRecord = {
      protocol: EFFECT_RECORD_PROTOCOL,
      effect_id: id,
      idempotency_key: `${session.run_id}:${action.action_id}:v1`,
      task_id: session.task_id,
      run_id: session.run_id,
      action_id: action.action_id,
      permission: action.permission,
      status: 'proposed',
      input: structuredClone(action.input),
      event_ids: [],
      created_at: now,
      updated_at: now,
    };
    await this.store.saveEffect(effect);
    await this.trace(session, 'effect.proposed', 'taskmaster', `登记副作用 ${action.tool}`, { effect_id: id, action_id: action.action_id, permission: action.permission });
    effect.status = 'approved';
    effect.updated_at = new Date().toISOString();
    await this.store.saveEffect(effect);
    return effect;
  }

  private async recoverCommittedEffect(session: FrostTaskSession, action: FrostTaskAction, priorResults: Record<string, JsonObject>): Promise<boolean> {
    const effect = await this.store.getEffect(this.effectId(action));
    if (effect?.status !== 'committed') return false;
    action.status = 'completed';
    action.result = structuredClone(effect.result || {});
    priorResults[action.tool] = structuredClone(action.result);
    for (const eventId of effect.event_ids) if (!session.source_event_ids.includes(eventId)) session.source_event_ids.push(eventId);
    session.next_action_index += 1;
    await this.persist(session);
    await this.trace(session, 'tool.completed', 'taskmaster', `从 Effect Ledger 恢复 ${action.tool}`, { action_id: action.action_id, effect_id: effect.effect_id });
    return true;
  }

  private async completeAction(session: FrostTaskSession, action: FrostTaskAction, result: ToolResult, priorResults: Record<string, JsonObject>): Promise<void> {
    afterToolUse(result.events);
    const eventIds: string[] = [];
    for (const event of result.events || []) {
      await this.store.appendHealthEvent(event);
      eventIds.push(event.event_id);
      if (!session.source_event_ids.includes(event.event_id)) session.source_event_ids.push(event.event_id);
    }
    let effect = await this.store.getEffect(this.effectId(action));
    if (!effect && eventIds.length > 0) {
      const now = new Date().toISOString();
      effect = {
        protocol: EFFECT_RECORD_PROTOCOL,
        effect_id: this.effectId(action),
        idempotency_key: `${session.run_id}:${action.action_id}:v1`,
        task_id: session.task_id,
        run_id: session.run_id,
        action_id: action.action_id,
        permission: 'write:health_events',
        status: 'approved',
        input: structuredClone(action.input),
        event_ids: [],
        created_at: now,
        updated_at: now,
      };
      await this.store.saveEffect(effect);
      await this.trace(session, 'effect.proposed', 'taskmaster', `登记健康事实写入 ${action.tool}`, { effect_id: effect.effect_id, action_id: action.action_id, permission: effect.permission });
    }
    if (effect) {
      effect.status = 'committed';
      effect.result = structuredClone(result.data);
      effect.event_ids = [...new Set([...effect.event_ids, ...eventIds])];
      effect.updated_at = new Date().toISOString();
      await this.store.saveEffect(effect);
      await this.trace(session, 'effect.committed', 'taskmaster', `提交副作用 ${action.tool}`, { effect_id: effect.effect_id, event_count: effect.event_ids.length });
    }
    action.status = 'completed';
    action.result = structuredClone(result.data);
    priorResults[action.tool] = structuredClone(result.data);
    session.next_action_index += 1;
    await this.persist(session);
    await this.trace(session, 'tool.completed', 'tool', `完成 ${action.tool}`, { action_id: action.action_id, emitted_events: eventIds.length });
  }

  private async failEffect(effect: EffectRecord, message: string): Promise<void> {
    if (effect.status === 'committed') return;
    effect.status = 'failed';
    effect.error = message;
    effect.updated_at = new Date().toISOString();
    await this.store.saveEffect(effect);
  }

  private async fail(session: FrostTaskSession, message: string): Promise<FrostTaskSession> {
    session.status = message.startsWith('safety_stop:') ? 'safe_stopped' : 'failed';
    session.error = message;
    await this.persist(session);
    await this.trace(session, 'task.stopped', message.startsWith('safety_stop:') ? 'policy' : 'taskmaster', message, { error: message });
    return session;
  }

  private async persist(session: FrostTaskSession): Promise<void> {
    session.updated_at = new Date().toISOString();
    await this.store.saveTask(session);
  }

  private async requireTask(taskId: string): Promise<FrostTaskSession> {
    const task = await this.store.getTask(taskId);
    if (!task) throw new Error(`task_not_found:${taskId}`);
    return task;
  }

  private requireSkill(skillId: string): HealthSkillDefinition {
    const skill = this.skills.load(skillId);
    if (!skill) throw new Error(`skill_not_found:${skillId}`);
    return skill;
  }

  private async trace(session: FrostTaskSession, type: Parameters<typeof createTraceEvent>[0]['type'], actor: Parameters<typeof createTraceEvent>[0]['actor'], detail: string, data: JsonObject): Promise<void> {
    await this.traces.append(createTraceEvent({ run_id: session.run_id, task_id: session.task_id, type, actor, detail, data }));
  }
}
