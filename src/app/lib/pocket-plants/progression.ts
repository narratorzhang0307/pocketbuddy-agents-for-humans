import { normalizePocketPlantAssetId, POCKET_PLANT_ASSETS } from './catalog';

const KEY = 'carrythecosmos:pocket-plant-progress:v1';
// Competition/demo baseline: every Beijing calendar day starts at 3,000
// steps, so the planting interaction is immediately available. Real walking
// and device snapshots continue accumulating from this floor.
const DEFAULT_TOTAL_STEPS = 0;
const DEFAULT_TODAY_STEPS = 3_000;
const STEP_THRESHOLDS = [0, 3_000, 8_000, 15_000, 30_000, 60_000, 100_000] as const;
const MILESTONE_SIZES = [7, 7, 7, 7, 7, 8, 7] as const;

export const DAILY_WALK_GOAL = {
  id: 'daily-walk-10000',
  threshold: 10_000,
  experience: 100,
  title: '万步城市漫游',
} as const;

export type WalkAchievementReward = {
  key: string;
  title: string;
  threshold: number;
  experience: number;
};

export type SeedMilestone = {
  id: string;
  threshold: number;
  title: string;
  assetIds: string[];
};

export type PocketPlantProgress = {
  totalSteps: number;
  todaySteps: number;
  dayKey: string;
  experience: number;
  completedAchievementKeys: string[];
  inventory: Record<string, number>;
  appliedMilestones: string[];
};

const subscribers = new Set<() => void>();
const storage = () => typeof window === 'undefined' ? null : window.localStorage;
/** Calendar key in the product's authoritative Asia/Shanghai day boundary. */
export const beijingDayKey = (date = new Date()) =>
  new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

export const POCKET_SEED_MILESTONES: SeedMilestone[] = (() => {
  let offset = 0;
  return STEP_THRESHOLDS.map((threshold, index) => {
    const size = MILESTONE_SIZES[index];
    const assetIds = POCKET_PLANT_ASSETS.slice(offset, offset + size).map((asset) => asset.id);
    offset += size;
    return {
      id: `walk-${threshold}`,
      threshold,
      title: index === 0 ? '最初的城市种子' : `${threshold.toLocaleString('zh-CN')} 步种子包`,
      assetIds,
    };
  });
})();

const normalize = (value: unknown, now = new Date()): PocketPlantProgress => {
  const source = value && typeof value === 'object'
    ? value as Partial<PocketPlantProgress>
    : {};
  const key = beijingDayKey(now);
  const sameDay = source.dayKey === key;
  return {
    totalSteps: Number.isFinite(source.totalSteps)
      ? Math.max(0, Math.floor(source.totalSteps as number))
      : DEFAULT_TOTAL_STEPS,
    todaySteps: sameDay && Number.isFinite(source.todaySteps)
      ? Math.max(DEFAULT_TODAY_STEPS, Math.floor(source.todaySteps as number))
      : DEFAULT_TODAY_STEPS,
    dayKey: key,
    experience: Number.isFinite(source.experience)
      ? Math.max(0, Math.floor(source.experience as number))
      : 0,
    completedAchievementKeys: Array.isArray(source.completedAchievementKeys)
      ? source.completedAchievementKeys.filter(
          (id): id is string => typeof id === 'string',
        )
      : [],
    inventory: source.inventory && typeof source.inventory === 'object'
      ? Object.entries(source.inventory).reduce<Record<string, number>>(
          (inventory, [assetId, count]) => {
            if (!Number.isFinite(count)) return inventory;
            const normalizedId = normalizePocketPlantAssetId(assetId);
            inventory[normalizedId] = (inventory[normalizedId] ?? 0) + Number(count);
            return inventory;
          },
          {},
        )
      : {},
    appliedMilestones: Array.isArray(source.appliedMilestones)
      ? source.appliedMilestones.filter((id): id is string => typeof id === 'string')
      : [],
  };
};

export function dailyWalkAchievementKey(dayKey: string) {
  return `${DAILY_WALK_GOAL.id}:${dayKey}`;
}

const applyDailyWalkAchievement = (
  progress: PocketPlantProgress,
): PocketPlantProgress => {
  const key = dailyWalkAchievementKey(progress.dayKey);
  if (
    progress.todaySteps < DAILY_WALK_GOAL.threshold ||
    progress.completedAchievementKeys.includes(key)
  ) {
    return progress;
  }
  return {
    ...progress,
    experience: progress.experience + DAILY_WALK_GOAL.experience,
    completedAchievementKeys: [...progress.completedAchievementKeys, key],
  };
};

const applyUnlockedMilestones = (progress: PocketPlantProgress): PocketPlantProgress => {
  const inventory = { ...progress.inventory };
  const applied = new Set(progress.appliedMilestones);
  let changed = false;
  POCKET_SEED_MILESTONES.forEach((milestone, milestoneIndex) => {
    if (progress.totalSteps < milestone.threshold || applied.has(milestone.id)) return;
    const quantity = milestoneIndex === 0 ? 2 : 1;
    milestone.assetIds.forEach((assetId) => {
      inventory[assetId] = Math.max(0, Math.floor(inventory[assetId] ?? 0)) + quantity;
    });
    applied.add(milestone.id);
    changed = true;
  });
  return changed
    ? { ...progress, inventory, appliedMilestones: [...applied] }
    : progress;
};

const applyProgressRewards = (progress: PocketPlantProgress) =>
  applyDailyWalkAchievement(applyUnlockedMilestones(progress));

const persist = (progress: PocketPlantProgress) => {
  storage()?.setItem(KEY, JSON.stringify(progress));
};

const emit = () => subscribers.forEach((subscriber) => subscriber());

export function readPocketPlantProgress(now = new Date()): PocketPlantProgress {
  try {
    const raw = storage()?.getItem(KEY);
    const normalized = normalize(raw ? JSON.parse(raw) : null, now);
    const withRewards = applyProgressRewards(normalized);
    persist(withRewards);
    return withRewards;
  } catch {
    const fallback = applyProgressRewards(normalize(null, now));
    persist(fallback);
    return fallback;
  }
}

export function subscribePocketPlantProgress(subscriber: () => void) {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

export function addCitySteps(steps: number, now = new Date()): PocketPlantProgress {
  const current = readPocketPlantProgress(now);
  const delta = Math.max(0, Math.floor(steps));
  const next = applyProgressRewards({
    ...current,
    totalSteps: current.totalSteps + delta,
    todaySteps: current.todaySteps + delta,
  });
  persist(next);
  emit();
  return next;
}

/**
 * Merge an absolute counter reported by a watch/phone. Absolute values use
 * max rather than addition, so a retry or the same walk seen by two clients
 * cannot double the user's progress.
 */
export function mergeCityStepSnapshot({
  todaySteps,
  totalSteps,
  dayKey,
  now = new Date(),
}: {
  todaySteps: number;
  totalSteps: number;
  dayKey: string;
  now?: Date;
}): PocketPlantProgress {
  const current = readPocketPlantProgress(now);
  const sameDay = dayKey === current.dayKey;
  const next = applyProgressRewards({
    ...current,
    totalSteps: Math.max(current.totalSteps, Math.max(0, Math.floor(totalSteps))),
    todaySteps: sameDay
      ? Math.max(current.todaySteps, Math.max(0, Math.floor(todaySteps)))
      : current.todaySteps,
  });
  persist(next);
  emit();
  return next;
}

export function recordCityWalkMeters(meters: number, now = new Date()) {
  return recordCityWalkMetersWithRewards(meters, now).progress;
}

export function recordCityWalkMetersWithRewards(
  meters: number,
  now = new Date(),
): { progress: PocketPlantProgress; rewards: WalkAchievementReward[] } {
  const before = readPocketPlantProgress(now);
  if (!Number.isFinite(meters) || meters <= 0) {
    return { progress: before, rewards: [] };
  }
  const progress = addCitySteps(Math.max(1, Math.round(meters / 0.72)), now);
  const previousKeys = new Set(before.completedAchievementKeys);
  const dailyKey = dailyWalkAchievementKey(progress.dayKey);
  const rewards =
    !previousKeys.has(dailyKey) &&
    progress.completedAchievementKeys.includes(dailyKey)
      ? [
          {
            key: dailyKey,
            title: DAILY_WALK_GOAL.title,
            threshold: DAILY_WALK_GOAL.threshold,
            experience: DAILY_WALK_GOAL.experience,
          },
        ]
      : [];
  return { progress, rewards };
}

export function consumePocketSeed(assetId: string): boolean {
  const current = readPocketPlantProgress();
  const count = current.inventory[assetId] ?? 0;
  if (count <= 0) return false;
  const next = {
    ...current,
    inventory: { ...current.inventory, [assetId]: count - 1 },
  };
  persist(next);
  emit();
  return true;
}

export function getPocketSeedCount(assetId: string): number {
  return Math.max(0, readPocketPlantProgress().inventory[assetId] ?? 0);
}

export function getPublicPlantQuota(progress = readPocketPlantProgress()): number {
  const unlocked = POCKET_SEED_MILESTONES.filter(
    (milestone) => progress.totalSteps >= milestone.threshold,
  ).length;
  return Math.min(9, 2 + unlocked);
}

export function resetPocketPlantProgress() {
  storage()?.removeItem(KEY);
  emit();
}
