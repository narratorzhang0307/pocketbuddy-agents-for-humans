import { describe, expect, it, vi } from 'vitest';
import { requestQwenText } from './qwenText';

describe('Qwen text transport', () => {
  it('sends the bounded task contract to the server proxy', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        prompt: '查《百年孤独》', system: '只给书目事实', json: true, task: 'research-book-metadata',
      });
      return new Response(JSON.stringify({ text: '{"title":"百年孤独"}', model: 'qwen3.7-plus' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    const result = await requestQwenText({
      prompt: '查《百年孤独》', system: '只给书目事实', json: true, task: 'research-book-metadata', fetcher,
    });
    expect(result).toMatchObject({ ok: true, text: '{"title":"百年孤独"}', model: 'qwen3.7-plus' });
  });

  it('fails closed on an empty successful response', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ text: '' }), { status: 200 })) as typeof fetch;
    await expect(requestQwenText({ prompt: 'x', fetcher })).resolves.toMatchObject({ ok: false, text: '', error: 'empty_text' });
  });
});
