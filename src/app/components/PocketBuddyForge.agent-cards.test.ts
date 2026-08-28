import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getPocketBuddySkill } from '../lib/pocket-buddy';
import { MY_AGENT_CARDS } from './PocketBuddyForge';

describe('MY AGENT city deck', () => {
  it('uses the four Agent World identities with distinct Shangjiequ scenes', () => {
    expect(MY_AGENT_CARDS.map(({ blueprint }) => blueprint.id)).toEqual([
      'pet-caramel-dachshund',
      'puff',
      'pip',
      'mossback',
    ]);
    expect(new Set(MY_AGENT_CARDS.map(({ scene }) => scene)).size).toBe(4);
    expect(new Set(MY_AGENT_CARDS.map(({ sceneVariant }) => sceneVariant)).size).toBe(4);
  });

  it('ships validated character cutouts and complete persona details for every card', () => {
    expect(MY_AGENT_CARDS[0].blueprint.assetUrl).toBe(
      '/assets/pocket-buddy/packages/holiday-christmas-dachshund/portrait-frost-no-hat-v2.png',
    );

    for (const card of MY_AGENT_CARDS) {
      const assetUrl = card.blueprint.assetUrl ?? '';
      if (card.blueprint.id === 'pet-caramel-dachshund') {
        expect(assetUrl).toContain('/assets/pocket-buddy/packages/holiday-christmas-dachshund/');
      } else {
        expect(assetUrl).toContain('/assets/pocket-buddy/agent-world-original-v2/');
      }
      expect(existsSync(join(process.cwd(), 'public', assetUrl))).toBe(true);
      expect(card.blueprint.persona.personality).toBeTruthy();
      expect(card.blueprint.persona.ability).toBeTruthy();
      expect(card.blueprint.persona.fear).toBeTruthy();
      expect(card.skillLearningRecords).toHaveLength(2);
      for (const record of card.skillLearningRecords) {
        expect(getPocketBuddySkill(record.skillId)?.version).toBe(record.skillVersion);
        expect(record.learnedFrom).toBeTruthy();
        expect(record.venue).toContain('Agent World');
        expect(record.proficiency).toBeGreaterThan(0);
        expect(record.confidence).toBeGreaterThan(0);
        expect(record.evidence).toBeTruthy();
      }
    }
  });
});
