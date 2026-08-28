import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('底部主导航', () => {
  const source = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');

  it('右侧入口显示 Agents，同时保留 skills 内部路由', () => {
    expect(source).toContain('>Agents</span>');
    expect(source).toContain("onClick={() => setActiveTab('skills')}");
    expect(source).not.toContain('>Skills</span>');
  });
});
