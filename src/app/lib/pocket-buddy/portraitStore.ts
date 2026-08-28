import { keyedStore } from '../skills/keyedStore';

interface StoredPocketBuddyPortrait {
  id: string;
  blob: Blob;
  createdAt: number;
}

const portraits = keyedStore<StoredPocketBuddyPortrait>(
  'shangjie-pocket-buddies',
  'id',
  'portraits',
);
const objectUrls = new Map<string, string>();
const MAX_OBJECT_URLS = 24;

export async function putPocketBuddyPortrait(blob: Blob, id: string) {
  if (!blob.size || !blob.type.startsWith('image/')) {
    throw new Error('MY AGENT 形象不是有效图片');
  }
  await portraits.put({ id, blob, createdAt: Date.now() });
  return id;
}

export async function getPocketBuddyPortraitUrl(id: string) {
  const cached = objectUrls.get(id);
  if (cached) {
    objectUrls.delete(id);
    objectUrls.set(id, cached);
    return cached;
  }
  const stored = await portraits.get(id);
  if (!stored?.blob?.size || typeof URL.createObjectURL !== 'function') return null;
  const url = URL.createObjectURL(stored.blob);
  objectUrls.set(id, url);
  if (objectUrls.size > MAX_OBJECT_URLS) {
    const oldest = objectUrls.keys().next().value as string | undefined;
    const oldUrl = oldest ? objectUrls.get(oldest) : undefined;
    if (oldest && oldUrl) {
      URL.revokeObjectURL(oldUrl);
      objectUrls.delete(oldest);
    }
  }
  return url;
}

export async function deletePocketBuddyPortrait(id: string) {
  const url = objectUrls.get(id);
  if (url) URL.revokeObjectURL(url);
  objectUrls.delete(id);
  await portraits.del(id);
}

export async function pocketBuddyPortraitBlobFromUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('无法读取 MY AGENT 形象');
  const blob = await response.blob();
  if (!blob.size || !blob.type.startsWith('image/')) {
    throw new Error('MY AGENT 形象不是有效图片');
  }
  return blob;
}

export async function makePocketBuddyThumbnail(url: string, size = 180) {
  const blob = await pocketBuddyPortraitBlobFromUrl(url);
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法建立 MY AGENT 缩略图');
    const scale = Math.min((size * 0.86) / bitmap.width, (size * 0.86) / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.clearRect(0, 0, size, size);
    context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
    return canvas.toDataURL('image/webp', 0.82);
  } finally {
    bitmap.close();
  }
}
