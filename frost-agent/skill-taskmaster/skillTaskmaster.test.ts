import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  compileSkillDraft,
  executeSkillGraph,
  getCanvasSkill,
  preflightBrowserSkillRuntime,
  previewSkillGraph,
  resetCanvasSkillsForTests,
  saveCanvasSkill,
  type SkillCanvasDraft,
} from '.';

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
});

function draft(): SkillCanvasDraft {
  const now = '2026-08-20T00:00:00.000Z';
  return {
    id: 'canvas-morning-run', title: '晨跑伙伴', prompt: '根据恢复状态陪我安全晨跑', avatar_id: 'health-tiger', created_at: now, updated_at: now, edges: [],
    nodes: [
      { id: 'voice', capability: 'action.voice', label: '语音陪伴', detail: '提醒', x: 0, y: 0 },
      { id: 'start', capability: 'trigger.manual', label: '开始', detail: '点击', x: 0, y: 0 },
      { id: 'health', capability: 'sensor.health', label: 'HRV', detail: '恢复', x: 0, y: 0 },
      { id: 'guard', capability: 'gate.safety', label: '安全门', detail: '停止', x: 0, y: 0 },
    ],
  };
}

beforeEach(() => { storage.clear(); resetCanvasSkillsForTests(); });

describe('Skill Taskmaster', () => {
  it('structures a rough sketch, compiles permissions and keeps a safety rule', () => {
    const result = compileSkillDraft(draft());
    expect(result.ok).toBe(true);
    expect(result.graph?.nodes.map((node) => node.stage)).toEqual(['trigger', 'sense', 'guard', 'act']);
    expect(result.graph?.permissions).toEqual(['read:health_events', 'notify:user']);
    expect(result.graph?.stop_rules).toHaveLength(1);
    expect(result.graph?.avatar_id).toBe('health-tiger');
  });

  it('rejects a sketch without trigger or outcome', () => {
    const input = draft();
    input.nodes = input.nodes.filter((node) => node.capability === 'sensor.health');
    const result = compileSkillDraft(input);
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['missing_trigger', 'missing_outcome']));
    expect(result.issues.filter((issue) => issue.code === 'missing_trigger' || issue.code === 'missing_outcome').every((issue) => issue.repair === 'user_required')).toBe(true);
    expect(result.issues.every((issue) => issue.suggested_action.length > 0)).toBe(true);
  });

  it('repairs only deterministic structure and config faults, and reports every repair', () => {
    const input = draft();
    input.nodes[0].id = 'duplicate';
    input.nodes[1].id = 'duplicate';
    input.nodes[2].config = { lookback_hours: -99, unexpected: 'drop-me' };
    input.edges = [
      { from: 'missing', to: 'duplicate' },
      { from: 'duplicate', to: 'duplicate' },
    ];

    const result = compileSkillDraft(input);

    expect(result.ok).toBe(true);
    expect(new Set(result.structured.nodes.map((node) => node.id)).size).toBe(result.structured.nodes.length);
    expect(result.structured.edges).toHaveLength(result.structured.nodes.length - 1);
    expect(result.structured.nodes.find((node) => node.capability === 'sensor.health')?.config).toEqual({ lookback_hours: 24 });
    expect(result.repairs.map((repair) => repair.code)).toEqual(expect.arrayContaining([
      'regenerated_node_id',
      'reset_invalid_config',
      'rebuilt_edges',
    ]));
  });

  it('does not guess when the entry point is ambiguous or a capability contract is unknown', () => {
    const input = draft();
    input.nodes.push({ id: 'second-start', capability: 'trigger.manual', label: '另一个开始', detail: '含糊入口', x: 0, y: 0 });
    input.nodes[2].capability = 'sensor.future' as SkillCanvasDraft['nodes'][number]['capability'];

    const result = compileSkillDraft(input);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['multiple_triggers', 'unknown_capability']));
    expect(result.issues.find((issue) => issue.code === 'multiple_triggers')?.repair).toBe('user_required');
  });

  it('runs an honest preview and persists the compiled Skill', () => {
    const result = compileSkillDraft(draft());
    expect(result.graph).toBeDefined();
    const trace = previewSkillGraph(result.graph!, new Date('2026-08-20T00:00:00.000Z'));
    expect(trace.status).toBe('preview_completed');
    expect(trace.steps.find((step) => step.node_id === 'health')?.evidence).toContain('未读取真实数据');
    saveCanvasSkill(result.graph!, result.structured, trace);
    expect(getCanvasSkill(result.graph!.skill_id)?.latest_run?.run_id).toBe(trace.run_id);
    expect(getCanvasSkill(result.graph!.skill_id)?.draft.avatar_id).toBe('health-tiger');
  });

  it('retries a transient read/model provider once and records the recovery', async () => {
    const input = draft();
    input.nodes = [
      { id: 'start', capability: 'trigger.manual', label: '开始', detail: '点击', x: 0, y: 0 },
      { id: 'model', capability: 'model.gemma', label: '决策', detail: 'Gemma', x: 0, y: 0 },
      { id: 'voice', capability: 'action.voice', label: '播报', detail: '语音', x: 0, y: 0 },
    ];
    const compiled = compileSkillDraft(input);
    let attempts = 0;
    const trace = await executeSkillGraph(compiled.graph!, {
      userId: 'retry-user',
      deviceId: 'vitest',
      retryDelayMs: 0,
      generateText: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary provider outage');
        return { text: '已恢复' };
      },
      speak: async () => undefined,
    });

    expect(trace.status).toBe('completed');
    expect(attempts).toBe(2);
    expect(trace.steps.find((step) => step.node_id === 'model')).toMatchObject({ attempts: 2, status: 'completed' });
    expect(trace.steps.find((step) => step.node_id === 'model')?.evidence).toContain('RECOVERED AFTER 2 ATTEMPTS');
  });

  it('persists a truthful cancelled trace instead of leaving a run stuck as running', async () => {
    const compiled = compileSkillDraft(draft());
    const controller = new AbortController();
    controller.abort();

    const trace = await executeSkillGraph(compiled.graph!, {
      userId: 'cancel-user',
      deviceId: 'vitest',
      signal: controller.signal,
    });

    expect(trace.status).toBe('cancelled');
    expect(trace.completed_at).toBeDefined();
    expect(trace.steps.every((step) => step.status === 'skipped')).toBe(true);
  });

  it('returns actionable structured preflight failures for missing host providers', async () => {
    const input = draft();
    input.nodes = [
      { id: 'start', capability: 'trigger.manual', label: '开始', detail: '点击', x: 0, y: 0 },
      { id: 'location', capability: 'sensor.location', label: '位置', detail: 'GPS', x: 0, y: 0 },
      { id: 'voice', capability: 'action.voice', label: '播报', detail: '语音', x: 0, y: 0 },
    ];
    const compiled = compileSkillDraft(input);
    const issues = await preflightBrowserSkillRuntime(compiled.graph!);

    expect(issues.some((issue) => issue.code === 'location_unavailable' && issue.node_id === 'location')).toBe(true);
    expect(issues.every((issue) => issue.suggested_action.length > 0)).toBe(true);
  });
});
