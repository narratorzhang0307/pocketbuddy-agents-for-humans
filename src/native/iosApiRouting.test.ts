import { afterEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { DEFAULT_IOS_API_ORIGIN, nativeApiEndpoint, validateIosApiOrigin } from './apiOrigin';
import { createIosApiFetch, iosApiUrl } from './iosApiRouting';

const page = 'capacitor://localhost/index.html';
const api = 'https://pocketbuddy.example';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('iOS API address boundary', () => {
  it('uses the new host by default, with no silent old-domain fallback', () => {
    expect(validateIosApiOrigin()).toBe(DEFAULT_IOS_API_ORIGIN);
    expect(validateIosApiOrigin(' https://pocketbuddy.example/ ')).toBe(api);
  });
  it.each(['http://example.com', 'https://user:password@example.com', 'https://example.com/api', 'https://example.com/?key=secret', 'https://example.com/#secret'])('rejects unsafe/misconfigured origin %s', (value) => {
    expect(() => validateIosApiOrigin(value)).toThrow();
  });
  it('only changes the native endpoints on iOS', () => {
    vi.stubEnv('VITE_POCKET_BUDDY_API_ORIGIN', api);
    const platform = vi.spyOn(Capacitor, 'getPlatform');
    platform.mockReturnValue('ios');
    expect(nativeApiEndpoint('/api/frost-llm', 'https://old.example/api/frost-llm')).toBe(`${api}/api/frost-llm`);
    platform.mockReturnValue('android');
    expect(nativeApiEndpoint('/api/frost-llm', 'https://old.example/api/frost-llm')).toBe('https://old.example/api/frost-llm');
  });
  it.each(['/api', '/api/frost-llm', 'api/pets?accessToken=example', 'capacitor://localhost/api/pets'])('routes only local API URLs: %s', (value) => {
    const url = new URL(value, page);
    expect(iosApiUrl(value, page, api)).toBe(`${api}${url.pathname}${url.search}`);
  });
  it.each(['/assets/pet.glb', '/apiary', 'https://other.example/api/pets', '//other.example/api/pets', 'blob:capacitor://localhost/abc', 'file://localhost/api/pets', 'data:text/plain,test'])('does not rewrite %s', (value) => {
    expect(iosApiUrl(value, page, api)).toBeUndefined();
  });
});

describe('iOS fetch adapter', () => {
  it('preserves JSON body, headers, signal and the actual streamed Response', async () => {
    const bytes = new TextEncoder().encode('data: {"token":"hello"}\n\n');
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    const routed = createIosApiFetch(fetcher, page, api);
    const options = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"prompt":"hi"}', signal: new AbortController().signal };
    const result = await routed('/api/frost-llm-stream', options);
    expect(fetcher).toHaveBeenCalledWith(`${api}/api/frost-llm-stream`, options);
    expect(fetcher.mock.calls[0][1]).toBe(options);
    expect(result).toBe(response);
    expect(await result.body!.getReader().read()).toMatchObject({ done: false, value: bytes });
  });
  it('does not convert or corrupt File uploads', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
    const photo = new File([new Uint8Array([0, 255, 137, 80])], 'photo.png', { type: 'image/png' });
    const init = { method: 'POST', headers: { 'content-type': photo.type, 'x-file-name': photo.name }, body: photo };
    await createIosApiFetch(fetcher, page, api)(new URL('/api/pets', page), init);
    expect(fetcher.mock.calls[0][0]).toBe(`${api}/api/pets`);
    expect(fetcher.mock.calls[0][1]?.body).toBe(photo);
  });
  it('preserves Request bodies and option overrides', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
    const request = new Request('capacitor://localhost/api/pets/a?accessToken=b', {
      method: 'POST', headers: { 'x-pet-name': 'buddy' }, body: 'bytes',
    });
    const controller = new AbortController();
    const overrides = { signal: controller.signal };
    await createIosApiFetch(fetcher, page, api)(request, overrides);
    const sent = fetcher.mock.calls[0][0] as Request;
    expect(sent.url).toBe(`${api}/api/pets/a?accessToken=b`);
    expect(sent.method).toBe('POST');
    expect(sent.headers.get('x-pet-name')).toBe('buddy');
    expect(await sent.text()).toBe('bytes');
    expect(fetcher.mock.calls[0][1]).toBe(overrides);
  });
  it('passes through unrelated URLs unchanged and propagates fetch rejection', async () => {
    const error = new DOMException('Stopped', 'AbortError');
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(error);
    const url = new URL('https://thirdparty.example/image.png');
    const routed = createIosApiFetch(fetcher, page, api);
    await expect(routed(url)).rejects.toBe(error);
    expect(fetcher).toHaveBeenCalledWith(url, undefined);
  });
});
