/**
 * Frost Harness · 本地长期记忆与可审计 RunTrace。
 *
 * 设计边界：
 * - 只记用户已经主动确认的“任务交接事实”，不永久保存聊天原文、图片或 OCR 正文。
 * - episodic（一次交接）与 procedural（反复验证过的路由）分开存放。
 * - 每条记录带来源、置信度、时间和专家；支持召回、纠正、遗忘与导出。
 * - IndexedDB 不可用时仅退化到进程内存，绝不改走云端。
 */

export const FROST_MEMORY_PROTOCOL = 'pocket-frost-memory/v1' as const;
export const FROST_MEMORY_EVENT = 'pocket-earth:frost-memory-changed';

export type FrostLongTermMemoryKind = 'episodic' | 'semantic' | 'procedural';
export type FrostMemoryTier = 'short-term' | 'long-term';
export type FrostHandoffPhase = 'dispatched' | 'accepted';

export interface FrostMemoryProvenance {
  source: 'frost-handoff' | 'user-correction' | 'user-note';
  planId?: string;
  stepId?: string;
  runId?: string;
  target?: string;
}

export interface FrostLongTermMemory {
  protocol: typeof FROST_MEMORY_PROTOCOL;
  id: string;
  kind: FrostLongTermMemoryKind;
  tier: FrostMemoryTier;
  summary: string;
  topic: string;
  tags: string[];
  skillId?: string;
  expertId?: string;
  expertName?: string;
  phase?: FrostHandoffPhase;
  repetitions: number;
  confidence: number;
  salience: number;
  privacy: 'private-local';
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string;
  accessCount: number;
  expiresAt?: string;
  correctedAt?: string;
  provenance: FrostMemoryProvenance;
}

export type FrostRunEventType = 'handoff-dispatched' | 'handoff-accepted';

export interface FrostRunEvent {
  type: FrostRunEventType;
  at: string;
  detail: string;
}

export interface FrostRunTrace {
  id: string;
  protocol: 'pocket-frost-run-trace/v1';
  planId: string;
  stepId: string;
  skillId: string;
  skillName: string;
  target: string;
  expertId: string;
  expertName: string;
  state: FrostHandoffPhase;
  createdAt: string;
  updatedAt: string;
  events: FrostRunEvent[];
}

export interface FrostHandoffMemoryInput {
  planId: string;
  stepId: string;
  skillId: string;
  skillName: string;
  target: string;
  expertId: string;
  expertName: string;
}

const DATABASE = 'pe-frost-harness';
const VERSION = 1;
const MEMORIES = 'memories';
const TRACES = 'runTraces';
const MAX_ACTIVE_MEMORIES = 300;
const SHORT_TERM_DAYS = 30;

const fallbackMemories = new Map<string, FrostLongTermMemory>();
const fallbackTraces = new Map<string, FrostRunTrace>();
let databasePromise: Promise<IDBDatabase | null> | null = null;
let handoffWriteQueue: Promise<void> = Promise.resolve();

function nowIso(): string { return new Date().toISOString(); }
function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
function compact(value: string, max = 240): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}
function clone<T>(value: T): T { return structuredClone(value); }
function notify(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(FROST_MEMORY_EVENT));
}

const requestValue = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('frost_memory_request_failed'));
});

const transactionDone = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error || new Error('frost_memory_transaction_failed'));
  transaction.onabort = () => reject(transaction.error || new Error('frost_memory_transaction_aborted'));
});

function database(): Promise<IDBDatabase | null> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    try {
      const request = indexedDB.open(DATABASE, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(MEMORIES)) {
          const store = db.createObjectStore(MEMORIES, { keyPath: 'id' });
          store.createIndex('kind', 'kind', { unique: false });
          store.createIndex('skillId', 'skillId', { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(TRACES)) {
          const store = db.createObjectStore(TRACES, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { databasePromise = null; resolve(null); };
      request.onblocked = () => { databasePromise = null; resolve(null); };
    } catch { databasePromise = null; resolve(null); }
  });
  return databasePromise;
}

async function readMemory(id: string): Promise<FrostLongTermMemory | null> {
  const db = await database();
  if (!db) return fallbackMemories.has(id) ? clone(fallbackMemories.get(id)!) : null;
  const transaction = db.transaction(MEMORIES, 'readonly');
  const committed = transactionDone(transaction);
  const value = await requestValue(transaction.objectStore(MEMORIES).get(id)) as FrostLongTermMemory | undefined;
  await committed;
  return value ? clone(value) : null;
}

async function putMemory(record: FrostLongTermMemory): Promise<void> {
  const db = await database();
  if (!db) { fallbackMemories.set(record.id, clone(record)); notify(); return; }
  const transaction = db.transaction(MEMORIES, 'readwrite');
  const committed = transactionDone(transaction);
  transaction.objectStore(MEMORIES).put(record);
  await committed;
  notify();
}

async function deleteMemory(id: string): Promise<void> {
  const db = await database();
  if (!db) { fallbackMemories.delete(id); notify(); return; }
  const transaction = db.transaction(MEMORIES, 'readwrite');
  const committed = transactionDone(transaction);
  transaction.objectStore(MEMORIES).delete(id);
  await committed;
  notify();
}

async function readTrace(id: string): Promise<FrostRunTrace | null> {
  const db = await database();
  if (!db) return fallbackTraces.has(id) ? clone(fallbackTraces.get(id)!) : null;
  const transaction = db.transaction(TRACES, 'readonly');
  const committed = transactionDone(transaction);
  const value = await requestValue(transaction.objectStore(TRACES).get(id)) as FrostRunTrace | undefined;
  await committed;
  return value ? clone(value) : null;
}

async function putTrace(trace: FrostRunTrace): Promise<void> {
  const db = await database();
  if (!db) { fallbackTraces.set(trace.id, clone(trace)); notify(); return; }
  const transaction = db.transaction(TRACES, 'readwrite');
  const committed = transactionDone(transaction);
  transaction.objectStore(TRACES).put(trace);
  await committed;
  notify();
}

function traceId(input: FrostHandoffMemoryInput): string { return `${input.planId}:${input.stepId}`; }
function episodicId(input: FrostHandoffMemoryInput): string { return `handoff:${traceId(input)}`; }
function proceduralId(skillId: string): string { return `route:${skillId}`; }

function shortTermExpiry(at: string): string {
  return new Date(new Date(at).getTime() + SHORT_TERM_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function memoryFromHandoff(input: FrostHandoffMemoryInput, phase: FrostHandoffPhase, existing: FrostLongTermMemory | null): FrostLongTermMemory {
  const at = nowIso();
  const accepted = phase === 'accepted';
  return {
    protocol: FROST_MEMORY_PROTOCOL,
    id: episodicId(input),
    kind: 'episodic',
    tier: accepted ? 'long-term' : 'short-term',
    summary: accepted
      ? `${input.expertName} 已接收「${input.skillName}」任务；目标 Skill 的质量门与确认门继续生效。`
      : `Frost 已把「${input.skillName}」任务交给 ${input.expertName}，等待目标 Skill 接手。`,
    topic: input.skillName,
    tags: [input.skillId, input.skillName, input.expertId, input.expertName, phase],
    skillId: input.skillId,
    expertId: input.expertId,
    expertName: input.expertName,
    phase,
    repetitions: 1,
    confidence: accepted ? 0.92 : 0.72,
    salience: accepted ? 0.72 : 0.45,
    privacy: 'private-local',
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
    lastAccessedAt: existing?.lastAccessedAt ?? at,
    accessCount: existing?.accessCount ?? 0,
    ...(accepted ? {} : { expiresAt: shortTermExpiry(at) }),
    provenance: {
      source: 'frost-handoff',
      planId: input.planId,
      stepId: input.stepId,
      runId: traceId(input),
      target: input.target,
    },
  };
}

async function consolidateProcedure(input: FrostHandoffMemoryInput): Promise<void> {
  const id = proceduralId(input.skillId);
  const existing = await readMemory(id);
  const at = nowIso();
  const repetitions = Math.min(999, (existing?.repetitions ?? 0) + 1);
  const record: FrostLongTermMemory = {
    protocol: FROST_MEMORY_PROTOCOL,
    id,
    kind: 'procedural',
    tier: 'long-term',
    summary: `已确认 ${repetitions} 次由 ${input.expertName} 接手「${input.skillName}」；仍须经过该 Skill 自己的质量门。`,
    topic: `Frost 专家路由 · ${input.skillName}`,
    tags: [input.skillId, input.skillName, input.expertId, input.expertName, '专家路由'],
    skillId: input.skillId,
    expertId: input.expertId,
    expertName: input.expertName,
    phase: 'accepted',
    repetitions,
    confidence: clamp(0.62 + Math.min(repetitions, 12) * 0.025),
    salience: clamp(0.52 + Math.min(repetitions, 10) * 0.02),
    privacy: 'private-local',
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
    lastAccessedAt: existing?.lastAccessedAt ?? at,
    accessCount: existing?.accessCount ?? 0,
    provenance: { source: 'frost-handoff', target: input.target },
  };
  await putMemory(record);
}

async function appendTrace(input: FrostHandoffMemoryInput, phase: FrostHandoffPhase): Promise<void> {
  const id = traceId(input);
  const existing = await readTrace(id);
  if (existing?.events.some((event) => event.type === `handoff-${phase}`)) return;
  const at = nowIso();
  const event: FrostRunEvent = {
    type: `handoff-${phase}`,
    at,
    detail: phase === 'accepted'
      ? `${input.expertName} / ${input.skillName} 已打开目标入口`
      : `Frost 已完成权限检查并交接给 ${input.expertName}`,
  };
  await putTrace({
    id,
    protocol: 'pocket-frost-run-trace/v1',
    planId: input.planId,
    stepId: input.stepId,
    skillId: input.skillId,
    skillName: input.skillName,
    target: input.target,
    expertId: input.expertId,
    expertName: input.expertName,
    state: phase,
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
    events: [...(existing?.events ?? []), event].slice(-20),
  });
}

async function persistTaskHandoff(input: FrostHandoffMemoryInput, phase: FrostHandoffPhase): Promise<void> {
  const existing = await readMemory(episodicId(input));
  await putMemory(memoryFromHandoff(input, phase, existing));
  await appendTrace(input, phase);
  if (phase === 'accepted') {
    await consolidateProcedure(input);
    await pruneFrostMemories();
  }
}

/** Persist one confirmed handoff lifecycle transition. Never receives or stores userText. */
export function rememberTaskHandoff(input: FrostHandoffMemoryInput, phase: FrostHandoffPhase): Promise<void> {
  const write = () => persistTaskHandoff(input, phase);
  handoffWriteQueue = handoffWriteQueue.then(write, write);
  return handoffWriteQueue;
}

export async function listFrostMemories(): Promise<FrostLongTermMemory[]> {
  const db = await database();
  const values = db
    ? await (async () => {
      const transaction = db.transaction(MEMORIES, 'readonly');
      const committed = transactionDone(transaction);
      const records = await requestValue(transaction.objectStore(MEMORIES).getAll()) as FrostLongTermMemory[];
      await committed;
      return records;
    })()
    : [...fallbackMemories.values()];
  const now = Date.now();
  return values
    .filter((record) => !record.expiresAt || new Date(record.expiresAt).getTime() > now)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map(clone);
}

export async function listFrostRunTraces(): Promise<FrostRunTrace[]> {
  const db = await database();
  const values = db
    ? await (async () => {
      const transaction = db.transaction(TRACES, 'readonly');
      const committed = transactionDone(transaction);
      const traces = await requestValue(transaction.objectStore(TRACES).getAll()) as FrostRunTrace[];
      await committed;
      return traces;
    })()
    : [...fallbackTraces.values()];
  return values.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).map(clone);
}

function tokens(value: string): Set<string> {
  const normalized = value.toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, ' ').trim();
  const result = new Set(normalized.split(/\s+/).filter((token) => token.length >= 2));
  const han = normalized.replace(/[^\u3400-\u9fff]/g, '');
  for (let index = 0; index < han.length - 1; index += 1) result.add(han.slice(index, index + 2));
  return result;
}

function recallScore(query: Set<string>, memory: FrostLongTermMemory): number {
  const haystack = tokens([memory.summary, memory.topic, ...memory.tags].join(' '));
  let overlap = 0;
  for (const token of query) if (haystack.has(token)) overlap += 1;
  if (!overlap) return 0;
  const ageDays = Math.max(0, (Date.now() - new Date(memory.updatedAt).getTime()) / 86_400_000);
  const recency = 1 / (1 + ageDays / 30);
  return overlap * 2 + memory.confidence + memory.salience + recency + Math.min(memory.repetitions, 10) * 0.04;
}

export async function recallFrostMemories(query: string, limit = 6): Promise<FrostLongTermMemory[]> {
  const queryTokens = tokens(query);
  if (!queryTokens.size) return [];
  const ranked = (await listFrostMemories())
    .map((memory) => ({ memory, score: recallScore(queryTokens, memory) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || right.memory.updatedAt.localeCompare(left.memory.updatedAt))
    .slice(0, Math.max(1, Math.min(limit, 12)));
  const accessedAt = nowIso();
  await Promise.all(ranked.map(async ({ memory }) => {
    const updated = { ...memory, lastAccessedAt: accessedAt, accessCount: memory.accessCount + 1 };
    await putMemory(updated);
  }));
  return ranked.map(({ memory }) => ({ ...memory, lastAccessedAt: accessedAt, accessCount: memory.accessCount + 1 }));
}

const MEMORY_RECALL_INTENT = /(长期记忆|记忆记录|你还记得|记得什么|回忆一下|上次.*(?:交给|接手|用了)|谁.*(?:接手|负责))/;

/** Explicit local recall command. It never calls Qwen/MNN and never exposes hidden reasoning. */
export function isFrostMemoryRecallRequest(text: string): boolean {
  return MEMORY_RECALL_INTENT.test(compact(text, 200));
}

export async function answerFrostMemoryRecallRequest(text: string): Promise<string | null> {
  if (!isFrostMemoryRecallRequest(text)) return null;
  const generic = /(长期记忆|记忆记录|你还记得什么|记得什么)/.test(text);
  let memories = generic
    ? (await listFrostMemories()).slice(0, 6)
    : await recallFrostMemories(text, 6);
  // “上次/最近”是明确的时间指代。用户使用口语别名（例如“上次热身”）时，
  // 若别名没有命中 Skill 的正式名称，安全地退回最近的已接收交接；不猜未确认任务。
  if (!memories.length && /(上次|最近|刚才)/.test(text)) {
    memories = (await listFrostMemories())
      .filter((memory) => memory.phase === 'accepted')
      .slice(0, 6);
  }
  if (!memories.length) return '本机长期记忆里还没有已确认的任务交接。完成一次 Frost → 专家 → Skill 交接后，我才会记住。';
  return [
    '我只从本机已确认的交接记录里找到：',
    ...memories.map((memory, index) => `${index + 1}. ${memory.summary}`),
    '聊天原文、图片和 OCR 正文没有进入长期记忆。',
  ].join('\n');
}

/** User correction is explicit and keeps the original provenance. */
export async function correctFrostMemory(id: string, summary: string): Promise<FrostLongTermMemory | null> {
  const existing = await readMemory(id);
  const corrected = compact(summary);
  if (!existing || !corrected) return null;
  const at = nowIso();
  const next: FrostLongTermMemory = {
    ...existing,
    summary: corrected,
    confidence: 1,
    updatedAt: at,
    correctedAt: at,
    provenance: { ...existing.provenance, source: 'user-correction' },
  };
  await putMemory(next);
  return clone(next);
}

/** Forget means physical deletion, not a hidden tombstone. */
export async function forgetFrostMemory(id: string): Promise<void> {
  await deleteMemory(id);
}

export async function pruneFrostMemories(): Promise<void> {
  const values = await listFrostMemories();
  const overflow = values.slice(MAX_ACTIVE_MEMORIES);
  await Promise.all(overflow.map((memory) => deleteMemory(memory.id)));
}

export async function exportFrostMemoryBundle(): Promise<{
  protocol: 'pocket-frost-memory-export/v1';
  exportedAt: string;
  memories: FrostLongTermMemory[];
  runTraces: FrostRunTrace[];
}> {
  return {
    protocol: 'pocket-frost-memory-export/v1',
    exportedAt: nowIso(),
    memories: await listFrostMemories(),
    runTraces: await listFrostRunTraces(),
  };
}

export async function clearFrostMemory(): Promise<void> {
  const db = await database();
  if (!db) {
    fallbackMemories.clear();
    fallbackTraces.clear();
    notify();
    return;
  }
  const transaction = db.transaction([MEMORIES, TRACES], 'readwrite');
  const committed = transactionDone(transaction);
  transaction.objectStore(MEMORIES).clear();
  transaction.objectStore(TRACES).clear();
  await committed;
  notify();
}

export function subscribeFrostMemory(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(FROST_MEMORY_EVENT, listener);
  return () => window.removeEventListener(FROST_MEMORY_EVENT, listener);
}

/** Tests use the no-IndexedDB in-memory fallback. */
export async function resetFrostMemoryForTests(): Promise<void> {
  await handoffWriteQueue.catch(() => undefined);
  fallbackMemories.clear();
  fallbackTraces.clear();
  if (databasePromise) await clearFrostMemory();
}
