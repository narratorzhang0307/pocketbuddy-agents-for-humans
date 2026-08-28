import catalog from './skill/avatarCloudCatalog.json';
import birds from './skill/birdCatalog.json';

export const BADGE_JPEG_ENDPOINT = 'avatar_jpeg_v1';
export const MAX_AVATAR_JPEG_BYTES = 65536;
const cache = new Map<number, Uint8Array>();
export const cloudAvatar = (index: number) => [...catalog, ...birds].find(item => item.index === index);

export async function loadAvatarJpeg(index: number, signal: AbortSignal): Promise<Uint8Array> {
  const item = cloudAvatar(index);
  if (!item || signal.aborted) throw new Error('头像加载已取消或编号无效');
  const cached = cache.get(index);
  if (cached) return cached;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 12000);
  try {
    const response = await fetch(item.jpegUrl, { signal: controller.signal, credentials: 'omit', redirect: 'error' });
    if (!response.ok) throw new Error(`OSS 头像下载失败 (${response.status})`);
    if (Number(response.headers.get('content-length')) > MAX_AVATAR_JPEG_BYTES) throw new Error('头像超过容量上限');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== item.bytes || bytes.length > MAX_AVATAR_JPEG_BYTES) throw new Error('头像长度校验失败');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    if (hash !== item.sha256) throw new Error('头像完整性校验失败');
    if (signal.aborted || controller.signal.aborted) throw new Error('头像加载已取消');
    cache.set(index, bytes); // Only the fixed 16-entry catalog is cacheable; no arbitrary URLs.
    return bytes;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}

export function* avatarUploadPackets(index: number, token: number, bytes: Uint8Array, maxWrite: number) {
  const item = cloudAvatar(index), chunkSize = Math.min(maxWrite - 6, 480) - 1 - BADGE_JPEG_ENDPOINT.length - 8;
  if (!item || bytes.length !== item.bytes || chunkSize < 4) throw new Error('头像或蓝牙 MTU 不符合要求');
  const packet = (op: number, length: number) => {
    const data = new Uint8Array(length); data[0] = op; data[1] = index;
    new DataView(data.buffer).setUint16(2, token, true); return data;
  };
  const begin = packet(0, 12), view = new DataView(begin.buffer);
  view.setUint32(4, bytes.length, true); view.setUint32(8, item.crc32, true);
  yield { data: begin, state: 1, value: 0 };
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const count = Math.min(chunkSize, bytes.length - offset), data = packet(1, count + 8);
    new DataView(data.buffer).setUint32(4, offset, true); data.set(bytes.subarray(offset, offset + count), 8);
    yield { data, state: 2, value: offset + count };
  }
  yield { data: packet(2, 4), state: 3, value: item.crc32 };
}
