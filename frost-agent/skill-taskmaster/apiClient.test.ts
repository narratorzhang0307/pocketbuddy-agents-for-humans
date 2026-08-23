import { describe, expect, it, vi } from 'vitest';
import { createPocketBuddyApiClient } from './apiClient';

function hangingFetch(): typeof fetch {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    const abort = () => reject(signal?.reason || new DOMException('Aborted', 'AbortError'));
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  })) as unknown as typeof fetch;
}

describe('PocketBuddy API client deadlines', () => {
  it('turns a stalled backend request into a retryable timeout error', async () => {
    const api = createPocketBuddyApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: async () => 'token',
      fetchImpl: hangingFetch(),
      timeoutMs: 5,
    });

    await expect(api.generate({ prompt: 'hello' })).rejects.toMatchObject({
      name: 'SkillApiError', code: 'request_timeout', status: 408,
    });
  });

  it('keeps caller cancellation distinct from a service timeout', async () => {
    const controller = new AbortController();
    controller.abort();
    const api = createPocketBuddyApiClient({
      getIdToken: async () => 'token',
      fetchImpl: hangingFetch(),
      signal: controller.signal,
    });

    await expect(api.generate({ prompt: 'hello' })).rejects.toMatchObject({
      name: 'SkillApiError', code: 'request_cancelled', status: 499,
    });
  });
});
