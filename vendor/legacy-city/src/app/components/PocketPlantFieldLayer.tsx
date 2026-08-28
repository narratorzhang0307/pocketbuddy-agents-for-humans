import { useEffect, useMemo } from 'react';
import { createPocketPlantField } from '../lib/pocket-plants/catalog';
import type { CityMapRuntime } from '../lib/maps/runtime';
import './PocketPlantFieldLayer.css';

type PocketPlantFieldLayerProps = {
  map: CityMapRuntime | null;
};

const markerScaleForZoom = (zoom: number) =>
  Math.min(1.18, Math.max(0.68, 0.78 + (zoom - 15) * 0.12));

export default function PocketPlantFieldLayer({ map }: PocketPlantFieldLayerProps) {
  const field = useMemo(() => createPocketPlantField(), []);

  useEffect(() => {
    if (!map) return;

    const entries = field.map((plant) => {
      const host = document.createElement('div');
      host.className = 'pocket-plant-field-marker';
      host.dataset.pocketPlantId = plant.id;
      host.dataset.plantingPocketId = plant.plantingPocketId;
      host.title = plant.asset.name;
      host.style.width = `${plant.size}px`;
      host.style.height = `${Math.round(plant.size * 1.42)}px`;
      host.style.setProperty('--plant-lean', `${plant.lean.toFixed(2)}deg`);
      host.style.setProperty('--plant-sway', `${plant.swayDuration.toFixed(2)}s`);
      host.style.setProperty('--plant-delay', `${plant.swayDelay.toFixed(2)}s`);

      const image = document.createElement('img');
      image.src = plant.asset.src;
      image.alt = '';
      image.decoding = 'async';
      image.draggable = false;
      host.append(image);

      return {
        host,
        marker: map.createMarker({
          element: host,
          position: plant.position,
          anchor: 'bottom-center',
          zIndex: 205,
        }),
      };
    });

    const syncScale = () => {
      const scale = markerScaleForZoom(map.getZoom()).toFixed(3);
      entries.forEach(({ host }) => host.style.setProperty('--map-scale', scale));
    };
    map.on('move', syncScale);
    syncScale();
    map.flyTo({ center: [120.103466, 30.314301], zoom: 17, duration: 700 });

    return () => {
      map.off('move', syncScale);
      entries.forEach(({ marker }) => marker.remove());
    };
  }, [field, map]);

  return null;
}
