export const CITY_CHARACTER_STATS = [
  { id: 'stamina', label: '体力', short: '体', description: '长距离行走、搬运和恢复' },
  { id: 'agility', label: '敏捷', short: '敏', description: '追赶、闪避和穿过窄路' },
  { id: 'intellect', label: '智力', short: '智', description: '学习、分析和理解机关' },
  { id: 'perception', label: '感知', short: '感', description: '发现花朵、脚印和隐藏伙伴' },
  { id: 'charm', label: '魅力', short: '魅', description: '交涉、邀请和交换见闻' },
  { id: 'will', label: '意志', short: '意', description: '克服害怕、驻守和坚持任务' },
] as const;

export type CityCharacterStatId = (typeof CITY_CHARACTER_STATS)[number]['id'];

export const CITY_CHARACTER_SKILLS = [
  { id: 'wayfinding', label: '寻路', stat: 'perception' },
  { id: 'tracking', label: '追踪', stat: 'perception' },
  { id: 'delivery', label: '送信', stat: 'agility' },
  { id: 'negotiation', label: '交涉', stat: 'charm' },
  { id: 'plant-care', label: '照料植物', stat: 'intellect' },
  { id: 'guarding', label: '驻守', stat: 'will' },
  { id: 'finding', label: '找东西', stat: 'intellect' },
  { id: 'endurance', label: '长途同行', stat: 'stamina' },
] as const satisfies readonly {
  id: string;
  label: string;
  stat: CityCharacterStatId;
}[];

export type CityCharacterSkillId = (typeof CITY_CHARACTER_SKILLS)[number]['id'];

export type CityCharacterSheet = {
  version: 1;
  stats: Record<CityCharacterStatId, number>;
  skills: CityCharacterSkillId[];
  habit: string;
  weakness: string;
};

export const CITY_CHARACTER_VITALS = [
  { id: 'vitality', label: '活力', short: 'HP' },
  { id: 'mood', label: '心情', short: 'MOOD' },
  { id: 'bond', label: '亲密', short: 'BOND' },
] as const;

export type CityCharacterVitalId = (typeof CITY_CHARACTER_VITALS)[number]['id'];

export type CityCharacterVitals = Record<CityCharacterVitalId, number>;

export type LegacyCharacterSource = {
  seed?: string;
  role?: string;
  traits?: readonly string[];
  agency?: number;
  empathy?: number;
  curiosity?: number;
  sheet?: CityCharacterSheet;
};

const clamp = (value: number, min = 6, max = 16) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? Math.round(value) : 10));

const fromScale = (value: number | undefined, fallback: number) =>
  clamp(6 + ((typeof value === 'number' ? value : fallback) / 100) * 10);

export function stableCharacterHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function normalizeCharacterVitals(vitals: CityCharacterVitals): CityCharacterVitals {
  return Object.fromEntries(
    CITY_CHARACTER_VITALS.map(({ id }) => [
      id,
      Math.min(100, Math.max(0, Math.round(vitals[id]))),
    ]),
  ) as CityCharacterVitals;
}

export function characterVitalsFrom(seed: string): CityCharacterVitals {
  const hash = stableCharacterHash(`${seed}:vitals`);
  return {
    vitality: 68 + (hash % 27),
    mood: 54 + ((hash >>> 5) % 39),
    bond: 36 + ((hash >>> 11) % 48),
  };
}

function defaultSkills(source: LegacyCharacterSource): CityCharacterSkillId[] {
  const text = `${source.role ?? ''} ${(source.traits ?? []).join(' ')}`;
  const chosen: CityCharacterSkillId[] = [];
  const add = (skill: CityCharacterSkillId) => {
    if (!chosen.includes(skill) && chosen.length < 3) chosen.push(skill);
  };
  if (/路|方向|侦探|观察|敏锐|寻找/.test(text)) add('wayfinding');
  if (/气味|追踪|脚印|侦探/.test(text)) add('tracking');
  if (/邮差|信使|送达|消息/.test(text)) add('delivery');
  if (/陪伴|招呼|社交|合群|倾听/.test(text)) add('negotiation');
  if (/植物|花|照料/.test(text)) add('plant-care');
  if (/守|夜路|谨慎|值日/.test(text)) add('guarding');
  if (/收集|档案|记录|智/.test(text)) add('finding');
  if (/同行|散步|跑|耐心/.test(text)) add('endurance');
  add('wayfinding');
  add('finding');
  return chosen;
}

function defaultHabit(source: LegacyCharacterSource) {
  const text = `${source.role ?? ''} ${(source.traits ?? []).join(' ')}`;
  if (/气味|追踪|侦探/.test(text)) return '闻到陌生气味时会停下来确认来源';
  if (/邮差|信使|送达/.test(text)) return '接到任务后会先确认地址和返回路线';
  if (/记录|档案|收集/.test(text)) return '发现新东西时会先记下地点';
  if (/方向|认路|寻路/.test(text)) return '遇到岔路会先记住回来的方向';
  if (/合群|招呼|社交/.test(text)) return '遇见陌生伙伴会先打招呼';
  if (/谨慎|守/.test(text)) return '行动前会先检查周围有没有风险';
  return '发现异常时会停下来多看一眼';
}

function defaultWeakness(stats: CityCharacterSheet['stats']) {
  const weakest = CITY_CHARACTER_STATS.reduce((current, candidate) =>
    stats[candidate.id] < stats[current.id] ? candidate : current,
  );
  return {
    stamina: '连续走太久会要求休息',
    agility: '遇到拥挤路段容易慢下来',
    intellect: '复杂线索需要多确认一次',
    perception: '热闹环境里容易漏掉小动静',
    charm: '第一次见面时不太会主动开口',
    will: '独自驻守太久会想提前回家',
  }[weakest.id];
}

export function normalizeCharacterSheet(sheet: CityCharacterSheet): CityCharacterSheet {
  return {
    version: 1,
    stats: Object.fromEntries(
      CITY_CHARACTER_STATS.map(({ id }) => [id, clamp(sheet.stats[id])]),
    ) as CityCharacterSheet['stats'],
    skills: sheet.skills.filter((skill, index, all) =>
      CITY_CHARACTER_SKILLS.some((candidate) => candidate.id === skill)
      && all.indexOf(skill) === index,
    ).slice(0, 3),
    habit: sheet.habit.trim() || '发现异常时会停下来多看一眼',
    weakness: sheet.weakness.trim() || '连续行动后需要休息',
  };
}

export function characterSheetFrom(source: LegacyCharacterSource): CityCharacterSheet {
  if (source.sheet) return normalizeCharacterSheet(source.sheet);
  const seed = stableCharacterHash(source.seed ?? source.role ?? 'city-character');
  const stats: CityCharacterSheet['stats'] = {
    stamina: clamp(9 + (seed % 4)),
    agility: clamp(9 + ((seed >>> 3) % 5)),
    intellect: fromScale(source.curiosity, 72),
    perception: fromScale(source.curiosity, 78),
    charm: fromScale(source.empathy, 72),
    will: fromScale(source.agency, 68),
  };
  return {
    version: 1,
    stats,
    skills: defaultSkills(source),
    habit: defaultHabit(source),
    weakness: defaultWeakness(stats),
  };
}

export function cityCharacterModifier(score: number) {
  return Math.floor((clamp(score) - 10) / 2);
}

export function cityCharacterSerial(seed: string) {
  return String((stableCharacterHash(seed) % 999) + 1).padStart(3, '0');
}
