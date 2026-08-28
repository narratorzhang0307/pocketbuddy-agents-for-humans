import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error Plain ESM server module intentionally has no client-facing types.
import { createHospitalAgentHandler } from './hospital-agent.mjs';

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string) { this.headers[name] = value; },
    end(value: string) { this.body = value; },
  };
}

const healthRequest = { method: 'GET', url: '/api/hospital-agent/health' };
const env = { HOSPITAL_AGENT_BASE_URL: 'https://doctor.example/agent/' };

describe('Hospital Agent read-only bridge', () => {
  it('reports missing configuration without probing localhost or a contest service', async () => {
    const fetchImpl = vi.fn();
    const res = responseRecorder();
    expect(await createHospitalAgentHandler({ env: {}, fetchImpl })(healthRequest, res)).toBe(true);
    expect(JSON.parse(res.body)).toEqual({ status: 'not_configured' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('checks only the configured health endpoint and keeps gateway credentials server-side', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"status":"ok"}'));
    const res = responseRecorder();
    await createHospitalAgentHandler({ env: { ...env, HOSPITAL_AGENT_API_TOKEN: 'server-secret' }, fetchImpl })({
      ...healthRequest,
      url: '/api/hospital-agent/health?url=https://untrusted.example/test',
      headers: { authorization: 'Bearer browser-secret' },
    }, res);
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith('https://doctor.example/agent/health', {
      method: 'GET',
      headers: { accept: 'application/json', authorization: 'Bearer server-secret' },
      redirect: 'error',
      signal: expect.any(AbortSignal),
    });
    expect(JSON.parse(res.body)).toEqual({ status: 'reachable' });
    expect(res.body).not.toMatch(/secret|doctor\.example/);
  });

  it.each([
    [401, '{"error":"secret"}', 'auth_required'],
    [403, '{}', 'auth_required'],
    [500, '{}', 'unreachable'],
    [404, '{}', 'unreachable'],
    [200, '<html>SPA fallback</html>', 'invalid_response'],
    [200, '{"status":"down"}', 'invalid_response'],
    [200, '{"ok":true}', 'invalid_response'],
    [200, 'null', 'invalid_response'],
  ])('maps HTTP %i / %s to %s without claiming readiness', async (httpStatus, body, expected) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(body, { status: httpStatus }));
    const res = responseRecorder();
    await createHospitalAgentHandler({ env, fetchImpl })(healthRequest, res);
    expect(JSON.parse(res.body)).toEqual({ status: expected });
  });

  it('does not expose upstream errors on network failure, timeout or redirect rejection', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('private-host / secret-token'));
    const res = responseRecorder();
    await createHospitalAgentHandler({ env, fetchImpl })(healthRequest, res);
    expect(JSON.parse(res.body)).toEqual({ status: 'unreachable' });
  });

  it.each([
    'not-a-url', 'file:///tmp/agent', 'https://user:secret@doctor.example',
    'https://doctor.example/?token=secret', 'https://doctor.example/#secret',
  ])('rejects unsafe or malformed configuration: %s', async (base) => {
    const fetchImpl = vi.fn();
    const res = responseRecorder();
    await createHospitalAgentHandler({ env: { HOSPITAL_AGENT_BASE_URL: base }, fetchImpl })(healthRequest, res);
    expect(JSON.parse(res.body)).toEqual({ status: 'invalid_config' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not send tokens over remote HTTP, but supports a local doctor service', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"status":"ok"}'));
    const remote = responseRecorder();
    await createHospitalAgentHandler({ env: { HOSPITAL_AGENT_BASE_URL: 'http://doctor.example', HOSPITAL_AGENT_API_TOKEN: 'secret' }, fetchImpl })(healthRequest, remote);
    expect(JSON.parse(remote.body)).toEqual({ status: 'invalid_config' });
    expect(fetchImpl).not.toHaveBeenCalled();
    const local = responseRecorder();
    await createHospitalAgentHandler({ env: { HOSPITAL_AGENT_BASE_URL: 'http://127.0.0.1:7860' }, fetchImpl })(healthRequest, local);
    expect(JSON.parse(local.body)).toEqual({ status: 'reachable' });
    expect(fetchImpl.mock.calls[0][0]).toBe('http://127.0.0.1:7860/health');
  });

  it.each([
    ['POST', '/api/hospital-agent/health', 405],
    ['POST', '/api/hospital-agent/test', 404],
    ['POST', '/api/hospital-agent/chat', 404],
  ])('does not forward %s %s', async (method, url, status) => {
    const fetchImpl = vi.fn();
    const res = responseRecorder();
    await createHospitalAgentHandler({ env, fetchImpl })({ method, url }, res);
    expect(res.statusCode).toBe(status);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('leaves other application routes untouched', async () => {
    const res = responseRecorder();
    expect(await createHospitalAgentHandler({ env })({ method: 'GET', url: '/api/health-skills/status' }, res)).toBe(false);
    expect(res.body).toBe('');
  });
});
