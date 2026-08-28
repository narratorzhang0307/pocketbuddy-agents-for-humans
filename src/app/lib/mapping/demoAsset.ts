export const MAPPING_DEMO_PDF = {
  name: 'jinling-shiji-partial-10-page-demo.pdf',
  title: '《金陵世纪》（部分）',
  pages: 10,
  bytes: 389033,
  sha256: '665557a2a720e7d6bc757aebd4c35bddadd7d92c8a0ba318ce963ef0b7685c2a',
  url: 'https://assets-pocketearth.throughtheglass.art/pocket-earth/assets/mapping-demo/20260813-jinling-shiji-partial-10-page-demo-665557a2a720.pdf',
  ossUrl: 'https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/assets/mapping-demo/20260813-jinling-shiji-partial-10-page-demo-665557a2a720.pdf',
} as const;

const arrayBufferHex = (value: ArrayBuffer): string => [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

export async function fetchVerifiedMappingDemoPdf(fetcher: typeof fetch = fetch): Promise<ArrayBuffer> {
  const response = await fetcher(MAPPING_DEMO_PDF.url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`OSS 下载失败：${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== MAPPING_DEMO_PDF.bytes || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') {
    throw new Error('OSS 返回的 PDF 文件不完整');
  }
  const digest = arrayBufferHex(await crypto.subtle.digest('SHA-256', bytes));
  if (digest !== MAPPING_DEMO_PDF.sha256) throw new Error('PDF 完整性校验失败');
  return bytes;
}
