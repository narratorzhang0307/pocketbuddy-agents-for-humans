import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FROST_AVATAR } from '../lib/skill/avatars';

describe('Frost 自由对话页', () => {
  const source = readFileSync(new URL('./FrostBuddyPage.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('./FrostBuddyPage.css', import.meta.url), 'utf8');

  it('身份卡使用新生成的焦糖腊肠犬头像，同时保留主 Agent 身份', () => {
    const portrait = new URL(
      `../../../public${FROST_AVATAR.src}`,
      import.meta.url,
    );
    expect(existsSync(portrait)).toBe(true);
    expect(source).toContain(
      'const FROST_DACHSHUND_AVATAR = FROST_AVATAR.src',
    );
    expect(source).not.toContain('portrait-agent-world-v2.png');
    expect(source).toContain('aria-label="Frost 腊肠犬头像"');
    expect(source).not.toContain("from './FrostPersona'");
  });

  it('头像框保留描边但不叠加阴影', () => {
    expect(styles).toMatch(/\.frost-encounter__portrait\s*\{[\s\S]*?width:\s*104px;[\s\S]*?height:\s*104px;[\s\S]*?border:\s*3px solid #0b0d0b;[\s\S]*?box-shadow:\s*none;/);
    expect(styles).toMatch(/\.frost-encounter__portrait img\s*\{[\s\S]*?filter:\s*none;/);
    expect(source).not.toContain('shadow-[4px_4px_0_#000]');
  });

  it('对话主区使用浅色纸张底，不再铺大面积黑色', () => {
    expect(styles).toContain('--frost-paper: #f6f1e6;');
    expect(styles).toMatch(/\.frost-encounter__dialogue-column\s*\{[\s\S]*?var\(--frost-paper\)/);
    expect(styles).not.toContain('background: #050605;');
  });

  it('文字输入保持至少 16px，避免 iPhone 聚焦时放大整个页面', () => {
    expect(source).toContain('className="frost-buddy-page ');
    expect(styles).toMatch(/\.frost-encounter__composer input\s*\{[^}]*font:\s*700 16px\/1 monospace;/);
    expect(styles).toMatch(/\.frost-buddy-page :is\(input:not\(\[type="checkbox"\]\):not\(\[type="range"\]\), textarea, select\)\s*\{[^}]*font-size:\s*max\(16px, 1rem\);/);
    const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
    expect(html).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:[.,"\s]|$)/);
  });

  it('移植怪物对话框的身份卡、对话记录和自由输入结构', () => {
    expect(source).toContain('className="frost-encounter__identity"');
    expect(source).toContain('className="frost-encounter__transcript"');
    expect(source).toContain('className="frost-encounter__composer"');
    expect(styles).toContain('grid-template-columns: 126px minmax(0, 1fr);');
  });

  it('保留指定开场白，不带入选项、骰子和对话树', () => {
    expect(source).toContain('我是 Frost。你说目标，我会先在已装备的 Skills 里选择能力、列出计划和权限，再把任务交到正确入口；没有把握时，我不会擅自执行。');
    expect(source).not.toContain('buddy-encounter__choices');
    expect(source).not.toContain('prepareCheck');
    expect(source).not.toContain('rollCheck');
    expect(source).not.toContain('2D6');
  });
});
