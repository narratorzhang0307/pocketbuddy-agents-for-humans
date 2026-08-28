import { describe, expect, it } from 'vitest';
import { expertForSkill } from './expertRouter';

describe('Frost deterministic health-expert delegation', () => {
  it.each([
    ['frost.running-coach', 'puff'],
    ['frost.run-route', 'puff'],
    ['frost.healthsync', 'puff'],
    ['frost.openfoodfacts', 'pip'],
    ['frost.cn-health-library', 'pip'],
    ['frost.sleep-detective', 'pip'],
    ['pocket.her-motion', 'mossback'],
    ['pocket.lianlema', 'mossback'],
    ['frost.mediapipe-motion', 'mossback'],
    ['frost.wger-planner', 'mossback'],
  ])('delegates %s to %s', (skillId, expertId) => {
    expect(expertForSkill(skillId).id).toBe(expertId);
  });

  it('keeps unknown work with the Frost master agent', () => {
    expect(expertForSkill('third-party.unknown')).toMatchObject({ id: 'frost', role: 'Frost 主 Agent' });
  });
});
