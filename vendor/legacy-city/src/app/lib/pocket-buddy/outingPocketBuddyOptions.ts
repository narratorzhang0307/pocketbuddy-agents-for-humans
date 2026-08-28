import {
  POCKET_BUDDY_SCHEMA_VERSION,
  type PocketBuddyCategory,
  type PocketBuddy,
  type PocketBuddyPersona,
} from './types';

export const OUTING_POCKET_BUDDY_OPTION_LIMIT = 10;

const OUTING_POCKET_BUDDY_PRESETS = [
  ['alien-04-07', '星友 048', '街角问候员'],
  ['alien-04-09', '星友 050', '异星路线员'],
  ['alien-01-05', '星友 005', '天气观察员'],
  ['alien-03-04', '星友 029', '天气观察员'],
  ['alien-04-08', '星友 049', '星光收集员'],
  ['alien-03-07', '星友 032', '异星路线员'],
  ['alien-02-15', '星友 024', '街角问候员'],
  ['alien-03-09', '星友 034', '城市频率员'],
  ['alien-05-11', '星友 062', '异星路线员'],
  ['alien-02-06', '星友 015', '情绪翻译员'],
] as const;

const BUILTIN_OUTING_TIMESTAMP = '2026-08-12T00:00:00.000Z';

const BUILTIN_PERSONA: PocketBuddyPersona = {
  role: '城市同行员',
  voice: '简短友好，会把不确定的事说明白',
  goal: '陪用户发现城市里值得停下来的小事',
  rule: '不公开未经确认的记忆，不把想象说成事实',
  traits: ['好奇', '温柔', '会记路'],
  agency: 72,
  empathy: 82,
  curiosity: 88,
};

function catalogBuddy(
  id: string,
  name: string,
  role: string,
  category: PocketBuddyCategory = 'fantasy',
): PocketBuddy {
  return {
    schemaVersion: POCKET_BUDDY_SCHEMA_VERSION,
    id: `outing-catalog-${id}`,
    name,
    category,
    visual: {
      kind: 'preset',
      catalogId: id,
      thumbnailUrl: `/assets/pocket-buddy/alien-materials-v1/${id}.png`,
      backgroundRemoval: 'preset',
      promptVersion: 'outing-pocket-options-v1',
    },
    persona: { ...BUILTIN_PERSONA, role },
    memories: [],
    skills: [],
    bonds: [],
    status: 'in-pocket',
    privacy: 'private',
    createdAt: BUILTIN_OUTING_TIMESTAMP,
    updatedAt: BUILTIN_OUTING_TIMESTAMP,
  };
}

export function buildOutingPocketBuddyOptions(
  localBuddies: readonly PocketBuddy[],
): PocketBuddy[] {
  const options = localBuddies
    .filter((buddy) => buddy.status === 'in-pocket')
    .slice(0, OUTING_POCKET_BUDDY_OPTION_LIMIT);
  const usedCatalogIds = new Set(
    options.flatMap((buddy) => buddy.visual.catalogId ? [buddy.visual.catalogId] : []),
  );

  for (const [catalogId, name, role] of OUTING_POCKET_BUDDY_PRESETS) {
    if (options.length >= OUTING_POCKET_BUDDY_OPTION_LIMIT) break;
    if (usedCatalogIds.has(catalogId)) continue;
    options.push(catalogBuddy(catalogId, name, role));
    usedCatalogIds.add(catalogId);
  }

  return options;
}
