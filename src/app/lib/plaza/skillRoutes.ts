export type SkillRunTarget =
  | 'frost'
  | 'hermotion'
  | 'lianlema'
  | 'healthsync'
  | 'openfoodfacts'
  | 'cnhealthlibrary'
  | 'outdoorwindow'
  | 'sleepdetective'
  | 'meallens'
  | 'wgerplanner'
  | 'mealiekitchen'
  | 'runningcoach'
  | 'runroute';

const SKILL_RUN_BY_ENTRY_TARGET: Readonly<Record<string, SkillRunTarget>> = {
  'her-motion': 'hermotion',
  'lianlema-coach': 'lianlema',
  'frost-motion-vision': 'hermotion',
  'frost-healthsync': 'healthsync',
  'frost-openfoodfacts': 'openfoodfacts',
  'frost-cn-health-library': 'cnhealthlibrary',
  'frost-outdoor-window': 'outdoorwindow',
  'frost-sleep-detective': 'sleepdetective',
  'frost-meal-lens': 'meallens',
  'frost-wger-planner': 'wgerplanner',
  'frost-mealie-kitchen': 'mealiekitchen',
  'frost-running-coach': 'runningcoach',
  'frost-run-route': 'runroute',
};

export function resolveSkillRunTarget(entryTarget: string): SkillRunTarget | null {
  return SKILL_RUN_BY_ENTRY_TARGET[entryTarget] ?? null;
}
