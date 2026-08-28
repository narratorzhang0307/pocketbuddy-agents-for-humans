import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  answerFrostMemoryRecallRequest,
  correctFrostMemory,
  exportFrostMemoryBundle,
  forgetFrostMemory,
  listFrostMemories,
  listFrostRunTraces,
  recallFrostMemories,
  rememberTaskHandoff,
  resetFrostMemoryForTests,
  type FrostHandoffMemoryInput,
} from './longTermMemory';

function handoff(overrides: Partial<FrostHandoffMemoryInput> = {}): FrostHandoffMemoryInput {
  return {
    planId: 'plan-1',
    stepId: 'step-1',
    skillId: 'pocket.guji-reading',
    skillName: '古籍识读',
    target: 'heritage-guji',
    expertId: 'pip',
    expertName: 'Pip',
    ...overrides,
  };
}

describe('Frost local long-term memory', () => {
  beforeEach(async () => resetFrostMemoryForTests());
  afterEach(async () => resetFrostMemoryForTests());

  it('persists dispatched and accepted lifecycle without chat or OCR source text', async () => {
    const input = handoff();
    await rememberTaskHandoff(input, 'dispatched');
    await rememberTaskHandoff(input, 'accepted');

    const bundle = await exportFrostMemoryBundle();
    expect(bundle.memories).toHaveLength(2);
    expect(bundle.memories.find((memory) => memory.kind === 'episodic')).toMatchObject({
      phase: 'accepted', expertId: 'pip', privacy: 'private-local', tier: 'long-term',
    });
    expect(bundle.memories.find((memory) => memory.kind === 'procedural')).toMatchObject({
      skillId: 'pocket.guji-reading', repetitions: 1,
    });
    expect(JSON.stringify(bundle)).not.toContain('聊天原文');
    expect(bundle.runTraces[0].events.map((event) => event.type)).toEqual([
      'handoff-dispatched', 'handoff-accepted',
    ]);
  });

  it('consolidates repeated verified routes instead of duplicating procedure memory', async () => {
    await rememberTaskHandoff(handoff(), 'accepted');
    await rememberTaskHandoff(handoff({ planId: 'plan-2' }), 'accepted');
    const procedures = (await listFrostMemories()).filter((memory) => memory.kind === 'procedural');
    expect(procedures).toHaveLength(1);
    expect(procedures[0]).toMatchObject({ repetitions: 2, expertName: 'Pip' });
  });

  it('recalls by topic and supports explicit correction and physical forgetting', async () => {
    await rememberTaskHandoff(handoff(), 'accepted');
    const recalled = await recallFrostMemories('上次的古籍识读交给谁了');
    expect(recalled[0]).toMatchObject({ skillId: 'pocket.guji-reading' });

    const corrected = await correctFrostMemory(recalled[0].id, '这项古籍任务应交给 Pip 并保留疑字。');
    expect(corrected).toMatchObject({ confidence: 1 });
    expect(corrected?.provenance.source).toBe('user-correction');

    await forgetFrostMemory(recalled[0].id);
    expect((await listFrostMemories()).some((memory) => memory.id === recalled[0].id)).toBe(false);
  });

  it('keeps a durable trace separate from semantic memory content', async () => {
    await rememberTaskHandoff(handoff(), 'accepted');
    const traces = await listFrostRunTraces();
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ state: 'accepted', expertId: 'pip', target: 'heritage-guji' });
  });

  it('answers only explicit recall requests from local confirmed records', async () => {
    await rememberTaskHandoff(handoff(), 'accepted');
    await expect(answerFrostMemoryRecallRequest('你还记得什么')).resolves.toContain('Pip 已接收');
    await expect(answerFrostMemoryRecallRequest('帮我识别一页古籍')).resolves.toBeNull();
  });

  it('resolves a recent confirmed handoff when the user uses a colloquial Skill alias', async () => {
    await rememberTaskHandoff(handoff({
      skillId: 'pocket.book-to-earth',
      skillName: 'Book-to-Earth',
      target: 'mapping',
    }), 'accepted');
    await expect(answerFrostMemoryRecallRequest('上次古籍 Mapping 交给谁了'))
      .resolves.toContain('Pip 已接收「Book-to-Earth」');
  });
});
