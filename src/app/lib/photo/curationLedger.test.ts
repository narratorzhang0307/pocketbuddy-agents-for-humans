import { describe, expect, it } from 'vitest';
import {
  createPhotoCurationEvent,
  publicationOverrides,
  summarizePhotoCurationEvents,
} from './curationLedger';

describe('photo curation event ledger', () => {
  it('stores only stable asset ids and derived score evidence', () => {
    const event = createPhotoCurationEvent({
      id: 'event-1', now: 1, action: 'publish', assetKeys: ['asset-a'], surface: 'chronicle',
      analyses: [{
        key: 'asset-a', assetId: 'asset-a', contentHash: 'hash', photoType: 'life', technicalQuality: 82,
        universalAesthetic: 74, aestheticSource: 'qwen3-vl-2b-base', preferenceConfidence: 0,
        confidence: 0.8, verdict: 'keep', pinnable: false, needPlace: false, tags: [], reasons: [],
        visionBackend: 'qwen3-vl-mnn', analyzedAt: 1,
      }],
    });
    expect(event).toMatchObject({ id: 'event-1', assetKeys: ['asset-a'], action: 'publish' });
    expect(event.scores[0]).toMatchObject({ technicalQuality: 82, universalAesthetic: 74 });
    expect(JSON.stringify(event)).not.toContain('thumbnail');
  });

  it('derives publication state from the last immutable action', () => {
    const publish = createPhotoCurationEvent({ id: 'a', now: 1, action: 'publish', assetKeys: ['one'], surface: 'chronicle' });
    const keepBoth = createPhotoCurationEvent({ id: 'b', now: 2, action: 'keep-both', assetKeys: ['two', 'three'], surface: 'decision-group' });
    const unpublish = createPhotoCurationEvent({ id: 'c', now: 3, action: 'unpublish', assetKeys: ['one', 'two'], surface: 'chronicle' });
    const state = publicationOverrides([publish, keepBoth, unpublish]);
    expect([...state.entries()]).toEqual([['one', false], ['two', false], ['three', true]]);
    expect([...summarizePhotoCurationEvents([publish, keepBoth, unpublish]).publishedKeys]).toEqual(['three']);
  });

  it('keeps preference history replayable across reset and later choices', () => {
    const prefer = (id: string, now: number) => createPhotoCurationEvent({ id, now, action: 'prefer', assetKeys: ['a', 'b'], winnerKey: 'a', loserKey: 'b', surface: 'cold-start' });
    const reset = createPhotoCurationEvent({ id: 'reset', now: 3, action: 'preference-reset', assetKeys: [], surface: 'system' });
    const undo = createPhotoCurationEvent({ id: 'undo', now: 5, action: 'preference-undo', assetKeys: [], surface: 'system' });
    expect(summarizePhotoCurationEvents([prefer('1', 1), prefer('2', 2), reset, prefer('4', 4), undo]).preferenceChoices).toBe(0);
  });

  it('records magazine to earth synchronization separately from publication', () => {
    const published = createPhotoCurationEvent({ id: 'published', now: 1, action: 'publish', assetKeys: ['a', 'b'], surface: 'chronicle' });
    const synced = createPhotoCurationEvent({ id: 'synced', now: 2, action: 'sync-earth', assetKeys: ['a'], surface: 'earth' });
    const summary = summarizePhotoCurationEvents([published, synced]);
    expect([...summary.publishedKeys]).toEqual(['a', 'b']);
    expect([...summary.earthSyncedKeys]).toEqual(['a']);
  });
});
