import type { CityCharacterSheet } from '../crpg/character';

export const POCKET_BUDDY_SCHEMA_VERSION = 1 as const;

export type PocketBuddyCategory =
  | 'animal'
  | 'object'
  | 'device'
  | 'fantasy';

export type PocketBuddyVisibility = 'private' | 'friends' | 'public';
export type PocketBuddyStatus = 'in-pocket' | 'resident' | 'visiting' | 'resting';
export type PocketBuddyMemoryKind =
  | 'origin'
  | 'chat'
  | 'camera'
  | 'diary'
  | 'city'
  | 'skill'
  | 'reflection';
export type PocketBuddyMemorySpeaker = 'user' | 'buddy' | 'system';
export type PocketBuddySkillState =
  | 'interested'
  | 'learning'
  | 'mastered'
  | 'paused';
export type PocketBuddyExchangeStage =
  | 'discover'
  | 'consent'
  | 'demonstrate'
  | 'imitate'
  | 'evaluate'
  | 'store'
  | 'reflect'
  | 'complete';

export interface PocketBuddyPersona {
  role: string;
  /** 自由文本人格设定：性格、判断方式与变化倾向。 */
  personality?: string;
  voice: string;
  goal: string;
  ability?: string;
  fear?: string;
  rule: string;
  traits: string[];
  agency: number;
  empathy: number;
  curiosity: number;
  sheet?: CityCharacterSheet;
}

export interface PocketBuddyVisual {
  kind: 'local-cutout' | 'mascot' | 'preset';
  catalogId?: string;
  portraitBlobId?: string;
  thumbnailUrl: string;
  sourceFileName?: string;
  backgroundRemoval: 'local' | 'service' | 'preset';
  promptVersion?: string;
}

export interface PocketBuddyMemory {
  id: string;
  kind: PocketBuddyMemoryKind;
  speaker: PocketBuddyMemorySpeaker;
  content: string;
  visibility: PocketBuddyVisibility;
  eventRefs: string[];
  createdAt: string;
}

export interface PocketBuddySkillPermission {
  share: PocketBuddyVisibility;
  tools: string[];
}

export interface PocketBuddySkillBinding {
  skillId: string;
  skillVersion: string;
  state: PocketBuddySkillState;
  proficiency: number;
  confidence: number;
  learnedFromBuddyId?: string;
  permission: PocketBuddySkillPermission;
  evidenceRefs: string[];
  loadedAt: string;
  updatedAt: string;
}

export interface PocketBuddyBond {
  buddyId: string;
  strength: number;
  sharedMemoryIds: string[];
  updatedAt: string;
}

export interface PocketBuddy {
  schemaVersion: typeof POCKET_BUDDY_SCHEMA_VERSION;
  id: string;
  name: string;
  category: PocketBuddyCategory;
  visual: PocketBuddyVisual;
  persona: PocketBuddyPersona;
  /** 从事件记忆滚动压缩出的长期印象；原始记忆仍单独保留。 */
  memoryDigest: string;
  memories: PocketBuddyMemory[];
  skills: PocketBuddySkillBinding[];
  bonds: PocketBuddyBond[];
  status: PocketBuddyStatus;
  privacy: PocketBuddyVisibility;
  homeBloomId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PocketBuddySkillDefinition {
  id: string;
  version: string;
  name: string;
  emoji: string;
  category: '陪伴' | '记录' | '探索' | '园艺' | '创作';
  summary: string;
  procedure: string[];
  evidenceRule: string;
  risk: 'low';
  defaultShare: PocketBuddyVisibility;
  recommendedFor: PocketBuddyCategory[];
}

export interface PocketBuddySkillExchange {
  id: string;
  teacherBuddyId: string;
  learnerBuddyId: string;
  skillId: string;
  stage: PocketBuddyExchangeStage;
  consent: boolean;
  result: 'pending' | 'passed' | 'rejected';
  memoryCreated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PocketBuddyState {
  schemaVersion: typeof POCKET_BUDDY_SCHEMA_VERSION;
  buddies: PocketBuddy[];
  exchanges: PocketBuddySkillExchange[];
}

export interface PocketBuddyGrowth {
  level: number;
  progress: number;
  memoryCount: number;
  masteredSkillCount: number;
  bondCount: number;
}
