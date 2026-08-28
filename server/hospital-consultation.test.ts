import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
// @ts-expect-error Server-only ESM module.
import { createHospitalConsultationHandler, HOSPITAL_GREETING } from './hospital-consultation.mjs';

const token = 'test-hospital-access-token-not-a-provider-key';
const env = { HOSPITAL_CHAT_ACCESS_TOKEN: token, DASHSCOPE_API_KEY: 'private-provider-key', QWEN_MODEL: 'configured-qwen' };
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => { s.closeAllConnections(); s.close(() => resolve()); }))); });
function answer(reply = '请问这种情况持续多久了？', finish = 'stop') {
  return new Response(JSON.stringify({ choices: [{ finish_reason: finish, message: { content: JSON.stringify({ reply }) } }] }));
}
async function setup(fetchImpl = vi.fn(async () => answer()), options: Record<string, unknown> = {}) {
  const handler = createHospitalConsultationHandler({ env, fetchImpl, skills: [], ...options });
  const server = createServer(async (req, res) => { if (!await handler(req, res)) { res.statusCode = 404; res.end(); } });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  const call = async (body?: unknown, auth = token) => {
    const res = await fetch(`http://127.0.0.1:${addr.port}/api/hospital-agent/consultation`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') };
  };
  return { call, fetchImpl };
}
const start = () => ({ action: 'start', sessionId: randomUUID(), inputId: randomUUID() });

describe('Qwen hospital voice trial', () => {
  it('requires a dedicated token and never sends provider keys to callers', async () => {
    const { call, fetchImpl } = await setup();
    expect((await call(undefined, '')).status).toBe(403);
    expect((await call(undefined, env.DASHSCOPE_API_KEY)).status).toBe(403);
    const result = await call();
    expect(result.body).toMatchObject({ configured: true, clinicalValidation: false });
    expect(JSON.stringify(result)).not.toContain(env.DASHSCOPE_API_KEY);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('acknowledges activation only after a real provider result, then retains context', async () => {
    const fetchImpl = vi.fn(async () => answer());
    const { call } = await setup(fetchImpl);
    const request = start();
    const result = await call(request);
    expect(result.status).toBe(200);
    expect(result.cache).toBe('no-store');
    expect(result.body.text).toBe(HOSPITAL_GREETING);
    expect(fetchImpl).toHaveBeenCalledOnce();
    await call({ action: 'message', sessionId: request.sessionId, inputId: randomUUID(), text: '只是连通测试，没有身体不适。' });
    const sent = JSON.parse((fetchImpl.mock.calls as unknown as [string, { body: string }][])[1][1].body);
    expect(sent.model).toBe('configured-qwen');
    expect(sent.enable_thinking).toBe(false);
    expect(sent.messages[2].content).toBe(HOSPITAL_GREETING);
    expect(sent.messages.at(-1).content).toBe('只是连通测试，没有身体不适。');
    expect(sent.messages[0].content).toContain('不得调用比赛工具');
  });
  it('deduplicates identical completed inputs and rejects changing their contents', async () => {
    const { call, fetchImpl } = await setup();
    const request = start();
    const first = await call(request);
    expect((await call(request)).body).toEqual(first.body);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const message = { action: 'message', sessionId: request.sessionId, inputId: randomUUID(), text: '测试一' };
    await call(message);
    expect((await call({ ...message, text: '测试二' })).status).toBe(409);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('does not activate on errors or silently retry a possibly charged request', async () => {
    const fetchImpl = vi.fn(async () => new Response('do not leak upstream secret', { status: 500 }));
    const { call } = await setup(fetchImpl);
    const request = start();
    expect((await call(request)).body).toEqual({ error: 'qwen_request_failed' });
    expect((await call(request)).status).toBe(409);
    expect((await call({ action: 'message', sessionId: request.sessionId, inputId: randomUUID(), text: '你好' })).body.error).toBe('session_not_started');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it('rejects truncated or oversized replies instead of cutting medical meaning', async () => {
    const { call } = await setup(vi.fn(async () => answer('应当', 'length')));
    expect((await call(start())).body.error).toBe('qwen_incomplete_reply');
    const long = await setup(vi.fn(async () => answer('长'.repeat(101))));
    expect((await long.call(start())).body.error).toBe('qwen_invalid_reply');
  });
  it('expires sessions and end removes consultation context', async () => {
    let now = 0;
    const { call } = await setup(undefined, { now: () => now });
    const request = start(); await call(request);
    now = 31 * 60_000;
    expect((await call({ action: 'message', sessionId: request.sessionId, inputId: randomUUID(), text: '还有呢' })).body.error).toBe('session_expired_start_again');
    const next = start(); await call(next);
    expect((await call({ action: 'end', sessionId: next.sessionId, inputId: randomUUID() })).body.active).toBe(false);
    expect((await call({ action: 'message', sessionId: next.sessionId, inputId: randomUUID(), text: '还有呢' })).status).toBe(409);
  });
  it('validates requests and refuses anonymous configuration', async () => {
    const { call, fetchImpl } = await setup();
    expect((await call({ ...start(), action: 'test' })).status).toBe(400);
    expect((await call({ ...start(), sessionId: '../../test' })).status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
    const unconfigured = await setup(undefined, { env: { DASHSCOPE_API_KEY: 'key' } });
    expect((await unconfigured.call(start())).status).toBe(403);
  });
});
