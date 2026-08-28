import { describe, expect, it } from 'vitest';
// @ts-expect-error Runtime service is intentionally plain ESM shared by Node and Vite.
import { __musicPublishTest, publishYoutubeMusic } from './music-publish.mjs';

describe('music publish service', () => {
  it('reads plain and fenced Qwen JSON', () => {
    expect(__musicPublishTest.extractJson('{"title":"Song"}')).toEqual({ title: 'Song' });
    expect(__musicPublishTest.extractJson('```json\n{"artist":"Artist"}\n```')).toEqual({ artist: 'Artist' });
  });

  it('rejects non-YouTube inputs before starting the media pipeline', async () => {
    await expect(publishYoutubeMusic({ youtubeUrl: 'https://example.com/audio' }, { env: {}, qwen: {} })).rejects.toThrow('youtube_url_invalid');
  });
});
