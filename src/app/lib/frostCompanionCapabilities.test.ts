import { beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_SKILLS, ensureBuiltinSkills, resetSkillRegistryForTests, shouldAutoEquipBuiltin } from './skill';
import { listFrostSkillSubagents } from '../../../frost-agent/subagents/registry';
import { planLocalFrostTask } from '../../../frost-agent/harness/skillRouter';
import { readFileSync } from 'node:fs';

describe('badge voice reuses every registered built-in capability', () => {
  beforeEach(() => { resetSkillRegistryForTests(); ensureBuiltinSkills(); });

  it.each(BUILTIN_SKILLS.filter(shouldAutoEquipBuiltin).map(skill => [skill.identity.id, skill] as const))('%s retains its same child identity, target and permission scopes', (id, manifest) => {
    const child = listFrostSkillSubagents().find(agent => agent.skill.id === id);
    expect(child?.agent_id).toBe(`skill:${id}`);
    expect(child?.skill.target).toBe(manifest.entry.target);
    expect(child?.skill.scopes).toEqual(manifest.permissions.scopes);
    // ASR produces text, not a replacement skill/target or a bypass of availability checks.
    const plan = planLocalFrostTask(id);
    expect(plan?.steps.some(step => step.skillId === id && step.target === manifest.entry.target)).toBe(true);
  });
  it.each(BUILTIN_SKILLS.filter(skill => !shouldAutoEquipBuiltin(skill)).map(skill => [skill.identity.id, skill] as const))('%s remains catalogued but cannot become a badge-started child before setup', (id, manifest) => {
    expect(listFrostSkillSubagents().some(agent => agent.skill.id === id)).toBe(false);
    expect(planLocalFrostTask(id)?.steps[0]).toMatchObject({ skillId: id, target: manifest.entry.target, availability: 'installed' });
  });
  it('has an explicit reviewed phone-input/result boundary for every built-in capability', () => {
    const audit = readFileSync(new URL('../../../docs/technical/FROST-COMPANION-2026-08-27.md', import.meta.url), 'utf8');
    for (const skill of BUILTIN_SKILLS) expect(audit).toContain(`\`${skill.identity.id}\``);
  });
});
