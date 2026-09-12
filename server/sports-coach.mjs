import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIMIT = 256 * 1024;

function runRules(payload, python, projectRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [path.join(projectRoot, 'vendor/sports-coach/assess.py')], {
      cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });
    let output = '', bytes = 0;
    const timer = setTimeout(() => { child.kill(); reject(new Error('sports_rules_timeout')); }, 10000);
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > LIMIT) { child.kill(); reject(new Error('sports_rules_output_limit')); }
      else output += chunk.toString();
    });
    // No pose requests, raw images or Python diagnostic paths are logged.
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.on('error', () => { clearTimeout(timer); reject(new Error('sports_rules_unavailable')); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) { reject(new Error('sports_rules_unavailable')); return; }
      try { resolve(JSON.parse(output)); } catch { reject(new Error('sports_rules_invalid_response')); }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

export function createSportsCoachHandler({ env = process.env, projectRoot = ROOT, evaluate } = {}) {
  let active = 0;
  const evaluatePose = evaluate || (payload => runRules(payload, env.SPORTS_COACH_PYTHON || 'python3', projectRoot));
  return async (req, res) => {
    const route = new URL(req.url || '/', 'http://localhost').pathname;
    if (!route.startsWith('/api/sports-coach/')) return false;
    const send = (value, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(value));
      return true;
    };
    if (!['/api/sports-coach/health', '/api/sports-coach/assess'].includes(route)) return send({ error: 'not_found' }, 404);
    const health = route.endsWith('/health');
    if (req.method !== (health ? 'GET' : 'POST')) return send({ error: 'method_not_allowed' }, 405);
    if (!health && !String(req.headers['content-type'] || '').startsWith('application/json')) return send({ error: 'json_required' }, 415);
    // A foreign website cannot use this local camera-analysis endpoint through CORS.
    if (req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) return send({ error: 'origin_not_allowed' }, 403); }
      catch { return send({ error: 'origin_not_allowed' }, 403); }
    }
    if (active >= 2) return send({ error: 'sports_rules_busy' }, 429);
    active++;
    try {
      let payload = { check: true };
      if (!health) {
        let bytes = 0; const chunks = [];
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > LIMIT) return send({ error: 'pose_request_too_large' }, 413);
          chunks.push(chunk);
        }
        try { payload = JSON.parse(Buffer.concat(chunks).toString()); }
        catch { return send({ error: 'invalid_json' }, 400); }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) || 'check' in payload) return send({ error: 'invalid_pose_request' }, 400);
      }
      const result = await evaluatePose(payload);
      return send(result, result.error ? 400 : 200);
    } catch {
      return send({ error: 'sports_rules_unavailable', detail: 'Sports analysis is unavailable. Install the sports rules dependencies and try again.' }, 503);
    } finally { active--; }
  };
}
