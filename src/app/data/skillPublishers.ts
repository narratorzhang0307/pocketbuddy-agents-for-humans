export type SkillPublisher = {
  name: string;
  role: string;
  avatar: string;
};

const PUFF_AVATAR = '/assets/pocket-buddy/agent-world-original-v2/puff-rabbit-card-v2.png';
const PIP_AVATAR = '/assets/pocket-buddy/agent-world-original-v2/pip-hamster-card-v2.png';
const MOSSBACK_AVATAR = '/assets/pocket-buddy/agent-world-original-v2/mossback-tortoise-card-v3.png';
const HER_MOTION_AVATAR = '/assets/plaza/her-motion-yoga.svg';

export const SKILL_PUBLISHERS: Record<string, SkillPublisher> = {
  'frost.running-coach': { name: 'Puff', role: '跑步决策员', avatar: PUFF_AVATAR },
  'frost.run-route': { name: 'Puff', role: '跑步路线员', avatar: PUFF_AVATAR },
  'frost.healthsync': { name: 'Pip', role: '健康数据员', avatar: PIP_AVATAR },
  'frost.mediapipe-motion': { name: 'Mossback', role: '动作信号员', avatar: MOSSBACK_AVATAR },
  'frost.endurance-guard': { name: 'Mossback', role: '耐力审计员', avatar: MOSSBACK_AVATAR },
  'frost.openfoodfacts': { name: 'Pip', role: '包装食品员', avatar: PIP_AVATAR },
  'frost.garmin-readonly': { name: 'Puff', role: '运动数据员', avatar: PUFF_AVATAR },
  'frost.cn-health-library': { name: 'Pip', role: '中国食品员', avatar: PIP_AVATAR },
  'frost.outdoor-window': { name: 'Puff', role: '户外条件员', avatar: PUFF_AVATAR },
  'frost.strava-replay': { name: 'Puff', role: '训练回放员', avatar: PUFF_AVATAR },
  'frost.sleep-detective': { name: 'Pip', role: '睡眠观察员', avatar: PIP_AVATAR },
  'frost.meal-lens': { name: 'Pip', role: '中国饮食镜头', avatar: PIP_AVATAR },
  'frost.wger-planner': { name: 'Mossback', role: '训练计划员', avatar: MOSSBACK_AVATAR },
  'frost.mealie-kitchen': { name: 'Pip', role: '恢复厨房员', avatar: PIP_AVATAR },
  'pocket.her-motion': { name: 'Her Motion', role: '女性动作视觉陪伴', avatar: HER_MOTION_AVATAR },
  'pocket.lianlema': { name: 'Mossback', role: 'AI 动作教练', avatar: MOSSBACK_AVATAR },
};

const AGENT_TO_PUBLISHER: Record<string, string> = {
  'frost-running-coach': 'frost.running-coach',
  'frost-run-route': 'frost.run-route',
  'frost-healthsync': 'frost.healthsync',
  'frost-motion-vision': 'frost.mediapipe-motion',
  'frost-endurance-guard': 'frost.endurance-guard',
  'frost-openfoodfacts': 'frost.openfoodfacts',
  'frost-garmin-readonly': 'frost.garmin-readonly',
  'frost-cn-health-library': 'frost.cn-health-library',
  'frost-outdoor-window': 'frost.outdoor-window',
  'frost-strava-replay': 'frost.strava-replay',
  'frost-sleep-detective': 'frost.sleep-detective',
  'frost-meal-lens': 'frost.meal-lens',
  'frost-wger-planner': 'frost.wger-planner',
  'frost-mealie-kitchen': 'frost.mealie-kitchen',
  'her-motion': 'pocket.her-motion',
  'lianlema-coach': 'pocket.lianlema',
};

export const DEFAULT_SKILL_PUBLISHER = SKILL_PUBLISHERS['frost.running-coach'];

export function skillPublisherForManifest(manifestId: string): SkillPublisher {
  return SKILL_PUBLISHERS[manifestId] || DEFAULT_SKILL_PUBLISHER;
}

export function skillPublisherForAgent(agentId: string): SkillPublisher {
  return skillPublisherForManifest(AGENT_TO_PUBLISHER[agentId] || agentId);
}
