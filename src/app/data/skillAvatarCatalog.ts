import type { SkillBlockCapability, SkillCanvasNode } from '../../../frost-agent/skill-canvas';

export interface SkillAvatarOption {
  id: string;
  name: string;
  role: string;
  assetUrl: string;
  accent: string;
  capability: SkillBlockCapability;
}

const ASSET_BASE = `${import.meta.env.BASE_URL}assets/skill-cards/city-agent-avatars/`;

export const SKILL_AVATARS: SkillAvatarOption[] = [
  { id: 'trigger-chicken', name: '启动小鸡', role: '负责把事情叫醒', assetUrl: `${ASSET_BASE}trigger-chicken.png`, accent: '#e5ba58', capability: 'trigger.manual' },
  { id: 'location-giraffe', name: '定位长颈鹿', role: '看清位置与路径', assetUrl: `${ASSET_BASE}location-giraffe.png`, accent: '#83b8d2', capability: 'sensor.location' },
  { id: 'health-tiger', name: '校色小虎', role: '关注身体与恢复', assetUrl: `${ASSET_BASE}health-tiger.png`, accent: '#72b9ad', capability: 'sensor.health' },
  { id: 'semantic-owl', name: '决策猫头鹰', role: '整理信息再判断', assetUrl: `${ASSET_BASE}semantic-owl.png`, accent: '#a8b77e', capability: 'model.qwen' },
  { id: 'pose-rabbit', name: '动作白兔', role: '辨认姿态与动作', assetUrl: `${ASSET_BASE}pose-rabbit.png`, accent: '#a99bc6', capability: 'model.pose' },
  { id: 'safety-bear', name: '守护小熊', role: '守住技能安全边界', assetUrl: `${ASSET_BASE}safety-bear.png`, accent: '#ad91b8', capability: 'gate.safety' },
  { id: 'voice-cat', name: '播报橘猫', role: '把下一步告诉你', assetUrl: `${ASSET_BASE}voice-cat.png`, accent: '#df8a5f', capability: 'action.voice' },
  { id: 'evidence-elephant', name: '记忆小象', role: '保存结果与证据', assetUrl: `${ASSET_BASE}evidence-elephant.png`, accent: '#95a77a', capability: 'store.local' },
];

export const BUILTIN_SKILL_AVATAR_IDS: Record<string, string> = {
  'frost-run-route': 'location-giraffe',
  'her-motion': 'pose-rabbit',
  'lianlema-coach': 'pose-rabbit',
  'frost-wger-planner': 'semantic-owl',
  'frost-mealie-kitchen': 'health-tiger',
  'frost-healthsync': 'evidence-elephant',
  'frost-motion-vision': 'pose-rabbit',
  'frost-openfoodfacts': 'health-tiger',
  'frost-cn-health-library': 'evidence-elephant',
  'frost-outdoor-window': 'location-giraffe',
  'frost-sleep-detective': 'semantic-owl',
  'frost-meal-lens': 'health-tiger',
};

export function getSkillAvatar(id?: string): SkillAvatarOption | undefined {
  return id ? SKILL_AVATARS.find((avatar) => avatar.id === id) : undefined;
}

export function getBuiltinSkillAvatar(agentId: string): SkillAvatarOption | undefined {
  return getSkillAvatar(BUILTIN_SKILL_AVATAR_IDS[agentId]);
}

export function recommendSkillAvatar(nodes: SkillCanvasNode[]): SkillAvatarOption {
  const lastMatchingCapability = [...nodes].reverse().find((node) => SKILL_AVATARS.some((avatar) => avatar.capability === node.capability))?.capability;
  return SKILL_AVATARS.find((avatar) => avatar.capability === lastMatchingCapability) || SKILL_AVATARS[0];
}
