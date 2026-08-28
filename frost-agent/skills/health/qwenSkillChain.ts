import type { HealthSkillDefinition } from '../../taskmaster/contracts';

export type HealthSkillChainOutcome = 'proceed' | 'wait' | 'degrade' | 'safe_stop';

export interface HealthSkillChainDecision {
  skill_id: string;
  outcome: HealthSkillChainOutcome;
  tool_requests: string[];
  evidence_refs: string[];
  unknowns: string[];
  user_message: string;
}

export interface HealthSkillChainInput {
  definition: HealthSkillDefinition;
  userRequest: string;
  requiredOutcome: HealthSkillChainOutcome;
  requiredTools: string[];
  requiredUnknowns?: string[];
  evidence: Record<string, unknown>;
  evidenceRefs: string[];
}

const DECISION_KEYS = ['skill_id', 'outcome', 'tool_requests', 'evidence_refs', 'unknowns', 'user_message'] as const;
const MODEL_WRITABLE_KEYS = ['m'] as const;
const OUTCOMES = new Set<HealthSkillChainOutcome>(['proceed', 'wait', 'degrade', 'safe_stop']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isTextArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim().length > 0);
}

function sameMembers(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item) => right.includes(item));
}

/**
 * Build the deliberately small contract sent to Qwen3-4B.
 * Deterministic code has already selected the skill and calculated the gate;
 * the model may explain that result, but cannot upgrade it or invent tools.
 */
export function buildHealthSkillChainPrompt(input: HealthSkillChainInput): { system: string; prompt: string } {
  const allowedTools = input.definition.steps.map((step) => step.tool);
  for (const tool of input.requiredTools) {
    if (!allowedTools.includes(tool)) throw new Error(`required_tool_not_allowed:${tool}`);
  }
  const payload = {
    skill: input.definition.skill_id,
    request: input.userRequest.slice(0, 160),
    tools: input.requiredTools,
    outcome: ({ proceed: 'p', wait: 'w', degrade: 'd', safe_stop: 'x' } as const)[input.requiredOutcome],
    rules: [...input.definition.not_for, ...input.definition.stop_rules],
    refs: input.evidenceRefs,
    unknowns: input.requiredUnknowns || [],
    evidence: input.evidence,
  };
  return {
    system: [
      '你是 Frost 健康控制层。只转述证据，不诊断、不补数字、不改变安全结论。',
      '只输出 JSON：{"m":"不超过80字的中文说明"}。字段不可增删。',
    ].join(''),
    prompt: JSON.stringify(payload),
  };
}

/** Strict boundary applied before any model output reaches the product UI. */
export function parseHealthSkillChainDecision(
  raw: string,
  input: Pick<HealthSkillChainInput, 'definition' | 'requiredOutcome' | 'requiredTools' | 'requiredUnknowns' | 'evidence' | 'evidenceRefs'>,
): HealthSkillChainDecision {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error('qwen_decision_invalid_json'); }
  if (!isRecord(parsed)) throw new Error('qwen_decision_not_object');
  const keys = Object.keys(parsed).sort();
  if (sameMembers(keys, [...MODEL_WRITABLE_KEYS].sort())) {
    parsed = {
      skill_id: input.definition.skill_id,
      outcome: input.requiredOutcome,
      tool_requests: [...input.requiredTools],
      evidence_refs: [...input.evidenceRefs],
      unknowns: [...(input.requiredUnknowns || [])],
      user_message: parsed.m,
    };
  } else if (!sameMembers(keys, [...DECISION_KEYS].sort())) {
    throw new Error('qwen_decision_unexpected_fields');
  }
  if (!isRecord(parsed)) throw new Error('qwen_decision_not_object');
  if (parsed.skill_id !== input.definition.skill_id) throw new Error('qwen_decision_skill_mismatch');
  if (typeof parsed.outcome !== 'string' || !OUTCOMES.has(parsed.outcome as HealthSkillChainOutcome)) {
    throw new Error('qwen_decision_invalid_outcome');
  }
  if (parsed.outcome !== input.requiredOutcome) throw new Error('qwen_decision_overrode_gate');
  if (!isTextArray(parsed.tool_requests) && !(Array.isArray(parsed.tool_requests) && parsed.tool_requests.length === 0)) {
    throw new Error('qwen_decision_invalid_tools');
  }
  const toolRequests = parsed.tool_requests as string[];
  const allowedTools = input.definition.steps.map((step) => step.tool);
  if (toolRequests.some((tool) => !allowedTools.includes(tool))) throw new Error('qwen_decision_tool_not_allowed');
  if (!sameMembers(toolRequests, input.requiredTools)) throw new Error('qwen_decision_tool_mismatch');
  if (!isTextArray(parsed.evidence_refs) && !(Array.isArray(parsed.evidence_refs) && parsed.evidence_refs.length === 0)) {
    throw new Error('qwen_decision_invalid_evidence_refs');
  }
  const evidenceRefs = parsed.evidence_refs as string[];
  if (evidenceRefs.some((ref) => !input.evidenceRefs.includes(ref))) throw new Error('qwen_decision_unknown_evidence_ref');
  if (!sameMembers(evidenceRefs, input.evidenceRefs)) throw new Error('qwen_decision_missing_evidence_ref');
  if (!isTextArray(parsed.unknowns) && !(Array.isArray(parsed.unknowns) && parsed.unknowns.length === 0)) {
    throw new Error('qwen_decision_invalid_unknowns');
  }
  if (typeof parsed.user_message !== 'string' || !parsed.user_message.trim() || parsed.user_message.length > 80) {
    throw new Error('qwen_decision_invalid_user_message');
  }
  const evidenceNumbers = new Set((JSON.stringify(input.evidence).match(/[-+]?\d+(?:\.\d+)?/g) || []).map((token) => token.replace(/^\+/, '')));
  const messageNumbers = (parsed.user_message.match(/[-+]?\d+(?:\.\d+)?/g) || []).map((token) => token.replace(/^\+/, ''));
  if (messageNumbers.some((token) => !evidenceNumbers.has(token))) throw new Error('qwen_decision_ungrounded_number');
  return parsed as unknown as HealthSkillChainDecision;
}
