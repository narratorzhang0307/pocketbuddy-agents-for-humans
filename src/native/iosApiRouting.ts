import { validateIosApiOrigin } from './apiOrigin';

/** Only remap app-local APIs, never third-party URLs, bundled assets or blob URLs. */
export function iosApiUrl(input: string, pageUrl: string, apiOrigin: string): string | undefined {
  const page = new URL(pageUrl);
  const url = new URL(input, page);
  // URL.origin is "null" for custom schemes; compare protocol + host instead.
  if (url.protocol !== page.protocol || url.host !== page.host || url.username || url.password) return;
  if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return;
  return `${apiOrigin}${url.pathname}${url.search}`;
}

export function createIosApiFetch(fetcher: typeof fetch, pageUrl: string, apiOrigin: string): typeof fetch {
  const origin = validateIosApiOrigin(apiOrigin);
  return (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const target = iosApiUrl(url, pageUrl, origin);
    if (!target) return fetcher(input, init);
    // Keep native WebKit fetch: streaming SSE, binary uploads and AbortSignal stay intact.
    return fetcher(input instanceof Request ? new Request(target, input) : target, init);
  };
}
