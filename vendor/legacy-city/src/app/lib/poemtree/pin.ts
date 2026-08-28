// 行动层：种诗到地球（suggest-then-confirm，用户确认才种）。写共享 userMarks(kind:'poemtree')，全字段进 meta。
// 复用 markPlace skill（与 movie/book/exhibition 同一套落点机制）；诗歌树自成一体，不与其他 agent 互相 import。
import { markPlace, isPinned, unmarkPlace } from '../skills/markPlace';
import type { PoemTree, PoemSpot } from './types';

const PREFIX = 'upt-';   // userMarks 里诗歌树钉的 id 前缀

export function alreadyPlanted(tree: PoemTree): boolean { return isPinned('poemtree', PREFIX, tree.id); }

// 种到地球：markPlace 落点（全字段进 meta 供地球详情读）。无坐标→needPlace 不种。
export function plantToEarth(tree: PoemTree, spot: PoemSpot): { pinned: boolean; reason?: 'needPlace' | 'exists' } {
  return markPlace({
    kind: 'poemtree', prefix: PREFIX, key: tree.id,
    label: tree.poem.poet || tree.poem.excerpt || '诗歌树',
    geo: { lat: spot.lat, lng: spot.lng },
    amp: 0.5,   // 同地多首诗密集，小抖散避重叠
    meta: {
      title: tree.poem.title || '', poet: tree.poem.poet || '', lines: tree.poem.lines, excerpt: tree.poem.excerpt || '',
      lux: tree.attributes.lux, temp: tree.attributes.temp, flux: tree.attributes.flux, grav: tree.attributes.grav,
      seed: tree.seed, videoUrl: tree.videoUrl || '', place: spot.place, source: tree.source,
    },
  });
}

export function unplant(tree: PoemTree): void { unmarkPlace('poemtree', PREFIX, tree.id); }
