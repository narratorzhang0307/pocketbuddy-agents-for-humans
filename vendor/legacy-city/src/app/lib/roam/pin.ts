// 落点层：建议 → 用户确认 → 钉回地球（kind 'book'，与地球 tab 藏书票图层共用）。
// 前缀 ubk-roam-；amp:0 不抖散（漫游点位就是精确落点本身，只是坐标为约略值）。

import { isPinned, markPlace, unmarkPlace } from '../skills/markPlace';
import { ROAM_PIN_PREFIX, setPlaceSuggest } from './store';
import type { RoamBook, RoamPlace } from './types';
import { ROAM_STATUS_LABEL } from './types';
import { getBookDisplayTitle } from './bookTitle';

export interface RoamPinResult { pinned: boolean; reason?: 'needPlace' | 'exists' }

/** 确认一处建议：钉地球 + 状态置 confirmed */
export function confirmRoamPlace(book: RoamBook, place: RoamPlace): RoamPinResult {
  if (!place.geo) return { pinned: false, reason: 'needPlace' };
  const r = markPlace({
    kind: 'book',
    prefix: ROAM_PIN_PREFIX,
    key: place.id,
    label: `${place.name}｜${getBookDisplayTitle(book)}`,
    geo: { lat: place.geo.lat, lng: place.geo.lng },
    amp: 0,
    meta: {
      author: book.author,
      place: place.modernName || place.name,
      note: `${place.chapter ? `${place.chapter}：` : ''}${place.quote || place.note}`,
      roamBookId: book.id,
      roamPlaceId: place.id,
      roamStatus: place.status,
      roamStatusLabel: ROAM_STATUS_LABEL[place.status],
    },
  });
  if (r.pinned || r.reason === 'exists') setPlaceSuggest(place.id, 'confirmed');
  return r;
}

/** 撤销确认：从地球撤下 + 回到建议态 */
export function unconfirmRoamPlace(placeId: string) {
  unmarkPlace('book', ROAM_PIN_PREFIX, placeId);
  setPlaceSuggest(placeId, 'suggested');
}

/** 排除一处建议（已上图的先撤下） */
export function rejectRoamPlace(placeId: string) {
  unmarkPlace('book', ROAM_PIN_PREFIX, placeId);
  setPlaceSuggest(placeId, 'rejected');
}

export function isRoamPlacePinned(placeId: string): boolean {
  return isPinned('book', ROAM_PIN_PREFIX, placeId);
}
