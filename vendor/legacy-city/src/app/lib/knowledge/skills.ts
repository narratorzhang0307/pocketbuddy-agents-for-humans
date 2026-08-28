import type { MarkerKind } from '../../data/mapMarkers';

export interface KnowledgeSkillDefinition {
  id: string;
  label: string;
  english: string;
  description: string;
  color: string;
  markerKinds: readonly MarkerKind[];
}

export const KNOWLEDGE_SKILLS: readonly KnowledgeSkillDefinition[] = [
  { id: 'city-music-skill', label: '城市音乐', english: 'MUSIC', description: '曲库、情境歌单与作品地点', color: '#00ff88', markerKinds: ['music'] },
  { id: 'city-literature-skill', label: '城市阅读', english: 'BOOKS', description: '书架、作者、故事地与阅读记录', color: '#b388ff', markerKinds: ['book'] },
  { id: 'city-cinema-skill', label: '城市电影', english: 'CINEMA', description: '片库、导演、取景地与观影记录', color: '#ffb000', markerKinds: ['movie'] },
  { id: 'city-images-skill', label: '城市影像', english: 'IMAGES', description: '照片、相册与地理记忆', color: '#00e5ff', markerKinds: ['photo'] },
  { id: 'city-roaming-skill', label: '城市行程', english: 'ROUTES', description: '散步路线、足迹与行前计划', color: '#ff3b6b', markerKinds: ['travel'] },
  { id: 'city-council-skill', label: '城市议事', english: 'COUNCIL', description: '围绕城市选择留下讨论与判断', color: '#caa64a', markerKinds: ['council'] },
  { id: 'city-exhibition-skill', label: '城市看展', english: 'EXHIBITION', description: '展览、博物馆与现场记录', color: '#5a8f7b', markerKinds: ['exhibition', 'museum'] },
  { id: 'poem-planting-skill', label: '诗歌植物', english: 'POEM PLANTS', description: '种下的诗与植物生长档案', color: '#8bc34a', markerKinds: ['poemtree'] },
  { id: 'quick-capture-skill', label: '自建记忆', english: 'CAPTURE', description: '随手记与自建 Agent 的城市落点', color: '#ff8a3d', markerKinds: ['custom'] },
] as const;

// MAPPING 的 Plaza 与行程规划只陈列能直接参与城市漫游的六类 Skill。
// 其余历史能力仍保留在数据层，避免破坏已有地图记录和深链。
const ROAMING_SKILL_IDS = new Set([
  'city-music-skill',
  'city-literature-skill',
  'city-cinema-skill',
  'city-roaming-skill',
  'city-exhibition-skill',
  'poem-planting-skill',
]);

export const ROAMING_KNOWLEDGE_SKILLS: readonly KnowledgeSkillDefinition[] =
  KNOWLEDGE_SKILLS.filter((skill) => ROAMING_SKILL_IDS.has(skill.id));

const STORAGE_KEY = 'shangjie.knowledgeSkills.v1';
const KNOWN_IDS = new Set(KNOWLEDGE_SKILLS.map((skill) => skill.id));

function defaults(): Record<string, boolean> {
  return Object.fromEntries(KNOWLEDGE_SKILLS.map((skill) => [skill.id, true]));
}

function read(): Record<string, boolean> {
  if (typeof localStorage === 'undefined') return defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults();
    return Object.fromEntries(KNOWLEDGE_SKILLS.map((skill) => [
      skill.id,
      typeof raw[skill.id] === 'boolean' ? raw[skill.id] : true,
    ]));
  } catch {
    return defaults();
  }
}

let loadedState = read();
const subscribers = new Set<() => void>();

function persist() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loadedState));
  } catch {
    // 内存状态仍然可用。
  }
}

function emit() {
  subscribers.forEach((subscriber) => subscriber());
}

export function subscribeKnowledgeSkills(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

export function isKnowledgeSkillLoaded(skillId: string): boolean {
  return KNOWN_IDS.has(skillId) && loadedState[skillId] !== false;
}

export function setKnowledgeSkillLoaded(skillId: string, loaded: boolean) {
  if (!KNOWN_IDS.has(skillId) || loadedState[skillId] === loaded) return;
  loadedState = { ...loadedState, [skillId]: loaded };
  persist();
  emit();
}

export function setAllKnowledgeSkillsLoaded(loaded: boolean) {
  const next = Object.fromEntries(KNOWLEDGE_SKILLS.map((skill) => [skill.id, loaded]));
  if (KNOWLEDGE_SKILLS.every((skill) => loadedState[skill.id] === loaded)) return;
  loadedState = next;
  persist();
  emit();
}

export function setAllRoamingKnowledgeSkillsLoaded(loaded: boolean) {
  const next = { ...loadedState };
  let changed = false;
  for (const skill of ROAMING_KNOWLEDGE_SKILLS) {
    if (next[skill.id] !== loaded) {
      next[skill.id] = loaded;
      changed = true;
    }
  }
  if (!changed) return;
  loadedState = next;
  persist();
  emit();
}

export function getLoadedKnowledgeMarkerKinds(): Set<MarkerKind> {
  return new Set(
    ROAMING_KNOWLEDGE_SKILLS
      .filter((skill) => isKnowledgeSkillLoaded(skill.id))
      .flatMap((skill) => [...skill.markerKinds]),
  );
}

export function resetKnowledgeSkills() {
  loadedState = defaults();
  if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  emit();
}
