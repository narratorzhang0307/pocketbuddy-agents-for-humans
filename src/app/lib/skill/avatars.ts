import { resolveSkillRunTarget, type SkillRunTarget } from '../plaza/skillRoutes';
import cloudCatalog from './avatarCloudCatalog.json';
import birdCatalog from '../../../../native/frost-badge/ios/BirdCatalog.json';

// Wire indexes are shared with the OJBadge avatar_skill_v1 firmware endpoint.
// Keep existing indexes stable when adding new characters.
const ROOT = '/assets/skill-avatars/20260827';

export interface SkillAvatar {
  id: string;
  target: string;
  name: string;
  badgeIndex: number;
  src: string;
}

function avatar(id: string, target: string, name: string, badgeIndex: number): SkillAvatar {
  const cloud = [...cloudCatalog, ...birdCatalog].find(item => item.index === badgeIndex);
  return { id, target, name, badgeIndex, src: cloud?.webUrl || `${ROOT}/web/${id}.webp` };
}

export const FROST_AVATAR = avatar('frost', 'frost', 'Frost Caramel Dachshund', 0);
// Consultation has a separate phone portrait but deliberately retains Frost on
// the badge: no new unprovisioned avatar index is sent to existing firmware.
export const SKILLS_WITH_FROST_AVATAR = ['frost.health-consultation'] as const;
export const SKILL_AVATARS: readonly SkillAvatar[] = [
  avatar('frost.bird-listener', 'frost-bird-listener', 'Bird ID Listening Bird', 17),
  avatar('pocket.her-motion', 'her-motion', 'Her Motion Flamingo', 1),
  avatar('pocket.lianlema', 'lianlema-coach', 'Lianlema Bear', 2),
  avatar('frost.run-route', 'frost-run-route', 'Run Route Pathfinder Bird', 3),
  avatar('frost.running-coach', 'frost-running-coach', 'Running Coach Rabbit', 4),
  avatar('frost.healthsync', 'frost-healthsync', 'Health Sync Apple', 5),
  avatar('frost.mediapipe-motion', 'frost-motion-vision', 'Motion Signal Gecko', 6),
  avatar('frost.endurance-guard', 'frost-endurance-guard', 'Endurance Check Tortoise', 7),
  avatar('frost.openfoodfacts', 'frost-openfoodfacts', 'Packaged Food Box', 8),
  avatar('frost.garmin-readonly', 'frost-garmin-readonly', 'Garmin Sync Penguin', 9),
  avatar('frost.cn-health-library', 'frost-cn-health-library', 'Chinese Food Broccoli', 10),
  avatar('frost.outdoor-window', 'frost-outdoor-window', 'Outdoor Window Sunflower', 11),
  avatar('frost.strava-replay', 'frost-strava-replay', 'Training Replay Fox', 12),
  avatar('frost.sleep-detective', 'frost-sleep-detective', 'Sleep Detective Owl', 13),
  avatar('frost.meal-lens', 'frost-meal-lens', 'Meal Lens Rice Bowl', 14),
  avatar('frost.wger-planner', 'frost-wger-planner', 'Training Plan Gorilla', 15),
  avatar('frost.mealie-kitchen', 'frost-mealie-kitchen', 'Recovery Kitchen Mushroom', 16),
];

const byIdentity = new Map([FROST_AVATAR, ...SKILL_AVATARS].flatMap(item => [
  [item.id, item] as const, [item.target, item] as const,
]));

/** Unknown/custom skills retain the main companion; never invent a wire index. */
export function skillAvatarFor(idOrTarget?: string): SkillAvatar {
  return byIdentity.get(idOrTarget || '') || FROST_AVATAR;
}

/** Keep the original capability when two skills share one runtime page. */
export function skillAvatarForPage(page: SkillRunTarget | null, entryTarget?: string): SkillAvatar {
  if (!page) return FROST_AVATAR;
  if (entryTarget && resolveSkillRunTarget(entryTarget) === page) return skillAvatarFor(entryTarget);
  return SKILL_AVATARS.find(item => resolveSkillRunTarget(item.target) === page) || FROST_AVATAR;
}

export const BADGE_AVATAR_ENDPOINT = 'avatar_skill_v1';
