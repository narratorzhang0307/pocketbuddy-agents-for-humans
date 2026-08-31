import type { PlazaWorldDraft } from './worldDraft';

export type WorldSuggestionTone = {
  id: string;
  name: string;
  copy: string;
};

export type WorldSuggestionSkill = {
  id: string;
  name: string;
  description: string;
  publisher: string;
  role: string;
};

export type WorldSuggestionAgent = {
  id: string;
  name: string;
  role: string;
};

export type PlazaWorldSuggestion = Pick<PlazaWorldDraft, 'name' | 'toneId' | 'agentId' | 'publishedSkillId'>;

const KEYWORD_SKILLS: ReadonlyArray<[RegExp, string]> = [
  [/跑步|readiness|训练处方|配速|\brunning\b|\bjog\w*|\bpace\b|training plan/i, 'frost.running-coach'],
  [/路线|GPS|跑到|几公里|\broute\b|\bkm\b|kilomet(er|re)|\bmap\b|run to/i, 'frost.run-route'],
  [/瑜伽|普拉提|热身|拉伸|产后恢复|yoga|pilates|warm[- ]?up|stretch|postnatal|postpartum/i, 'pocket.her-motion'],
  [/深蹲|俯卧撑|动作计数|姿势纠正|squat|push[- ]?up|rep count|form correction|posture/i, 'pocket.lianlema'],
  [/Apple\s*Health|HRV|健康导出|步数|health export|step count|\bsteps\b/i, 'frost.healthsync'],
  [/睡眠|咖啡|饮酒|晚间训练|\bsleep\b|coffee|caffeine|alcohol|evening (workout|training)/i, 'frost.sleep-detective'],
  [/包装食品|条码|营养标签|OpenFoodFacts|barcode|nutrition label|packaged food/i, 'frost.openfoodfacts'],
  [/餐食照片|记一餐|份量|中餐|meal photo|log a meal|portion|photo of my (meal|food)/i, 'frost.meal-lens'],
  [/AQI|紫外线|空气质量|户外运动|air quality|\bUV\b|outdoor/i, 'frost.outdoor-window'],
  [/力量训练|今天练什么|wger|strength training|\blift\w*|what to train|workout plan/i, 'frost.wger-planner'],
  [/恢复餐|训练日食谱|mealie|recovery meal|recipe|training[- ]day meal/i, 'frost.mealie-kitchen'],
] as const;

const LOCAL_WORLD_NAMES: Readonly<Record<string, string>> = {
  'frost.running-coach': 'Runner Decisions',
  'frost.run-route': 'Runner Route Map',
  'pocket.her-motion': 'Gentle Motion Room',
  'pocket.lianlema': 'Training Ground',
  'frost.healthsync': 'Health Data Hub',
  'frost.sleep-detective': 'Sleep Watch Room',
  'frost.openfoodfacts': 'Food Label Station',
  'frost.meal-lens': 'Meal Watch Deck',
  'frost.outdoor-window': 'Outdoor Window',
  'frost.wger-planner': 'Strength Room',
  'frost.mealie-kitchen': 'Recovery Kitchen',
};

function safeName(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return value.trim().replace(/[\n\r\t]+/g, ' ').slice(0, 18);
}

function jsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(raw.slice(start, end + 1));
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function createWorldSuggestionPrompt(
  description: string,
  tones: readonly WorldSuggestionTone[],
  agents: readonly WorldSuggestionAgent[],
  skills: readonly WorldSuggestionSkill[],
): string {
  return [
    `The user wants to define an Agent World that is kept only on this phone: ${description.trim()}`,
    'Pick the world tone, the resident sub-Agent and one Skill from the whitelists below. Output one JSON object only, with no explanation.',
    `World tones: ${tones.map((tone) => `${tone.id}=${tone.name} (${tone.copy})`).join('; ')}`,
    `Sub-Agents: ${agents.map((agent) => `${agent.id}=${agent.name}/${agent.role}`).join('; ')}`,
    `Skills: ${skills.map((skill) => `${skill.id}=${skill.name}, published by ${skill.publisher}/${skill.role}, ${skill.description}`).join('; ')}`,
    'Output shape: {"name":"world name, 18 characters or fewer","toneId":"whitelisted ID","agentId":"whitelisted Agent ID","publishedSkillId":"whitelisted Skill ID"}',
    'Do not output links, Markdown, extra fields or new IDs.',
  ].join('\n');
}

export function parseWorldSuggestion(
  raw: string,
  fallback: PlazaWorldSuggestion,
  validToneIds: readonly string[],
  validAgentIds: readonly string[],
  validSkillIds: readonly string[],
): PlazaWorldSuggestion | null {
  const value = jsonObject(raw);
  if (!value) return null;
  const toneId = String(value.toneId || '');
  const agentId = String(value.agentId || '');
  const publishedSkillId = String(value.publishedSkillId || '');
  if (!validToneIds.includes(toneId) || !validAgentIds.includes(agentId) || !validSkillIds.includes(publishedSkillId)) return null;
  return {
    name: safeName(value.name, fallback.name),
    toneId,
    agentId,
    publishedSkillId,
  };
}

export function suggestWorldLocally(
  description: string,
  fallback: PlazaWorldSuggestion,
  validSkillIds: readonly string[],
): PlazaWorldSuggestion {
  const text = description.trim();
  const toneId = /营养|餐食|条码|数据|同步|报告|Apple\s*Health|HRV|步数|nutrition|\bmeal\b|barcode|\bdata\b|\bsync\b|report|\bsteps\b/i.test(text)
    ? 'paper'
    : /睡眠|恢复|呼吸|放松|晚间|\bsleep\b|recovery|breath\w*|relax\w*|evening/i.test(text)
      ? 'night'
      : /跑步|路线|健身|动作|户外|热身|\brun\w*|\broute\b|fitness|workout|motion|outdoor|warm[- ]?up/i.test(text)
      ? 'field'
      : fallback.toneId;
  const matched = KEYWORD_SKILLS.find(([pattern, skillId]) => pattern.test(text) && validSkillIds.includes(skillId));
  const publishedSkillId = matched?.[1] ?? fallback.publishedSkillId;
  return {
    name: LOCAL_WORLD_NAMES[publishedSkillId] ?? fallback.name,
    toneId,
    agentId: fallback.agentId,
    publishedSkillId,
  };
}
