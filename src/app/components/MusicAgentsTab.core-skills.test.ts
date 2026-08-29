import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MusicAgentsTab from './MusicAgentsTab';
import { CORE_SKILL_TARGETS } from '../data/coreSkills';
import { resolveSkillRunTarget } from '../lib/plaza/skillRoutes';

describe('My Skills core capabilities', () => {
  it('puts running and bird listening first while keeping the existing movement skills core', () => {
    const html = renderToStaticMarkup(createElement(MusicAgentsTab, { embedded: true }));
    const coreStart = html.indexOf('<section aria-label="核心能力"');
    const moreStart = html.indexOf('<section aria-label="更多能力"');
    const core = html.slice(coreStart, moreStart);

    expect(coreStart).toBeGreaterThan(-1);
    expect(moreStart).toBeGreaterThan(coreStart);
    expect([...core.matchAll(/data-skill-id="([^"]+)"/g)].map((match) => match[1])).toEqual([
      'frost.run-route', 'frost.bird-listener', 'pocket.her-motion', 'pocket.lianlema',
    ]);
    expect(core.match(/>核心<\/span>/g)).toHaveLength(4);
    expect(core).toContain('4 CORE');
    expect(html.indexOf('SME2 加速对比')).toBeGreaterThan(moreStart);
    expect(html).not.toContain('FITNESS AGENT');
    expect(html.indexOf('健康咨询 Agent')).toBeGreaterThan(moreStart);
  });

  it('keeps every other catalogue skill in the lower section without duplication or core badges', () => {
    const html = renderToStaticMarkup(createElement(MusicAgentsTab, { embedded: true }));
    const more = html.slice(html.indexOf('<section aria-label="更多能力"'));
    const ids = [...more.matchAll(/data-skill-id="([^"]+)"/g)].map((match) => match[1]);

    expect(ids).toEqual([
      'frost.wger-planner', 'frost.mealie-kitchen',
      'frost.healthsync', 'frost.mediapipe-motion', 'frost.openfoodfacts',
      'frost.cn-health-library', 'frost.outdoor-window', 'frost.sleep-detective', 'frost.meal-lens',
    ]);
    expect(more).not.toContain('>核心</span>');
    expect(html.match(/data-skill-id=/g)).toHaveLength(13);
  });

  it('uses the same core selection for the header count and preserves all four launch routes', () => {
    expect(CORE_SKILL_TARGETS).toEqual(['frost-run-route', 'frost-bird-listener', 'her-motion', 'lianlema-coach']);
    expect(CORE_SKILL_TARGETS.map(resolveSkillRunTarget)).toEqual(['runroute', 'birdlistener', 'hermotion', 'lianlema']);
    const header = readFileSync(new URL('./PlazaTab.tsx', import.meta.url), 'utf8');
    expect(header).toContain('{CORE_SKILL_TARGETS.length} CORE');
    expect(header).not.toContain('VISIBLE_SKILL_COUNT');
  });
});
