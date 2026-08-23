import { afterEach, describe, expect, it } from 'vitest';
import {
  CanvasAwareHealthSkillRegistry,
  compileSkillDraft,
  registerCanvasTaskmasterTool,
  resetCanvasSkillsForTests,
  saveCanvasSkill,
  type SkillCanvasDraft,
  type CompiledSkillGraph,
  type SkillPreflightIssue,
} from '../skill-taskmaster';
import { FrostHealthTaskmaster } from '../taskmaster/orchestrator';
import { InMemoryTaskmasterStore } from '../taskmaster/store';
import { createDefaultTools } from '../taskmaster/tools';
import { InMemoryTraceSink } from '../taskmaster/trace';
import { FrostAgentLoop } from './agentLoop';
import { LocalHealthFallbackModel } from './localHealthModel';
import { InMemoryFrostSessionLog } from './sessionLog';
import { createSkillAgentTools, TaskmasterSkillProvider } from './skillCatalog';
import { createTaskmasterAgentTools } from './taskmasterAdapter';
import { FrostAgentToolRegistry } from './toolRegistry';

const at = '2026-08-23T08:00:00.000Z';

function canvasDraft(): SkillCanvasDraft {
  return {
    id: 'city-observer',
    title: '城市观察伙伴',
    prompt: '生成一条安全的城市观察建议，播报后保存完成证据',
    nodes: [
      { id: 'start', capability: 'trigger.manual', label: '手动启动', detail: '用户确认', x: 0, y: 0 },
      { id: 'gemma', capability: 'model.gemma', label: '语义决策', detail: 'Gemma', x: 0, y: 0 },
      { id: 'voice', capability: 'action.voice', label: '语音通知', detail: '播报', x: 0, y: 0 },
      { id: 'state', capability: 'state.skill_completed', label: '完成与证据', detail: '写入事实', x: 0, y: 0 },
    ],
    edges: [],
    created_at: at,
    updated_at: at,
  };
}

function installCanvas(): CompiledSkillGraph {
  const compiled = compileSkillDraft(canvasDraft());
  if (!compiled.ok || !compiled.graph) throw new Error('test_canvas_compile_failed');
  saveCanvasSkill(compiled.graph, compiled.structured);
  return compiled.graph;
}

afterEach(() => resetCanvasSkillsForTests());

describe('Fitness Agent → Skill Registry → Taskmaster → Canvas Graph', () => {
  it('discovers and executes the exact user graph through the real Agent Loop', async () => {
    const graph = installCanvas();
    const spoken: string[] = [];
    const synced: string[] = [];
    const registry = new CanvasAwareHealthSkillRegistry();
    const taskTools = createDefaultTools();
    registerCanvasTaskmasterTool(taskTools, {
      preflight: async () => [],
      dependencies: ({ request, idempotencyKey }) => ({
        userId: request.user_id,
        deviceId: 'vitest-agent',
        now: () => new Date(at),
        createId: (prefix) => `${prefix}:${idempotencyKey}`,
        generateText: async () => ({ text: '向光线好的街口慢走五分钟。', model_version: 'gemma-test' }),
        speak: async (text) => { spoken.push(text); },
        syncHealthEvent: async (event) => {
          synced.push(event.event_id);
          return { status: 'synced', revision: 1 };
        },
      }),
    });
    const store = new InMemoryTaskmasterStore();
    const taskmaster = new FrostHealthTaskmaster(store, taskTools, new InMemoryTraceSink(), registry);
    const provider = new TaskmasterSkillProvider(registry);
    const agentTools = new FrostAgentToolRegistry();
    for (const tool of createSkillAgentTools(provider)) agentTools.register(tool);
    for (const tool of createTaskmasterAgentTools(taskmaster)) agentTools.register(tool);
    const log = new InMemoryFrostSessionLog();
    const loop = new FrostAgentLoop(
      FrostAgentLoop.createSession('fitness-canvas-session', 'user-1', new Date(at)),
      new LocalHealthFallbackModel(provider),
      agentTools,
      log,
    );
    await loop.initialize();

    await loop.followup({ text: '开始城市观察伙伴' });
    await loop.whenIdle();

    expect(loop.getSession().status).toBe('idle');
    const task = await taskmaster.get('fitness-canvas-session:task:2');
    expect(task).toMatchObject({ status: 'completed', skill_id: graph.skill_id });
    expect(task?.request.input).toMatchObject({ graph_id: graph.graph_id, graph_hash: graph.graph_hash, skill_id: graph.skill_id });
    expect(task?.actions[0].result?.skill_run).toMatchObject({ status: 'completed', graph_hash: graph.graph_hash });
    expect(spoken).toEqual(['向光线好的街口慢走五分钟。']);
    expect(synced).toHaveLength(1);
    const called = (await log.list('fitness-canvas-session'))
      .filter((event) => event.type === 'tool.called')
      .map((event) => event.data.tool);
    expect(called).toEqual(['skill.load', 'taskmaster.start_intent']);
  });

  it('keeps a recoverable provider checkpoint and lets the Agent resume the same graph', async () => {
    const graph = installCanvas();
    const registry = new CanvasAwareHealthSkillRegistry();
    const taskTools = createDefaultTools();
    let providerReady = false;
    const waitingIssue: SkillPreflightIssue = {
      code: 'backend_unavailable',
      severity: 'blocking',
      message: 'Gemma Provider 暂不可用',
      suggested_action: '恢复 Provider 后重试',
      retryable: true,
      capability: 'model.gemma',
      node_id: 'gemma',
    };
    registerCanvasTaskmasterTool(taskTools, {
      preflight: async () => providerReady ? [] : [waitingIssue],
      dependencies: ({ request, idempotencyKey }) => ({
        userId: request.user_id,
        deviceId: 'vitest-agent',
        createId: (prefix) => `${prefix}:${idempotencyKey}`,
        generateText: async () => ({ text: '恢复后已执行' }),
        speak: async () => undefined,
        syncHealthEvent: async () => ({ status: 'synced', revision: 1 }),
      }),
    });
    const taskmaster = new FrostHealthTaskmaster(new InMemoryTaskmasterStore(), taskTools, new InMemoryTraceSink(), registry);
    const provider = new TaskmasterSkillProvider(registry);
    const agentTools = new FrostAgentToolRegistry();
    for (const tool of createSkillAgentTools(provider)) agentTools.register(tool);
    for (const tool of createTaskmasterAgentTools(taskmaster)) agentTools.register(tool);
    const log = new InMemoryFrostSessionLog();
    const loop = new FrostAgentLoop(
      FrostAgentLoop.createSession('canvas-recovery', 'user-1', new Date(at)),
      new LocalHealthFallbackModel(provider),
      agentTools,
      log,
    );
    await loop.initialize();

    await loop.followup({ text: '开始城市观察伙伴' });
    await loop.whenIdle();
    let session = await taskmaster.get('canvas-recovery:task:2');
    if (!session) throw new Error('recovery_task_missing');
    expect(session.status).toBe('waiting_external');
    expect(session.actions[0].status).toBe('waiting_external');
    expect(session.actions[0].result).toMatchObject({
      waiting_reason: 'Gemma Provider 暂不可用',
      issues: [expect.objectContaining({ code: 'backend_unavailable' })],
    });
    expect(session.counters.tool_calls).toBe(1);
    expect(loop.getSession().status).toBe('waiting_external');

    providerReady = true;
    await loop.followup({ text: 'Provider 好了，继续' });
    await loop.whenIdle();
    session = await taskmaster.get(session.task_id);
    if (!session) throw new Error('recovered_task_missing');
    expect(session.status).toBe('completed');
    expect(session.actions[0].result?.skill_run).toMatchObject({ status: 'completed', graph_hash: graph.graph_hash });
    expect(session.counters.tool_calls).toBe(2);
    expect(loop.getSession().status).toBe('idle');
    expect((await log.list('canvas-recovery')).some((event) => event.type === 'tool.called' && event.data.tool === 'taskmaster.resume')).toBe(true);
  });
});
