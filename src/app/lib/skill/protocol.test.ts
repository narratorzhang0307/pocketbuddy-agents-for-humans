import { beforeEach, describe, expect, it } from 'vitest';
import { resolveSkillRunTarget } from '../plaza/skillRoutes';
import { BUILTIN_SKILLS, DEFAULT_DISABLED_BUILTIN_SKILL_IDS, shouldAutoEquipBuiltin } from './builtins';
import { SkillProtocolError, validateSkillManifest } from './protocol';
import { disableSkill, ensureBuiltinSkills, equipSkill, getEquippedSkill, getInstalledSkill, installSkillManifest, listInstalledSkills, resetSkillRegistryForTests, rollbackSkill, uninstallSkill, uninstallSkillWithAssets } from './index';

describe('pocket-skill/v1', () => {
  beforeEach(() => resetSkillRegistryForTests());

  it('accepts all built-in Markdown/LoRA/hybrid manifests', () => {
    expect(BUILTIN_SKILLS.map(validateSkillManifest)).toHaveLength(BUILTIN_SKILLS.length);
  });

  it('publishes thirteen OSS-derived health skills behind deterministic gates', () => {
    const ids = [
      'frost.running-coach', 'frost.healthsync', 'frost.mediapipe-motion', 'frost.endurance-guard',
      'frost.openfoodfacts', 'frost.garmin-readonly', 'frost.cn-health-library',
      'frost.outdoor-window', 'frost.strava-replay', 'frost.sleep-detective',
      'frost.meal-lens',
      'frost.wger-planner', 'frost.mealie-kitchen',
    ];
    const healthSkills = ids.map((id) => BUILTIN_SKILLS.find((item) => item.identity.id === id));
    expect(healthSkills.every(Boolean)).toBe(true);
    expect(healthSkills.every((item) => item?.runtime.execution === 'declarative')).toBe(true);
    expect(healthSkills.every((item) => item?.data.schemas.includes('frost-qwen-control/v1'))).toBe(true);
    expect(healthSkills.every((item) => item?.provenance.source.includes('https://github.com/'))).toBe(true);
    expect(BUILTIN_SKILLS.find((item) => item.identity.id === 'frost.garmin-readonly')?.quality_gate.checks.join(' ')).toContain('delete');
  });

  it('publishes sport, health, nutrition and the explicit bird-listening extension', () => {
    expect(BUILTIN_SKILLS.map((item) => item.identity.id)).toEqual([
      'pocket.her-motion',
      'pocket.lianlema',
      'frost.run-route',
      'frost.running-coach',
      'frost.healthsync',
      'frost.mediapipe-motion',
      'frost.endurance-guard',
      'frost.openfoodfacts',
      'frost.garmin-readonly',
      'frost.cn-health-library',
      'frost.outdoor-window',
      'frost.strava-replay',
      'frost.sleep-detective',
      'frost.meal-lens',
      'frost.wger-planner',
      'frost.mealie-kitchen',
      'frost.bird-listener',
      'frost.health-consultation',
    ]);
    expect(JSON.stringify(BUILTIN_SKILLS)).not.toMatch(/pocket\.(?:books|movies|music|travel|reading-jot|exhibition)/);
  });

  it('registers the local Lianlema coach as a camera-scoped runnable Skill', () => {
    const lianlema = BUILTIN_SKILLS.find((item) => item.identity.id === 'pocket.lianlema');
    expect(lianlema).toMatchObject({
      entry: { target: 'lianlema-coach' },
      runtime: { execution: 'declarative', platforms: ['web'] },
      permissions: { tools: ['pose'] },
    });
    expect(lianlema?.permissions.scopes).toEqual(expect.arrayContaining(['camera', 'audio', 'network']));
    expect(lianlema?.quality_gate.checks.join(' ')).toContain('仅在用户同意后发往 Pocket Buddy 模型服务，不保存画面');
    expect(lianlema?.permissions.network_hosts).toEqual(['localhost', 'pocketbuddy.throughtheglass.art']);
    expect(resolveSkillRunTarget(lianlema?.entry.target || '')).toBe('lianlema');
  });

  it('rejects unknown fields, incompatible bases and undeclared network', () => {
    const base = structuredClone(BUILTIN_SKILLS[0]) as any;
    base.debug = true;
    expect(() => validateSkillManifest(base)).toThrow(SkillProtocolError);

    const lora = structuredClone(BUILTIN_SKILLS[0]) as any;
    lora.kind = 'lora';
    lora.runtime.execution = 'mnn';
    lora.entry.adapter = 'test-adapter';
    expect(() => validateSkillManifest(lora)).toThrow(/基座/);

    const network = structuredClone(BUILTIN_SKILLS[0]) as any;
    network.permissions.network_hosts = ['example.com'];
    expect(() => validateSkillManifest(network)).toThrow(/network scope/);
  });

  it('installs, equips, disables, upgrades, rolls back and uninstalls', () => {
    const v1 = installSkillManifest(BUILTIN_SKILLS[0]);
    equipSkill(v1.key);
    expect(getEquippedSkill(v1.manifest.identity.id)?.key).toBe(v1.key);
    disableSkill(v1.manifest.identity.id);
    expect(getEquippedSkill(v1.manifest.identity.id)).toBeUndefined();

    equipSkill(v1.key);
    const v2Manifest = structuredClone(BUILTIN_SKILLS[0]);
    v2Manifest.identity.version = '1.1.0';
    const v2 = installSkillManifest(v2Manifest);
    equipSkill(v2.key);
    expect(getEquippedSkill(v1.manifest.identity.id)?.key).toBe(v2.key);
    expect(rollbackSkill(v1.manifest.identity.id).key).toBe(v1.key);
    uninstallSkill(v2.key);
    expect(listInstalledSkills().some((item) => item.key === v2.key)).toBe(false);
  });

  it('bootstraps each built-in exactly once', () => {
    ensureBuiltinSkills();
    ensureBuiltinSkills();
    expect(listInstalledSkills()).toHaveLength(BUILTIN_SKILLS.length);
    expect(BUILTIN_SKILLS.filter(shouldAutoEquipBuiltin).every((item) => getEquippedSkill(item.identity.id))).toBe(true);
    expect(BUILTIN_SKILLS.filter((item) => !shouldAutoEquipBuiltin(item)).every((item) => !getEquippedSkill(item.identity.id))).toBe(true);
    expect([...DEFAULT_DISABLED_BUILTIN_SKILL_IDS].every((id) => !getEquippedSkill(id))).toBe(true);
  });

  it('migrates connector-only built-ins out of the active Taskmaster catalog', () => {
    const healthsync = BUILTIN_SKILLS.find((item) => item.identity.id === 'frost.healthsync')!;
    const installed = installSkillManifest(healthsync, 'builtin');
    equipSkill(installed.key);
    ensureBuiltinSkills();
    expect(getEquippedSkill(healthsync.identity.id)).toBeUndefined();
    expect(getInstalledSkill(installed.key)?.status).toBe('disabled');
  });

  it('removes a retired built-in without hard-coding its identity', () => {
    const retired = structuredClone(BUILTIN_SKILLS[0]);
    retired.identity.id = 'frost.retired-demo';
    retired.identity.version = '0.9.0';
    installSkillManifest(retired, 'builtin');
    ensureBuiltinSkills();
    expect(listInstalledSkills().some((item) => item.manifest.identity.id === 'frost.retired-demo')).toBe(false);
  });

  it('keeps an unloaded health built-in visible as pending and does not silently reload it', async () => {
    ensureBuiltinSkills();
    await uninstallSkillWithAssets('pocket.her-motion@1.0.0');
    ensureBuiltinSkills();
    expect(getInstalledSkill('pocket.her-motion@1.0.0')).toMatchObject({ status: 'disabled' });
    expect(getEquippedSkill('pocket.her-motion')).toBeUndefined();
  });
});
