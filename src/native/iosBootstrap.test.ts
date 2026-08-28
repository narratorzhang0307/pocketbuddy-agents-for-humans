import { afterEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(), getPlatform: vi.fn() },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.resetModules();
});

async function bootstrap(platform: string, native: boolean) {
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(native);
  vi.mocked(Capacitor.getPlatform).mockReturnValue(platform);
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
  const page = {
    fetch: fetcher,
    location: { href: 'capacitor://localhost/index.html' },
  };
  vi.stubGlobal('window', page);
  await import('./iosBootstrap');
  return { page, fetcher };
}

describe('iOS AMap rendering bootstrap', () => {
  it('opts native iOS into vector rendering before maps can load', async () => {
    const { page } = await bootstrap('ios', true);
    expect(Reflect.get(page, 'forceWebGL')).toBe(true);
    expect(Reflect.get(page, 'AMap')).toBeUndefined();
    expect(Reflect.get(page, 'forceWebGLBaseRender')).toBeUndefined();
    expect(Reflect.get(page, 'forbidenWebGL')).toBeUndefined();
  });

  it.each([['web', false], ['ios', false], ['android', true]])(
    'does not change renderer policy or fetch on %s (native=%s)',
    async (platform, native) => {
      const { page, fetcher } = await bootstrap(platform, native);
      expect(Reflect.get(page, 'forceWebGL')).toBeUndefined();
      expect(page.fetch).toBe(fetcher);
    },
  );

  it('preserves direct HTTPS AMap requests when installing the API fetch adapter', async () => {
    const { page, fetcher } = await bootstrap('ios', true);
    const url = 'https://webapi.amap.com/maps?v=2.0&key=test';
    await page.fetch(url);
    expect(fetcher).toHaveBeenCalledWith(url, undefined);
  });
});
