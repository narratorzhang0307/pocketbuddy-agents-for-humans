import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseFrostVoiceAudio, requestFrostVoice } from './frostVoice';

const fixture = vi.hoisted(() => ({ native: false, post: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => fixture.native, getPlatform: () => 'android' }, CapacitorHttp: { post: fixture.post } }));
const payload = { format: 'pcm_s16le', sampleRate: 16000, channels: 1, audioBase64: 'AAAQAPD/' };
beforeEach(() => { vi.restoreAllMocks(); fixture.native = false; fixture.post.mockReset(); });

describe('Frost MiniMax client', () => {
  it('sends only the explicit short text and decodes reusable PCM', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(payload));
    const audio = await requestFrostVoice(' 你好。 ');
    expect(audio.pcm).toEqual(Uint8Array.of(0, 0, 16, 0, 240, 255));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('/api/frost-voice/tts');
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ text: '你好。' });
    expect(fetcher.mock.calls[0][1]!.headers).not.toHaveProperty('authorization');
  });
  it('uses native HTTP and only the separate access code on the phone', async () => {
    fixture.native = true; fixture.post.mockResolvedValue({ status: 200, data: payload });
    await requestFrostVoice('你好。', 'a'.repeat(40));
    expect(fixture.post).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://pocketearth.throughtheglass.art/api/frost-voice/tts', data: { text: '你好。' },
      headers: expect.objectContaining({ authorization: `Bearer ${'a'.repeat(40)}` }), disableRedirects: true,
    }));
  });
  it('prevents long prompts or accidentally pasted provider keys from leaving the app', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    await expect(requestFrostVoice('a'.repeat(101))).rejects.toThrow('1–100');
    await expect(requestFrostVoice('你好。', `sk-api-${'x'.repeat(40)}`)).rejects.toThrow('API Key');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('never retries a timeout and does not echo private upstream error text', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network detail'));
    await expect(requestFrostVoice('你好。')).rejects.toThrow('未自动重试');
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValue(Response.json({ error: 'secret-error-body' }, { status: 502 }));
    await expect(requestFrostVoice('你好。')).rejects.toThrow('HTTP 502');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects compressed audio, stereo, partial samples, and oversized output', () => {
    for (const value of [{ ...payload, format: 'mp3' }, { ...payload, channels: 2 },
      { ...payload, audioBase64: 'AA==' }, { ...payload, audioBase64: '!invalid' },
      { ...payload, audioBase64: 'AAAA'.repeat(320001) }]) expect(() => parseFrostVoiceAudio(value)).toThrow();
  });
});
