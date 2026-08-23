import { compileSkillDraft } from './compiler';
import type {
  CanvasSkillRecord,
  CompiledSkillGraph,
  SkillCanvasDraft,
  SkillEvidenceRecord,
  SkillRunTrace,
} from './contracts';

const MANIFEST_KEY = 'pocket.skill-canvas.v2';
const LEGACY_MANIFEST_KEY = 'pocket.skill-canvas.v1';
const DATABASE = 'pocket-skill-taskmaster';
const DATABASE_VERSION = 1;
const GRAPHS = 'graphs';
const RUNS = 'runs';
const EVIDENCE = 'evidence';

const graphFallback = new Map<string, CompiledSkillGraph>();
const runFallback = new Map<string, SkillRunTrace>();
const evidenceFallback = new Map<string, SkillEvidenceRecord>();
const subscribers = new Set<() => void>();
let databasePromise: Promise<IDBDatabase | null> | null = null;

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('indexeddb_request_failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('indexeddb_transaction_failed'));
    transaction.onabort = () => reject(transaction.error || new Error('indexeddb_transaction_aborted'));
  });
}

function database(): Promise<IDBDatabase | null> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    const request = indexedDB.open(DATABASE, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(GRAPHS)) db.createObjectStore(GRAPHS, { keyPath: 'graph_id' });
      if (!db.objectStoreNames.contains(RUNS)) {
        const store = db.createObjectStore(RUNS, { keyPath: 'run_id' });
        store.createIndex('graph_id', 'graph_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(EVIDENCE)) {
        const store = db.createObjectStore(EVIDENCE, { keyPath: 'evidence_id' });
        store.createIndex('run_id', 'run_id', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return databasePromise;
}

function migrateDraft(value: unknown): SkillCanvasDraft | null {
  if (!value || typeof value !== 'object') return null;
  const draft = structuredClone(value) as Omit<SkillCanvasDraft, 'nodes'> & {
    nodes?: Array<Omit<SkillCanvasDraft['nodes'][number], 'capability'> & { capability: string }>;
  };
  if (!draft.id || !draft.title || !Array.isArray(draft.nodes) || !Array.isArray(draft.edges)) return null;
  const nodes = draft.nodes.map((node) => ({
    ...node,
    capability: node.capability === 'model.qwen'
      ? 'model.gemma'
      : node.capability === 'store.local' ? 'state.skill_completed' : node.capability,
  })) as SkillCanvasDraft['nodes'];
  return { ...draft, nodes } as SkillCanvasDraft;
}

function migrateRecord(value: unknown): CanvasSkillRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<CanvasSkillRecord> & { draft?: unknown };
  const draft = migrateDraft(record.draft);
  if (!draft) return null;
  const compiled = compileSkillDraft(draft);
  if (!compiled.ok || !compiled.graph) return null;
  return {
    graph: compiled.graph,
    draft: compiled.structured,
    saved_at: typeof record.saved_at === 'string' ? record.saved_at : new Date().toISOString(),
  };
}

function loadManifest(): CanvasSkillRecord[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(MANIFEST_KEY) || localStorage.getItem(LEGACY_MANIFEST_KEY) || '[]';
    const values = JSON.parse(raw) as unknown;
    if (!Array.isArray(values)) return [];
    const migrated = values.map(migrateRecord).filter((record): record is CanvasSkillRecord => !!record);
    if (migrated.length) localStorage.setItem(MANIFEST_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return [];
  }
}

let memory: CanvasSkillRecord[] = loadManifest();

function persistManifest() {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(MANIFEST_KEY, JSON.stringify(memory)); } catch { /* manifest stays in memory */ }
  subscribers.forEach((subscriber) => subscriber());
}

export async function persistCompiledGraph(graph: CompiledSkillGraph): Promise<void> {
  graphFallback.set(graph.graph_id, structuredClone(graph));
  const db = await database();
  if (!db) return;
  const transaction = db.transaction(GRAPHS, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(GRAPHS).put(graph);
  await done;
}

export async function getCompiledGraph(graphId: string): Promise<CompiledSkillGraph | null> {
  const db = await database();
  if (!db) return structuredClone(graphFallback.get(graphId) || null);
  const transaction = db.transaction(GRAPHS, 'readonly');
  const done = transactionDone(transaction);
  const graph = await requestValue(transaction.objectStore(GRAPHS).get(graphId)) as CompiledSkillGraph | undefined;
  await done;
  return graph ? structuredClone(graph) : null;
}

export async function persistSkillRun(trace: SkillRunTrace): Promise<void> {
  runFallback.set(trace.run_id, structuredClone(trace));
  const db = await database();
  if (!db) return;
  const transaction = db.transaction(RUNS, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(RUNS).put(trace);
  await done;
}

export async function persistSkillEvidence(record: SkillEvidenceRecord): Promise<void> {
  evidenceFallback.set(record.evidence_id, structuredClone(record));
  const db = await database();
  if (!db) return;
  const transaction = db.transaction(EVIDENCE, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(EVIDENCE).put(record);
  await done;
}

export async function listSkillEvidence(runId: string): Promise<SkillEvidenceRecord[]> {
  const db = await database();
  if (!db) return [...evidenceFallback.values()].filter((record) => record.run_id === runId).map((record) => structuredClone(record));
  const transaction = db.transaction(EVIDENCE, 'readonly');
  const done = transactionDone(transaction);
  const records = await requestValue(transaction.objectStore(EVIDENCE).index('run_id').getAll(runId)) as SkillEvidenceRecord[];
  await done;
  return records.map((record) => structuredClone(record));
}

export function listCanvasSkills(): CanvasSkillRecord[] { return structuredClone(memory); }

export function getCanvasSkill(id: string): CanvasSkillRecord | undefined {
  const found = memory.find((record) => record.graph.skill_id === id);
  return found ? structuredClone(found) : undefined;
}

export function saveCanvasSkill(graph: CompiledSkillGraph, draft: SkillCanvasDraft, latestRun?: SkillRunTrace): CanvasSkillRecord {
  const record: CanvasSkillRecord = {
    graph: structuredClone(graph),
    draft: structuredClone(draft),
    ...(latestRun ? { latest_run: structuredClone(latestRun) } : {}),
    saved_at: new Date().toISOString(),
  };
  memory = [record, ...memory.filter((item) => item.graph.skill_id !== graph.skill_id)];
  persistManifest();
  void persistCompiledGraph(graph);
  if (latestRun) void persistSkillRun(latestRun);
  return structuredClone(record);
}

export function removeCanvasSkill(id: string): void {
  memory = memory.filter((record) => record.graph.skill_id !== id);
  persistManifest();
}

export function subscribeCanvasSkills(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  return () => { subscribers.delete(subscriber); };
}

export function resetCanvasSkillsForTests(): void {
  memory = [];
  graphFallback.clear();
  runFallback.clear();
  evidenceFallback.clear();
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(MANIFEST_KEY);
      localStorage.removeItem(LEGACY_MANIFEST_KEY);
    }
  } catch { /* tests */ }
  subscribers.forEach((subscriber) => subscriber());
}
