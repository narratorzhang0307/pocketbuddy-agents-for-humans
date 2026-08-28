import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Skills 顶部 MY AGENT 子页', () => {
  const plazaSource = readFileSync(new URL('./PlazaTab.tsx', import.meta.url), 'utf8');
  const forgeSource = readFileSync(new URL('./PocketBuddyForge.tsx', import.meta.url), 'utf8');
  const portraitSource = readFileSync(
    new URL('./AgentWorldPocketBuddyPortrait.tsx', import.meta.url),
    'utf8',
  );

  it('顶部只保留 MY SKILLS 与 AGENT WORLD 两个子页', () => {
    expect(plazaSource).toContain('grid grid-cols-2');
    const skills = plazaSource.indexOf('>MY SKILLS</button>');
    const myAgent = plazaSource.indexOf('>MY AGENT</button>');
    const agentWorld = plazaSource.indexOf('>AGENT WORLD</button>');
    expect(skills).toBeGreaterThan(-1);
    expect(myAgent).toBe(-1);
    expect(agentWorld).toBeGreaterThan(skills);
  });

  it('Agent World 首页不再展示重复的网络统计与流程说明', () => {
    expect(plazaSource).not.toContain('个世界 · 可验证 Skill 协议');
    expect(plazaSource).not.toContain('先看发布者，再决定是否装入');
    expect(plazaSource).not.toContain('Qwen3-VL-2B · MNN 真机运行');
    expect(plazaSource).not.toContain('<PrivateSkillForgePanel />');
    expect(plazaSource).not.toContain('MY PRIVATE WORLD');
  });

  it('打开精简后的口袋伙伴页，并保留拍照创建入口', () => {
    expect(plazaSource).toContain("mode === 'myagent'");
    expect(plazaSource).toContain('<PocketBuddyForge worldDraftName=');
    expect(forgeSource).toContain('口袋伙伴卡册');
    expect(forgeSource).toContain('创建属于你自己的 Agent');
    expect(forgeSource.indexOf('pbf-capture-cta')).toBeLessThan(forgeSource.indexOf('pbf-buddy-strip'));
    expect(forgeSource).toContain('submitPetCutout(file');
    expect(forgeSource).not.toContain('AGENT FORGE · POCKET');
    expect(forgeSource).not.toContain('2D/2.5D 的长期智能体');
    expect(forgeSource).not.toContain('pbf-catalog-entry');
  });

  it('把私有 Skill 和 Agent World 创建链路收进 MY AGENT', () => {
    expect(forgeSource).toContain('<PrivateSkillForgePanel />');
    expect(forgeSource.indexOf('<PrivateSkillForgePanel />')).toBeLessThan(forgeSource.indexOf('Skill 摘要'));
    expect(forgeSource).toContain('一键定义我的 Agent World');
    expect(forgeSource.indexOf('创建属于你自己的 Agent')).toBeLessThan(forgeSource.indexOf('一键定义我的 Agent World'));
    expect(plazaSource).toContain('CREATE YOUR AGENT WORLD');
    expect(plazaSource).toContain("['pet-caramel-dachshund', 'puff', 'pip', 'mossback']");
    expect(plazaSource).toContain('01 · 选择常驻子 AGENT');
    expect(plazaSource).toContain('02 · 定义世界名字');
    expect(plazaSource).not.toContain('02 · 定义世界气质与名字');
    expect(plazaSource).not.toContain('NIGHT SIGNAL</span><b');
  });

  it('合并人格、能力与边界定义', () => {
    expect(forgeSource).toContain('人格设定');
    expect(forgeSource).toContain('核心能力');
    expect(forgeSource).toContain('<label>边界');
  });

  it('健康版卡册不再装入整套旧角色动作包', () => {
    expect(portraitSource).not.toContain('buddyPackages.generated');
    expect(portraitSource).not.toContain('motionPackage?.motion.frames');
  });
});
