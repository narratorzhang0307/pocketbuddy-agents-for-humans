export type PlazaWorldDraft = {
  name: string;
  toneId: string;
  agentId: string;
  publishedSkillId: string;
  savedAt?: string;
};

export const PLAZA_WORLD_DRAFT_KEY = 'pocket-earth.plaza-world-draft.v1';

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): DraftStorage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage;
}

export function readPlazaWorldDraft(fallback: PlazaWorldDraft, validToneIds: readonly string[], validAgentIds: readonly string[], validSkillIds: readonly string[], storage = browserStorage()): PlazaWorldDraft {
  if (!storage) return fallback;
  try {
    const stored = JSON.parse(storage.getItem(PLAZA_WORLD_DRAFT_KEY) || 'null') as Partial<PlazaWorldDraft> | null;
    if (!stored) return fallback;
    return {
      name: typeof stored.name === 'string' && stored.name.trim() ? stored.name.trim().slice(0, 18) : fallback.name,
      toneId: validToneIds.includes(String(stored.toneId)) ? String(stored.toneId) : fallback.toneId,
      agentId: validAgentIds.includes(String(stored.agentId)) ? String(stored.agentId) : fallback.agentId,
      publishedSkillId: validSkillIds.includes(String(stored.publishedSkillId)) ? String(stored.publishedSkillId) : fallback.publishedSkillId,
      savedAt: typeof stored.savedAt === 'string' ? stored.savedAt : undefined,
    };
  } catch {
    return fallback;
  }
}

export function writePlazaWorldDraft(draft: PlazaWorldDraft, storage = browserStorage()): PlazaWorldDraft {
  if (!storage) throw new Error('Plaza world draft storage unavailable');
  const saved = { ...draft, name: draft.name.trim().slice(0, 18), savedAt: new Date().toISOString() };
  storage.setItem(PLAZA_WORLD_DRAFT_KEY, JSON.stringify(saved));
  return saved;
}

export function deletePlazaWorldDraft(storage = browserStorage()): void {
  storage?.removeItem(PLAZA_WORLD_DRAFT_KEY);
}
