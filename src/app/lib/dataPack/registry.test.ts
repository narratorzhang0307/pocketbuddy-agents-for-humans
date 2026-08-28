import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataPackDomain, InstalledDataPack } from './types';

const db = vi.hoisted(() => new Map<string, InstalledDataPack>());

vi.mock('./idb', () => ({
  getInstalledPack: vi.fn(async (key: string) => db.get(key) || null),
  putInstalledPack: vi.fn(async (pack: InstalledDataPack) => { db.set(pack.packKey, pack); }),
  deleteInstalledPack: vi.fn(async (key: string) => { db.delete(key); }),
  listInstalledPacks: vi.fn(async (domain?: DataPackDomain) => [...db.values()].filter((pack) => !domain || pack.domain === domain)),
}));

const adapter = {
  books: { schema: 'pocket.books/v1', skill: 'pocket.books' },
  movies: { schema: 'pocket.movies/v1', skill: 'pocket.movies' },
  music: { schema: 'pocket.music/v1', skill: 'pocket.music' },
  mapping: { schema: 'pocket.mapping/v1', skill: 'pocket.mapping' },
} as const;

const bundle = (domain: DataPackDomain) => ({
  protocol: 'pocket-data/v1',
  identity: { id: `earth.pocket.demo.${domain}`, name: `${domain} demo`, version: '1.0.0', author: 'Pocket Earth', description: '' },
  schema: { name: adapter[domain].schema, version: '1.0.0', record_count: 0 },
  compatibility: { skills: [adapter[domain].skill], runtime_min: '1.0.0' },
  privacy: 'public',
  provenance: { source: 'unit test', license: 'test-only', generated_at: '2026-08-10T00:00:00.000Z' },
  distribution: { mode: 'inline' },
  records: [],
});

describe('Data Pack demo restore', () => {
  beforeEach(() => {
    vi.resetModules();
    db.clear();
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
      clear: () => storage.clear(),
    });
    vi.stubGlobal('location', { href: 'http://127.0.0.1:5178/' });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const domain: DataPackDomain = url.includes('pocket-earth-books') ? 'books' : url.includes('pocket-earth-movies') ? 'movies' : 'music';
      return new Response(JSON.stringify(bundle(domain)), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
  });

  it('turns one library off without deleting its cache, then restores all three from cache', async () => {
    const registry = await import('./registry');
    const mapLayer = await import('./mapLayer');
    const idb = await import('./idb');

    const initial = await registry.restoreDemoDataPacks();
    expect(Object.keys(initial)).toEqual(['books', 'movies', 'music']);
    expect(mapLayer.isDataPackMapLayerEnabled('books')).toBe(true);

    vi.mocked(fetch).mockClear();
    await registry.deactivateDataPack('books');
    expect(registry.getDataPackState('books').active).toBeNull();
    expect(mapLayer.isDataPackMapLayerEnabled('books')).toBe(false);
    expect(await idb.getInstalledPack(initial.books.packKey)).toEqual(initial.books);

    await registry.installDefaultDataPack('books');
    expect(fetch).not.toHaveBeenCalled();
    expect(registry.getDataPackState('books').active?.packKey).toBe(initial.books.packKey);
    expect(mapLayer.isDataPackMapLayerEnabled('books')).toBe(false);

    await registry.deactivateDataPack('books');
    await registry.restoreDemoDataPacks();
    expect(fetch).not.toHaveBeenCalled();
    for (const domain of ['books', 'movies', 'music'] as const) {
      expect(registry.getDataPackState(domain).active?.domain).toBe(domain);
      expect(mapLayer.isDataPackMapLayerEnabled(domain)).toBe(true);
    }
  });

  it('uses bundled verified libraries by default and honors explicit web releases', async () => {
    const { BUNDLED_DATA_PACK_URLS, DEFAULT_DATA_PACK_URLS, defaultDataPackUrlFor } = await import('./registry');
    const remote = 'https://example.com/music/manifest.json';
    expect(defaultDataPackUrlFor('music', remote, true)).toBe('/data-packs/pocket-earth-music/1.0.0/bundle.json');
    expect(defaultDataPackUrlFor('music', remote, false)).toBe(remote);
    for (const domain of ['books', 'movies', 'music'] as const) {
      expect(DEFAULT_DATA_PACK_URLS[domain]).toBe(BUNDLED_DATA_PACK_URLS[domain]);
    }
  });
});
