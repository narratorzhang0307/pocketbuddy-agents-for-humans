import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelCoachProvider } from '../../../../lianlema-portable/app_project/app/src/analysis/ModelCoachProvider';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
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

  it('allows a slow mobile frame response beyond the old 12-second deadline', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ session_id: 'sid', session_token: 'token' }))
      .mockImplementationOnce((_url, init) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(Response.json({ rep_count: 1, visible_keypoints: 17, inference_ms: 320, status_color: 'good' })), 15000);
        init.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Fetch is aborted', 'AbortError')); });
      }));
    vi.stubGlobal('fetch', fetch);
    const analyzing = new ModelCoachProvider('https://example.test').analyze({ exercise: 'squat', imageBase64: 'test' });
    const result = expect(analyzing).resolves.toMatchObject({ repCount: 1, visibleKeypoints: 17 });
    await Promise.all([result, vi.advanceTimersByTimeAsync(15000)]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports a bounded frame timeout in Chinese without replaying the frame', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ session_id: 'sid', session_token: 'token' }))
      .mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('Fetch is aborted', 'AbortError')));
      }));
    vi.stubGlobal('fetch', fetch);
    const analyzing = new ModelCoachProvider('https://example.test').analyze({ exercise: 'squat', imageBase64: 'test' });
    const failure = expect(analyzing).rejects.toThrow('画面上传或模型响应超过 45 秒');
    await Promise.all([failure, vi.advanceTimersByTimeAsync(45000)]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('identifies a session-start timeout separately from a frame timeout', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Fetch is aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fetch);
    const analyzing = new ModelCoachProvider('https://example.test').analyze({ exercise: 'squat', imageBase64: 'test' });
    const failure = expect(analyzing).rejects.toThrow('建立模型会话超过 45 秒');
    await Promise.all([failure, vi.advanceTimersByTimeAsync(45000)]);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('explains WebKit connection aborts and non-JSON gateway failures without fabricated results', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new DOMException('Fetch is aborted', 'AbortError'))
      .mockResolvedValueOnce(new Response('<html>Gateway Timeout</html>', { status: 504 }));
    vi.stubGlobal('fetch', fetch);
    await expect(new ModelCoachProvider('https://example.test').analyze({ exercise: 'squat', imageBase64: 'test' }))
      .rejects.toThrow('模型服务连接被中断');
    await expect(new ModelCoachProvider('https://example.test').analyze({ exercise: 'squat', imageBase64: 'test' }))
      .rejects.toThrow('模型服务 HTTP 504');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
