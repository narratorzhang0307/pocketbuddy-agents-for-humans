import type { CanvasSkillRecord, CompiledSkillGraph, SkillCanvasDraft, SkillRunTrace } from './contracts';

const STORAGE_KEY = 'pocket.skill-canvas.v1';
let memory: CanvasSkillRecord[] = load();
const subscribers = new Set<() => void>();

function validRecord(value: unknown): value is CanvasSkillRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<CanvasSkillRecord>;
  return record.graph?.protocol === 'pocket-skill-graph/v1' && typeof record.graph.skill_id === 'string' && Array.isArray(record.draft?.nodes);
}

function load(): CanvasSkillRecord[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.filter(validRecord) : [];
  } catch {
    return [];
  }
}

function persist() {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(memory)); } catch { /* memory remains usable */ }
  subscribers.forEach((subscriber) => subscriber());
}

export function listCanvasSkills(): CanvasSkillRecord[] { return structuredClone(memory); }

export function getCanvasSkill(id: string): CanvasSkillRecord | undefined {
  const found = memory.find((record) => record.graph.skill_id === id);
  return found ? structuredClone(found) : undefined;
}

export function saveCanvasSkill(graph: CompiledSkillGraph, draft: SkillCanvasDraft, latestRun?: SkillRunTrace): CanvasSkillRecord {
  const record: CanvasSkillRecord = { graph: structuredClone(graph), draft: structuredClone(draft), ...(latestRun ? { latest_run: structuredClone(latestRun) } : {}), saved_at: new Date().toISOString() };
  memory = [record, ...memory.filter((item) => item.graph.skill_id !== graph.skill_id)];
  persist();
  return structuredClone(record);
}

export function removeCanvasSkill(id: string): void {
  memory = memory.filter((record) => record.graph.skill_id !== id);
  persist();
}

export function subscribeCanvasSkills(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  return () => { subscribers.delete(subscriber); };
}

export function resetCanvasSkillsForTests(): void {
  memory = [];
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY); } catch { /* tests */ }
  subscribers.forEach((subscriber) => subscriber());
}
