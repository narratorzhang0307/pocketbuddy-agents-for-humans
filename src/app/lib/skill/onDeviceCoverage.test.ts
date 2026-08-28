import { describe, expect, it } from 'vitest';
import { BUILTIN_SKILLS } from './builtins';
import { ON_DEVICE_SKILL_COVERAGE } from './onDeviceCoverage';

const EXPECTED_HEALTH_SKILLS = BUILTIN_SKILLS.map((skill) => skill.identity.id).sort();

describe('Skills 端侧覆盖契约', () => {
  it('覆盖健康版 Skills 页的全部内置 Skill', () => {
    expect(ON_DEVICE_SKILL_COVERAGE.map((item) => item.manifestId).sort()).toEqual(EXPECTED_HEALTH_SKILLS);
    expect(new Set(ON_DEVICE_SKILL_COVERAGE.map((item) => item.manifestId)).size).toBe(EXPECTED_HEALTH_SKILLS.length);
  });

  it('每个 Skill 都声明可复查的本机能力和证据入口', () => {
    for (const item of ON_DEVICE_SKILL_COVERAGE) {
      expect(item.capabilities.length).toBeGreaterThan(0);
      expect(item.proof.trim().length).toBeGreaterThan(8);
      expect(item.deterministicTasks.length + item.semanticTasks.length).toBeGreaterThan(0);
      if (item.semanticTasks.length) expect(item.semanticRuntime).toBe('qwen3-4b-health-mnn');
      else expect(item.semanticRuntime).toBe('not-required');
    }
  });

  it('云端不属于健康 Skills 的默认手机语义运行时', () => {
    expect(ON_DEVICE_SKILL_COVERAGE.some((item) => String(item.semanticRuntime).includes('cloud'))).toBe(false);
  });
});
