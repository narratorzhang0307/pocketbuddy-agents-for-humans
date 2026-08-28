import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildPocketBuddySystemPrompt,
  refreshPocketBuddyMemoryDigest,
  requestPocketBuddyReply,
} from './brain';
import { getPocketBuddySkill } from './catalog';
import {
  addPocketBuddyConversation,
  addPocketBuddyMemory,
  advancePocketBuddySkillExchange,
  createPocketBuddy,
  derivePocketBuddyGrowth,
  getPocketBuddy,
  listPocketBuddyExchanges,
  loadPocketBuddySkill,
  migratePocketBuddyState,
  practicePocketBuddySkill,
  proposePocketBuddySkillExchange,
  resetPocketBuddiesForTests,
  setPocketBuddySkillPaused,
} from './store';
import { POCKET_BUDDY_SCHEMA_VERSION, type PocketBuddyCategory } from './types';

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
};

const create = (name: string, category: PocketBuddyCategory, now = '2026-08-01T00:00:00.000Z') =>
  createPocketBuddy({
    name,
    category,
    visual: {
      kind: 'preset',
      thumbnailUrl: '/buddy.png',
      backgroundRemoval: 'preset',
    },
    persona: {
      role: '口袋观察员',
      voice: '短句，先确认再回答',
      personality: '先观察，再形成自己的判断；会随记忆慢慢改变',
      goal: '记录真实的城市小事',
      ability: '把散步里的微小线索整理成记忆',
      fear: '害怕重要记忆被误删，也不会替主人做公开决定',
      rule: '不编造见闻',
      traits: ['好奇', '谨慎'],
      agency: 61,
      empathy: 74,
      curiosity: 88,
    },
    privacy: 'private',
    now,
  });

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('localStorage', memoryStorage());
  resetPocketBuddiesForTests();
});

describe('Pocket Buddy domain store', () => {
  it('creates an independent buddy with an origin memory and traceable core skill', () => {
    const buddy = create('罐罐', 'object');
    expect(buddy.schemaVersion).toBe(POCKET_BUDDY_SCHEMA_VERSION);
    expect(buddy.status).toBe('in-pocket');
    expect(buddy.memories).toHaveLength(1);
    expect(buddy.memories[0]).toMatchObject({ kind: 'origin', visibility: 'private' });
    expect(buddy.memories[0].content).not.toContain('data:image');
    expect(buddy.skills[0].state).toBe('mastered');
    expect(getPocketBuddySkill(buddy.skills[0].skillId)).toBeDefined();
    expect(getPocketBuddy(buddy.id)?.persona).toMatchObject({
      personality: '先观察，再形成自己的判断；会随记忆慢慢改变',
      ability: '把散步里的微小线索整理成记忆',
      fear: '害怕重要记忆被误删，也不会替主人做公开决定',
    });
  });

  it('keeps a catalog identity while starting our own growth sequence', () => {
    const buddy = createPocketBuddy({
      name: 'Miko',
      category: 'object',
      visual: {
        kind: 'preset',
        catalogId: 'miko',
        thumbnailUrl: '',
        backgroundRemoval: 'preset',
      },
      persona: {
        role: '咖啡馆管理员',
        voice: '温暖务实',
        goal: '保留微小记忆',
        rule: '不编造见闻',
        traits: ['温柔', '耐心'],
        agency: 60,
        empathy: 80,
        curiosity: 70,
      },
      privacy: 'private',
      now: '2026-08-01T00:00:00.000Z',
    });
    expect(buddy.visual.catalogId).toBe('miko');
    expect(buddy.memories).toHaveLength(1);
    expect(buddy.memories[0].kind).toBe('origin');
    expect(getPocketBuddy(buddy.id)?.visual.catalogId).toBe('miko');
  });

  it('keeps both sides of a conversation as private memories', () => {
    const buddy = create('阿圆', 'fantasy');
    addPocketBuddyConversation(buddy.id, '今天走了很远。', '我听见了，要把哪一段留下？');
    const saved = getPocketBuddy(buddy.id);
    expect(saved?.memories.slice(0, 2).map((memory) => memory.speaker)).toEqual([
      'buddy',
      'user',
    ]);
    expect(saved?.memories.slice(0, 2).every((memory) => memory.visibility === 'private')).toBe(true);
    expect(saved?.memoryDigest).toContain('今天走了很远');
  });

  it('requires evidence to progress a skill and supports pausing and rollback', () => {
    const buddy = create('镜头仔', 'device');
    loadPocketBuddySkill(buddy.id, 'memory-postcard');
    practicePocketBuddySkill(buddy.id, 'memory-postcard', '整理了第一段确认过的散步记录');
    let saved = getPocketBuddy(buddy.id);
    expect(saved?.skills.find((skill) => skill.skillId === 'memory-postcard')).toMatchObject({
      state: 'learning',
      proficiency: 30,
      confidence: 32,
    });
    expect(saved?.memories[0].kind).toBe('skill');
    setPocketBuddySkillPaused(buddy.id, 'memory-postcard', true);
    saved = getPocketBuddy(buddy.id);
    expect(saved?.skills.find((skill) => skill.skillId === 'memory-postcard')?.state).toBe('paused');
  });

  it('runs a consented seven-stage local skill exchange with provenance and reflection', () => {
    const teacher = create('豆豆', 'animal');
    const learner = create('路标', 'device');
    const skillId = teacher.skills[0].skillId;
    const exchange = proposePocketBuddySkillExchange({
      teacherBuddyId: teacher.id,
      learnerBuddyId: learner.id,
      skillId,
    });
    for (let step = 0; step < 7; step += 1) {
      advancePocketBuddySkillExchange(exchange.id);
    }
    const final = listPocketBuddyExchanges()[0];
    const learned = getPocketBuddy(learner.id);
    const bondedTeacher = getPocketBuddy(teacher.id);
    expect(final).toMatchObject({
      stage: 'complete',
      consent: true,
      result: 'passed',
      memoryCreated: true,
    });
    expect(learned?.skills.find((skill) => skill.skillId === skillId)).toMatchObject({
      learnedFromBuddyId: teacher.id,
      state: 'learning',
    });
    expect(learned?.memories.some((memory) => memory.kind === 'reflection')).toBe(true);
    expect(bondedTeacher?.bonds.some((bond) => bond.buddyId === learner.id)).toBe(true);
  });

  it('does not downgrade a learner who already mastered the same skill', () => {
    const teacher = create('豆豆', 'animal');
    const learner = create('泡泡', 'animal');
    expect(() => proposePocketBuddySkillExchange({
      teacherBuddyId: teacher.id,
      learnerBuddyId: learner.id,
      skillId: teacher.skills[0].skillId,
    })).toThrow('已经掌握');
    expect(getPocketBuddy(learner.id)?.skills[0].state).toBe('mastered');
  });

  it('sanitizes corrupted persisted records instead of reviving unknown skills', () => {
    const migrated = migratePocketBuddyState({
      schemaVersion: 1,
      buddies: [{
        id: 'buddy-1',
        name: '  小灯  ',
        category: 'device',
        visual: { kind: 'preset', catalogId: 'luma', thumbnailUrl: '/lamp.png', backgroundRemoval: 'preset' },
        persona: { role: '灯', voice: '轻声', goal: '照亮', rule: '不越界', traits: ['耐心'] },
        memories: [{ id: 'bad', content: '', createdAt: 'not-a-date' }],
        skills: [{ skillId: 'unknown-skill' }],
        bonds: [],
        status: 'somewhere',
        privacy: 'nobody',
        createdAt: '2026-08-01T00:00:00.000Z',
      }],
      exchanges: [],
    });
    expect(migrated.buddies[0]).toMatchObject({
      name: '小灯',
      status: 'in-pocket',
      privacy: 'private',
      visual: { catalogId: 'luma' },
    });
    expect(migrated.buddies[0].skills).toEqual([]);
    expect(migrated.buddies[0].memories).toEqual([]);
    expect(migrated.buddies[0].persona).toMatchObject({
      personality: '独立而有主见，会被自己的记忆和关系慢慢塑造',
      ability: '观察、陪伴，并把零散经历整理成可以回看的记忆',
      fear: '失去自己最古老、最重要的那段记忆',
    });
  });

  it('derives growth from memories, mastered skills and bonds', () => {
    const buddy = create('慢慢', 'fantasy');
    for (let index = 0; index < 20; index += 1) {
      addPocketBuddyMemory(buddy.id, {
        kind: 'diary',
        speaker: 'user',
        content: `第 ${index + 1} 条观察`,
      });
    }
    expect(derivePocketBuddyGrowth(getPocketBuddy(buddy.id)!)).toMatchObject({
      level: 2,
      memoryCount: 21,
      masteredSkillCount: 1,
    });
  });
});

describe('Pocket Buddy brain', () => {
  it('builds a bounded prompt from identity, memories and skill bindings', () => {
    const buddy = create('罐罐', 'object');
    addPocketBuddyMemory(buddy.id, {
      kind: 'city',
      speaker: 'user',
      content: '在梧桐树下看见一片黄色叶子。',
    });
    const prompt = buildPocketBuddySystemPrompt(getPocketBuddy(buddy.id)!);
    expect(prompt).toContain('不伪造地点、见闻、步数');
    expect(prompt).toContain('梧桐树下');
    expect(prompt).toContain('长期印象');
    expect(prompt).toContain('已加载 Skills');
  });

  it('uses the existing cloud backend to roll an approved interaction into the long-term digest', async () => {
    const buddy = create('罐罐', 'object');
    const saved = addPocketBuddyConversation(buddy.id, '记住我喜欢梧桐叶。', '好，我只记你确认的这一点。')!;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      text: '{"memoryDigest":"我记得主人喜欢梧桐叶，而且要求我只保存确认过的事。"}',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await refreshPocketBuddyMemoryDigest(saved, '主人说喜欢梧桐叶。', { allowCloud: true });

    expect(getPocketBuddy(buddy.id)?.memoryDigest).toContain('喜欢梧桐叶');
    expect(getPocketBuddy(buddy.id)?.memories).toHaveLength(3);
  });

  it('does not send private memories to the cloud unless the user explicitly opts in', async () => {
    const buddy = create('罐罐', 'object');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const reply = await requestPocketBuddyReply(buddy, '今天有点累');
    expect(reply).toContain('先陪你');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
