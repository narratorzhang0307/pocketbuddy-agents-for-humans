import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FrostPlan, FrostPlanStep } from './skillRouter';
import { acceptTaskHandoff, clearTaskHandoff, peekTaskHandoff, stageTaskHandoff } from './taskHandoff';
import { exportFrostMemoryBundle, resetFrostMemoryForTests } from './longTermMemory';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function step(overrides: Partial<FrostPlanStep> = {}): FrostPlanStep {
  return {
    id: 'step-1', skillId: 'frost.openfoodfacts', skillName: 'Open Food Facts', target: 'openfoodfacts',
    objective: '查询包装食品营养', reason: '营养数据任务', availability: 'equipped',
    permissions: ['范围:private'], requiresConfirmation: false, ...overrides,
  };
}

function plan(planStep: FrostPlanStep): FrostPlan {
  return {
    id: 'plan-1', mode: 'single', source: 'local-rule', summary: '营养任务', steps: [planStep],
    ready: true, createdAt: '2026-08-11T00:00:00.000Z',
  };
}

describe('Frost task handoff contract', () => {
  beforeEach(async () => {
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: new MemoryStorage() });
    await resetFrostMemoryForTests();
  });
  afterEach(async () => {
    clearTaskHandoff();
    await resetFrostMemoryForTests();
    Reflect.deleteProperty(globalThis, 'sessionStorage');
  });

  it('stages a bounded handoff and lets only the matching Skill target read it', () => {
    const selected = step();
    const handoff = stageTaskHandoff(plan(selected), selected, '查询这包燕麦片的每百克营养');
    expect(handoff.protocol).toBe('pocket-frost-task/v1');
    expect(peekTaskHandoff('healthsync')).toBeNull();
    expect(peekTaskHandoff('openfoodfacts')).toMatchObject({ skillId: 'frost.openfoodfacts', objective: '查询包装食品营养' });
  });

  it('rejects an invented step or an unavailable Skill', () => {
    const selected = step();
    expect(() => stageTaskHandoff(plan(selected), step({ id: 'step-invented' }), '任务')).toThrow('不属于当前计划');
    const unavailable = step({ availability: 'installed' });
    expect(() => stageTaskHandoff(plan(unavailable), unavailable, '任务')).toThrow('尚未装备');
  });

  it('bounds carried user text and supports explicit cleanup', () => {
    const selected = step();
    stageTaskHandoff(plan(selected), selected, '甲'.repeat(3000));
    expect(peekTaskHandoff()?.userText).toHaveLength(2000);
    clearTaskHandoff();
    expect(peekTaskHandoff()).toBeNull();
  });

  it('carries an optional Taskmaster correlation id to the target Skill', () => {
    const selected = step({ skillId: 'pocket.her-motion', target: 'her-motion' });
    stageTaskHandoff(plan(selected), selected, '打开 Her Motion', 'health-task-1');
    expect(peekTaskHandoff('her-motion')).toMatchObject({ taskmasterTaskId: 'health-task-1' });
  });

  it('accepts only on the matching target and never persists the carried user text', async () => {
    const selected = step();
    stageTaskHandoff(plan(selected), selected, '我的身份证号码 1234567890 不得进入长期记忆');
    await expect(acceptTaskHandoff('healthsync')).resolves.toBeNull();
    await expect(acceptTaskHandoff('openfoodfacts')).resolves.toMatchObject({
      expertId: 'pip', expertRole: '恢复营养专家', runId: 'plan-1:step-1',
    });
    const bundle = await exportFrostMemoryBundle();
    expect(JSON.stringify(bundle)).not.toContain('1234567890');
    expect(bundle.runTraces[0].state).toBe('accepted');
  });
});
