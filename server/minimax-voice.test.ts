import { answerSpeechTicket } from './frost-voice-ticket.mjs';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFrostVoiceHandler, decodeMiniMaxPcm, synthesizeMiniMax, validateVoiceText } from './minimax-voice.mjs';

const env = { MINIMAX_API_KEY: 'minimax-fixture-not-real', FROST_VOICE_ACCESS_TOKEN: 'x'.repeat(40) };
const payload = () => ({
  base_resp: { status_code: 0 }, data: { status: 2, audio: '00001000f0ff' },
  extra_info: { audio_format: 'pcm', audio_sample_rate: 16000, audio_channel: 1 },
});
const mockProvider = () => vi.fn(async (_url: string, _options: RequestInit) => Response.json(payload()));
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.closeAllConnections(); server.close(() => resolve());
  })));
});
async function start(options: Record<string, unknown> = {}) {
  const fetcher = mockProvider();
  const handle = createFrostVoiceHandler({ env, localDev: true, fetcher, ...options });
  const server = createServer((req, res) => { void handle(req, res); }); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test server unavailable');
  const base = `http://127.0.0.1:${address.port}/api/frost-voice`;
  const post = (body: unknown = { text: '你好。' }, headers: Record<string, string> = {}) => fetch(`${base}/tts`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  return { base, post, fetcher };
}

describe('MiniMax voice provider (offline fixtures only)', () => {
  it('requests exactly one short PCM synthesis using the server key', async () => {
    const fetcher = mockProvider();
    const result = await synthesizeMiniMax('你好。', { env, fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.minimaxi.com/v1/t2a_v2');
    expect(options.headers).toMatchObject({ authorization: `Bearer ${env.MINIMAX_API_KEY}` });
    expect(JSON.parse(options.body as string)).toMatchObject({ text: '你好。', stream: false,
      audio_setting: { format: 'pcm', sample_rate: 16000, channel: 1 }, output_format: 'hex' });
    expect(result.pcm).toEqual(Buffer.from([0, 0, 16, 0, 240, 255]));
    expect(result.durationMs).toBe(6 / 32);
  });
  it('never retries a potentially billed timeout or a provider error', async () => {
    const fetcher = vi.fn().mockRejectedValue(new DOMException('sensitive upstream text', 'TimeoutError'));
    await expect(synthesizeMiniMax('你好。', { env, fetcher })).rejects.toThrow('minimax_timeout_no_retry');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const failing = vi.fn(async () => Response.json({ base_resp: { status_code: 1008, status_msg: 'private-provider-detail' } }));
    await expect(synthesizeMiniMax('你好。', { env, fetcher: failing })).rejects.toThrow('minimax_error_1008');
    expect(failing).toHaveBeenCalledTimes(1);
  });
  it('rejects missing credentials, long text, and credential redirection before any network call', async () => {
    const fetcher = mockProvider();
    await expect(synthesizeMiniMax('你好。', { env: {}, fetcher })).rejects.toThrow('key_not_configured');
    await expect(synthesizeMiniMax('a'.repeat(101), { env, fetcher })).rejects.toThrow('1_to_100');
    await expect(synthesizeMiniMax('你好。', { env: { ...env, MINIMAX_BASE_URL: 'https://other.invalid' }, fetcher })).rejects.toThrow('invalid_api_origin');
    expect(fetcher).not.toHaveBeenCalled();
    expect(validateVoiceText('🙂'.repeat(100))).toHaveLength(200);
  });
  it('rejects compressed, wrong-rate, incomplete, and oversized audio before playback', () => {
    for (const data of [
      { ...payload(), extra_info: { ...payload().extra_info, audio_format: 'mp3' } },
      { ...payload(), extra_info: { ...payload().extra_info, audio_sample_rate: 32000 } },
      { ...payload(), data: { status: 2, audio: '000' } },
      { ...payload(), data: { status: 1, audio: '0000' } },
      { ...payload(), data: { status: 2, audio: '00'.repeat(960002) } },
    ]) expect(() => decodeMiniMaxPcm(data)).toThrow();
  });
});

describe('Frost voice HTTP boundary (no paid network requests)', () => {
  it('keeps provider credentials private and ignores client model overrides', async () => {
    const { base, post, fetcher } = await start();
    const status = await fetch(`${base}/status`).then(r => r.json());
    expect(status).toMatchObject({ configured: true, asr: false });
    const result = await post({ text: '你好。', model: 'expensive-model', apiKey: 'client-key' });
    expect(result.status).toBe(200);
    const data = await result.json();
    expect(data.audioBase64).toBe('AAAQAPD/');
    expect(JSON.stringify(data)).not.toContain(env.MINIMAX_API_KEY);
    const options = fetcher.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(options.body as string).model).toBe('speech-2.8-turbo');
  });
  it('does not allow web origins or forwarded requests to use the local bypass', async () => {
    const { post, fetcher } = await start();
    expect((await post(undefined, { origin: 'https://other.invalid' })).status).toBe(403);
    expect((await post(undefined, { 'x-forwarded-for': '203.0.113.1' })).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('requires a separate access code in production, including byte-safe comparisons', async () => {
    const { post, fetcher } = await start({ localDev: false });
    expect((await post()).status).toBe(403);
    expect((await post(undefined, { authorization: `Bearer ${env.MINIMAX_API_KEY}` })).status).toBe(403);
    expect((await post(undefined, { authorization: `Bearer ${'é'.repeat(40)}` })).status).toBe(403);
    expect((await post(undefined, { authorization: `Bearer ${env.FROST_VOICE_ACCESS_TOKEN}` })).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid inputs and missing configuration without billing', async () => {
    const { post, fetcher } = await start();
    for (const body of [null, {}, { text: '' }, { text: 'a'.repeat(101) }]) expect((await post(body)).status).toBe(400);
    expect((await post({ text: 'a'.repeat(5000) })).status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
    const noKey = await start({ env: {} });
    expect((await noKey.post()).status).toBe(503);
    expect(noKey.fetcher).not.toHaveBeenCalled();
  });
  it('rejects concurrent syntheses and caps sequential calls at six per minute', async () => {
    let resolveResponse!: (response: Response) => void, entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const fetcher = vi.fn(() => { entered(); return new Promise<Response>(resolve => { resolveResponse = resolve; }); });
    const { post } = await start({ fetcher });
    const first = post(); await started;
    expect((await post()).status).toBe(429);
    resolveResponse(Response.json(payload())); expect((await first).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const sequential = await start();
    for (let i = 0; i < 6; i++) expect((await sequential.post()).status).toBe(200);
    expect((await sequential.post()).status).toBe(429);
    expect(sequential.fetcher).toHaveBeenCalledTimes(6);
  });
});


describe('server-issued short answer tickets', () => {
  it('binds one answer and reuses its audio without sharing a provider credential', async () => {
    const { post, fetcher } = await start({ localDev: false, env: { MINIMAX_API_KEY: env.MINIMAX_API_KEY } });
    const { speechTicket } = answerSpeechTicket('skill-answer:frost.outdoor-window:answer', JSON.stringify({ reply: '你好', speech: '你好。' }));
    const headers = { authorization: `Bearer ${speechTicket}` };
    expect((await post({ text: '改成另一个收费请求' }, headers)).status).toBe(403);
    const a = await post({ text: '你好。' }, headers); expect(a.status).toBe(200);
    const b = await post({ text: '你好。' }, headers); expect(b.status).toBe(200);
    expect(await a.json()).toEqual(await b.json()); expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await post(undefined, { authorization: `Bearer ${speechTicket}x` })).status).toBe(403);
  });
  it('does not retry a billed failure with the same ticket', async () => {
    const fetcher = vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    const { post } = await start({ localDev: false, fetcher });
    const { speechTicket } = answerSpeechTicket('skill-answer:frost.sleep-detective:answer', JSON.stringify({ reply: '你好', speech: '你好。' }));
    const headers = { authorization: `Bearer ${speechTicket}` };
    expect((await post(undefined, headers)).status).toBe(502);
    expect((await post(undefined, headers)).status).toBe(502);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects expired tickets and does not issue tickets for arbitrary existing chat routes', async () => {
    expect(answerSpeechTicket('subagent:test', JSON.stringify({ reply: 'a', speech: 'a' }))).toEqual({});
    const { speechTicket } = answerSpeechTicket('skill-answer:frost.sleep-detective:answer', JSON.stringify({ reply: '你好', speech: '你好。' }), Date.now() - 360000);
    const { post, fetcher } = await start({ localDev: false });
    expect((await post(undefined, { authorization: `Bearer ${speechTicket}` })).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
