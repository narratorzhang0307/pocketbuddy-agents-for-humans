import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { GeoMarkerHandle } from '../lib/maps/runtime';
import type { MapLayerSkillProps } from '../lib/skills/mapLayers';
import {
  isBookDataPackLayerVisible,
  listBookDataPackPoints,
  subscribeBookDataPackLayers,
  type BookDataPackPoint,
} from '../lib/skills/book-data-pack/store';

const MAX_VISIBLE_MARKERS = 120;

function markerElement(point: BookDataPackPoint, onOpen: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.title = `${point.title} · ${point.place}`;
  button.setAttribute('aria-label', `查看书籍 ${point.title}`);
  Object.assign(button.style, {
    width: '15px',
    height: '15px',
    border: '2px solid #111',
    borderRadius: '50%',
    background: '#b95d47',
    boxShadow: '2px 2px 0 #111',
    cursor: 'pointer',
  });
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onOpen();
  });
  return button;
}

export default function BookDataPackMapLayer({
  mapRef,
  mapReady,
  markerZooms,
  worldLayer = 'personal',
}: MapLayerSkillProps) {
  const [revision, refresh] = useState(0);
  const [viewportRevision, refreshViewport] = useState(0);
  const [selected, setSelected] = useState<BookDataPackPoint | null>(null);
  const markersRef = useRef<Map<string, GeoMarkerHandle>>(new Map());

  useEffect(() => subscribeBookDataPackLayers(() => refresh((value) => value + 1)), []);
  const visible = isBookDataPackLayerVisible(worldLayer);
  const allPoints = useMemo(() => listBookDataPackPoints(), [revision]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let timer = 0;
    const onMove = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => refreshViewport((value) => value + 1), 90);
    };
    map.on('move', onMove);
    return () => {
      window.clearTimeout(timer);
      map.off('move', onMove);
    };
  }, [mapReady, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();
    if (!visible) {
      setSelected(null);
      return;
    }

    const points = allPoints
      .filter((point) => map.getBounds().contains([point.lng, point.lat]))
      .slice(0, MAX_VISIBLE_MARKERS);
    points.forEach((point) => {
      const element = markerElement(point, () => setSelected(point));
      markersRef.current.set(point.id, map.createMarker({
        element,
        position: [point.lng, point.lat],
        anchor: 'center',
        zIndex: 111,
        zooms: markerZooms,
      }));
    });
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
    };
  }, [allPoints, mapReady, mapRef, markerZooms, viewportRevision, visible]);

  useEffect(() => () => {
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();
  }, []);

  if (!selected || !visible) return null;
  return (
    <section className="pointer-events-auto absolute inset-x-4 bottom-3 z-[46] mx-auto max-w-[560px] border-2 border-black bg-[#f5efdf] p-3 shadow-[4px_4px_0_#000]">
      <button
        type="button"
        aria-label="关闭书籍地点"
        onClick={() => setSelected(null)}
        className="absolute right-2 top-2 grid h-7 w-7 place-items-center border-2 border-black bg-white active:translate-y-px"
      >
        <X className="h-4 w-4" strokeWidth={3} />
      </button>
      <div className="pr-9 font-pixel text-[6px] tracking-widest text-[#9a4636]">CITY READING · 本机资料包</div>
      <h3 className="mt-1 text-[17px] font-black">{selected.title}</h3>
      <div className="mt-0.5 text-[9px] font-bold text-black/50">{selected.author || '作者待考'} · {selected.place}</div>
      <p className="mt-2 line-clamp-4 text-[10px] leading-relaxed text-black/65">{selected.synopsis || '这本书已落位到城市阅读图层。'}</p>
      <div className="mt-2 border-t border-black/20 pt-1.5 font-pixel text-[5px] text-black/45">
        {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)} · 同源 OSS 数据包
      </div>
    </section>
  );
}
