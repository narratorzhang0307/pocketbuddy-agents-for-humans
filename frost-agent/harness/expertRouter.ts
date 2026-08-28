/** Frost's deterministic health-expert delegation layer. */

export type FrostExpertId = 'frost' | 'pip' | 'puff' | 'mossback';

export interface FrostExpert {
  id: FrostExpertId;
  name: string;
  role: string;
  boundary: string;
}

export const FROST_EXPERTS: Readonly<Record<FrostExpertId, FrostExpert>> = {
  frost: {
    id: 'frost',
    name: '焦糖',
    role: 'Frost 主 Agent',
    boundary: '理解目标、拆解任务、选择专家与汇总证据，不绕过目标 Skill 的授权和确认门。',
  },
  puff: {
    id: 'puff',
    name: 'Puff',
    role: '户外行动专家',
    boundary: '规划路线不等于现场安全；定位、天气和可穿戴数据只在用户授权范围内读取。',
  },
  pip: {
    id: 'pip',
    name: 'Pip',
    role: '恢复营养专家',
    boundary: '缺失数据不补成确定结论；饮食和恢复建议不替代医疗诊断。',
  },
  mossback: {
    id: 'mossback',
    name: 'Mossback',
    role: '动作训练专家',
    boundary: '只根据可见动作信号提供训练反馈；疼痛、眩晕或异常状态立即停止。',
  },
};

const SKILL_EXPERT: Readonly<Record<string, FrostExpertId>> = {
  'frost.running-coach': 'puff',
  'frost.run-route': 'puff',
  'frost.healthsync': 'puff',
  'frost.garmin-readonly': 'puff',
  'frost.outdoor-window': 'puff',
  'frost.strava-replay': 'puff',

  'frost.openfoodfacts': 'pip',
  'frost.cn-health-library': 'pip',
  'frost.sleep-detective': 'pip',
  'frost.meal-lens': 'pip',
  'frost.mealie-kitchen': 'pip',

  'pocket.her-motion': 'mossback',
  'pocket.lianlema': 'mossback',
  'frost.mediapipe-motion': 'mossback',
  'frost.endurance-guard': 'mossback',
  'frost.wger-planner': 'mossback',
};

/** Unregistered or cross-domain work remains with Frost rather than inventing an expert. */
export function expertForSkill(skillId: string): FrostExpert {
  return FROST_EXPERTS[SKILL_EXPERT[skillId] ?? 'frost'];
}
