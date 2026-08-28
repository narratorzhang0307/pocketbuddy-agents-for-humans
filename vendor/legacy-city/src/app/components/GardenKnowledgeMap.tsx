import { memo, useCallback, useState } from 'react';
import StreetGardenLab from './StreetGardenLab';
import PocketPlantFieldLayer from './PocketPlantFieldLayer';
import NatureSoundSudiPlantLayer from './NatureSoundSudiPlantLayer';
import {
  createAmapRuntime,
  type AmapMap,
} from '../lib/maps/amapRuntime';
import type { CityMapRuntime } from '../lib/maps/runtime';
import type { NatureSoundObservation } from '../lib/nature-sound/types';

type GardenKnowledgeMapProps = {
  onReady: (map: CityMapRuntime | null) => void;
  onLiveOutingChange?: (active: boolean) => void;
  voiceTreePlanting?: boolean;
  focusPocketPlantingId?: string | null;
  onOpenNatureCard?: (speciesId: string) => void;
  natureObservationFocus?: NatureSoundObservation | null;
};

// 公共街道首屏保留西湖与苏堤的空间关系，同时让默认声景路线更接近卡牌浏览尺度。
// GPS 校正后仍由实时位置接管。
const PUBLIC_STREET_CENTER: [number, number] = [120.1398, 30.2416];
const PUBLIC_STREET_ZOOM = 14;

/**
 * “公共街道”专用地图边界。高德负责公共底图、相机、角色与城市花园，
 * 组件本身不接受 personal worldLayer，避免私人知识覆盖物误入公共运行时。
 */
function GardenKnowledgeMap({
  onReady,
  onLiveOutingChange,
  voiceTreePlanting = false,
  focusPocketPlantingId,
  onOpenNatureCard,
  natureObservationFocus,
}: GardenKnowledgeMapProps) {
  const [mapRuntime, setMapRuntime] = useState<CityMapRuntime | null>(null);
  const searchParams =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search);
  const showPocketPlantField = searchParams?.get('pocketPlantField') === '1';
  const handleAmapReady = useCallback(
    (map: unknown | null) => {
      const runtime = map ? createAmapRuntime(map as AmapMap) : null;
      setMapRuntime(runtime);
      onReady(runtime);
    },
    [onReady],
  );

  return (
    <div className="absolute inset-0 z-0">
      <StreetGardenLab
        voiceTreePlanting={voiceTreePlanting}
        worldLayer="public"
        showLegacyGardenPlants={false}
        showResidentAgents={false}
        wildlifePresentation
        initialCenter={PUBLIC_STREET_CENTER}
        initialZoom={PUBLIC_STREET_ZOOM}
        initialPitch={0}
        initialRotation={0}
        staticPresentation
        focusPocketPlantingId={focusPocketPlantingId}
        onMapReady={handleAmapReady}
        onLiveOutingChange={onLiveOutingChange}
      />
      <NatureSoundSudiPlantLayer
        map={mapRuntime}
        onOpenNatureCard={onOpenNatureCard}
        focusObservation={natureObservationFocus}
      />
      {showPocketPlantField && <PocketPlantFieldLayer map={mapRuntime} />}
    </div>
  );
}

export default memo(GardenKnowledgeMap);
