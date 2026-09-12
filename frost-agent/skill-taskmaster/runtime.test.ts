import { describe, expect, it, vi } from 'vitest';
import { compileSkillDraft, type SkillBlockCapability, type SkillCanvasDraft } from '../skill-canvas';
import { inspectSkillBindings, runSkillGraph, SkillCapabilityRegistry, type SkillAdapterResult } from '.';

function graph(capabilities: SkillBlockCapability[]) {
  const at = '2026-09-01T00:00:00.000Z';
  const draft: SkillCanvasDraft = {
    id: 'runtime-skill', title: 'Runtime Skill', prompt: 'Run a real chain', created_at: at, updated_at: at, edges: [],
    nodes: capabilities.map((capability, index) => ({ id: `n${index}`, capability, label: capability, detail: '', x: 0, y: 0 })),
  };
  const result = compileSkillDraft(draft);
  expect(result.ok).toBe(true);
  return result.graph!;
}

function completed(capability: SkillBlockCapability, execute = vi.fn()): { adapter: { capability: SkillBlockCapability; execute: ReturnType<typeof vi.fn> }; execute: ReturnType<typeof vi.fn> } {
  execute.mockResolvedValue({ status: 'completed', output: { capability }, evidence: [{ kind: 'runtime', summary: `${capability} evidence` }] } satisfies SkillAdapterResult);
  return { adapter: { capability, execute }, execute };
}

function registry(...capabilities: SkillBlockCapability[]) {
  const value = new SkillCapabilityRegistry();
  const executions = new Map<SkillBlockCapability, ReturnType<typeof vi.fn>>();
  capabilities.forEach((capability) => { const item = completed(capability); value.register(item.adapter); executions.set(capability, item.execute); });
  return { value, executions };
}

describe('real Skill Taskmaster runtime', () => {
  it('executes a complete graph in order and keeps evidence plus permission decisions', async () => {
    const compiled = graph(['trigger.manual', 'sensor.health', 'gate.safety', 'action.voice']);
    const bindings = registry('trigger.manual', 'sensor.health', 'gate.safety', 'action.voice');
    const authorize = vi.fn().mockResolvedValue(true);
    const trace = await runSkillGraph(compiled, bindings.value, { authorize, createRunId: () => 'run-complete' });

    expect(trace.status).toBe('completed');
    expect(trace.steps.map((step) => step.capability)).toEqual(['trigger.manual', 'sensor.health', 'gate.safety', 'action.voice']);
    expect(trace.evidence).toHaveLength(4);
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(trace.steps[1].permission_decisions).toEqual([{ permission: 'read:health_events', granted: true }]);
    expect(bindings.executions.get('action.voice')).toHaveBeenCalledOnce();
  });

  it('fails closed before an unregistered capability', async () => {
    const compiled = graph(['trigger.manual', 'action.voice']);
    const bindings = registry('trigger.manual');
    expect(inspectSkillBindings(compiled, bindings.value)).toEqual({ ready: false, missing_capabilities: ['action.voice'] });
    const trace = await runSkillGraph(compiled, bindings.value, { authorize: () => true, createRunId: () => 'run-missing' });
    expect(trace.status).toBe('blocked');
    expect(trace.steps.at(-1)?.error).toBe('missing_skill_adapter:action.voice');
  });

  it('stops at the exact permission denied by the user', async () => {
    const compiled = graph(['trigger.manual', 'sensor.health', 'action.voice']);
    const bindings = registry('trigger.manual', 'sensor.health', 'action.voice');
    const trace = await runSkillGraph(compiled, bindings.value, {
      authorize: ({ permission }) => permission !== 'read:health_events', createRunId: () => 'run-denied',
    });
    expect(trace.status).toBe('blocked');
    expect(trace.steps.at(-1)?.error).toBe('permission_denied:read:health_events');
    expect(bindings.executions.get('sensor.health')).not.toHaveBeenCalled();
    expect(bindings.executions.get('action.voice')).not.toHaveBeenCalled();
  });

  it('honors a safety stop and never invokes downstream effects', async () => {
    const compiled = graph(['trigger.manual', 'gate.safety', 'action.voice']);
    const bindings = registry('trigger.manual', 'gate.safety', 'action.voice');
    const safety = vi.fn().mockResolvedValue({ status: 'safe_stopped', output: { decision: 'stop' }, error: 'pain',
      evidence: [{ kind: 'policy', summary: 'pain stop' }] } satisfies SkillAdapterResult);
    const custom = new SkillCapabilityRegistry()
      .register(completed('trigger.manual').adapter)
      .register({ capability: 'gate.safety', execute: safety })
      .register({ capability: 'action.voice', execute: bindings.executions.get('action.voice')! });
    const trace = await runSkillGraph(compiled, custom, { authorize: () => true, createRunId: () => 'run-safe-stop' });
    expect(trace.status).toBe('safe_stopped');
    expect(trace.steps.at(-1)?.capability).toBe('gate.safety');
    expect(bindings.executions.get('action.voice')).not.toHaveBeenCalled();
  });

  it('rejects adapters that claim success without evidence', async () => {
    const compiled = graph(['trigger.manual', 'store.local']);
    const bindings = new SkillCapabilityRegistry()
      .register(completed('trigger.manual').adapter)
      .register({ capability: 'store.local', execute: vi.fn().mockResolvedValue({ status: 'completed', output: { stored: true }, evidence: [] }) });
    const trace = await runSkillGraph(compiled, bindings, { authorize: () => true, createRunId: () => 'run-no-evidence' });
    expect(trace.status).toBe('failed');
    expect(trace.error).toBe('adapter_evidence_missing');
  });

  it('runs the same graph repeatedly with isolated run and evidence ids', async () => {
    const compiled = graph(['trigger.manual', 'store.local']);
    const bindings = registry('trigger.manual', 'store.local').value;
    const first = await runSkillGraph(compiled, bindings, { authorize: () => true, createRunId: () => 'run-1' });
    const second = await runSkillGraph(compiled, bindings, { authorize: () => true, createRunId: () => 'run-2' });
    expect([first.status, second.status]).toEqual(['completed', 'completed']);
    expect(first.evidence[0].evidence_id).not.toBe(second.evidence[0].evidence_id);
  });

  it('times out a hung adapter and does not continue to later effects', async () => {
    const compiled = graph(['trigger.manual', 'action.voice', 'store.local']);
    const store = completed('store.local');
    const bindings = new SkillCapabilityRegistry()
      .register(completed('trigger.manual').adapter)
      .register({ capability: 'action.voice', execute: vi.fn(() => new Promise(() => undefined)) })
      .register(store.adapter);
    const trace = await runSkillGraph(compiled, bindings, { authorize: () => true, timeoutMs: 5, createRunId: () => 'run-timeout' });
    expect(trace.status).toBe('failed');
    expect(trace.error).toBe('skill_adapter_timeout');
    expect(store.execute).not.toHaveBeenCalled();
  });

  it('turns an explicit user cancellation into a safe stop', async () => {
    const compiled = graph(['trigger.manual', 'action.voice', 'store.local']);
    const controller = new AbortController();
    const store = completed('store.local');
    const bindings = new SkillCapabilityRegistry()
      .register(completed('trigger.manual').adapter)
      .register({ capability: 'action.voice', execute: vi.fn(() => new Promise(() => undefined)) })
      .register(store.adapter);
    const running = runSkillGraph(compiled, bindings, { authorize: () => true, signal: controller.signal, timeoutMs: 5_000, createRunId: () => 'run-cancelled' });
    controller.abort('user_cancelled');
    const trace = await running;
    expect(trace.status).toBe('safe_stopped');
    expect(trace.error).toBe('user_cancelled');
    expect(store.execute).not.toHaveBeenCalled();
  });

  it('safe-stops a run cancelled while permission authorization is pending', async () => {
    const compiled = graph(['trigger.manual', 'action.voice', 'store.local']);
    const controller = new AbortController();
    const bindings = registry('trigger.manual', 'action.voice', 'store.local');
    let release!: (value: boolean) => void;
    const authorization = new Promise<boolean>((resolve) => { release = resolve; });
    const running = runSkillGraph(compiled, bindings.value, { authorize: () => authorization, signal: controller.signal, createRunId: () => 'run-auth-cancel' });
    await Promise.resolve();
    controller.abort('user_cancelled_during_authorization');
    release(true);
    const trace = await running;
    expect(trace.status).toBe('safe_stopped');
    expect(trace.error).toBe('user_cancelled_during_authorization');
    expect(trace.steps.at(-1)?.status).toBe('safe_stopped');
    expect(bindings.executions.get('action.voice')).not.toHaveBeenCalled();
  });

  it('returns a failed trace instead of rejecting when permission authorization fails', async () => {
    const compiled = graph(['trigger.manual', 'action.voice']);
    const bindings = registry('trigger.manual', 'action.voice');
    const trace = await runSkillGraph(compiled, bindings.value, { authorize: () => { throw new Error('prompt_unavailable'); }, createRunId: () => 'run-auth-error' });
    expect(trace.status).toBe('failed');
    expect(trace.error).toBe('permission_authorization_failed:prompt_unavailable');
    expect(bindings.executions.get('action.voice')).not.toHaveBeenCalled();
  });

  it('rejects tampered node order and dependency metadata before any adapter runs', async () => {
    const compiled = graph(['trigger.manual', 'action.voice']);
    compiled.nodes[1].order = 0;
    const bindings = registry('trigger.manual', 'action.voice');
    const trace = await runSkillGraph(compiled, bindings.value, { authorize: () => true, createRunId: () => 'run-tampered' });
    expect(trace.status).toBe('failed');
    expect(trace.error).toBe('invalid_node_order:n1');
    expect(bindings.executions.get('trigger.manual')).not.toHaveBeenCalled();
  });

  it('does not let a failing progress observer interrupt a valid run', async () => {
    const compiled = graph(['trigger.manual', 'store.local']);
    const bindings = registry('trigger.manual', 'store.local');
    const trace = await runSkillGraph(compiled, bindings.value, { authorize: () => true, onStep: () => { throw new Error('observer_failed'); }, createRunId: () => 'run-observer' });
    expect(trace.status).toBe('completed');
    expect(trace.steps).toHaveLength(2);
  });
  it('cancels without waiting forever for an authorization callback', async () => {
    const controller = new AbortController();
    const bindings = registry('trigger.manual', 'action.voice');
    const trace = await runSkillGraph(graph(['trigger.manual', 'action.voice']), bindings.value, {
      signal: controller.signal,
      authorize: () => { queueMicrotask(() => controller.abort('user_cancelled')); return new Promise(() => {}); },
    });
    expect(trace.status).toBe('safe_stopped');
    expect(bindings.executions.get('action.voice')).not.toHaveBeenCalled();
  });

  it('does not allow an adapter to mutate the graph or permission scope of later steps', async () => {
    const compiled = graph(['trigger.manual', 'action.voice']);
    const voice = completed('action.voice');
    const bindings = new SkillCapabilityRegistry().register({ capability: 'trigger.manual', async execute(context) {
      context.graph.nodes[1].capability = 'store.local';
      return { status: 'completed', output: {}, evidence: [{ kind: 'user_action', summary: 'clicked' }] };
    }}).register(voice.adapter);
    const trace = await runSkillGraph(compiled, bindings, { authorize: () => true });
    expect(trace.status).toBe('completed');
    expect(voice.execute).toHaveBeenCalledOnce();
    expect(compiled.nodes[1].capability).toBe('action.voice');
  });

  it('rejects premature completion storage before any adapter runs', async () => {
    const compiled = graph(['trigger.manual', 'action.voice', 'store.local']);
    compiled.nodes[1].order = 2; compiled.nodes[2].order = 1;
    const bindings = registry('trigger.manual', 'action.voice', 'store.local');
    const trace = await runSkillGraph(compiled, bindings.value, { authorize: () => true });
    expect(trace.error).toBe('evidence_store_must_finish');
    expect(bindings.executions.get('trigger.manual')).not.toHaveBeenCalled();
  });

});
