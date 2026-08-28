// 地图 Skill 图层宿主：只负责按注册表挂载/卸载图层，不负责控制台 UI。
// Mapping 与中间地图共用同一个宿主，因此新增 Skill 只需登记到 mapLayers.ts，
// 两张地图不再分别复制具体图层组件。
import { memo, useEffect, useReducer } from 'react';
import {
  MAP_LAYER_SKILLS,
  type MapLayerSkillDescriptor,
  type MapLayerSkillProps,
} from '../lib/skills/mapLayers';
import {
  isCitySkillInstalled,
  isCitySkillPublished,
  subscribeCitySkills,
} from '../lib/city-world/skills';
import { PUBLIC_BLOOM_MEDIUM_ZOOM } from '../lib/city-world/selectors';
import type { WorldLayer } from '../lib/city-world/types';
import { isMapSkillAvailableInWorld } from '../lib/skills/worldLayer';

type MapSkillLayerHostProps = MapLayerSkillProps & {
  skills?: readonly MapLayerSkillDescriptor[];
  worldLayer?: WorldLayer;
};

const CITY_SKILL_MARKER_ZOOMS: [number, number] = [
  PUBLIC_BLOOM_MEDIUM_ZOOM,
  20,
];

function MapSkillLayerHost({
  mapRef,
  mapReady,
  skills = MAP_LAYER_SKILLS,
  worldLayer,
}: MapSkillLayerHostProps) {
  const [, refresh] = useReducer((value: number) => value + 1, 0);

  useEffect(() => {
    const unsubscribe = [
      ...skills.map((skill) => skill.subscribe(refresh)),
      subscribeCitySkills(refresh),
    ];
    return () => unsubscribe.forEach((off) => off());
  }, [skills]);

  return (
    <>
      {skills
        .filter(
          (skill) =>
            skill.isLoaded(worldLayer) &&
            isMapSkillAvailableInWorld(skill, worldLayer, {
              isInstalled: isCitySkillInstalled,
              isPublished: isCitySkillPublished,
            }),
        )
        .map((skill) => (
          <skill.Layer
            key={skill.id}
            mapRef={mapRef}
            mapReady={mapReady}
            markerZooms={
              worldLayer ? CITY_SKILL_MARKER_ZOOMS : undefined
            }
            worldLayer={worldLayer}
          />
        ))}
    </>
  );
}

export default memo(MapSkillLayerHost);
