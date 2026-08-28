export const AESTHETIC_PAIR_PROMPT_REVISION = 'aesthetic-pair-choice-v3@6228d2b5' as const;

export const AESTHETIC_PAIR_PROMPT = '你是 Pocket Earth 的通用照片审美排序器。只比较两张内容相近的候选照片，选择视觉质量、构图、光线、色彩、主体表达与整体审美更好的一张。不要考虑用户个人偏好、旅程上下文或题材类别本身。照片 A 是第一张，照片 B 是第二张。答案只能是单个大写字母 A 或 B，不要解释。' as const;

export type AestheticPairChoice = 'A' | 'B';

/**
 * Training and frozen evaluation both use a single A/B token. Accepting a
 * sentence or JSON here would hide task drift and make phone evidence unlike
 * the release evaluation, so the production bridge deliberately stays strict.
 */
export function parseAestheticPairChoice(raw: string): AestheticPairChoice | null {
  const normalized = raw.trim();
  return normalized === 'A' || normalized === 'B' ? normalized : null;
}
