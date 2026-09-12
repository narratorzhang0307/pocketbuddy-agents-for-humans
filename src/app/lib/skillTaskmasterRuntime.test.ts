import { afterEach, describe, expect, it, vi } from 'vitest';
import { compileSkillDraft, type SkillBlockCapability, type SkillCanvasDraft } from '../../../frost-agent/skill-canvas';
import { inspectSkillBindings, runSkillGraph } from '../../../frost-agent/skill-taskmaster';
import { createBrowserSkillRegistry, type BrowserSkillTaskmasterDependencies } from './skillTaskmasterRuntime';

function compiled(capabilities: SkillBlockCapability[]) {
  const at = '2026-09-01T00:00:00.000Z';
  const draft: SkillCanvasDraft = { id: 'browser-chain', title: '城市观察伙伴', prompt: '给出一个城市观察动作', created_at: at, updated_at: at, edges: [],
    nodes: capabilities.map((capability, index) => ({ id: String(index), capability, label: capability, detail: '', x: 0, y: 0 })) };
  return compileSkillDraft(draft).graph!;
}

function fakes(): BrowserSkillTaskmasterDependencies {
  return {
    getLocation: vi.fn().mockResolvedValue({ latitude: 31.2, longitude: 121.5, accuracy_m: 12, observed_at: '2026-09-01T00:00:00.000Z' }),
    readHealth: vi.fn().mockResolvedValue({ day: '2026-09-01', revision: 'health-r1', missing: [] }),
    runModel: vi.fn().mockResolvedValue({ backend: 'mnn', model: 'qwen3', text: '向前走到树荫处，观察一片叶子。' }),
    speak: vi.fn().mockResolvedValue(undefined),
    persistCompletion: vi.fn().mockResolvedValue(undefined),
    now: () => new Date('2026-09-01T00:00:00.000Z'),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('Skill Canvas browser bindings', () => {
  it('executes the registered chain with injected test providers and captures their evidence', async () => {
    const deps = fakes();
    const graph = compiled(['trigger.manual', 'sensor.location', 'model.qwen', 'gate.safety', 'action.voice', 'store.local']);
    const registry = createBrowserSkillRegistry(deps);
    expect(inspectSkillBindings(graph, registry).ready).toBe(true);

    const trace = await runSkillGraph(graph, registry, { authorize: () => true, createRunId: () => 'browser-run' });
    expect(trace.status).toBe('completed');
    expect(trace.steps).toHaveLength(6);
    expect(deps.getLocation).toHaveBeenCalledOnce();
    expect(deps.runModel).toHaveBeenCalledOnce();
    expect(deps.speak).toHaveBeenCalledWith('向前走到树荫处，观察一片叶子。', expect.any(AbortSignal));
    expect(deps.persistCompletion).toHaveBeenCalledWith('browser-run:5', 'browser-chain', '2026-09-01T00:00:00.000Z');
    expect(trace.evidence.map((item) => item.kind)).toEqual(['user_action', 'sensor', 'model', 'policy', 'effect', 'store']);
  });

  it('safe-stops before voice and persistence when the user reports pain', async () => {
    const deps = fakes();
    const graph = compiled(['trigger.manual', 'gate.safety', 'action.voice', 'store.local']);
    const trace = await runSkillGraph(graph, createBrowserSkillRegistry(deps), { authorize: () => true, createRunId: () => 'pain-run',
      input: { safety_signals: { pain: true } } });
    expect(trace.status).toBe('safe_stopped');
    expect(deps.speak).not.toHaveBeenCalled();
    expect(deps.persistCompletion).not.toHaveBeenCalled();
  });

  it('blocks honestly when the model execution surface returns unavailable', async () => {
    const deps = fakes();
    vi.mocked(deps.runModel).mockRejectedValueOnce(new Error('qwen_runtime_unavailable'));
    const graph = compiled(['trigger.manual', 'model.qwen', 'action.voice']);
    const trace = await runSkillGraph(graph, createBrowserSkillRegistry(deps), { authorize: () => true, createRunId: () => 'qwen-blocked' });
    expect(trace.status).toBe('blocked');
    expect(trace.error).toBe('qwen_runtime_unavailable');
    expect(deps.speak).not.toHaveBeenCalled();
  });

  it('keeps pose graphs unavailable until the live camera page provides an adapter', () => {
    const graph = compiled(['trigger.manual', 'model.pose', 'store.local']);
    expect(inspectSkillBindings(graph, createBrowserSkillRegistry(fakes()))).toEqual({ ready: false, missing_capabilities: ['model.pose'] });
  });
  it('uses the existing Frost endpoint and records the actual configured model', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'Look at a leaf.', provider: 'gemini', model: 'configured-test-model' })));
    vi.stubGlobal('fetch', request);
    const { runModel: _model, ...deps } = fakes();
    const trace = await runSkillGraph(compiled(['trigger.manual', 'model.qwen', 'store.local']), createBrowserSkillRegistry(deps), { authorize: () => true });
    expect(trace.status).toBe('completed');
    expect(request).toHaveBeenCalledWith('/api/frost-llm', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ task: 'skill-canvas' });
    expect(trace.steps.find(step => step.capability === 'model.qwen')?.output).toMatchObject({ model: 'configured-test-model', backend: 'gemini' });
  });

  it('never turns a missing server model into a successful fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'no_qwen_key', text: '' }), { status: 503 })));
    const { runModel: _model, ...deps } = fakes();
    const trace = await runSkillGraph(compiled(['trigger.manual', 'model.qwen', 'action.voice', 'store.local']), createBrowserSkillRegistry(deps), { authorize: () => true });
    expect(trace.status).toBe('blocked');
    expect(trace.error).toBe('frost_model_unavailable:503');
    expect(deps.speak).not.toHaveBeenCalled();
    expect(deps.persistCompletion).not.toHaveBeenCalled();
  });

  it('keeps health data local unless the existing cloud-sharing setting is enabled', async () => {
    vi.stubGlobal('localStorage', { getItem: () => '{}' });
    const deps = fakes();
    const trace = await runSkillGraph(compiled(['trigger.manual', 'sensor.health', 'model.qwen', 'store.local']), createBrowserSkillRegistry(deps), { authorize: () => true });
    expect(trace.error).toBe('health_cloud_sharing_disabled');
    expect(deps.readHealth).toHaveBeenCalledOnce();
    expect(deps.runModel).not.toHaveBeenCalled();
    expect(deps.persistCompletion).not.toHaveBeenCalled();
  });

  it('binds pose capture supplied by the Canvas page and passes it to the semantic model first', async () => {
    const deps = fakes();
    deps.estimatePose = vi.fn().mockResolvedValue({ protocol: 'pocket-canvas-pose/v1', model: 'test-fixture', frames_observed: 30,
      landmarks: Array.from({ length: 17 }, () => [0.5, 0.5, 0.9]) });
    const graph = compiled(['trigger.manual', 'model.qwen', 'model.pose', 'store.local']);
    expect(graph.nodes.map(node => node.capability)).toEqual(['trigger.manual', 'model.pose', 'model.qwen', 'store.local']);
    const consent = vi.fn((_request: { permission: string }) => true);
    const trace = await runSkillGraph(graph, createBrowserSkillRegistry(deps), { authorize: consent });
    expect(trace.status).toBe('completed');
    expect(deps.runModel).toHaveBeenCalledWith(expect.stringContaining('pocket-canvas-pose/v1'), expect.any(AbortSignal));
    expect(consent.mock.calls.map(([request]) => request.permission)).toEqual(['capture:camera', 'run:model', 'write:health_events']);
  });

  it('does not run the model or completion store after incomplete pose capture', async () => {
    const deps = fakes(); deps.estimatePose = vi.fn().mockResolvedValue({ frames_observed: 0 });
    const trace = await runSkillGraph(compiled(['trigger.manual', 'model.pose', 'model.qwen', 'store.local']), createBrowserSkillRegistry(deps), { authorize: () => true });
    expect(trace.status).toBe('blocked');
    expect(trace.error).toBe('pose_observation_incomplete');
    expect(deps.runModel).not.toHaveBeenCalled();
    expect(deps.persistCompletion).not.toHaveBeenCalled();
  });

});
