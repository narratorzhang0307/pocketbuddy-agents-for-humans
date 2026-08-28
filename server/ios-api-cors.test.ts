import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handleIosApiCors } from './ios-api-cors.mjs';

describe('bundled iOS CORS boundary (real local HTTP server, no provider calls)', () => {
  let server: Server;
  let origin: string;
  let handled = 0;
  beforeAll(async () => {
    server = createServer(async (req, res) => {
      res.setHeader('vary', 'Accept-Encoding');
      if (handleIosApiCors(req, res, new URL(req.url!, 'http://localhost').pathname)) return;
      handled++;
      if (req.url === '/api/rate-limited') {
        res.setHeader('retry-after', '10');
        res.writeHead(429);
        res.end('limited');
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(Buffer.concat(chunks));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  it('answers permitted preflight before API handlers, without cookies or wildcard', async () => {
    const previous = handled;
    const response = await fetch(`${origin}/api/pets`, { method: 'OPTIONS', headers: {
      Origin: 'capacitor://localhost', 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type,X-Pet-Name,X-File-Name,X-Forge-Mode,X-Rig-Template',
    } });
    expect(response.status).toBe(204);
    expect(handled).toBe(previous);
    expect(response.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
    expect(response.headers.has('access-control-allow-credentials')).toBe(false);
    expect(response.headers.get('vary')).toBe('Accept-Encoding, Origin');
  });
  it.each(['null', 'https://evil.example', 'capacitor://evil.example', 'capacitor://localhost.evil.example'])('does not grant new access to origin %s', async (value) => {
    const response = await fetch(`${origin}/api/frost-llm`, { headers: { Origin: value } });
    expect(response.headers.has('access-control-allow-origin')).toBe(false);
  });
  it.each([
    { 'Access-Control-Request-Method': 'TRACE' },
    { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'X-Unknown-Header' },
  ])('rejects unsupported preflight %j', async (headers) => {
    const response = await fetch(`${origin}/api/pets`, { method: 'OPTIONS', headers: { Origin: 'capacitor://localhost', ...headers } });
    expect(response.status).toBe(403);
  });
  it('preserves binary bytes and exposes retry information on errors', async () => {
    const bytes = new Uint8Array([255, 0, 128, 35]);
    const upload = await fetch(`${origin}/api/pets`, { method: 'POST', headers: { Origin: 'capacitor://localhost' }, body: bytes });
    expect(new Uint8Array(await upload.arrayBuffer())).toEqual(bytes);
    const error = await fetch(`${origin}/api/rate-limited`, { headers: { Origin: 'capacitor://localhost' } });
    expect(error.status).toBe(429);
    expect(error.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
    expect(error.headers.get('access-control-expose-headers')).toContain('Retry-After');
    expect(error.headers.get('retry-after')).toBe('10');
  });
  it('does not change non-API assets', async () => {
    const response = await fetch(`${origin}/assets/buddy.png`, { headers: { Origin: 'capacitor://localhost' } });
    expect(response.headers.has('access-control-allow-origin')).toBe(false);
    expect(response.headers.get('vary')).toBe('Accept-Encoding');
  });
});
