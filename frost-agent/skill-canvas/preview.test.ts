import { afterEach, describe, expect, it, vi } from 'vitest';
import * as canvas from './index';
import * as legacy from '../skill-taskmaster';
import { previewSkillGraph as legacyPreview } from '../skill-taskmaster/runtime';

describe('Canvas compatibility and non-execution boundary', () => {
  afterEach(() => { canvas.resetCanvasSkillsForTests(); vi.unstubAllGlobals(); });

  it('shares the same implementation/store through old and new imports', () => {
    expect(legacy.saveCanvasSkill).toBe(canvas.saveCanvasSkill);
    expect(legacy.previewSkillGraph).toBe(canvas.previewSkillGraph);
    expect(legacyPreview).toBe(canvas.previewSkillGraph);
  });

  it('keeps the old storage key and never calls models, sensors, audio or execution Taskmaster', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
    const fetch = vi.fn(() => { throw new Error('preview_must_not_call_network'); });
    vi.stubGlobal('fetch', fetch);
    const at = '2026-08-27T00:00:00.000Z';
    const draft: canvas.SkillCanvasDraft = { id: 'compat-card', title: '卡片', prompt: '', created_at: at, updated_at: at, edges: [],
      nodes: (['trigger.manual', 'model.qwen', 'action.voice', 'store.local'] as const).map((capability, n) => ({ id: String(n), capability, label: capability, detail: '', x: 0, y: 0 })),
    };
    const compiled = canvas.compileSkillDraft(draft);
    const trace = canvas.previewSkillGraph(compiled.graph!, new Date(at));
    expect(trace.steps.slice(1).every((step) => step.status === 'simulated')).toBe(true);
    expect(trace.note).toContain('没有播放语音');
    expect(trace.started_at).toBe(trace.completed_at);
    legacy.saveCanvasSkill(compiled.graph!, compiled.structured, trace);
    expect(values.has('pocket.skill-canvas.v1')).toBe(true);
    expect(canvas.getCanvasSkill('compat-card')?.latest_run?.mode).toBe('preview');
    expect(fetch).not.toHaveBeenCalled();
  });
});
