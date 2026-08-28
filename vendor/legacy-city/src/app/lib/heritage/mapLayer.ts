import HeritageMapLayer from '../../components/HeritageMapLayer';
import type { MapLayerSkillDescriptor } from '../skills/mapLayers';
import { focusFromSkillCoordinates } from '../skills/mapSkillFocus';
import {
  isHeritageMapVisible, listHeritageRecords, setHeritageMapVisible, subscribeHeritageRecords,
} from './store';

export const HERITAGE_CAPTURE_LAYER_SKILL: MapLayerSkillDescriptor = {
  id: 'heritage-capture-map',
  displayName: '古籍与碑拓活化记录',
  legendLabel: '古籍活化',
  color: '#9e3c2f',
  isLoaded: () => true,
  setLoaded: (loaded) => { if (loaded) setHeritageMapVisible(true); },
  isVisible: isHeritageMapVisible,
  setVisible: setHeritageMapVisible,
  count: () => listHeritageRecords().filter((record) => record.geo).length,
  focus: () => focusFromSkillCoordinates(
    listHeritageRecords().map((record) => record.geo),
  ),
  canUnload: false,
  subscribe: subscribeHeritageRecords,
  worldScope: 'personal',
  Layer: HeritageMapLayer,
};
