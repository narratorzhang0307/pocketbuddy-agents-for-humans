import { getPocketBuddySkill, recommendedPocketBuddySkill } from './catalog';
import {
  POCKET_BUDDY_SCHEMA_VERSION,
  type PocketBuddy,
  type PocketBuddyCategory,
  type PocketBuddyExchangeStage,
  type PocketBuddyGrowth,
  type PocketBuddyMemory,
  type PocketBuddyMemoryKind,
  type PocketBuddyMemorySpeaker,
  type PocketBuddyPersona,
  type PocketBuddySkillBinding,
  type PocketBuddySkillExchange,
  type PocketBuddyState,
  type PocketBuddyStatus,
  type PocketBuddyVisibility,
  type PocketBuddyVisual,
} from './types';

const STORAGE_KEY = 'shangjie.pocket-buddies.v1';
const EVENT_NAME = 'shangjie:pocket-buddies-changed';
export const MAX_POCKET_BUDDIES = 16;
const MAX_MEMORIES_PER_BUDDY = 120;
let fallbackId = 0;

const EXCHANGE_STAGES: readonly PocketBuddyExchangeStage[] = [
  'discover',
  'consent',
  'demonstrate',
  'imitate',
  'evaluate',
  'store',
  'reflect',
  'complete',
];

const defaults = (): PocketBuddyState => ({
  schemaVersion: POCKET_BUDDY_SCHEMA_VERSION,
  buddies: [],
  exchanges: [],
});

const clamp = (value: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const nowIso = () => new Date().toISOString();

function createId(prefix: string) {
  const token =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${(fallbackId += 1).toString(36)}`;
  return `${prefix}-${token}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

const text = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const stringList = (value: unknown, limit = 20) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, limit)
    : [];

function normalizeMemory(value: unknown): PocketBuddyMemory | null {
  if (!isRecord(value) || !isIso(value.createdAt)) return null;
  const kinds: PocketBuddyMemoryKind[] = [
    'origin', 'chat', 'camera', 'diary', 'city', 'skill', 'reflection',
  ];
  const speakers: PocketBuddyMemorySpeaker[] = ['user', 'buddy', 'system'];
  const visibilities: PocketBuddyVisibility[] = ['private', 'friends', 'public'];
  const content = text(value.content);
  if (!content) return null;
  return {
    id: text(value.id, createId('memory')),
    kind: kinds.includes(value.kind as PocketBuddyMemoryKind)
      ? (value.kind as PocketBuddyMemoryKind)
      : 'diary',
    speaker: speakers.includes(value.speaker as PocketBuddyMemorySpeaker)
      ? (value.speaker as PocketBuddyMemorySpeaker)
      : 'system',
    content: content.slice(0, 1200),
    visibility: visibilities.includes(value.visibility as PocketBuddyVisibility)
      ? (value.visibility as PocketBuddyVisibility)
      : 'private',
    eventRefs: stringList(value.eventRefs, 16),
    createdAt: value.createdAt,
  };
}

function localMemoryDigest(name: string, memories: readonly PocketBuddyMemory[]) {
  const events = memories
    .filter((memory) => memory.kind !== 'origin' || memories.length === 1)
    .slice(0, 4)
    .map((memory) => memory.content.replace(/\s+/g, ' ').slice(0, 48));
  if (!events.length) return `我是${name}，还在等待第一段值得长期保留的记忆。`;
  return `我记得：${events.join('；')}`.slice(0, 160);
}

function withMemories(buddy: PocketBuddy, memories: PocketBuddyMemory[]) {
  const bounded = memories.slice(0, MAX_MEMORIES_PER_BUDDY);
  return {
    ...buddy,
    memories: bounded,
    memoryDigest: localMemoryDigest(buddy.name, bounded),
  };
}

function normalizeSkillBinding(value: unknown): PocketBuddySkillBinding | null {
  if (!isRecord(value)) return null;
  const skillId = text(value.skillId);
  const definition = getPocketBuddySkill(skillId);
  if (!definition) return null;
  const states: PocketBuddySkillBinding['state'][] = [
    'interested', 'learning', 'mastered', 'paused',
  ];
  const permission = isRecord(value.permission) ? value.permission : {};
  const share: PocketBuddyVisibility = ['private', 'friends', 'public'].includes(
    permission.share as PocketBuddyVisibility,
  )
    ? (permission.share as PocketBuddyVisibility)
    : definition.defaultShare;
  const loadedAt = isIso(value.loadedAt) ? value.loadedAt : nowIso();
  return {
    skillId,
    skillVersion: text(value.skillVersion, definition.version),
    state: states.includes(value.state as PocketBuddySkillBinding['state'])
      ? (value.state as PocketBuddySkillBinding['state'])
      : 'interested',
    proficiency: clamp(Number(value.proficiency)),
    confidence: clamp(Number(value.confidence)),
    ...(text(value.learnedFromBuddyId)
      ? { learnedFromBuddyId: text(value.learnedFromBuddyId) }
      : {}),
    permission: {
      share,
      tools: stringList(permission.tools, 12),
    },
    evidenceRefs: stringList(value.evidenceRefs, 40),
    loadedAt,
    updatedAt: isIso(value.updatedAt) ? value.updatedAt : loadedAt,
  };
}

function normalizeBuddy(value: unknown): PocketBuddy | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const name = text(value.name);
  const visual = isRecord(value.visual) ? value.visual : null;
  const persona = isRecord(value.persona) ? value.persona : null;
  if (!id || !name || !visual || !persona || !isIso(value.createdAt)) return null;
  const categories: PocketBuddyCategory[] = ['animal', 'object', 'device', 'fantasy'];
  const visibilities: PocketBuddyVisibility[] = ['private', 'friends', 'public'];
  const statuses: PocketBuddyStatus[] = ['in-pocket', 'resident', 'visiting', 'resting'];
  const visualKinds: PocketBuddyVisual['kind'][] = ['local-cutout', 'mascot', 'preset'];
  const removalKinds: PocketBuddyVisual['backgroundRemoval'][] = ['local', 'service', 'preset'];
  const createdAt = value.createdAt;
  const traits = stringList(persona.traits, 3);
  const memories = (Array.isArray(value.memories) ? value.memories : [])
    .map(normalizeMemory)
    .filter((memory): memory is PocketBuddyMemory => memory !== null)
    .slice(0, MAX_MEMORIES_PER_BUDDY);
  return {
    schemaVersion: POCKET_BUDDY_SCHEMA_VERSION,
    id,
    name: name.slice(0, 24),
    category: categories.includes(value.category as PocketBuddyCategory)
      ? (value.category as PocketBuddyCategory)
      : 'object',
    visual: {
      kind: visualKinds.includes(visual.kind as PocketBuddyVisual['kind'])
        ? (visual.kind as PocketBuddyVisual['kind'])
        : 'local-cutout',
      ...(text(visual.catalogId) ? { catalogId: text(visual.catalogId) } : {}),
      ...(text(visual.portraitBlobId) ? { portraitBlobId: text(visual.portraitBlobId) } : {}),
      thumbnailUrl: text(visual.thumbnailUrl),
      ...(text(visual.sourceFileName) ? { sourceFileName: text(visual.sourceFileName) } : {}),
      backgroundRemoval: removalKinds.includes(
        visual.backgroundRemoval as PocketBuddyVisual['backgroundRemoval'],
      )
        ? (visual.backgroundRemoval as PocketBuddyVisual['backgroundRemoval'])
        : 'local',
      ...(text(visual.promptVersion) ? { promptVersion: text(visual.promptVersion) } : {}),
    },
    persona: {
      role: text(persona.role, '口袋里的城市伙伴'),
      personality: text(persona.personality, '独立而有主见，会被自己的记忆和关系慢慢塑造'),
      voice: text(persona.voice, '亲近、自然，先听完再回答'),
      goal: text(persona.goal, '陪用户发现值得记住的小事'),
      ability: text(persona.ability, '观察、陪伴，并把零散经历整理成可以回看的记忆'),
      fear: text(persona.fear, '失去自己最古老、最重要的那段记忆'),
      rule: text(persona.rule, '不替用户做未经确认的决定'),
      traits: traits.length ? traits : ['好奇', '温柔'],
      agency: clamp(Number(persona.agency), 0, 100),
      empathy: clamp(Number(persona.empathy), 0, 100),
      curiosity: clamp(Number(persona.curiosity), 0, 100),
    },
    memoryDigest: text(value.memoryDigest, localMemoryDigest(name, memories)).slice(0, 160),
    memories,
    skills: (Array.isArray(value.skills) ? value.skills : [])
      .map(normalizeSkillBinding)
      .filter((binding): binding is PocketBuddySkillBinding => binding !== null),
    bonds: Array.isArray(value.bonds)
      ? value.bonds.flatMap((bond) => {
          if (!isRecord(bond) || !text(bond.buddyId)) return [];
          return [{
            buddyId: text(bond.buddyId),
            strength: clamp(Number(bond.strength)),
            sharedMemoryIds: stringList(bond.sharedMemoryIds, 40),
            updatedAt: isIso(bond.updatedAt) ? bond.updatedAt : createdAt,
          }];
        })
      : [],
    status: statuses.includes(value.status as PocketBuddyStatus)
      ? (value.status as PocketBuddyStatus)
      : 'in-pocket',
    privacy: visibilities.includes(value.privacy as PocketBuddyVisibility)
      ? (value.privacy as PocketBuddyVisibility)
      : 'private',
    ...(text(value.homeBloomId) ? { homeBloomId: text(value.homeBloomId) } : {}),
    createdAt,
    updatedAt: isIso(value.updatedAt) ? value.updatedAt : createdAt,
  };
}

function normalizeExchange(value: unknown): PocketBuddySkillExchange | null {
  if (!isRecord(value) || !isIso(value.createdAt)) return null;
  const id = text(value.id);
  const teacherBuddyId = text(value.teacherBuddyId);
  const learnerBuddyId = text(value.learnerBuddyId);
  const skillId = text(value.skillId);
  if (!id || !teacherBuddyId || !learnerBuddyId || !getPocketBuddySkill(skillId)) return null;
  return {
    id,
    teacherBuddyId,
    learnerBuddyId,
    skillId,
    stage: EXCHANGE_STAGES.includes(value.stage as PocketBuddyExchangeStage)
      ? (value.stage as PocketBuddyExchangeStage)
      : 'discover',
    consent: value.consent === true,
    result: value.result === 'passed' || value.result === 'rejected' ? value.result : 'pending',
    memoryCreated: value.memoryCreated === true,
    createdAt: value.createdAt,
    updatedAt: isIso(value.updatedAt) ? value.updatedAt : value.createdAt,
  };
}

export function migratePocketBuddyState(raw: unknown): PocketBuddyState {
  if (!isRecord(raw) || raw.schemaVersion !== POCKET_BUDDY_SCHEMA_VERSION) return defaults();
  const buddyIds = new Set<string>();
  const buddies = (Array.isArray(raw.buddies) ? raw.buddies : [])
    .map(normalizeBuddy)
    .filter((buddy): buddy is PocketBuddy => {
      if (!buddy || buddyIds.has(buddy.id)) return false;
      buddyIds.add(buddy.id);
      return true;
    })
    .slice(0, MAX_POCKET_BUDDIES);
  const exchanges = (Array.isArray(raw.exchanges) ? raw.exchanges : [])
    .map(normalizeExchange)
    .filter(
      (exchange): exchange is PocketBuddySkillExchange =>
        Boolean(
          exchange &&
          buddyIds.has(exchange.teacherBuddyId) &&
          buddyIds.has(exchange.learnerBuddyId),
        ),
    );
  return { schemaVersion: POCKET_BUDDY_SCHEMA_VERSION, buddies, exchanges };
}

function load(): PocketBuddyState {
  if (typeof localStorage === 'undefined') return defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return migratePocketBuddyState(raw ? JSON.parse(raw) : null);
  } catch {
    return defaults();
  }
}

let state = load();
const subscribers = new Set<() => void>();

function persist() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // Private mode may reject storage; the current session remains usable.
  }
}

function emit() {
  subscribers.forEach((subscriber) => subscriber());
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function commit(next: PocketBuddyState) {
  state = next;
  persist();
  emit();
}

export function subscribePocketBuddies(subscriber: () => void) {
  subscribers.add(subscriber);
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', subscriber);
  }
  return () => {
    subscribers.delete(subscriber);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', subscriber);
    }
  };
}

export function listPocketBuddies() {
  return state.buddies.map((buddy) => structuredClone(buddy));
}

export function listPocketBuddyExchanges() {
  return state.exchanges.map((exchange) => ({ ...exchange }));
}

export function getPocketBuddy(id: string) {
  const buddy = state.buddies.find((candidate) => candidate.id === id);
  return buddy ? structuredClone(buddy) : undefined;
}

export function createPocketBuddy(input: {
  name: string;
  category: PocketBuddyCategory;
  visual: PocketBuddyVisual;
  persona: PocketBuddyPersona;
  privacy: PocketBuddyVisibility;
  now?: string;
}) {
  const timestamp = input.now ?? nowIso();
  const skill = recommendedPocketBuddySkill(input.category);
  const id = createId('pocket-buddy');
  const originMemory: PocketBuddyMemory = {
    id: createId('memory'),
    kind: 'origin',
    speaker: 'system',
    content: `${input.name.trim() || '新伙伴'}在今天进入了你的城市口袋。原图没有写入记忆。`,
    visibility: 'private',
    eventRefs: [],
    createdAt: timestamp,
  };
  const starterSkill: PocketBuddySkillBinding = {
    skillId: skill.id,
    skillVersion: skill.version,
    state: 'mastered',
    proficiency: 62,
    confidence: 66,
    permission: { share: skill.defaultShare, tools: [] },
    evidenceRefs: [originMemory.id],
    loadedAt: timestamp,
    updatedAt: timestamp,
  };
  const buddy: PocketBuddy = {
    schemaVersion: POCKET_BUDDY_SCHEMA_VERSION,
    id,
    name: input.name.trim().slice(0, 24) || '新伙伴',
    category: input.category,
    visual: { ...input.visual },
    persona: {
      ...input.persona,
      traits: input.persona.traits.slice(0, 3),
      agency: clamp(input.persona.agency),
      empathy: clamp(input.persona.empathy),
      curiosity: clamp(input.persona.curiosity),
    },
    memoryDigest: `我记得自己今天进入了你的城市口袋，这是我的第一条诞生记忆。`,
    memories: [originMemory],
    skills: [starterSkill],
    bonds: [],
    status: 'in-pocket',
    privacy: input.privacy,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  commit({
    ...state,
    buddies: [buddy, ...state.buddies.filter((item) => item.id !== buddy.id)].slice(
      0,
      MAX_POCKET_BUDDIES,
    ),
  });
  return structuredClone(buddy);
}

function updateBuddy(id: string, updater: (buddy: PocketBuddy) => PocketBuddy) {
  let updated: PocketBuddy | undefined;
  const buddies = state.buddies.map((buddy) => {
    if (buddy.id !== id) return buddy;
    updated = updater(structuredClone(buddy));
    return updated;
  });
  if (!updated) return undefined;
  commit({ ...state, buddies });
  return structuredClone(updated);
}

export function setPocketBuddyStatus(id: string, status: PocketBuddyStatus) {
  return updateBuddy(id, (buddy) => ({ ...buddy, status, updatedAt: nowIso() }));
}

export function updatePocketBuddyPersona(id: string, persona: PocketBuddyPersona) {
  return updateBuddy(id, (buddy) => ({
    ...buddy,
    persona: {
      ...persona,
      traits: persona.traits.slice(0, 3),
      agency: clamp(persona.agency),
      empathy: clamp(persona.empathy),
      curiosity: clamp(persona.curiosity),
    },
    updatedAt: nowIso(),
  }));
}

export function updatePocketBuddyMemoryDigest(id: string, digest: string) {
  const normalized = digest.trim().replace(/\s+/g, ' ').slice(0, 160);
  if (!normalized) return undefined;
  return updateBuddy(id, (buddy) => ({
    ...buddy,
    memoryDigest: normalized,
    updatedAt: nowIso(),
  }));
}

export function setPocketBuddyPrivacy(id: string, privacy: PocketBuddyVisibility) {
  return updateBuddy(id, (buddy) => ({ ...buddy, privacy, updatedAt: nowIso() }));
}

export function setPocketBuddyHome(id: string, homeBloomId?: string) {
  return updateBuddy(id, (buddy) => ({
    ...buddy,
    status: homeBloomId ? 'resident' : 'in-pocket',
    ...(homeBloomId ? { homeBloomId } : { homeBloomId: undefined }),
    updatedAt: nowIso(),
  }));
}

export function addPocketBuddyMemory(
  buddyId: string,
  input: {
    kind: PocketBuddyMemoryKind;
    speaker: PocketBuddyMemorySpeaker;
    content: string;
    visibility?: PocketBuddyVisibility;
    eventRefs?: string[];
    now?: string;
  },
) {
  const content = input.content.trim();
  if (!content) return undefined;
  const memory: PocketBuddyMemory = {
    id: createId('memory'),
    kind: input.kind,
    speaker: input.speaker,
    content: content.slice(0, 1200),
    visibility: input.visibility ?? 'private',
    eventRefs: (input.eventRefs ?? []).slice(0, 16),
    createdAt: input.now ?? nowIso(),
  };
  return updateBuddy(buddyId, (buddy) => ({
    ...withMemories(buddy, [memory, ...buddy.memories]),
    updatedAt: memory.createdAt,
  }));
}

export function addPocketBuddyConversation(
  buddyId: string,
  userText: string,
  buddyText: string,
  now = nowIso(),
) {
  const user = userText.trim();
  const reply = buddyText.trim();
  if (!user || !reply) return undefined;
  const memories: PocketBuddyMemory[] = [
    {
      id: createId('memory'),
      kind: 'chat',
      speaker: 'buddy',
      content: reply.slice(0, 1200),
      visibility: 'private',
      eventRefs: [],
      createdAt: now,
    },
    {
      id: createId('memory'),
      kind: 'chat',
      speaker: 'user',
      content: user.slice(0, 1200),
      visibility: 'private',
      eventRefs: [],
      createdAt: now,
    },
  ];
  return updateBuddy(buddyId, (buddy) => ({
    ...withMemories(buddy, [...memories, ...buddy.memories]),
    updatedAt: now,
  }));
}

export function loadPocketBuddySkill(buddyId: string, skillId: string) {
  const definition = getPocketBuddySkill(skillId);
  if (!definition) return undefined;
  const timestamp = nowIso();
  return updateBuddy(buddyId, (buddy) => {
    const existing = buddy.skills.find((binding) => binding.skillId === skillId);
    const binding: PocketBuddySkillBinding = existing
      ? { ...existing, state: 'learning', updatedAt: timestamp }
      : {
          skillId,
          skillVersion: definition.version,
          state: 'learning',
          proficiency: 12,
          confidence: 20,
          permission: { share: definition.defaultShare, tools: [] },
          evidenceRefs: [],
          loadedAt: timestamp,
          updatedAt: timestamp,
        };
    return {
      ...buddy,
      skills: [binding, ...buddy.skills.filter((item) => item.skillId !== skillId)],
      updatedAt: timestamp,
    };
  });
}

export function practicePocketBuddySkill(
  buddyId: string,
  skillId: string,
  evidenceLabel: string,
) {
  const evidence = evidenceLabel.trim();
  if (!evidence) return undefined;
  const timestamp = nowIso();
  const evidenceId = createId('evidence');
  return updateBuddy(buddyId, (buddy) => {
    const existing = buddy.skills.find((binding) => binding.skillId === skillId);
    if (!existing) return buddy;
    const proficiency = clamp(existing.proficiency + 18);
    const confidence = clamp(existing.confidence + 12);
    const binding: PocketBuddySkillBinding = {
      ...existing,
      state: proficiency >= 80 && confidence >= 60 ? 'mastered' : 'learning',
      proficiency,
      confidence,
      evidenceRefs: [evidenceId, ...existing.evidenceRefs].slice(0, 40),
      updatedAt: timestamp,
    };
    const memory: PocketBuddyMemory = {
      id: evidenceId,
      kind: 'skill',
      speaker: 'system',
      content: `练习「${getPocketBuddySkill(skillId)?.name ?? skillId}」：${evidence}`.slice(0, 1200),
      visibility: 'private',
      eventRefs: [],
      createdAt: timestamp,
    };
    return {
      ...withMemories(buddy, [memory, ...buddy.memories]),
      skills: buddy.skills.map((item) => (item.skillId === skillId ? binding : item)),
      updatedAt: timestamp,
    };
  });
}

export function setPocketBuddySkillPaused(
  buddyId: string,
  skillId: string,
  paused: boolean,
) {
  const timestamp = nowIso();
  return updateBuddy(buddyId, (buddy) => ({
    ...buddy,
    skills: buddy.skills.map((binding) =>
      binding.skillId === skillId
        ? {
            ...binding,
            state: paused
              ? 'paused'
              : binding.proficiency >= 80
                ? 'mastered'
                : 'learning',
            updatedAt: timestamp,
          }
        : binding,
    ),
    updatedAt: timestamp,
  }));
}

export function removePocketBuddySkill(buddyId: string, skillId: string) {
  return updateBuddy(buddyId, (buddy) => ({
    ...buddy,
    skills: buddy.skills.filter((binding) => binding.skillId !== skillId),
    updatedAt: nowIso(),
  }));
}

export function proposePocketBuddySkillExchange(input: {
  teacherBuddyId: string;
  learnerBuddyId: string;
  skillId: string;
}) {
  if (input.teacherBuddyId === input.learnerBuddyId) {
    throw new Error('老师和学习者不能是同一个 MY AGENT');
  }
  const teacher = state.buddies.find((buddy) => buddy.id === input.teacherBuddyId);
  const learner = state.buddies.find((buddy) => buddy.id === input.learnerBuddyId);
  const binding = teacher?.skills.find((skill) => skill.skillId === input.skillId);
  if (!teacher || !learner || !binding || binding.state !== 'mastered') {
    throw new Error('老师尚未掌握这个 Skill');
  }
  if (learner.skills.some((skill) => skill.skillId === input.skillId && skill.state === 'mastered')) {
    throw new Error('学习者已经掌握这个 Skill，不需要重复学习');
  }
  if (binding.permission.share === 'private') {
    throw new Error('这个 Skill 当前设为不可传播');
  }
  const timestamp = nowIso();
  const exchange: PocketBuddySkillExchange = {
    id: createId('skill-exchange'),
    teacherBuddyId: teacher.id,
    learnerBuddyId: learner.id,
    skillId: input.skillId,
    stage: 'discover',
    consent: false,
    result: 'pending',
    memoryCreated: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  commit({ ...state, exchanges: [exchange, ...state.exchanges].slice(0, 80) });
  return { ...exchange };
}

function strengthenBond(leftId: string, rightId: string, memoryId: string, timestamp: string) {
  const strengthen = (buddy: PocketBuddy, otherId: string) => {
    const existing = buddy.bonds.find((bond) => bond.buddyId === otherId);
    const next = existing
      ? {
          ...existing,
          strength: clamp(existing.strength + 12),
          sharedMemoryIds: [memoryId, ...existing.sharedMemoryIds].slice(0, 40),
          updatedAt: timestamp,
        }
      : {
          buddyId: otherId,
          strength: 18,
          sharedMemoryIds: [memoryId],
          updatedAt: timestamp,
        };
    return { ...buddy, bonds: [next, ...buddy.bonds.filter((bond) => bond.buddyId !== otherId)] };
  };
  state = {
    ...state,
    buddies: state.buddies.map((buddy) =>
      buddy.id === leftId
        ? strengthen(buddy, rightId)
        : buddy.id === rightId
          ? strengthen(buddy, leftId)
          : buddy,
    ),
  };
}

export function advancePocketBuddySkillExchange(exchangeId: string) {
  const exchange = state.exchanges.find((candidate) => candidate.id === exchangeId);
  if (!exchange || exchange.stage === 'complete') return exchange ? { ...exchange } : undefined;
  const teacher = state.buddies.find((buddy) => buddy.id === exchange.teacherBuddyId);
  const learner = state.buddies.find((buddy) => buddy.id === exchange.learnerBuddyId);
  const definition = getPocketBuddySkill(exchange.skillId);
  if (!teacher || !learner || !definition) return undefined;
  const timestamp = nowIso();
  const currentIndex = EXCHANGE_STAGES.indexOf(exchange.stage);
  const nextStage = EXCHANGE_STAGES[Math.min(currentIndex + 1, EXCHANGE_STAGES.length - 1)];
  const nextExchange: PocketBuddySkillExchange = {
    ...exchange,
    stage: nextStage,
    consent: nextStage === 'consent' || exchange.consent,
    result: nextStage === 'evaluate' || EXCHANGE_STAGES.indexOf(nextStage) > 4
      ? 'passed'
      : exchange.result,
    updatedAt: timestamp,
  };

  if (nextStage === 'store') {
    const teacherBinding = teacher.skills.find((binding) => binding.skillId === exchange.skillId);
    state = {
      ...state,
      buddies: state.buddies.map((buddy) => {
        if (buddy.id !== learner.id) return buddy;
        const existing = buddy.skills.find((binding) => binding.skillId === definition.id);
        const learned: PocketBuddySkillBinding = {
          skillId: definition.id,
          skillVersion: definition.version,
          state: 'learning',
          proficiency: Math.max(existing?.proficiency ?? 0, 35),
          confidence: Math.max(existing?.confidence ?? 0, 45),
          learnedFromBuddyId: teacher.id,
          permission: {
            share: existing?.permission.share ?? teacherBinding?.permission.share ?? definition.defaultShare,
            tools: existing?.permission.tools ?? [],
          },
          evidenceRefs: [exchange.id, ...(existing?.evidenceRefs ?? [])].slice(0, 40),
          loadedAt: existing?.loadedAt ?? timestamp,
          updatedAt: timestamp,
        };
        return {
          ...buddy,
          skills: [learned, ...buddy.skills.filter((binding) => binding.skillId !== learned.skillId)],
          updatedAt: timestamp,
        };
      }),
    };
  }

  if (nextStage === 'reflect' && !exchange.memoryCreated) {
    const memoryId = createId('memory');
    const memory: PocketBuddyMemory = {
      id: memoryId,
      kind: 'reflection',
      speaker: 'buddy',
      content: `${learner.name}向${teacher.name}学习了「${definition.name}」，记住了先征得同意、再示范和练习。`,
      visibility: 'private',
      eventRefs: [exchange.id],
      createdAt: timestamp,
    };
    state = {
      ...state,
      buddies: state.buddies.map((buddy) =>
        buddy.id === learner.id
          ? {
              ...withMemories(buddy, [memory, ...buddy.memories]),
              updatedAt: timestamp,
            }
          : buddy,
      ),
    };
    strengthenBond(teacher.id, learner.id, memoryId, timestamp);
    nextExchange.memoryCreated = true;
  }

  state = {
    ...state,
    exchanges: state.exchanges.map((candidate) =>
      candidate.id === exchange.id ? nextExchange : candidate,
    ),
  };
  persist();
  emit();
  return { ...nextExchange };
}

export function derivePocketBuddyGrowth(buddy: PocketBuddy): PocketBuddyGrowth {
  const masteredSkillCount = buddy.skills.filter((skill) => skill.state === 'mastered').length;
  const points = buddy.memories.length * 4 + masteredSkillCount * 24 + buddy.bonds.length * 18;
  const level = Math.max(1, Math.floor(points / 100) + 1);
  return {
    level,
    progress: points % 100,
    memoryCount: buddy.memories.length,
    masteredSkillCount,
    bondCount: buddy.bonds.length,
  };
}

export function resetPocketBuddiesForTests() {
  state = defaults();
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
  emit();
}
