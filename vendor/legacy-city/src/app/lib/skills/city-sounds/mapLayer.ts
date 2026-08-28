import CitySoundLayer from '../../../components/CitySoundLayer';
import type { MapLayerSkillDescriptor } from '../mapLayers';
import { focusFromSkillCoordinates } from '../mapSkillFocus';
import {
  isCitySoundsLoaded,
  isCitySoundsVisible,
  listSoundObservations,
  setCitySoundsLoaded,
  setCitySoundsVisible,
  subscribeCitySounds,
} from './store';

export const CITY_SOUND_LAYER_SKILL: MapLayerSkillDescriptor = {
  id: 'city-sounds-skill',
  displayName: '城市声音地图',
  legendLabel: '声音',
  color: '#54d6c7',
  worldScope: 'personal',
  isLoaded: isCitySoundsLoaded,
  setLoaded: setCitySoundsLoaded,
  isVisible: isCitySoundsVisible,
  setVisible: setCitySoundsVisible,
  count: () =>
    listSoundObservations().filter((observation) => observation.location).length,
  focus: () => focusFromSkillCoordinates(
    listSoundObservations().map((observation) => observation.location),
  ),
  subscribe: subscribeCitySounds,
  Layer: CitySoundLayer,
};
