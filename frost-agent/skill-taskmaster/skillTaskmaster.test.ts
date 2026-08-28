import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compileSkillDraft, previewSkillGraph, resetCanvasSkillsForTests, saveCanvasSkill, getCanvasSkill, type SkillCanvasDraft } from '.';

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
});
