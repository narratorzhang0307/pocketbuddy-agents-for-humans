import type { SkillExecutionTrace } from '../skill-taskmaster/contracts';
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

function persist(next: CanvasSkillRecord[]) {
  // A quota/storage failure must not be shown as a saved draft or a saved run.
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  memory = next;
  subscribers.forEach((subscriber) => { try { subscriber(); } catch { /* observer only */ } });
}

function executionKey(graph: CompiledSkillGraph): string {
  const { compiled_at: _at, avatar_id: _avatar, avatar_name: _name, avatar_role: _role, ...executable } = graph;
  return JSON.stringify(executable);
}

export function listCanvasSkills(): CanvasSkillRecord[] { return structuredClone(memory); }

export function getCanvasSkill(id: string): CanvasSkillRecord | undefined {
  const found = memory.find((record) => record.graph.skill_id === id);
  return found ? structuredClone(found) : undefined;
}

export function saveCanvasSkill(graph: CompiledSkillGraph, draft: SkillCanvasDraft, latestRun?: SkillRunTrace | SkillExecutionTrace): CanvasSkillRecord {
  const previous = memory.find((item) => item.graph.skill_id === graph.skill_id);
  const run = latestRun || (previous && executionKey(previous.graph) === executionKey(graph) ? previous.latest_run : undefined);
  if (latestRun && latestRun.skill_id !== graph.skill_id) throw new Error('canvas_run_skill_mismatch');
  const record: CanvasSkillRecord = { graph: structuredClone(graph), draft: structuredClone(draft), ...(run ? { latest_run: structuredClone(run) } : {}), saved_at: new Date().toISOString() };
  persist([record, ...memory.filter((item) => item.graph.skill_id !== graph.skill_id)]);
  return structuredClone(record);
}

export function removeCanvasSkill(id: string): void {
  persist(memory.filter((record) => record.graph.skill_id !== id));
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
