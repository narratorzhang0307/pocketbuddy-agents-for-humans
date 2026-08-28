import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ runEdgeChatEvidence: vi.fn(), runEdgeVisionEvidence: vi.fn(), resolvePlace: vi.fn() }));
vi.mock('../../../../frost-agent/edge/httpEdge', () => ({ runEdgeChatEvidence: mocks.runEdgeChatEvidence, runEdgeVisionEvidence: mocks.runEdgeVisionEvidence }));
vi.mock('./resolvePlace', () => ({ resolvePlace: mocks.resolvePlace }));

import { decideTextPlacementOnDevice, parsePlacementSuggestion } from './suggestMapPlacement';

const roles = [{ value: 'story', label: '故事地' }, { value: 'author', label: '作者地' }];

describe('parsePlacementSuggestion', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts a grounded allowed suggestion', () => {
    expect(parsePlacementSuggestion('{"place":"杭州","role":"story","confidence":0.82,"evidence":"原文出现西湖"}', roles)).toEqual({
      place: '杭州', role: 'story', confidence: 0.82, evidence: '原文出现西湖', source: 'edge-qwen',
    });
  });

  it('rejects empty, low-confidence or unsupported-role guesses', () => {
    expect(parsePlacementSuggestion('{"place":"杭州","role":"story","confidence":0.2,"evidence":"猜测"}', roles)).toBeNull();
    expect(parsePlacementSuggestion('{"place":"杭州","role":"capture","confidence":0.9,"evidence":"路牌"}', roles)).toBeNull();
    expect(parsePlacementSuggestion('{"place":"","role":"story","confidence":0.9,"evidence":""}', roles)).toBeNull();
  });

  it('lets edge Qwen decide semantics while deterministic geocoding supplies coordinates', async () => {
    mocks.runEdgeChatEvidence.mockResolvedValue({
      backend: 'mnn', model: 'Qwen3-VL-2B-Instruct',
      text: '{"place":"杭州","role":"story","confidence":0.86,"evidence":"内容明确出现西湖"}',
    });
    mocks.resolvePlace.mockResolvedValue({ place: '杭州', lng: 120.1551, lat: 30.2741, source: 'local' });

    await expect(decideTextPlacementOnDevice({ domain: '书籍卡片', title: '测试', text: '西湖', roles })).resolves.toMatchObject({
      place: '杭州', role: 'story', confidence: 0.86,
      geo: { place: '杭州', lng: 120.1551, lat: 30.2741 },
    });
    expect(mocks.resolvePlace).toHaveBeenCalledWith('杭州');
  });
});
