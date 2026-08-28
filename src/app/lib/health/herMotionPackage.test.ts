import { describe, expect, it, vi } from 'vitest';
import { verifyHerMotionPackage } from './herMotionPackage';

describe('bundled Her Motion identity', () => {
  it('checks the explicit local package rather than accepting the Pocket Buddy homepage', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ app: 'HerMotion', protocol: 'pocket-her-motion-bridge/v1', version: 1 })));
    await verifyHerMotionPackage('/her-motion/index.html', 'capacitor://localhost/', fetcher);
    expect(fetcher).toHaveBeenCalledWith('capacitor://localhost/her-motion/manifest.json', expect.objectContaining({ cache: 'no-store' }));
  });
  it.each([new Response('<html>Pocket Buddy</html>'), new Response('{}'), new Response('', { status: 404 })])('rejects missing/SPA fallback/wrong applications', async response => {
    await expect(verifyHerMotionPackage('/her-motion/index.html', 'https://example.test/', async () => response)).rejects.toThrow('Her Motion');
  });
});
