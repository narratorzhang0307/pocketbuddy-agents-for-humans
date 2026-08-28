import { beforeEach, describe, expect, it } from 'vitest';
import { deletePlazaWorldDraft, PLAZA_WORLD_DRAFT_KEY, readPlazaWorldDraft, writePlazaWorldDraft, type PlazaWorldDraft } from './worldDraft';

const fallback: PlazaWorldDraft = { name: '我的 Agent World', toneId: 'night', agentId: 'puff', publishedSkillId: 'skill.a' };

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
  };
}

describe('Plaza local world draft', () => {
  let storage = memoryStorage();
  beforeEach(() => { storage = memoryStorage(); });

  it('persists only the compact world definition', () => {
    const saved = writePlazaWorldDraft({ ...fallback, name: '  夜航站  ', agentId: 'mossback' }, storage);
    expect(saved.name).toBe('夜航站');
    expect(saved.savedAt).toBeTruthy();
    expect(readPlazaWorldDraft(fallback, ['night'], ['puff', 'mossback'], ['skill.a', 'skill.b'], storage)).toMatchObject({ name: '夜航站', agentId: 'mossback' });
  });

  it('rejects unknown theme and skill ids without losing a valid name', () => {
    storage.setItem(PLAZA_WORLD_DRAFT_KEY, JSON.stringify({ name: '可信名字', toneId: 'remote-theme', agentId: 'remote-agent', publishedSkillId: 'remote-skill' }));
    expect(readPlazaWorldDraft(fallback, ['night'], ['puff'], ['skill.a'], storage)).toMatchObject({ name: '可信名字', toneId: 'night', agentId: 'puff', publishedSkillId: 'skill.a' });
  });

  it('recovers from malformed storage and deletes only its own key', () => {
    storage.setItem('other-private-data', 'keep');
    storage.setItem(PLAZA_WORLD_DRAFT_KEY, '{broken');
    expect(readPlazaWorldDraft(fallback, ['night'], ['puff'], ['skill.a'], storage)).toEqual(fallback);
    deletePlazaWorldDraft(storage);
    expect(storage.getItem('other-private-data')).toBe('keep');
    expect(storage.getItem(PLAZA_WORLD_DRAFT_KEY)).toBeNull();
  });

  it('surfaces a storage write failure instead of claiming the draft was saved', () => {
    const deniedStorage = {
      getItem: () => null,
      setItem: () => { throw new Error('quota denied'); },
      removeItem: () => undefined,
    };
    expect(() => writePlazaWorldDraft(fallback, deniedStorage)).toThrow('quota denied');
  });
});
