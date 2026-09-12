import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compileSkillDraft, previewSkillGraph, resetCanvasSkillsForTests, saveCanvasSkill, getCanvasSkill,
  runSkillGraph, SkillCapabilityRegistry, type SkillCanvasDraft } from '.';

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
});

function draft(): SkillCanvasDraft {
  const now = '2026-08-20T00:00:00.000Z';
  return {
    id: 'canvas-morning-run', title: '晨跑伙伴', prompt: '根据恢复状态陪我安全晨跑', created_at: now, updated_at: now, edges: [],
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
  });

  it('rejects a sketch without trigger or outcome', () => {
    const input = draft();
    input.nodes = input.nodes.filter((node) => node.capability === 'sensor.health');
    const result = compileSkillDraft(input);
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['missing_trigger', 'missing_outcome']));
  });

  it('runs an honest preview and persists the compiled Skill', () => {
    const result = compileSkillDraft(draft());
    expect(result.graph).toBeDefined();
    const trace = previewSkillGraph(result.graph!, new Date('2026-08-20T00:00:00.000Z'));
    expect(trace.status).toBe('preview_completed');
    expect(trace.steps.find((step) => step.node_id === 'health')?.evidence).toContain('未读取真实数据');
    saveCanvasSkill(result.graph!, result.structured, trace);
    expect(getCanvasSkill(result.graph!.skill_id)?.latest_run?.run_id).toBe(trace.run_id);
  });

  it('persists a real execution trace across later draft saves', async () => {
    const result = compileSkillDraft(draft());
    const registry = new SkillCapabilityRegistry();
    result.graph!.nodes.forEach((node) => registry.register({ capability: node.capability, async execute() {
      return { status: 'completed', output: { node: node.id }, evidence: [{ kind: 'runtime', summary: `evidence:${node.id}` }] };
    }}));
    const trace = await runSkillGraph(result.graph!, registry, { authorize: () => true, createRunId: () => 'persisted-run' });
    saveCanvasSkill(result.graph!, result.structured, trace);
    saveCanvasSkill(result.graph!, { ...result.structured, prompt: '编辑后仍保留最近运行' });
    expect(getCanvasSkill(result.graph!.skill_id)?.latest_run).toMatchObject({ mode: 'execute', run_id: 'persisted-run', status: 'completed' });
  });
  it('clears stale completion when the executable graph changes', () => {
    const before = compileSkillDraft(draft());
    const trace = previewSkillGraph(before.graph!);
    saveCanvasSkill(before.graph!, before.structured, trace);
    const after = compileSkillDraft({ ...draft(), prompt: 'A different task' });
    saveCanvasSkill(after.graph!, after.structured);
    expect(getCanvasSkill(after.graph!.skill_id)?.latest_run).toBeUndefined();
  });

  it('does not change memory or notify observers when durable draft persistence fails', () => {
    const result = compileSkillDraft(draft());
    const previous = saveCanvasSkill(result.graph!, result.structured);
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    expect(() => saveCanvasSkill({ ...result.graph!, title: 'Not saved' }, result.structured)).toThrow('quota');
    expect(getCanvasSkill(result.graph!.skill_id)).toEqual(previous);
    setItem.mockRestore();
  });

});
