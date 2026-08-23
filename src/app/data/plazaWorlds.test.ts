import { describe, expect, it } from 'vitest';
import { BUILTIN_SKILLS } from '../lib/skill';
import { resolveSkillRunTarget } from '../lib/plaza/skillRoutes';
import { PLAZA_SKILL_IDS, PLAZA_WORLDS } from './plazaWorlds';

describe('Plaza world registry', () => {
  it('keeps only the health-focused demo worlds', () => {
    expect(PLAZA_WORLDS.map((world) => world.id)).toEqual(['w_run_route', 'w_hermotion', 'w_tongue']);
    expect(new Set(PLAZA_WORLDS.map((world) => world.id)).size).toBe(PLAZA_WORLDS.length);
  });

  it('only publishes skills that exist in the private Skills runtime', () => {
    const builtinIds = new Set(BUILTIN_SKILLS.map((skill) => skill.identity.id));
    const missing = PLAZA_SKILL_IDS.filter((skillId) => !builtinIds.has(skillId));

    expect(missing).toEqual([]);
  });

  it('routes every published skill into a real private run page', () => {
    const manifests = new Map(BUILTIN_SKILLS.map((skill) => [skill.identity.id, skill]));
    const unroutable = PLAZA_SKILL_IDS.flatMap((skillId) => {
      const manifest = manifests.get(skillId);
      if (!manifest) return [{ skillId, target: 'missing-manifest' }];
      return resolveSkillRunTarget(manifest.entry.target)
        ? []
        : [{ skillId, target: manifest.entry.target }];
    });

    expect(unroutable).toEqual([]);
  });

  it('keeps the Plaza runtime on the approved health model contract', () => {
    const published = BUILTIN_SKILLS.filter((skill) => PLAZA_SKILL_IDS.includes(skill.identity.id));
    const serialized = JSON.stringify(published);
    const worldCopy = JSON.stringify(PLAZA_WORLDS);

    expect(serialized).not.toMatch(/Qwen3-VL-4B/i);
    expect(serialized).not.toMatch(/qwen3-4b-health-mnn/i);
    expect(serialized).toMatch(/frost-server-control\/v1/i);
    expect(worldCopy).not.toMatch(/Injective|wallet|blockchain|代币|区块链/i);
  });

  it('gives every world enough context and a real skill or experience route', () => {
    for (const world of PLAZA_WORLDS) {
      expect(world.landmarks.length).toBeGreaterThanOrEqual(3);
      expect(world.residents.length).toBeGreaterThanOrEqual(1);
      expect(world.skillIds.length > 0 || Boolean(world.launchUrl)).toBe(true);
    }
  });

  it('replaces the succulent demo with the tongue observation experience', () => {
    expect(PLAZA_WORLDS.some((world) => world.name === '多肉银行')).toBe(false);
    expect(PLAZA_WORLDS.find((world) => world.id === 'w_tongue')).toMatchObject({
      name: '舌苔观察站',
      launchUrl: '/tongue-observer/',
      skillIds: [],
    });
  });

  it('marks the integrated health experiences as core Skills', () => {
    expect(PLAZA_WORLDS.filter((world) => world.coreSkill).map((world) => world.id)).toEqual([
      'w_run_route',
      'w_hermotion',
      'w_tongue',
    ]);
    expect(PLAZA_WORLDS.filter((world) => world.coreSkill).every((world) => Boolean(world.launchUrl || world.entryTarget))).toBe(true);
  });

  it('does not expose culture, travel or entertainment worlds', () => {
    expect(JSON.stringify(PLAZA_WORLDS)).not.toMatch(/SignBridge|深夜电台|火山口食堂|玩具复活站|travel|music|movies/i);
  });
});
