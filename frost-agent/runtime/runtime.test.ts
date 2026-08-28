import { describe, expect, it } from 'vitest';
import { HEALTH_EVENT_PROTOCOL, TASK_SIGNAL_PROTOCOL, type FrostTaskRequest, type HealthEvent, type JsonObject } from '../taskmaster/contracts';
import { FrostHealthTaskmaster } from '../taskmaster/orchestrator';
import { InMemoryTaskmasterStore } from '../taskmaster/store';
import { createDefaultTools } from '../taskmaster/tools';
import { InMemoryTraceSink } from '../taskmaster/trace';
import { FrostAgentLoop } from './agentLoop';
import { InMemoryFrostApprovalStore, issueFrostApproval, ReceiptApprovalGate } from './approval';
import { FROST_AGENT_DECISION_PROTOCOL, type FrostAgentDecision, type FrostAgentModelAdapter } from './contracts';
import { FrostInbox } from './inbox';
import { createFrostGoal, FrostGoalDriver, InMemoryFrostGoalStore } from './goalDriver';
import { IndexedDbFrostSessionLog } from './indexedDbSessionLog';
import { LocalHealthFallbackModel } from './localHealthModel';
import { buildFrostDecisionPrompt, QwenFrostModelAdapter } from './qwenModelAdapter';
import { InMemoryFrostSessionLog } from './sessionLog';
import { createSkillAgentTools, TaskmasterSkillProvider } from './skillCatalog';
import { createTaskmasterAgentTools } from './taskmasterAdapter';
import { FrostAgentToolRegistry } from './toolRegistry';

const at = '2026-08-20T00:00:00.000Z';

function decision(next_action: FrostAgentDecision['next_action'], goal = '完成测试目标'): FrostAgentDecision {
  return {
    protocol: FROST_AGENT_DECISION_PROTOCOL,
    goal,
    observations: [],
    next_action,
    confidence: 1,
    risk: 'low',
    success_condition: goal,
  };
}

describe('Frost Harness session log and inbox', () => {
  it('keeps contiguous immutable events and idempotent explicit ids', async () => {
    const log = new InMemoryFrostSessionLog();
    log.subscribe(() => { throw new Error('observer_failure_must_not_rollback'); });
    const first = await log.append({ session_id: 'session-1', event_id: 'event-1', type: 'user.message', occurred_at: at, data: { text: '开始' } });
    const duplicate = await log.append({ session_id: 'session-1', event_id: 'event-1', type: 'user.message', data: { text: '开始' } });
    const second = await log.append({ session_id: 'session-1', type: 'assistant.message', data: { text: '继续' } });
    first.data.text = 'mutated';

    expect(duplicate).toEqual(expect.objectContaining({ event_id: 'event-1', seq: 1 }));
    expect(second.seq).toBe(2);
    expect((await log.list('session-1')).map((event) => event.seq)).toEqual([1, 2]);
    expect((await log.list('session-1'))[0].data.text).toBe('开始');
    await expect(log.append({ session_id: 'session-1', event_id: 'event-1', type: 'user.message', data: { text: '冲突' } })).rejects.toThrow('agent_event_id_conflict');
  });

  it('keeps next-turn and next-step semantics distinct', () => {
    const inbox = new FrostInbox();
    inbox.enqueue({ message_id: 'followup', mode: 'followup', source: 'user', content: { text: '新目标' }, created_at: at });
    inbox.enqueue({ message_id: 'steer', mode: 'steer', source: 'user', content: { text: '先停一下' }, created_at: at });
    inbox.enqueue({ message_id: 'inject', mode: 'inject', source: 'system', content: { fact: '设备已完成' }, created_at: at });

    expect(inbox.claim('next-turn').map((item) => item.message_id)).toEqual(['followup']);
    expect(inbox.claim('next-step').map((item) => item.message_id)).toEqual(['steer', 'inject']);
    expect(inbox.has()).toBe(false);
  });

  it('uses an explicit memory fallback when browser IndexedDB is unavailable', async () => {
    const log = new IndexedDbFrostSessionLog('test-no-idb', null);
    await log.append({ session_id: 'fallback-session', type: 'user.message', data: { text: '本地保留' } });
    await expect(log.list('fallback-session')).resolves.toEqual([
      expect.objectContaining({ seq: 1, type: 'user.message', data: { text: '本地保留' } }),
    ]);
  });

  it('rehydrates counters and pauses an interrupted running turn for recovery review', async () => {
    const log = new InMemoryFrostSessionLog();
    const original = FrostAgentLoop.createSession('restore-session', 'user-1', new Date(at));
    await log.append({ session_id: original.session_id, type: 'session.created', data: original as unknown as JsonObject });
    await log.append({ session_id: original.session_id, type: 'session.status_changed', data: { previous: 'idle', status: 'running' } });
    await log.append({ session_id: original.session_id, type: 'turn.started', data: { turn: 2 } });
    await log.append({ session_id: original.session_id, type: 'step.started', data: { turn: 2, step: 4 } });
    await log.append({ session_id: original.session_id, type: 'tool.called', data: { tool: 'test.interrupted' } });
    const restored = new FrostAgentLoop(
      FrostAgentLoop.createSession('restore-session', 'user-1', new Date(at)),
      { async decide() { return decision({ type: 'complete', summary: '恢复', evidence_ids: [] }); } },
      new FrostAgentToolRegistry(),
      log,
    );

    await restored.initialize();

    expect(restored.getSession()).toEqual(expect.objectContaining({
      status: 'waiting_user',
      counters: { turns: 2, steps: 4, tool_calls: 1 },
    }));
    const restoredEvents = await log.list(original.session_id);
    expect(restoredEvents[restoredEvents.length - 1]).toEqual(expect.objectContaining({
      type: 'session.restored', data: expect.objectContaining({ recovered_from: 'running', review_required: true }),
    }));
  });
});

describe('Frost Agent Loop', () => {
  it('runs Decision → Tool → Observation for multiple steps without another click', async () => {
    let modelCalls = 0;
    const model: FrostAgentModelAdapter = {
      async decide() {
        modelCalls += 1;
        if (modelCalls <= 2) return decision({ type: 'call_tool', tool: 'test.echo', arguments: { pass: modelCalls } });
        return decision({ type: 'complete', summary: '两次工具调用完成', evidence_ids: ['echo-1', 'echo-2'] });
      },
    };
    const tools = new FrostAgentToolRegistry();
    tools.register({
      name: 'test.echo', description: 'echo', read_only: true, risk: 'low',
      async execute(input) { return { status: 'success', data: { echoed: input } }; },
    });
    const log = new InMemoryFrostSessionLog();
    const loop = new FrostAgentLoop(FrostAgentLoop.createSession('loop-1', 'user-1', new Date(at)), model, tools, log);
    await loop.initialize();
    await loop.followup({ text: '连续执行两次' });
    await loop.whenIdle();

    expect(loop.getSession()).toEqual(expect.objectContaining({ status: 'idle', counters: { turns: 1, steps: 3, tool_calls: 2 } }));
    const events = await log.list('loop-1');
    expect(events.filter((event) => event.type === 'tool.result')).toHaveLength(2);
    expect(events.map((event) => event.seq)).toEqual(events.map((_event, index) => index + 1));
    expect(events.find((event) => event.type === 'assistant.message')?.data.text).toBe('两次工具调用完成');
  });

  it('splices steer input into the next step while a tool is running', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let toolStarted!: () => void;
    const started = new Promise<void>((resolve) => { toolStarted = resolve; });
    let modelCalls = 0;
    let sawSteer = false;
    const model: FrostAgentModelAdapter = {
      async decide(context) {
        modelCalls += 1;
        if (modelCalls === 1) return decision({ type: 'call_tool', tool: 'test.slow', arguments: {} });
        sawSteer = context.events.some((event) => event.type === 'user.message' && event.data.mode === 'steer');
        return decision({ type: 'complete', summary: '已采纳中途指令', evidence_ids: [] });
      },
    };
    const tools = new FrostAgentToolRegistry();
    tools.register({
      name: 'test.slow', description: 'slow', read_only: true, risk: 'low',
      async execute() {
        toolStarted();
        await gate;
        return { status: 'success', data: { finished: true } };
      },
    });
    const loop = new FrostAgentLoop(FrostAgentLoop.createSession('loop-steer', 'user-1', new Date(at)), model, tools, new InMemoryFrostSessionLog());
    await loop.initialize();
    await loop.followup({ text: '开始' });
    await started;
    await loop.steer({ text: '下一步改成轻量动作' });
    release();
    await loop.whenIdle();

    expect(sawSteer).toBe(true);
    expect(loop.getSession().status).toBe('idle');
  });
});

describe('Frost Goal Driver', () => {
  it('claims a durable goal by revision and runs exactly one autonomous round', async () => {
    const log = new InMemoryFrostSessionLog();
    const loop = new FrostAgentLoop(
      FrostAgentLoop.createSession('goal-session', 'user-1', new Date(at)),
      { async decide() { return decision({ type: 'complete', summary: '目标轮次完成', evidence_ids: [] }); } },
      new FrostAgentToolRegistry(),
      log,
      { now: () => new Date(at) },
    );
    await loop.initialize();
    const store = new InMemoryFrostGoalStore();
    await store.create(createFrostGoal({
      goal_id: 'goal-1', session_id: 'goal-session', user_id: 'user-1', objective: '生成今日轻量运动建议', now: new Date(at),
    }));
    const driver = new FrostGoalDriver(loop, store, { now: () => new Date(at) });

    const claims = await Promise.all([driver.runDue(), driver.runDue()]);

    expect(claims.flat()).toEqual(['goal-1']);
    await expect(store.get('goal-1')).resolves.toEqual(expect.objectContaining({
      status: 'completed', revision: 3, budget: { rounds: 1, max_rounds: 1 },
    }));
    const events = await log.list('goal-session');
    expect(events.filter((event) => event.type === 'turn.started')).toHaveLength(1);
    expect(events.some((event) => event.type === 'user.message' && event.data.source === 'goal')).toBe(true);
  });
});

describe('Frost Skill disclosure and Qwen decision boundary', () => {
  it('keeps only the semantic catalog resident and loads one exact skill on demand', async () => {
    const provider = new TaskmasterSkillProvider();
    const tools = new FrostAgentToolRegistry();
    for (const tool of createSkillAgentTools(provider)) tools.register(tool);
    const session = FrostAgentLoop.createSession('skill-session', 'user-1', new Date(at));
    const context = { session, call_id: 'skill-call', signal: new AbortController().signal, events: [] };

    const catalog = await tools.execute('skill.catalog', {}, context);
    const loaded = await tools.execute('skill.load', { skill_id: 'frost.her-motion-warmup' }, context);

    expect(catalog.status).toBe('success');
    expect(JSON.stringify(catalog.data)).not.toContain('capture:camera');
    expect(loaded).toEqual(expect.objectContaining({ status: 'success', data: expect.objectContaining({ digest: expect.stringMatching(/^fnv1a32:/) }) }));
    expect(JSON.stringify(loaded.data)).toContain('capture:camera');
  });

  it('builds a bounded Qwen prompt and accepts fenced strict JSON without exposing hidden reasoning', async () => {
    const provider = new TaskmasterSkillProvider();
    const tools = new FrostAgentToolRegistry();
    for (const tool of createSkillAgentTools(provider)) tools.register(tool);
    const session = FrostAgentLoop.createSession('qwen-session', 'user-1', new Date(at));
    const events = [{
      protocol: 'frost-agent-event/v1' as const, event_id: 'e1', session_id: session.session_id,
      seq: 1, type: 'user.message' as const, occurred_at: at, data: { text: '带我做瑜伽' },
    }];
    const context = { session, events, turn: 1, step: 1, signal: new AbortController().signal };
    const prompt = buildFrostDecisionPrompt(context, tools, provider, { max_context_chars: 2_000 });
    const model = new QwenFrostModelAdapter({
      async complete() {
        return '```json\n{"protocol":"frost-agent-decision/v1","goal":"开始瑜伽","observations":["用户请求瑜伽"],"next_action":{"type":"load_skill","skill_id":"frost.her-motion-warmup"},"confidence":0.98,"risk":"low","success_condition":"加载动作 Skill"}\n```';
      },
    }, tools, provider);

    expect(prompt).toContain('skill_catalog');
    expect(prompt).not.toContain('capture:camera');
    await expect(model.decide(context)).resolves.toEqual(expect.objectContaining({
      protocol: FROST_AGENT_DECISION_PROTOCOL,
      next_action: { type: 'load_skill', skill_id: 'frost.her-motion-warmup' },
    }));
  });

  it('preserves a tool call and its result as one context unit during compaction', () => {
    const provider = new TaskmasterSkillProvider();
    const tools = new FrostAgentToolRegistry();
    const session = FrostAgentLoop.createSession('compact-session', 'user-1', new Date(at));
    const events = [
      { protocol: 'frost-agent-event/v1' as const, event_id: 'call', session_id: session.session_id, seq: 1, type: 'tool.called' as const, occurred_at: at, data: { call_id: 'pair-1', tool: 'test.echo' } },
      { protocol: 'frost-agent-event/v1' as const, event_id: 'noise', session_id: session.session_id, seq: 2, type: 'user.message' as const, occurred_at: at, data: { text: 'x'.repeat(500) } },
      { protocol: 'frost-agent-event/v1' as const, event_id: 'result', session_id: session.session_id, seq: 3, type: 'tool.result' as const, occurred_at: at, data: { call_id: 'pair-1', tool: 'test.echo', result: { status: 'success' } } },
    ];

    const prompt = buildFrostDecisionPrompt(
      { session, events, turn: 1, step: 2, signal: new AbortController().signal },
      tools,
      provider,
      { max_events: 2, max_context_chars: 5_000 },
    );

    expect(prompt).toContain('"type":"tool.called"');
    expect(prompt).toContain('"type":"tool.result"');
    expect(prompt.match(/pair-1/g)).toHaveLength(2);
  });
});

describe('Frost Tool Pipeline', () => {
  it('fails closed for approval tools, validates input, enforces timeout, and deep-freezes results', async () => {
    let executed = 0;
    const tools = new FrostAgentToolRegistry({ default_timeout_ms: 20 });
    tools.register({
      name: 'test.approval', description: 'approval', read_only: false, risk: 'high', requires_approval: true,
      async execute() { executed += 1; return { status: 'success', data: { changed: true } }; },
    });
    tools.register({
      name: 'test.validated', description: 'validated', read_only: true, risk: 'low',
      validate_input: (input) => typeof input.value === 'string' ? [] : ['value_required'],
      async execute() { return { status: 'success', data: { nested: { frozen: true } } }; },
    });
    tools.register({
      name: 'test.timeout', description: 'timeout', read_only: true, risk: 'low', timeout_ms: 5,
      async execute() { return new Promise(() => {}); },
    });
    const context = {
      session: FrostAgentLoop.createSession('tool-session', 'user-1', new Date(at)),
      call_id: 'tool-call', signal: new AbortController().signal, events: [],
    };

    await expect(tools.execute('test.approval', {}, context)).resolves.toEqual(expect.objectContaining({ status: 'waiting_user' }));
    await expect(tools.execute('test.validated', {}, context)).resolves.toEqual(expect.objectContaining({ status: 'error', message: expect.stringContaining('value_required') }));
    const success = await tools.execute('test.validated', { value: 'ok' }, context);
    await expect(tools.execute('test.timeout', {}, context)).resolves.toEqual(expect.objectContaining({ status: 'error', message: 'tool_timeout' }));

    expect(executed).toBe(0);
    expect(Object.isFrozen(success)).toBe(true);
    expect(Object.isFrozen(success.data.nested)).toBe(true);
  });

  it('runs an approved side effect only after the injected approval gate allows it', async () => {
    let executed = 0;
    const tools = new FrostAgentToolRegistry({
      approval_gate: { async check() { return { decision: 'allow', reason: 'structured_user_approval' }; } },
    });
    tools.register({
      name: 'test.approved', description: 'approved', read_only: false, risk: 'high', requires_approval: true,
      async execute() { executed += 1; return { status: 'success', data: { committed: true } }; },
    });
    const result = await tools.execute('test.approved', {}, {
      session: FrostAgentLoop.createSession('approved-session', 'user-1', new Date(at)),
      call_id: 'approved-call', signal: new AbortController().signal, events: [],
    });
    expect(result.status).toBe('success');
    expect(executed).toBe(1);
  });

  it('binds a single-use approval receipt to the exact session, tool, and arguments', async () => {
    const approvals = new InMemoryFrostApprovalStore();
    const tools = new FrostAgentToolRegistry({ approval_gate: new ReceiptApprovalGate(approvals, () => new Date(at)) });
    let executions = 0;
    tools.register({
      name: 'test.commit', description: 'commit', read_only: false, risk: 'high', requires_approval: true,
      async execute() { executions += 1; return { status: 'success', data: { committed: true } }; },
    });
    const context = {
      session: FrostAgentLoop.createSession('receipt-session', 'user-1', new Date(at)),
      call_id: 'receipt-call', signal: new AbortController().signal, events: [],
    };
    await issueFrostApproval(approvals, {
      approval_id: 'approval-1', session_id: context.session.session_id, tool: 'test.commit',
      arguments: { record_id: 'expected' }, decision: 'allow', reason: 'user_confirmed', issued_at: at,
    });

    await expect(tools.execute('test.commit', { record_id: 'different' }, context)).resolves.toEqual(expect.objectContaining({ status: 'waiting_user' }));
    await expect(tools.execute('test.commit', { record_id: 'expected' }, context)).resolves.toEqual(expect.objectContaining({ status: 'success' }));
    await expect(tools.execute('test.commit', { record_id: 'expected' }, context)).resolves.toEqual(expect.objectContaining({ status: 'waiting_user' }));
    expect(executions).toBe(1);
  });
});

describe('Frost Agent Loop + existing Taskmaster', () => {
  it('creates, confirms, waits for Her Motion, then resumes from the external signal', async () => {
    const store = new InMemoryTaskmasterStore();
    const taskmaster = new FrostHealthTaskmaster(store, createDefaultTools(), new InMemoryTraceSink());
    const tools = new FrostAgentToolRegistry();
    for (const tool of createTaskmasterAgentTools(taskmaster)) tools.register(tool);

    const request: FrostTaskRequest = {
      task_id: 'agent-motion-session:task:2', user_id: 'user-1', kind: 'start_workout', requested_at: at,
      input: { exercise: '瑜伽', duration_sec: 600 }, source: 'user',
    };
    const provider = new TaskmasterSkillProvider();
    for (const tool of createSkillAgentTools(provider)) tools.register(tool);
    const model = new QwenFrostModelAdapter(
      { async complete() { return ''; } },
      tools,
      provider,
      { fallback: new LocalHealthFallbackModel() },
    );
    const log = new InMemoryFrostSessionLog();
    const loop = new FrostAgentLoop(FrostAgentLoop.createSession('agent-motion-session', 'user-1', new Date(at)), model, tools, log);
    await loop.initialize();

    await loop.followup({ text: '做十分钟瑜伽' });
    await loop.whenIdle();
    expect(loop.getSession().status).toBe('waiting_external');

    const taskId = request.task_id;
    const waiting = await taskmaster.get(taskId);
    if (!waiting) throw new Error('task_missing');
    const action = waiting.actions[waiting.next_action_index];
    const event: HealthEvent = {
      protocol: HEALTH_EVENT_PROTOCOL,
      event_id: `${request.task_id}:skill_completed`,
      user_id: request.user_id,
      occurred_at: at,
      domain: 'skill',
      type: 'skill_completed',
      source: { device_id: 'pwa', provider: 'her-motion' },
      facts: { exercise: '瑜伽', duration_sec: 600 },
      confidence: 1,
      provenance: { model_version: 'her-motion/test', tool_version: 'adapter/test', input_hash: 'motion-test' },
      visibility: 'private',
      sync: { state: 'pending', revision: 1 },
    };
    await taskmaster.signal({
      protocol: TASK_SIGNAL_PROTOCOL,
      signal_id: 'agent-motion-signal',
      task_id: waiting.task_id,
      run_id: waiting.run_id,
      action_id: action.action_id,
      correlation_id: action.correlation_id,
      kind: 'tool_result',
      occurred_at: at,
      actor: 'skill',
      payload: { exercise: '瑜伽', duration_sec: 600 },
      events: [event],
    });

    await loop.steer({ signal_id: 'agent-motion-signal', task_id: taskId }, 'skill');
    await loop.whenIdle();

    expect(loop.getSession().status).toBe('idle');
    expect((await store.listHealthEvents('user-1'))).toHaveLength(1);
    const calledTools = (await log.list('agent-motion-session'))
      .filter((item) => item.type === 'tool.called')
      .map((item) => item.data.tool);
    expect(calledTools).toEqual(['skill.load', 'taskmaster.start_intent', 'taskmaster.get']);
  });
});
