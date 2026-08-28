import type {
  PocketBuddyCategory,
  PocketBuddySkillDefinition,
} from './types';

export const POCKET_BUDDY_TRAITS = [
  '好奇',
  '温柔',
  '勇敢',
  '谨慎',
  '独立',
  '合群',
  '敏锐',
  '耐心',
  '幽默',
  '会记路',
] as const;

export const POCKET_BUDDY_SKILLS: readonly PocketBuddySkillDefinition[] = [
  {
    id: 'quiet-listening',
    version: '1.0.0',
    name: '安静倾听',
    emoji: '◌',
    category: '陪伴',
    summary: '先复述对方真正关心的事，再给一句不过度打扰的回应。',
    procedure: ['听完一整段话', '复述核心情绪与事实', '询问是否需要建议'],
    evidenceRule: '至少完成 3 次被用户保留的倾听记录',
    risk: 'low',
    defaultShare: 'friends',
    recommendedFor: ['animal'],
  },
  {
    id: 'street-notes',
    version: '1.0.0',
    name: '街角见闻',
    emoji: '⌖',
    category: '探索',
    summary: '把地点、时间、现场细节和不确定性整理成可回看的城市见闻。',
    procedure: ['记录地点与时间', '提取一个现场细节', '标注亲历或转述'],
    evidenceRule: '至少关联 2 条真实城市事件',
    risk: 'low',
    defaultShare: 'friends',
    recommendedFor: ['device'],
  },
  {
    id: 'memory-postcard',
    version: '1.0.0',
    name: '记忆明信片',
    emoji: '▱',
    category: '记录',
    summary: '从一段经历中挑出人物、地点和一句最值得留下的话。',
    procedure: ['确认记忆来源', '提炼三项事实', '写成一段短笺'],
    evidenceRule: '至少从 3 条记忆中生成并保留 1 张短笺',
    risk: 'low',
    defaultShare: 'private',
    recommendedFor: ['fantasy'],
  },
  {
    id: 'plant-shade',
    version: '1.0.0',
    name: '花下值日',
    emoji: '♧',
    category: '园艺',
    summary: '观察一株城市植物的环境与变化，只记录，不冒充专业诊断。',
    procedure: ['确认植物落点', '记录光照与天气', '写下可见变化'],
    evidenceRule: '同一落点至少有 2 次间隔观察',
    risk: 'low',
    defaultShare: 'public',
    recommendedFor: ['animal', 'object', 'fantasy'],
  },
  {
    id: 'object-story',
    version: '1.0.0',
    name: '物件小传',
    emoji: '✎',
    category: '创作',
    summary: '根据用户确认的来历，为一件普通物品写一段不篡改事实的小传。',
    procedure: ['询问真实来历', '区分事实与想象', '写成 120 字内小传'],
    evidenceRule: '用户确认事实边界并保留 1 篇小传',
    risk: 'low',
    defaultShare: 'private',
    recommendedFor: ['object'],
  },
] as const;

export function getPocketBuddySkill(skillId: string) {
  return POCKET_BUDDY_SKILLS.find((skill) => skill.id === skillId);
}

export function recommendedPocketBuddySkill(category: PocketBuddyCategory) {
  const preferredId: Record<PocketBuddyCategory, string> = {
    animal: 'quiet-listening',
    object: 'object-story',
    device: 'street-notes',
    fantasy: 'memory-postcard',
  };
  return getPocketBuddySkill(preferredId[category]) ?? POCKET_BUDDY_SKILLS[0];
}
