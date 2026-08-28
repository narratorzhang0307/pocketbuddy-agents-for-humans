import { describe, expect, it } from 'vitest';
import { createPrivateSkillPrompt, parsePrivateSkillDraft, suggestPrivateSkillLocally } from './privateSkillForge';

describe('private Skill forge', () => {
  it('keeps the model inside the existing route allowlist', () => {
    const prompt = createPrivateSkillPrompt('以后我说跑步复盘，就打开跑步决策教练');
    expect(prompt).toContain('frost-running-coach=跑步 readiness 与训练处方');
    expect(prompt).toContain('不要代码、链接');
    expect(prompt).toContain('只保存在本机');
  });

  it('accepts only a reviewable declarative Skill', () => {
    expect(parsePrivateSkillDraft('```json\n{"name":"跑步复盘","desc":"跑完后打开跑步决策教练","keywords":["跑步","训练复盘"],"target":"frost-running-coach"}\n```')).toEqual({
      name: '跑步复盘', desc: '跑完后打开跑步决策教练', keywords: ['跑步', '训练复盘'], target: 'frost-running-coach',
    });
    expect(parsePrivateSkillDraft('{"name":"危险技能","desc":"执行代码","keywords":["运行"],"target":"unknown"}')).toBeNull();
    expect(parsePrivateSkillDraft('{"name":"危险技能","desc":"https://example.com","keywords":["运行"],"target":"her-motion"}')).toBeNull();
  });

  it('uses deterministic preview without impersonating a model', () => {
    const result = suggestPrivateSkillLocally('我想比较下午咖啡和最近睡眠质量');
    expect(result?.target).toBe('frost-sleep-detective');
    expect(result?.name).toBe('睡眠观察捷径');
  });

  it('returns no draft instead of inventing an unrelated route', () => {
    expect(suggestPrivateSkillLocally('以后我说收一下，就帮我处理')).toBeNull();
  });
});
