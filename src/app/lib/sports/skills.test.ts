import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import SportsCoachSkillPage from '../../components/SportsCoachSkillPage';
import { ALLOWED_TARGETS } from '../../../../frost-agent/harness/skillForge';
import { SPORTS, sportForTarget } from './pose';
import { SPORTS_SKILLS } from '../skill/sportsBuiltins';
import { ensureBuiltinSkills, resetSkillRegistryForTests } from '../skill';
import { skillAvatarFor, skillAvatarForPage } from '../skill/avatars';
import { resolveSkillRunTarget } from '../plaza/skillRoutes';
import { skillPublisherForAgent } from '../../data/skillPublishers';
import { planFrostTask } from '../../../../frost-agent/harness/skillRouter';
import MusicAgentsTab from '../../components/MusicAgentsTab';

describe('sport skill identity and routing', () => {
  beforeEach(() => { resetSkillRegistryForTests(); ensureBuiltinSkills(); });

  it('offers five independent skill identities and the original 23 selected actions', () => {
    expect(SPORTS).toHaveLength(5);
    expect(SPORTS.map(s => s.actions.length)).toEqual([5, 5, 5, 4, 4]);
    expect(new Set(SPORTS_SKILLS.map(s => s.identity.id)).size).toBe(5);
    const html = renderToStaticMarkup(createElement(MusicAgentsTab, { embedded: true }));
    const section = html.slice(html.indexOf('<section aria-label="Sports coaching skills"'), html.indexOf('<section aria-label="More abilities"'));
    expect([...section.matchAll(/data-skill-id="([^"]+)"/g)].map(match => match[1])).toEqual(SPORTS.map(s => s.skillId));
    expect(section).not.toMatch(/[\u3400-\u9fff]/);
    for (const sport of SPORTS) {
      expect(ALLOWED_TARGETS[sport.target]).toContain(sport.skillName);
      expect(renderToStaticMarkup(createElement(SportsCoachSkillPage, { sport, onBack() {} }))).not.toMatch(/[\u3400-\u9fff]/);
      expect(section).toContain(sport.skillName);
      expect(section).toContain(sport.mascot);
      expect(section).toContain(sport.avatar);
      expect(resolveSkillRunTarget(sport.target)).toBe('sportscoach');
      expect(sportForTarget(sport.target)?.id).toBe(sport.id);
      expect(skillAvatarForPage('sportscoach', sport.target)).toEqual(skillAvatarFor(sport.skillId));
      expect(skillPublisherForAgent(sport.target)).toMatchObject({ name: sport.mascot, avatar: sport.avatar });
    }
  });

  it.each(SPORTS)('routes $name to its own skill when the request also mentions movement correction', async sport => {
    const { plan } = await planFrostTask({ now: new Date(), surface: 'frost', userText: `打开${sport.skillName}帮我纠正动作` });
    expect(plan?.steps.map(step => step.skillId)).toEqual([sport.skillId]);
  });

  it('bundles five different decodable portraits, with matching names and colors', async () => {
    const hashes = new Set<string>();
    for (const sport of SPORTS) {
      const avatar = skillAvatarFor(sport.skillId);
      expect(avatar).toMatchObject({ src: sport.avatar, name: sport.mascot, accent: sport.accent });
      const bytes = readFileSync(resolve('public', sport.avatar.slice(1)));
      const { info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
      expect(info.width).toBeGreaterThanOrEqual(512);
      expect(info.width).toBe(info.height);
      hashes.add(bytes.toString('base64'));
    }
    expect(hashes.size).toBe(5);
  });
});
