import { createDefaultPocketBuddyApiClient } from '../../skill-taskmaster/apiClient';
import type { PrescriptionValidation, ReadinessDecision } from './foundation';

export interface HealthDecisionExplanationInput {
  skillId: 'frost.running-coach' | 'frost.endurance-guard';
  readiness: ReadinessDecision;
  validation: PrescriptionValidation;
}

export interface HealthDecisionExplanation {
  text: string;
  backend: 'server' | 'fallback';
  error?: string;
}

export function buildHealthDecisionExplanationPrompt(input: HealthDecisionExplanationInput): string {
  return [
    '以下是 Frost 确定性安全规则已经完成的结果。你只能解释，不能更改、升级或补造任何健康事实。',
    JSON.stringify({
      skillId: input.skillId,
      readiness: input.readiness,
      gate: {
        passed: input.validation.ok,
        errors: input.validation.errors,
        finalPrescription: input.validation.conservative,
      },
    }),
    '用简洁中文输出：1）今天为什么是这个 readiness；2）最终强度和时长；3）所有停止规则；4）数据不足或不确定性。',
  ].join('\n');
}

export async function explainHealthDecisionWithServerModel(
  input: HealthDecisionExplanationInput,
  signal?: AbortSignal,
): Promise<HealthDecisionExplanation> {
  try {
    const response = await createDefaultPocketBuddyApiClient(signal).generate({
      task: 'health-decision-explanation',
      system: '你是 Frost 运动健康解释层。确定性安全门是唯一最终决策者。不做诊断，不建议药物，不改写处方强度、时长或停止规则。',
      prompt: buildHealthDecisionExplanationPrompt(input),
    });
    const text = response.text?.trim();
    if (!text) return { text: '', backend: 'fallback', error: 'server_model_empty_response' };
    return { text, backend: 'server' };
  } catch (cause) {
    return {
      text: '',
      backend: 'fallback',
      error: cause instanceof Error ? cause.message : 'server_model_unavailable',
    };
  }
}
