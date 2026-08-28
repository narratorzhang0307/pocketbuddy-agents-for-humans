import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveSkillRunTarget } from '../lib/plaza/skillRoutes';
import { getAgentWorldPocketBuddyBlueprint } from '../lib/pocket-buddy';

const forgeSource = readFileSync(new URL('./PocketBuddyForge.tsx', import.meta.url), 'utf8');
const plazaSource = readFileSync(new URL('./PlazaTab.tsx', import.meta.url), 'utf8');

describe('Frost 主 Agent 与领域专家路由', () => {
  it('把焦糖设为主 Agent，并为三个子 Agent 定义清楚的专家领域', () => {
    expect(getAgentWorldPocketBuddyBlueprint('pet-caramel-dachshund')?.role).toBe('Frost 主 Agent');
    expect(getAgentWorldPocketBuddyBlueprint('pip')?.role).toBe('恢复营养专家');
    expect(getAgentWorldPocketBuddyBlueprint('puff')?.role).toBe('户外行动专家');
    expect(getAgentWorldPocketBuddyBlueprint('mossback')?.role).toBe('动作训练专家');
    expect(forgeSource).toContain('一个主 Agent · 三位领域专家');
    expect(forgeSource).toContain('FROST MULTI-AGENT ROUTER');
  });

  it('三个领域专家只连接当前运动健康运行页', () => {
    expect(resolveSkillRunTarget('frost-run-route')).toBe('runroute');
    expect(resolveSkillRunTarget('frost-sleep-detective')).toBe('sleepdetective');
    expect(resolveSkillRunTarget('her-motion')).toBe('hermotion');
    expect(resolveSkillRunTarget('unknown-skill')).toBeNull();
  });

  it('Skill 摘要按钮从 My Agent 交接到 Skills，并能返回 My Agent', () => {
    expect(forgeSource).toContain('pbf-agent-skill-routes');
    expect(forgeSource).toContain('onClick={() => onRunSkill?.(skill.target)}');
    expect(plazaSource).toContain("setSkillOpenOrigin('myagent')");
    expect(plazaSource).toContain("skillOpenOrigin === 'myagent' ? 'myagent' : 'worlds'");
  });
});
