import { createHospitalConsultationHandler } from './hospital-consultation.mjs';
const API_PREFIX = '/api/hospital-agent';

// This is the deployed DOCTOR agent, not the contest's patient/model service.
// Only its SDK health endpoint is exposed; /test starts a real contest run.
export function createHospitalAgentHandler({ env = process.env, fetchImpl = fetch } = {}) {
  const consultation = createHospitalConsultationHandler({ env, fetchImpl });
  return async function handleHospitalAgent(req, res) {
    if (await consultation(req, res)) return true;
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (pathname !== API_PREFIX && !pathname.startsWith(`${API_PREFIX}/`)) return false;
    const send = (body, code = 200) => {
      res.statusCode = code;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(JSON.stringify(body));
      return true;
    };
    if (pathname !== `${API_PREFIX}/health`) return send({ error: 'not_found' }, 404);
    if (req.method !== 'GET') {
      res.setHeader('allow', 'GET');
      return send({ error: 'method_not_allowed' }, 405);
    }

    const base = String(env.HOSPITAL_AGENT_BASE_URL || '').trim();
    if (!base) return send({ status: 'not_configured' });
    const token = String(env.HOSPITAL_AGENT_API_TOKEN || '').trim();
    let endpoint;
    try {
      endpoint = new URL(base);
      if (!['http:', 'https:'].includes(endpoint.protocol)
        || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('invalid_url');
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
      if (token && endpoint.protocol !== 'https:' && !loopback) throw new Error('insecure_auth');
      endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, '')}/health`;
    } catch {
      return send({ status: 'invalid_config' });
    }

    try {
      const response = await fetchImpl(endpoint.href, {
        method: 'GET',
        headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        redirect: 'error',
        signal: AbortSignal.timeout(8_000),
      });
      if (response.status === 401 || response.status === 403) return send({ status: 'auth_required' });
      if (!response.ok) return send({ status: 'unreachable' });
      const payload = await response.json().catch(() => null);
      return send({ status: payload?.status === 'ok' ? 'reachable' : 'invalid_response' });
    } catch {
      // Never return upstream bodies, URLs, credentials or stack traces to the browser.
      return send({ status: 'unreachable' });
    }
  };
}
