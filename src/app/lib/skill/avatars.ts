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

export const FROST_AVATAR = avatar('frost', 'frost', 'Frost 焦糖腊肠犬', 0);
// Consultation has a separate phone portrait but deliberately retains Frost on
// the badge: no new unprovisioned avatar index is sent to existing firmware.
export const SKILLS_WITH_FROST_AVATAR = ['frost.health-consultation'] as const;
export const SKILL_AVATARS: readonly SkillAvatar[] = [
  avatar('frost.bird-listener', 'frost-bird-listener', '识鸟 聆听小鸟', 17),
  avatar('pocket.her-motion', 'her-motion', 'Her Motion 火烈鸟', 1),
  avatar('pocket.lianlema', 'lianlema-coach', '练了吗 小熊', 2),
  avatar('frost.run-route', 'frost-run-route', '跑步路线 探路鸟', 3),
  avatar('frost.running-coach', 'frost-running-coach', '跑步教练 小兔', 4),
  avatar('frost.healthsync', 'frost-healthsync', '健康同步 苹果', 5),
  avatar('frost.mediapipe-motion', 'frost-motion-vision', '动作信号 壁虎', 6),
  avatar('frost.endurance-guard', 'frost-endurance-guard', '耐力校验 乌龟', 7),
  avatar('frost.openfoodfacts', 'frost-openfoodfacts', '包装食品 小盒子', 8),
  avatar('frost.garmin-readonly', 'frost-garmin-readonly', 'Garmin 同步 企鹅', 9),
  avatar('frost.cn-health-library', 'frost-cn-health-library', '中国食品 西兰花', 10),
  avatar('frost.outdoor-window', 'frost-outdoor-window', '户外窗口 向日葵', 11),
  avatar('frost.strava-replay', 'frost-strava-replay', '训练回放 狐狸', 12),
  avatar('frost.sleep-detective', 'frost-sleep-detective', '睡眠侦探 猫头鹰', 13),
  avatar('frost.meal-lens', 'frost-meal-lens', '饮食镜头 米饭碗', 14),
  avatar('frost.wger-planner', 'frost-wger-planner', '训练计划 大猩猩', 15),
  avatar('frost.mealie-kitchen', 'frost-mealie-kitchen', '恢复厨房 蘑菇', 16),
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
