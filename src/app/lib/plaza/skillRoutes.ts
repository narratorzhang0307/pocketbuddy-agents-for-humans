export type SkillRunTarget =
  | 'birdlistener'
  | 'frost'
  | 'deviceevidence'
  | 'hermotion'
  | 'lianlema'
  | 'hospital'
  | 'healthsync'
  | 'openfoodfacts'
  | 'cnhealthlibrary'
  | 'outdoorwindow'
  | 'sleepdetective'
  | 'meallens'
  | 'wgerplanner'
  | 'mealiekitchen'
  | 'runroute'
  | 'runningcoach'
  | 'enduranceguard'
  | 'garminreadonly'
  | 'stravareplay';

const SKILL_RUN_BY_ENTRY_TARGET: Readonly<Record<string, SkillRunTarget>> = {
  'frost-bird-listener': 'birdlistener',
  'frost': 'frost',
  'her-motion': 'hermotion',
  'lianlema-coach': 'lianlema',
  'hospital-agent': 'hospital',
  'health-consultation': 'hospital',
  'frost-motion-vision': 'hermotion',
  'frost-healthsync': 'healthsync',
  'frost-openfoodfacts': 'openfoodfacts',
  'frost-cn-health-library': 'cnhealthlibrary',
  'frost-outdoor-window': 'outdoorwindow',
  'frost-sleep-detective': 'sleepdetective',
  'frost-meal-lens': 'meallens',
  'frost-wger-planner': 'wgerplanner',
  'frost-mealie-kitchen': 'mealiekitchen',
  'frost-run-route': 'runroute',
  'frost-running-coach': 'runningcoach',
  'frost-endurance-guard': 'enduranceguard',
  'frost-garmin-readonly': 'garminreadonly',
  'frost-strava-replay': 'stravareplay',
};

export function resolveSkillRunTarget(entryTarget: string): SkillRunTarget | null {
  return Object.prototype.hasOwnProperty.call(SKILL_RUN_BY_ENTRY_TARGET, entryTarget) ? SKILL_RUN_BY_ENTRY_TARGET[entryTarget] : null;
}

// The same page registration is used by manual entry and Frost auto navigation.
export const FOUNDATION_SKILL_BY_RUN: Partial<Record<SkillRunTarget, string>> = {
  healthsync: 'frost.healthsync', openfoodfacts: 'frost.openfoodfacts',
  cnhealthlibrary: 'frost.cn-health-library', outdoorwindow: 'frost.outdoor-window',
  sleepdetective: 'frost.sleep-detective', meallens: 'frost.meal-lens',
  wgerplanner: 'frost.wger-planner', mealiekitchen: 'frost.mealie-kitchen',
  runningcoach: 'frost.running-coach', enduranceguard: 'frost.endurance-guard',
  garminreadonly: 'frost.garmin-readonly', stravareplay: 'frost.strava-replay',
};
