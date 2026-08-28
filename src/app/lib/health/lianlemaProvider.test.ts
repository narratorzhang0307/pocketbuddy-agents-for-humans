import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelCoachProvider } from '../../../../lianlema-portable/app_project/app/src/analysis/ModelCoachProvider';

afterEach(() => vi.unstubAllGlobals());
describe('hosted coach protocol', () => {
  it('uses the private session token for frames and stop, and preserves real inference evidence', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ session_id: 'sid', session_token: 'private-token' }))
      .mockResolvedValueOnce(Response.json({ rep_count: 2, status_color: 'good', visible_keypoints: 17, inference_ms: 350 }))
      .mockResolvedValueOnce(Response.json({ summary: { rep_count: 2 } }));
    vi.stubGlobal('fetch', fetch);
    const provider = new ModelCoachProvider('https://pocketbuddy.throughtheglass.art/lianlema');
    expect(await provider.analyze({ exercise: 'squat', imageBase64: 'test' }))
      .toMatchObject({ repCount: 2, isStandard: true, visibleKeypoints: 17, inferenceMs: 350 });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ exercise: 'squats', mode: 'manual', consent: true });
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer private-token');
    expect(await provider.stop()).toEqual({ rep_count: 2 });
    expect(fetch.mock.calls[2][1].headers.Authorization).toBe('Bearer private-token');
  });

  it('does not claim a person or a completed action from a no-person response', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ session_id: 'sid', session_token: 'token' }))
      .mockResolvedValueOnce(Response.json({ rep_count: 0, status_color: 'warn', errors: [{ code: 'no_person', severity: 1 }], visible_keypoints: 0 })));
    const result = await new ModelCoachProvider('https://example.test').analyze({ exercise: 'squat', imageBase64: 'test' });
    expect(result).toMatchObject({ isStandard: false, status: 'inconclusive', repCount: 0, visibleKeypoints: 0 });
  });

  it('surfaces model failures instead of returning invented results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: '服务繁忙' }, { status: 503 })));
    await expect(new ModelCoachProvider('https://example.test').analyze({ exercise: 'squat', imageBase64: 'test' })).rejects.toThrow('服务繁忙');
  });

  it('aborts a pending start when leaving, so it cannot start uploading later', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url, init) => {
      signal = init.signal;
      return new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(new Error('aborted'))));
    }));
    const provider = new ModelCoachProvider('https://example.test');
    const analyzing = provider.analyze({ exercise: 'squat', imageBase64: 'test' });
    const rejection = expect(analyzing).rejects.toThrow('aborted');
    await provider.stop();
    expect(signal?.aborted).toBe(true);
    await rejection;
  });
});
