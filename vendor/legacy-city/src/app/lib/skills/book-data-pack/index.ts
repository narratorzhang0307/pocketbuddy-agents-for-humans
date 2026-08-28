import BookDataPackMapLayer from '../../../components/BookDataPackMapLayer';
import type { MapLayerSkillDescriptor } from '../mapLayers';
import { focusFromSkillCoordinates } from '../mapSkillFocus';
import {
  isBookDataPackLayerLoaded,
  isBookDataPackLayerVisible,
  listBookDataPackPoints,
  loadBookDataPackLayer,
  setBookDataPackLayerVisible,
  subscribeBookDataPackLayers,
  unloadBookDataPackLayer,
} from './store';

export * from './store';

export const BOOK_DATA_PACK_LAYER_SKILL: MapLayerSkillDescriptor = {
  id: 'pocket-earth-books-map',
  displayName: 'Pocket Earth 城市阅读',
  legendLabel: '城市阅读',
  color: '#b388ff',
  worldScope: 'global',
  isLoaded: isBookDataPackLayerLoaded,
  setLoaded: (loaded, worldLayer = 'personal') => {
    if (loaded) void loadBookDataPackLayer(worldLayer);
    else unloadBookDataPackLayer(worldLayer);
  },
  isVisible: isBookDataPackLayerVisible,
  setVisible: setBookDataPackLayerVisible,
  count: () => listBookDataPackPoints().length,
  focus: () => focusFromSkillCoordinates(listBookDataPackPoints()),
  subscribe: subscribeBookDataPackLayers,
  Layer: BookDataPackMapLayer,
};
