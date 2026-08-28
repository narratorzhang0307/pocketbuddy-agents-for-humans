import { callEdgeRequest } from '../../edge/httpEdge';
import type { PrescriptionValidation, ReadinessDecision } from './foundation';

export interface HealthDecisionExplanationInput {
  skillId: 'frost.running-coach' | 'frost.endurance-guard';
  readiness: ReadinessDecision;
  validation: PrescriptionValidation;
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

export async function explainHealthDecisionWithQwen4B(input: HealthDecisionExplanationInput): Promise<{
  text: string;
  backend: 'mnn' | 'stub';
  model?: string;
  error?: string;
}> {
  const response = await callEdgeRequest({
    task: 'chat',
    model: 'health-qwen3-4b',
    purpose: 'health-decision-explanation',
    prompt: buildHealthDecisionExplanationPrompt(input),
    system: '你是 Frost 运动健康解释层。确定性安全门是唯一最终决策者。不做诊断，不建议药物，不改写处方强度、时长或停止规则。',
    maxTokens: 384,
  }, 120_000);
  const ok = response.backend === 'mnn' && response.model?.includes('Qwen3-4B') && typeof response.text === 'string' && response.text.trim().length > 0;
  return {
    text: ok ? response.text!.trim() : '',
    backend: ok ? 'mnn' : 'stub',
    model: response.model,
    error: ok ? undefined : response.error || 'health_qwen3_4b_unavailable',
  };
}
