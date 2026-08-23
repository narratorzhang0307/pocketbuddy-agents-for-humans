import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpBrain } from './httpBrain';

afterEach(() => vi.unstubAllGlobals());

describe('Frost shared brain server contract', () => {
  it('uses the authenticated pocketbuddy-api LLM endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: '{"ok":true}' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { __POCKET_BUDDY_GET_ID_TOKEN__: async () => 'firebase-test-token' });

    await expect(httpBrain.complete('build a world', { json: true, task: 'agent-world-draft' })).resolves.toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledWith('/v1/llm/generate', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ authorization: 'Bearer firebase-test-token' }),
      body: JSON.stringify({ prompt: 'build a world', json: true, task: 'agent-world-draft' }),
    }));
  });

  it('returns an empty result so callers can apply deterministic fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'model_unavailable', message: 'provider offline' },
    }), { status: 503, headers: { 'content-type': 'application/json' } })));
    vi.stubGlobal('window', { __POCKET_BUDDY_GET_ID_TOKEN__: async () => 'firebase-test-token' });

    await expect(httpBrain.complete('fallback please')).resolves.toBe('');
  });
});
