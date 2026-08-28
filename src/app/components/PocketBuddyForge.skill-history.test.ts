import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('MY AGENT Skill 学习溯源', () => {
  const source = readFileSync(
    new URL('./PocketBuddyForge.tsx', import.meta.url),
    'utf8',
  );
  const css = readFileSync(
    new URL('./PocketBuddyForge.css', import.meta.url),
    'utf8',
  );

  it('沿用 Agent 世界的老师、版本、状态、熟练度、置信度和证据字段', () => {
    expect(source).toContain('SKILL PROVENANCE');
    expect(source).toContain('binding.learnedFromBuddyId');
    expect(source).toContain('binding.skillVersion');
    expect(source).toContain('binding.state');
    expect(source).toContain('binding.proficiency');
    expect(source).toContain('binding.confidence');
    expect(source).toContain('binding.evidenceRefs.length');
  });

  it('真实 Agent 没有跨 Agent 学习时显示诚实空状态', () => {
    expect(source).toContain('还没有跨 Agent 学习记录');
    expect(source).toContain('Pocket Buddy · 本机 Plaza');
    expect(css).toContain('.pbf-agent-skill-history');
    expect(css).toContain('.pbf-agent-skill-empty');
  });

  it('使用 Skill 摘要并移除近期事件区', () => {
    expect(source).toContain('SKILL DIGEST');
    expect(source).toContain('Skill 摘要');
    expect(source).not.toContain('LONG-TERM DIGEST');
    expect(source).not.toContain('长期记忆摘要');
    expect(source).not.toContain('EVENT MEMORY');
    expect(source).not.toContain('近期事件');
    expect(css).toContain('.pbf-agent-skill-digest');
    expect(css).not.toContain('.pbf-agent-recent-memories');
  });
});
