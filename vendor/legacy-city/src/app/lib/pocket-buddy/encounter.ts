import {
  addPocketBuddyMemory,
  createPocketBuddy,
  listPocketBuddies,
} from './store';
import type {
  AgentWorldPocketBuddyBlueprint,
} from './agentWorldCatalog';
import type { PocketBuddy, PocketBuddyPersona } from './types';

const STORAGE_KEY = 'shangjie.buddy-encounters.v1';

export type BuddyEncounterTarget = {
  catalogId: string;
  name: string;
  role: string;
  assetUrl: string;
  accent: string;
  cityName: string;
  locationName: string;
  openingLine: string;
};

export type BuddyCheckOutcome =
  | 'critical-success'
  | 'success'
  | 'failure'
  | 'critical-failure';

export type BuddyCheckResult = {
  dice: [number, number];
  modifier: number;
  target: number;
  total: number;
  outcome: BuddyCheckOutcome;
  success: boolean;
};

export type BuddyEncounterProgress = {
  rapport: number;
  turns: number;
  attempts: number;
  nextCheckTurn: number;
  recruited: boolean;
  lastCheck?: BuddyCheckResult;
};

const defaultProgress = (): BuddyEncounterProgress => ({
  rapport: 0,
  turns: 0,
  attempts: 0,
  nextCheckTurn: 0,
  recruited: false,
});

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

function readAll(): Record<string, BuddyEncounterProgress> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<
      string,
      Partial<BuddyEncounterProgress>
    >;
    return Object.fromEntries(
      Object.entries(parsed).map(([id, value]) => [
        id,
        {
          rapport: clamp(Number(value.rapport), 0, 6),
          turns: Math.max(0, Math.floor(Number(value.turns) || 0)),
          attempts: Math.max(0, Math.floor(Number(value.attempts) || 0)),
          nextCheckTurn: Math.max(0, Math.floor(Number(value.nextCheckTurn) || 0)),
          recruited: value.recruited === true,
          ...(value.lastCheck ? { lastCheck: value.lastCheck } : {}),
        },
      ]),
    );
  } catch {
    return {};
  }
}

function write(catalogId: string, progress: BuddyEncounterProgress) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...readAll(), [catalogId]: progress }),
      );
    }
  } catch {
    // Storage can be unavailable in private mode; the current encounter still works.
  }
  return progress;
}

export function loadBuddyEncounterProgress(catalogId: string) {
  return readAll()[catalogId] ?? defaultProgress();
}

export function buddyCheckTarget(persona: PocketBuddyPersona) {
  return 8 + Number(persona.agency >= 70) + Number(persona.agency >= 88);
}

export function buddyCheckModifier(progress: BuddyEncounterProgress) {
  return Math.min(3, Math.floor(progress.rapport / 2));
}

export function buddyCheckAvailable(progress: BuddyEncounterProgress) {
  return progress.turns >= progress.nextCheckTurn;
}

export function buddyCheckProbability(target: number, modifier: number) {
  let successes = 0;
  for (let first = 1; first <= 6; first += 1) {
    for (let second = 1; second <= 6; second += 1) {
      if (first === 6 && second === 6) successes += 1;
      else if (first !== 1 || second !== 1) {
        successes += Number(first + second + modifier >= target);
      }
    }
  }
  return Math.round((successes / 36) * 100);
}

function die(random: () => number) {
  return Math.floor(clamp(random(), 0, 0.999999) * 6) + 1;
}

export function rollBuddyCheck(
  target: number,
  modifier: number,
  random: () => number = Math.random,
): BuddyCheckResult {
  const dice: [number, number] = [die(random), die(random)];
  const total = dice[0] + dice[1] + modifier;
  const outcome: BuddyCheckOutcome =
    dice[0] === 6 && dice[1] === 6
      ? 'critical-success'
      : dice[0] === 1 && dice[1] === 1
        ? 'critical-failure'
        : total >= target
          ? 'success'
          : 'failure';
  return {
    dice,
    modifier,
    target,
    total,
    outcome,
    success: outcome === 'success' || outcome === 'critical-success',
  };
}

export function recordBuddyConversation(
  catalogId: string,
  progress: BuddyEncounterProgress,
) {
  return write(catalogId, {
    ...progress,
    turns: progress.turns + 1,
    rapport: Math.min(6, progress.rapport + 1),
  });
}

export function recordBuddyCheck(
  catalogId: string,
  progress: BuddyEncounterProgress,
  result: BuddyCheckResult,
) {
  return write(catalogId, {
    ...progress,
    attempts: progress.attempts + 1,
    recruited: progress.recruited || result.success,
    nextCheckTurn: result.success
      ? progress.nextCheckTurn
      : progress.turns + (result.outcome === 'critical-failure' ? 3 : 2),
    lastCheck: result,
  });
}

export function findRecruitedCatalogBuddy(catalogId: string) {
  return listPocketBuddies().find(
    (buddy) => buddy.visual.catalogId === catalogId,
  );
}

export function recruitCatalogBuddy(
  blueprint: AgentWorldPocketBuddyBlueprint,
  target: BuddyEncounterTarget,
): PocketBuddy {
  const existing = findRecruitedCatalogBuddy(blueprint.id);
  if (existing) return existing;
  const buddy = createPocketBuddy({
    name: blueprint.name,
    category: blueprint.category,
    visual: {
      kind: 'preset',
      catalogId: blueprint.id,
      thumbnailUrl: blueprint.assetUrl ?? target.assetUrl,
      backgroundRemoval: 'preset',
      promptVersion: 'city-buddy-encounter-v1',
    },
    persona: blueprint.persona,
    privacy: 'private',
  });
  addPocketBuddyMemory(buddy.id, {
    kind: 'city',
    speaker: 'system',
    content: `${blueprint.name}在${target.cityName}${target.locationName}与你完成了同行检定，决定进入你的口袋伙伴图鉴。`,
  });
  return buddy;
}

export function resetBuddyEncountersForTests() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
}
