// Frost 的运动健康主题换装。它只是可视化状态，不参与 Skill 决策。
import type { StateDef } from './poses';

export type FrostTheme = 'none' | 'movement' | 'running' | 'recovery' | 'nutrition' | 'sleep' | 'outdoor' | 'mood';

export const THEME_LABEL: Record<Exclude<FrostTheme, 'none'>, string> = {
  movement: 'MOVING',
  running: 'RUNNING',
  recovery: 'RECOVERING',
  nutrition: 'FUELING',
  sleep: 'RESTING',
  outdoor: 'OUTDOORS',
  mood: 'CHECKING IN',
};

function theme(accessory: string, particle: StateDef['particle'] = 'snow'): StateDef {
  return {
    div: 3,
    particle,
    poses: [
      { name: 'REST', lines: ['   .-~-.     ', '  [.:::.]    ', '  [ o  o ]   ', '  [ ---- ]   ', '  `------`   ', accessory] },
      { name: 'BREATHE', lines: ['   .-~-.     ', '  [.:::.]    ', '  [ o  o ]   ', '  [ ---- ]   ', ' `--------`  ', accessory] },
      { name: 'BLINK', lines: ['   .-~-.     ', '  [.:::.]    ', '  [ -  - ]   ', '  [ ---- ]   ', '  `------`   ', accessory] },
    ],
    seq: [0, 0, 1, 0, 0, 2, 0, 1, 0, 0],
  };
}

export const THEMES: Partial<Record<FrostTheme, StateDef>> = {
  movement: theme('  --[==]--   '),
  running: theme('   _/  \\_    '),
  recovery: theme('   \\____/    '),
  nutrition: theme('    \\__/     '),
  sleep: theme('      zZ      ', 'sleep'),
  outdoor: theme('   \\  |  /   '),
  mood: theme('     <3       ', 'heart'),
};

const THEME_PRIORITY: FrostTheme[] = ['movement', 'running', 'recovery', 'nutrition', 'sleep', 'outdoor', 'mood'];

const THEME_KEYWORDS: Record<Exclude<FrostTheme, 'none'>, string[]> = {
  movement: ['瑜伽', '普拉提', '深蹲', '弓步', '俯卧撑', '动作', '姿态', '训练', 'yoga', 'pilates', 'workout', 'pose'],
  running: ['跑步', '慢跑', '配速', '公里', '路线', '跑到', 'readiness', 'running', 'run route', 'pace'],
  recovery: ['恢复', '热身', '拉伸', '酸痛', '疲劳', '产后', 'recovery', 'warmup', 'stretch', 'soreness'],
  nutrition: ['餐食', '营养', '食品', '条码', '蛋白质', '热量', '恢复餐', 'nutrition', 'meal', 'food'],
  sleep: ['睡眠', '失眠', '入睡', '早醒', '午睡', '咖啡', 'sleep', 'bedtime'],
  outdoor: ['户外', '空气质量', '紫外线', '天气', '公园', '绿道', 'AQI', 'outdoor', 'weather'],
  mood: ['心情', '压力', '焦虑', '孤独', '难过', '放松', '陪我', '聊聊', 'mood', 'stress', 'feeling'],
};

const INTENT_THEME: Record<string, FrostTheme> = {
  'frost-run-route': 'running',
  'frost-running-coach': 'running',
  'her-motion': 'recovery',
  'lianlema-coach': 'movement',
  'frost-motion-vision': 'movement',
  'frost-meal-lens': 'nutrition',
  'frost-openfoodfacts': 'nutrition',
  'frost-mealie-kitchen': 'nutrition',
  'frost-sleep-detective': 'sleep',
  'frost-outdoor-window': 'outdoor',
};

export function themeFor(text: string, intent?: string): FrostTheme {
  const lower = (text || '').toLowerCase();
  for (const candidate of THEME_PRIORITY) {
    if (candidate !== 'none' && THEME_KEYWORDS[candidate].some((keyword) => lower.includes(keyword.toLowerCase()))) return candidate;
  }
  return intent ? INTENT_THEME[intent.toLowerCase()] || 'none' : 'none';
}
