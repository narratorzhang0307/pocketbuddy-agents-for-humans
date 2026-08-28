import { Capacitor } from '@capacitor/core';

export const DEFAULT_IOS_API_ORIGIN = 'https://pocketbuddy.throughtheglass.art';

// Public server address only. Provider credentials must remain on the server.
export function validateIosApiOrigin(value = DEFAULT_IOS_API_ORIGIN): string {
  const url = new URL(value.trim() || DEFAULT_IOS_API_ORIGIN);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('VITE_POCKET_BUDDY_API_ORIGIN 必须是无路径、无凭据的 HTTPS origin。');
  }
  return url.origin;
}

export function iosApiOrigin(): string {
  return validateIosApiOrigin(import.meta.env.VITE_POCKET_BUDDY_API_ORIGIN);
}

// Preserve Android's existing deployed endpoint. Never silently use it on iOS.
export function nativeApiEndpoint(path: string, androidEndpoint: string): string {
  return Capacitor.getPlatform() === 'ios' ? `${iosApiOrigin()}${path}` : androidEndpoint;
}
