import { describe, expect, it } from 'vitest';
import { EXTERNAL_HEALTH_SKILL_DEFINITIONS } from '../../taskmaster/externalSkills';
import { buildHealthSkillChainPrompt, parseHealthSkillChainDecision } from './qwenSkillChain';

const definition = EXTERNAL_HEALTH_SKILL_DEFINITIONS.find((skill) => skill.skill_id === 'frost.running-coach')!;
const input = {
  definition,
  requiredOutcome: 'degrade' as const,
  requiredTools: ['coach.assess-readiness', 'coach.validate-prescription'],
  evidence: { readiness: 'red' },
  evidenceRefs: ['readiness:test'],
};

describe('Qwen3-4B health skill chain boundary', () => {
  it('sends only a bounded control-plane contract', () => {
    const result = buildHealthSkillChainPrompt({
      ...input,
      userRequest: '今天做间歇跑',
      evidence: { readiness: 'red' },
    });
    expect(result.system).toContain('字段不可增删');
    expect(JSON.parse(result.prompt)).toMatchObject({
      skill: 'frost.running-coach', outcome: 'd',
    });
  });

  it('accepts an exact evidence-bound decision', () => {
    expect(parseHealthSkillChainDecision(JSON.stringify({
      skill_id: 'frost.running-coach', outcome: 'degrade',
      tool_requests: ['coach.assess-readiness', 'coach.validate-prescription'],
      evidence_refs: ['readiness:test'], unknowns: [], user_message: '今天只做恢复活动。',
    }), input).outcome).toBe('degrade');
    expect(parseHealthSkillChainDecision(JSON.stringify({
      m: '今天只做恢复活动。',
    }), input).outcome).toBe('degrade');
  });

  it('rejects gate overrides, invented tools, evidence and extra fields', () => {
    const valid = {
      skill_id: 'frost.running-coach', outcome: 'degrade',
      tool_requests: ['coach.assess-readiness', 'coach.validate-prescription'],
      evidence_refs: ['readiness:test'], unknowns: [], user_message: '今天只做恢复活动。',
    };
    expect(() => parseHealthSkillChainDecision(JSON.stringify({ ...valid, outcome: 'proceed' }), input)).toThrow('overrode_gate');
    expect(() => parseHealthSkillChainDecision(JSON.stringify({ ...valid, tool_requests: ['shell.exec'] }), input)).toThrow('tool_not_allowed');
    expect(() => parseHealthSkillChainDecision(JSON.stringify({ ...valid, evidence_refs: ['invented'] }), input)).toThrow('unknown_evidence_ref');
    expect(() => parseHealthSkillChainDecision(JSON.stringify({ ...valid, debug: true }), input)).toThrow('unexpected_fields');
    expect(() => parseHealthSkillChainDecision(JSON.stringify({ ...valid, user_message: '今天做99分钟。' }), input)).toThrow('ungrounded_number');
  });
});
