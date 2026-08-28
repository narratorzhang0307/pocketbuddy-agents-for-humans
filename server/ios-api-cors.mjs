const IOS_ORIGIN = 'capacitor://localhost';
const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'];
const HEADERS = [
  'content-type', 'authorization', 'x-kiri-key', 'x-pet-name',
  'x-file-name', 'x-forge-mode', 'x-rig-template',
];

// CORS is not authentication. Keep existing API authorization and rate limits.
export function handleIosApiCors(req, res, pathname) {
  if (pathname !== '/api' && !pathname.startsWith('/api/')) return false;
  const vary = String(res.getHeader('vary') || '').split(',').map((v) => v.trim()).filter(Boolean);
  if (!vary.some((v) => v.toLowerCase() === 'origin')) vary.push('Origin');
  res.setHeader('vary', vary.join(', '));
  if (req.headers.origin !== IOS_ORIGIN) return false;

  res.setHeader('access-control-allow-origin', IOS_ORIGIN);
  res.setHeader('access-control-expose-headers', 'Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining');
  if (req.method !== 'OPTIONS') return false;

  const method = String(req.headers['access-control-request-method'] || '').toUpperCase();
  const headers = String(req.headers['access-control-request-headers'] || '')
    .toLowerCase().split(',').map((h) => h.trim()).filter(Boolean);
  if (!METHODS.includes(method) || headers.some((h) => !HEADERS.includes(h))) {
    res.writeHead(403);
    res.end();
    return true;
  }
  res.setHeader('access-control-allow-methods', METHODS.join(', '));
  res.setHeader('access-control-allow-headers', HEADERS.join(', '));
  res.setHeader('access-control-max-age', '600');
  res.writeHead(204);
  res.end();
  return true;
}
