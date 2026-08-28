import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MapLayerSkillProps } from '../lib/skills/mapLayers';
import type {
  GeoMarkerHandle,
  GeoPopupHandle,
} from '../lib/maps/runtime';
import {
  isCitySoundsVisible,
  listSoundObservations,
  subscribeCitySounds,
} from '../lib/skills/city-sounds/store';
import {
  formatSoundDuration,
  SOUND_CATEGORY_COLOR,
  SOUND_CATEGORY_GLYPH,
  SOUND_CATEGORY_LABEL,
  type SoundObservation,
} from '../lib/skills/city-sounds/types';

export default function CitySoundLayer({
  mapRef,
  mapReady,
  markerZooms,
}: MapLayerSkillProps) {
  const [, refresh] = useState(0);
  const markersRef = useRef<Map<string, GeoMarkerHandle>>(new Map());
  const popupRef = useRef<GeoPopupHandle | null>(null);
  const [detail, setDetail] = useState<SoundObservation | null>(null);
  const [popupElement, setPopupElement] = useState<HTMLDivElement | null>(null);

  useEffect(
    () => subscribeCitySounds(() => refresh((value) => value + 1)),
    [],
  );

  const visible = isCitySoundsVisible();
  const observations = listSoundObservations().filter(
    (observation) => observation.location,
  );
  const markerKey = observations
    .map(
      (observation) =>
        `${observation.id}:${observation.location?.lng}:${observation.location?.lat}`,
    )
    .join(',');

  useEffect(() => {
    if (!visible) setDetail(null);
  }, [visible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();
    if (!visible) return;

    observations.forEach((observation) => {
      if (!observation.location) return;
      const element = buildSoundMarker(observation, () =>
        setDetail(observation),
      );
      markersRef.current.set(
        observation.id,
        map.createMarker({
          element,
          position: [observation.location.lng, observation.location.lat],
          zooms: markerZooms,
        }),
      );
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, mapRef, markerKey, markerZooms, visible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !detail?.location) return;
    const element = document.createElement('div');
    const popup = map.createPopup({
      element,
      position: [detail.location.lng, detail.location.lat],
      offset: 18,
      className: 'pe-city-sound-popup',
    });
    popupRef.current = popup;
    setPopupElement(element);
    return () => {
      popup.remove();
      popupRef.current = null;
      setPopupElement(null);
    };
  }, [detail, mapReady, mapRef]);

  return (
    <>
      {detail?.location && visible && popupElement && createPortal(
        <article className="w-[224px] border-2 border-black bg-white p-2 shadow-[3px_3px_0_#000]">
          <div className="flex items-start gap-2">
            <span
              className="grid h-6 w-6 shrink-0 place-items-center border-2 border-black text-[11px] font-bold"
              style={{ background: SOUND_CATEGORY_COLOR[detail.category] }}
            >
              {SOUND_CATEGORY_GLYPH[detail.category]}
            </span>
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-[11px]">
                {detail.title}
              </strong>
              <small className="block pt-0.5 text-[8px] text-black/50">
                {SOUND_CATEGORY_LABEL[detail.category]}
                {' · '}
                {formatSoundDuration(detail.durationMs)}
                {' · '}
                ±{Math.round(detail.location.accuracy)}m
              </small>
            </div>
            <button
              type="button"
              onClick={() => setDetail(null)}
              aria-label="关闭声音记录"
              className="grid h-5 w-5 shrink-0 place-items-center border border-black bg-black font-pixel text-[7px] text-[#54d6c7]"
            >
              ✕
            </button>
          </div>
          {detail.note && (
            <p className="mt-2 line-clamp-3 text-[9px] leading-relaxed text-black/65">
              {detail.note}
            </p>
          )}
          <div className="mt-2 border-t border-black/20 pt-1 font-pixel text-[5.5px] tracking-wider text-black/40">
            CITY SOUNDS · 高德实地点位
          </div>
        </article>,
        popupElement,
      )}
    </>
  );
}

function buildSoundMarker(
  observation: SoundObservation,
  onClick: () => void,
): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className =
    'grid h-[23px] w-[23px] place-items-center border-2 border-black text-[10px] font-bold shadow-[2px_2px_0_#000]';
  element.style.background = SOUND_CATEGORY_COLOR[observation.category];
  element.textContent = SOUND_CATEGORY_GLYPH[observation.category];
  element.title = `${observation.title} · ${SOUND_CATEGORY_LABEL[observation.category]}`;
  element.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return element;
}
