import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { nativeApiEndpoint } from '../../../native/apiOrigin';
import type { MusicPlaybackRef } from '../dataPack';

const ENDPOINT = '/api/music/youtube-publish';
const NATIVE_ENDPOINT = 'https://pocketearth.throughtheglass.art/api/music/youtube-publish';
const TIMEOUT_MS = 6 * 60_000;

export interface PublishedMusicCard {
  id: string;
  title: string;
  artist: string;
  genre: string;
  year: number | null;
  songIntro: string;
  artistIntro: string;
  place: string;
  country: string;
  geoKind: 'artist_origin' | 'song_city';
  geo: { lng: number; lat: number; place: string } | null;
  model: string;
  durationSec: number;
  playback: MusicPlaybackRef;
  sourceUrl: string;
  artifact: { objectKey: string; sha256: string; bytes: number; durationSec: number };
}

type PublishResponse = { ok?: boolean; card?: PublishedMusicCard; error?: string };

export async function publishYoutubeMusicUrl(youtubeUrl: string): Promise<PublishedMusicCard> {
  const payload = { youtubeUrl: youtubeUrl.trim() };
  let status = 0;
  let data: PublishResponse;
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.post({
      url: nativeApiEndpoint(ENDPOINT, NATIVE_ENDPOINT),
      headers: { 'content-type': 'application/json' },
      data: payload,
      connectTimeout: 30_000,
      readTimeout: TIMEOUT_MS,
      responseType: 'json',
    });
    status = response.status;
    data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  } else {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = response.status;
    data = await response.json();
  }
  if (status < 200 || status >= 300 || !data.ok || !data.card) throw new Error(data.error || `music_publish_${status}`);
  return data.card;
}
