import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { GeoMarkerHandle } from '../lib/maps/runtime';
import type { MapLayerSkillProps } from '../lib/skills/mapLayers';
import {
  getActiveCityContentPackId,
  isCityContentPacksVisible,
  listCityContentPackSpots,
  subscribeCityContentPacks,
} from '../lib/skills/city-content-packs/store';
import type { AtlasSpot } from '../lib/roam/atlas';

const STATUS_COLOR: Record<AtlasSpot['status'], string> = {
  extant: '#7CFF6B',
  rebuilt: '#ff8a3d',
  'memory-only': '#9aa7b5',
};

function markerElement(spot: AtlasSpot, onOpen: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.title = `${spot.city} · ${spot.name}`;
  button.setAttribute('aria-label', `查看 ${spot.city}${spot.name}`);
  Object.assign(button.style, {
    width: '13px',
    height: '13px',
    border: '2px solid #111',
    background: STATUS_COLOR[spot.status],
    boxShadow: '1px 1px 0 #111',
    cursor: 'pointer',
    transform: 'rotate(45deg)',
  });
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onOpen();
  });
  return button;
}

export default function CityContentPacksLayer({
  mapRef,
  mapReady,
  markerZooms,
  worldLayer = 'personal',
}: MapLayerSkillProps) {
  const [revision, refresh] = useState(0);
  useEffect(() => subscribeCityContentPacks(() => refresh((value) => value + 1)), []);
  const markersRef = useRef<Map<string, GeoMarkerHandle>>(new Map());
  const [selected, setSelected] = useState<AtlasSpot | null>(null);
  const activePackId = getActiveCityContentPackId(worldLayer);
  const visible = isCityContentPacksVisible(worldLayer);
  const spots = useMemo(
    () => visible ? listCityContentPackSpots(activePackId, worldLayer) : [],
    [activePackId, revision, visible, worldLayer],
  );
  const markerKey = spots.map((spot) => `${spot.key}:${spot.lng}:${spot.lat}`).join(',');

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();
    if (!visible) {
      setSelected(null);
      return;
    }
    for (const spot of spots) {
      const element = markerElement(spot, () => setSelected(spot));
      markersRef.current.set(spot.key, map.createMarker({
        element,
        position: [spot.lng, spot.lat],
        anchor: 'center',
        zIndex: 108,
        zooms: markerZooms,
      }));
    }
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
    };
    // markerKey contains every rendered coordinate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, mapRef, markerKey, markerZooms, visible]);

  useEffect(() => () => {
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();
  }, []);

  if (!selected || !visible) return null;
  return (
    <section className="absolute inset-x-4 bottom-3 z-[46] mx-auto max-w-[560px] border-2 border-black bg-[#f5efdf] p-3 shadow-[4px_4px_0_#000] pointer-events-auto">
      <button
        type="button"
        aria-label="关闭城市内容包地点"
        onClick={() => setSelected(null)}
        className="absolute right-2 top-2 grid h-7 w-7 place-items-center border-2 border-black bg-white active:translate-y-px"
      >
        <X className="h-4 w-4" strokeWidth={3} />
      </button>
      <div className="pr-9 font-pixel text-[6px] tracking-widest text-[#7b4434]">{selected.city} · CITY PACK</div>
      <h3 className="mt-1 text-[17px] font-black">{selected.name}</h3>
      {selected.modernName && <div className="mt-0.5 text-[9px] font-bold text-black/50">今 · {selected.modernName}</div>}
      <p className="mt-2 text-[10px] leading-relaxed text-black/65">{selected.note || selected.quote || '这条地理记录已通过坐标校验。'}</p>
      <div className="mt-2 border-t border-black/20 pt-1.5 font-pixel text-[5px] text-black/45">
        {selected.books.join(' · ')} · {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
      </div>
    </section>
  );
}
