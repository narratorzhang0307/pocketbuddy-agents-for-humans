import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkHospitalAgentHealth, HOSPITAL_CONNECTION_STATES } from './hospitalAgent';

afterEach(() => vi.unstubAllGlobals());

describe('Hospital Agent connection client', () => {
  it('performs a cancellable, uncached same-origin GET with no patient data or credentials', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"status":"not_configured"}'));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    expect(await checkHospitalAgentHealth(controller.signal)).toBe('not_configured');
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/hospital-agent/health', {
      method: 'GET', cache: 'no-store', signal: controller.signal,
    });
  });

  it.each(['reachable', 'auth_required', 'unreachable', 'invalid_config', 'invalid_response'])('accepts explicit backend state %s', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status }))));
    expect(await checkHospitalAgentHealth()).toBe(status);
  });

  it.each(['ok', 'checking', 'bridge_unavailable', 'toString', '__proto__', null, true])('rejects an unexpected status: %s', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status }))));
    await expect(checkHospitalAgentHealth()).rejects.toThrow('invalid_hospital_status');
  });

  it('rejects a missing proxy and HTML fallback instead of reporting an online doctor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));
    await expect(checkHospitalAgentHealth()).rejects.toThrow('hospital_bridge_unavailable');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>app</html>')));
    await expect(checkHospitalAgentHealth()).rejects.toThrow();
  });

  it('does not claim diagnostic or model readiness from a successful health probe', () => {
    expect(HOSPITAL_CONNECTION_STATES.reachable.detail).toContain('不代表模型、比赛凭据或诊疗流程已验证');
  });
});
