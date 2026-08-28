// 私人知识地图的电影 / 书重目录。
// 本文件必须只在用户启用对应 Skill 或点开对应标记后动态 import；不要从地图首屏静态导入。
import { MAP_MARKERS } from './mapMarkers';
import type { MoviePoint } from './movies';
import type { BookPoint } from './books';
import { importWithChunkRecovery } from '../lib/runtime/lazyRetry';

const movieById = new Map<string, MoviePoint>();
const bookById = new Map<string, BookPoint>();
let heavyLoaded = false;
let heavyPromise: Promise<void> | null = null;

export function ensureHeavyMarkers(): Promise<void> {
  if (heavyLoaded) return Promise.resolve();
  if (heavyPromise) return heavyPromise;
  heavyPromise = Promise.all([
    importWithChunkRecovery(() => import('./movies')),
    importWithChunkRecovery(() => import('./books')),
  ]).then(([movies, books]) => {
    for (const movie of movies.moviePoints) {
      const id = `mv-${movie.id}`;
      if (!movieById.has(id)) {
        MAP_MARKERS.push({ id, kind: 'movie', lat: movie.lat, lng: movie.lng, label: movie.title });
        movieById.set(id, movie);
      }
    }
    for (const book of books.bookPoints) {
      const id = `bk-${book.id}`;
      if (!bookById.has(id)) {
        MAP_MARKERS.push({ id, kind: 'book', lat: book.lat, lng: book.lng, label: book.title });
        bookById.set(id, book);
      }
    }
    heavyLoaded = true;
  }).catch((error) => {
    // 瞬时离线 / 旧 chunk 404 后允许下次重新尝试。
    heavyPromise = null;
    throw error;
  });
  return heavyPromise;
}

export async function getHeavyMarkerDetail(id: string, kind: 'movie' | 'book') {
  await ensureHeavyMarkers();
  return kind === 'movie' ? movieById.get(id) ?? null : bookById.get(id) ?? null;
}
