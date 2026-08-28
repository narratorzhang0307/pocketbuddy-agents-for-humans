import { ALLOWED_TARGETS, reviewSkill, type LearnedSkill } from '../../../../frost-agent/harness/skillForge';

export type PrivateSkillDraft = Pick<LearnedSkill, 'name' | 'desc' | 'keywords' | 'target'>;

const TARGET_HINTS: ReadonlyArray<{ match: RegExp; target: string; name: string; keywords: string[] }> = [
  { match: /深蹲|弓步|俯卧撑|动作计数|姿势纠正|练了吗/, target: 'lianlema-coach', name: '动作纠正捷径', keywords: ['动作纠正', '计数', '深蹲'] },
  { match: /瑜伽|普拉提|热身|拉伸|恢复动作|her\s*motion/i, target: 'her-motion', name: '恢复运动捷径', keywords: ['瑜伽', '热身', '恢复'] },
  { match: /跑步|readiness|质量课|配速|训练处方/i, target: 'frost-running-coach', name: '跑步决策捷径', keywords: ['跑步', 'readiness', '处方'] },
  { match: /apple\s*health|hrv|苹果健康|健康导出/i, target: 'frost-healthsync', name: '健康同步捷径', keywords: ['Apple Health', 'HRV', '同步'] },
  { match: /mediapipe|姿态关键点|连续帧|置信度/i, target: 'frost-motion-vision', name: '姿态信号捷径', keywords: ['MediaPipe', '关键点', '连续帧'] },
  { match: /耐力|负荷|强度上限|处方校验|section\s*11/i, target: 'frost-endurance-guard', name: '耐力校验捷径', keywords: ['耐力', '负荷', '校验'] },
  { match: /条码|包装食品|营养标签|每\s*100\s*g|openfoodfacts/i, target: 'frost-openfoodfacts', name: '食品标签捷径', keywords: ['条码', '营养标签', '包装食品'] },
  { match: /garmin|佳明|body\s*battery/i, target: 'frost-garmin-readonly', name: 'Garmin 复盘捷径', keywords: ['Garmin', '训练状态', 'HRV'] },
  { match: /中国食品|中餐|奶茶|中国品牌食品/, target: 'frost-cn-health-library', name: '中餐营养捷径', keywords: ['中餐', '营养', '食品库'] },
  { match: /aqi|紫外线|空气质量|雷暴|户外运动|适合跑步/i, target: 'frost-outdoor-window', name: '户外窗口捷径', keywords: ['AQI', '紫外线', '户外运动'] },
  { match: /strava|训练回放|活动复盘|配速分段/i, target: 'frost-strava-replay', name: '训练回放捷径', keywords: ['Strava', '活动复盘', '分段'] },
  { match: /睡眠|咖啡|饮酒|晚间训练|失眠/, target: 'frost-sleep-detective', name: '睡眠观察捷径', keywords: ['睡眠', '咖啡', '趋势'] },
  { match: /餐食照片|拍照记一餐|菜名|估算这顿饭/, target: 'frost-meal-lens', name: '餐食观察捷径', keywords: ['餐食照片', '份量', '营养'] },
  { match: /wger|力量训练计划|今天练什么/i, target: 'frost-wger-planner', name: '力量计划捷径', keywords: ['wger', '力量训练', '计划'] },
  { match: /mealie|恢复餐|训练日食谱|购物清单/i, target: 'frost-mealie-kitchen', name: '恢复餐捷径', keywords: ['Mealie', '恢复餐', '食谱'] },
] as const;

function jsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function createPrivateSkillPrompt(description: string): string {
  const targets = Object.entries(ALLOWED_TARGETS).map(([id, label]) => `${id}=${label}`).join('；');
  return [
    `用户想为 Frost 创建一个只保存在本机的声明式快捷 Skill：${description.trim()}`,
    `target 只能从白名单选择：${targets}`,
    '只输出 JSON：{"name":"20字以内","desc":"40字以内","keywords":["1到8个触发词，每个12字以内"],"target":"白名单ID"}',
    '不要代码、链接、Markdown、额外字段，也不要声称已经安装或执行。',
  ].join('\n');
}

export function parsePrivateSkillDraft(raw: string): PrivateSkillDraft | null {
  const value = jsonObject(raw);
  if (!value) return null;
  const candidate: PrivateSkillDraft = {
    name: typeof value.name === 'string' ? value.name.trim() : '',
    desc: typeof value.desc === 'string' ? value.desc.trim() : '',
    keywords: Array.isArray(value.keywords) ? value.keywords.filter((item): item is string => typeof item === 'string').map((item) => item.trim()) : [],
    target: typeof value.target === 'string' ? value.target : '',
  };
  return reviewSkill(candidate).ok ? candidate : null;
}

export function suggestPrivateSkillLocally(description: string): PrivateSkillDraft | null {
  const text = description.trim();
  const matched = TARGET_HINTS.find((item) => item.match.test(text));
  if (!matched) return null;
  return {
    name: matched.name,
    desc: `当你提到${matched.keywords.slice(0, 2).join('或')}时，交给${ALLOWED_TARGETS[matched.target]}。`.slice(0, 40),
    keywords: [...matched.keywords],
    target: matched.target,
  };
}
