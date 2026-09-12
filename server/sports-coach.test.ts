import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Shared server-only ESM pose adapter.
import { createSportsCoachHandler } from './sports-coach.mjs';

const servers: Server[] = [];
async function start(options: Record<string, unknown> = {}) {
  const handle = createSportsCoachHandler(options);
  const server = createServer(async (req, res) => {
    if (!await handle(req, res)) { res.writeHead(404); res.end(); }
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  return `http://127.0.0.1:${address.port}/api/sports-coach`;
}
const post = (body: string, headers: Record<string, string> = {}) => ({
  method: 'POST', body, headers: { 'content-type': 'application/json', ...headers },
});
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.closeAllConnections(); server.close(() => resolve());
  })));
});

describe('sports rules HTTP boundary', () => {
  it('allows only the health GET and pose JSON POST routes', async () => {
    const evaluate = vi.fn(async () => ({ valid: true, score: 88 }));
    const url = await start({ evaluate });
    expect((await fetch(url + '/assess')).status).toBe(405);
    expect((await fetch(url + '/unknown')).status).toBe(404);
    expect((await fetch(url + '/assess', { method: 'POST', body: '{}' })).status).toBe(415);
    const response = await fetch(url + '/assess', post('{"sport":"basketball"}'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(evaluate).toHaveBeenCalledExactlyOnceWith({ sport: 'basketball' });
  });

  it.each(['{', 'null', '[]', '{"check":true}'])('rejects malformed or health-probe pose payload %s', async body => {
    const evaluate = vi.fn(); const url = await start({ evaluate });
    expect((await fetch(url + '/assess', post(body))).status).toBe(400);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('bounds request size and rejects requests from another website', async () => {
    const evaluate = vi.fn(); const url = await start({ evaluate });
    const oversized = await fetch(url + '/assess', post(JSON.stringify({ frames: 'x'.repeat(270000) })));
    expect(oversized.status).toBe(413);
    expect((await fetch(url + '/assess', post('{}', { origin: 'https://foreign.example' }))).status).toBe(403);
    expect((await fetch(url + '/assess', post('{}', { origin: 'null' }))).status).toBe(403);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('returns validation errors without inventing a score', async () => {
    const url = await start({ evaluate: async () => ({ error: 'invalid_pose_request', detail: 'Unknown sport' }) });
    const response = await fetch(url + '/assess', post('{}'));
    expect(response.status).toBe(400);
    expect(await response.json()).not.toHaveProperty('score');
  });

  it('reports missing Python clearly without exposing local paths', async () => {
    const url = await start({ env: { SPORTS_COACH_PYTHON: '/missing-sports-python' } });
    const response = await fetch(url + '/health');
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe('sports_rules_unavailable');
    expect(JSON.stringify(body)).not.toContain('/missing');
    expect(body).not.toHaveProperty('score');
  });

  it('limits concurrent rule processes and releases a slot after completion', async () => {
    const finish: (() => void)[] = [];
    const url = await start({ evaluate: () => new Promise(resolve => finish.push(() => resolve({ ready: true }))) });
    const first = fetch(url + '/health');
    const second = fetch(url + '/health');
    await vi.waitFor(() => expect(finish).toHaveLength(2));
    expect((await fetch(url + '/health')).status).toBe(429);
    finish.splice(0).forEach(done => done());
    expect((await first).status).toBe(200); expect((await second).status).toBe(200);
    const next = fetch(url + '/health');
    await vi.waitFor(() => expect(finish).toHaveLength(1));
    finish[0](); expect((await next).status).toBe(200);
  });
});
