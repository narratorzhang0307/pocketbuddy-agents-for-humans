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
  [/跑步|readiness|训练处方|配速/i, 'frost.running-coach'],
  [/路线|GPS|跑到|几公里/i, 'frost.run-route'],
  [/瑜伽|普拉提|热身|拉伸|产后恢复/i, 'pocket.her-motion'],
  [/深蹲|俯卧撑|动作计数|姿势纠正/, 'pocket.lianlema'],
  [/Apple\s*Health|HRV|健康导出|步数/i, 'frost.healthsync'],
  [/睡眠|咖啡|饮酒|晚间训练/, 'frost.sleep-detective'],
  [/包装食品|条码|营养标签|OpenFoodFacts/i, 'frost.openfoodfacts'],
  [/餐食照片|记一餐|份量|中餐/, 'frost.meal-lens'],
  [/AQI|紫外线|空气质量|户外运动/i, 'frost.outdoor-window'],
  [/力量训练|今天练什么|wger/i, 'frost.wger-planner'],
  [/恢复餐|训练日食谱|mealie/i, 'frost.mealie-kitchen'],
] as const;

const LOCAL_WORLD_NAMES: Readonly<Record<string, string>> = {
  'frost.running-coach': '跑者决策室',
  'frost.run-route': '跑者行动地图',
  'pocket.her-motion': '温和动作室',
  'pocket.lianlema': '动作训练场',
  'frost.healthsync': '健康数据站',
  'frost.sleep-detective': '睡眠观察室',
  'frost.openfoodfacts': '食品标签站',
  'frost.meal-lens': '餐食观察台',
  'frost.outdoor-window': '户外运动窗口',
  'frost.wger-planner': '力量训练室',
  'frost.mealie-kitchen': '恢复厨房',
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
    `用户想定义一个只保存在手机本机的 Agent World：${description.trim()}`,
    '请从给定白名单里选择世界气质、常驻子 Agent 与一个 Skill。只输出一个 JSON 对象，不解释。',
    `世界气质：${tones.map((tone) => `${tone.id}=${tone.name}（${tone.copy}）`).join('；')}`,
    `子 Agents：${agents.map((agent) => `${agent.id}=${agent.name}/${agent.role}`).join('；')}`,
    `Skills：${skills.map((skill) => `${skill.id}=${skill.name}，发布者${skill.publisher}/${skill.role}，${skill.description}`).join('；')}`,
    '输出结构：{"name":"18字以内世界名","toneId":"白名单ID","agentId":"白名单Agent ID","publishedSkillId":"白名单Skill ID"}',
    '不要输出链接、Markdown、额外字段或新的 ID。',
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
  const toneId = /营养|餐食|条码|数据|同步|报告|Apple\s*Health|HRV|步数/i.test(text)
    ? 'paper'
    : /睡眠|恢复|呼吸|放松|晚间/.test(text)
      ? 'night'
      : /跑步|路线|健身|动作|户外|热身/.test(text)
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
