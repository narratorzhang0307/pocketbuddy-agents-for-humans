import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import AgentWorldPocketBuddyPortrait from './AgentWorldPocketBuddyPortrait';
import PocketBuddyPortrait from './PocketBuddyPortrait';
import { AGENT_WORLD_POCKET_BUDDY_CATALOG } from '../lib/pocket-buddy/agentWorldCatalog';
import type { PocketBuddy } from '../lib/pocket-buddy';
import { StreetPolaroid } from '../../../vendor/legacy-city/src/app/components/OutingPolaroidCamera';

describe('character images never invent replacements', () => {
  it.each(['mug', 'camera', 'plush', 'book', 'lamp', 'headphones', 'rabbit', 'cat', 'dachshund'] as const)(
    'missing %s image stays empty without vector characters', (icon) => {
      const blueprint = { ...AGENT_WORLD_POCKET_BUDDY_CATALOG[0], icon, assetUrl: undefined };
      expect(renderToStaticMarkup(React.createElement(AgentWorldPocketBuddyPortrait, { blueprint }))).toBe('');
    },
  );
  it.each(AGENT_WORLD_POCKET_BUDDY_CATALOG)('preserves the selected $name image', (blueprint) => {
    const html = renderToStaticMarkup(React.createElement(AgentWorldPocketBuddyPortrait, { blueprint }));
    expect(html).toContain(blueprint.assetUrl);
    expect(html).not.toContain('<svg');
  });
  it('does not turn an absent custom portrait into a letter badge', () => {
    const buddy = { name: 'My pet', visual: { thumbnailUrl: '' } } as PocketBuddy;
    expect(renderToStaticMarkup(React.createElement(PocketBuddyPortrait, { buddy }))).toBe('');
  });
  it('leaves missing people and pets out of a polaroid instead of drawing name badges', () => {
    const html = renderToStaticMarkup(React.createElement(StreetPolaroid, {
      scene: {
        city: '杭州', place: '测试地点', position: [120, 30],
        guide: { id: 'guide', name: 'Missing guide', kind: 'guide' },
        companions: [{ id: 'cat', name: 'Missing cat', kind: 'walking-companion' }],
        pocketBuddies: [{ id: 'buddy', name: 'Missing buddy', kind: 'pocket-buddy' }],
        nearbyPlant: null,
      },
    }));
    expect(html).not.toContain('Missing');
    expect(html).not.toContain('opc-photo-subject--');
  });
  it('removes the outing and polaroid missing-image substitute branches', () => {
    const garden = readFileSync(new URL('../../../vendor/legacy-city/src/app/components/StreetGardenLab.tsx', import.meta.url), 'utf8');
    const camera = readFileSync(new URL('../../../vendor/legacy-city/src/app/components/OutingPolaroidCamera.tsx', import.meta.url), 'utf8');
    expect(garden).not.toMatch(/(?:candidate\.label|pet\.name)\.slice\(0, 1\)/);
    expect(camera).not.toContain('subject.name.slice(0, 1)');
    expect(camera).toContain('failedUrl === subject.imageUrl');
    expect(garden.match(/event\.currentTarget\.style\.visibility = "hidden"/g)).toHaveLength(4);
  });
  it('contains no remaining vector or letter-placeholder implementation', () => {
    const catalog = readFileSync(new URL('./AgentWorldPocketBuddyPortrait.tsx', import.meta.url), 'utf8');
    const portrait = readFileSync(new URL('./PocketBuddyPortrait.tsx', import.meta.url), 'utf8');
    expect(catalog).not.toMatch(/<svg|function (?:Mug|Plush|Curio|Camera)Agent/);
    expect(portrait).not.toContain('pbf-portrait-fallback');
    expect(portrait).not.toContain('name.slice(0, 1)');
    expect(catalog).toContain('failedUrl === sourceAssetUrl');
    expect(portrait).toContain('url !== failedUrl');
  });
});
