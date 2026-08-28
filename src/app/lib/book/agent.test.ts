import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sense: vi.fn(), matchInCatalog: vi.fn(), enrichTags: vi.fn(), geoResolve: vi.fn(), organizeTagsOnDevice: vi.fn(),
  applyCritic: vi.fn(), applyUserFix: vi.fn(), mergeKnown: vi.fn(), getKnownBook: vi.fn(),
}));

vi.mock('./sense', () => ({ sense: mocks.sense }));
vi.mock('./catalog', () => ({ matchInCatalog: mocks.matchInCatalog }));
vi.mock('./tagging', () => ({ enrichTags: mocks.enrichTags, geoResolve: mocks.geoResolve, organizeTagsOnDevice: mocks.organizeTagsOnDevice }));
vi.mock('./critic', () => ({ applyCritic: mocks.applyCritic, applyUserFix: mocks.applyUserFix, mergeKnown: mocks.mergeKnown }));
vi.mock('./store', () => ({ getKnownBook: mocks.getKnownBook }));

import { enhanceBookDraftCloud, runBookAgent } from './agent';
import type { BookDraft } from './types';

describe('books edge/cloud boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.matchInCatalog.mockReturnValue(null);
    mocks.getKnownBook.mockResolvedValue(null);
    mocks.mergeKnown.mockReturnValue(false);
    mocks.organizeTagsOnDevice.mockResolvedValue({ ok: false, raw: {} });
    mocks.geoResolve.mockResolvedValue(null);
  });

  it('does not call cloud research during the default marking flow', async () => {
    mocks.sense.mockResolvedValue({
      title: '夜航西飞', author: '柏瑞尔·马卡姆', translator: '', publisher: '', visibleTags: [],
      rawVisibleText: '夜航西飞 柏瑞尔·马卡姆', ocrUsed: true, from: 'edge-vision',
    });
    const draft = await runBookAgent({ kind: 'image', imageDataUrl: 'data:image/jpeg;base64,AA==' });
    expect(mocks.enrichTags).not.toHaveBeenCalled();
    expect(draft?.evidence).toMatchObject({ onDevice: true, recognition: 'pp-ocr-v6+qwen-vl-2b-mnn' });
    expect(draft?.needsConfirm).toBe(true);
  });

  it('requires explicit consent and merges cloud fields without overwriting visible author evidence', async () => {
    const draft: BookDraft = {
      id: 'bk:test', title: '夜航西飞', year: null, country: '',
      tags: { author: '柏瑞尔·马卡姆', translator: '', genre: '', movement: '', plot: '', userRating: 0 },
      geo: null, needPlace: true, source: 'edge', confidence: 0.62, needsConfirm: true, reason: '端侧草稿', date: '2026-08-13',
      evidence: { onDevice: true, recognition: 'pp-ocr-v6+qwen-vl-2b-mnn', rawVisibleText: '夜航西飞 柏瑞尔·马卡姆' },
    };
    const declined = await enhanceBookDraftCloud(draft, { consent: false });
    expect(declined.evidence.cloudSearched).toBeUndefined();
    expect(mocks.enrichTags).not.toHaveBeenCalled();

    mocks.enrichTags.mockResolvedValue({
      ok: true, model: 'qwen3.7-plus',
      raw: { author: '错误覆盖作者', translator: '陶立夏', genre: '回忆录', movement: '', plot: '飞行与非洲生活回忆', country: '英国', year: 1942, storyPlace: '内罗毕', authorPlace: '' },
    });
    mocks.geoResolve.mockResolvedValue({ kind: 'story', place: '内罗毕', lng: 36.82, lat: -1.29, confidence: 0.82 });
    const enhanced = await enhanceBookDraftCloud(draft, { consent: true });
    expect(enhanced.tags.author).toBe('柏瑞尔·马卡姆');
    expect(enhanced.tags.genre).toBe('回忆录');
    expect(enhanced.evidence).toMatchObject({ cloudSearched: true, cloudModel: 'qwen3.7-plus' });
    expect(enhanced.needsConfirm).toBe(true);
  });
});
