import { BUILTIN_CITY_AGENTS } from './profiles';
import type { Agent3DProfile } from './types';

export const WALKING_COMPANION_IDS = [
  'dachshund-miko',
  'cat-shutter',
  'rabbit-nana',
  'bird-luma',
  'pig-hengdou',
] as const;

export const WALKING_COMPANION_ROSTER: readonly Agent3DProfile[] =
  WALKING_COMPANION_IDS.map((id) => {
    const companion = BUILTIN_CITY_AGENTS.find((candidate) => candidate.id === id);
    if (!companion) throw new Error(`Missing fixed walking companion: ${id}`);
    return companion;
  });
