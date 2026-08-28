import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, LocateFixed, MapPin, Sprout, Users, X } from 'lucide-react';
import { gcj02ToWgs84 } from '../lib/location/chinaCoordinates';
import type { CityMapRuntime, GeoMarkerHandle, GeoPosition } from '../lib/maps/runtime';
import { POCKET_PLANT_ASSETS } from '../lib/pocket-plants/catalog';
import {
  readPocketPlantings,
  type PocketPlanting,
} from '../lib/pocket-plants/planting';
import { requestStreetPane } from '../data/streetFocus';
import { mapMarkerScaleAtZoom } from '../lib/maps/gardenCamera';
import AmapEarth from './AmapEarth';
import './CityPlantingMap.css';

const HANGZHOU_CENTER = gcj02ToWgs84([120.1551, 30.2741]) as GeoPosition;

const hash = (value: string) => {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(result);
};

const mapPosition = (planting: PocketPlanting): GeoPosition =>
  gcj02ToWgs84(planting.position) as GeoPosition;

const mapViewFor = (plantings: readonly PocketPlanting[]) => {
  if (!plantings.length) return { center: HANGZHOU_CENTER, zoom: 11.6 };
  const positions = plantings.map(mapPosition);
  const lngs = positions.map(([lng]) => lng);
  const lats = positions.map(([, lat]) => lat);
  const spread = Math.max(
    Math.max(...lngs) - Math.min(...lngs),
    Math.max(...lats) - Math.min(...lats),
  );
  return {
    center: [
      lngs.reduce((sum, value) => sum + value, 0) / lngs.length,
      lats.reduce((sum, value) => sum + value, 0) / lats.length,
    ] as GeoPosition,
    zoom: spread < 0.015 ? 14.4 : spread < 0.05 ? 12.6 : spread < 0.12 ? 11.2 : 9.8,
  };
};

const markerScaleForZoom = (zoom: number) =>
  mapMarkerScaleAtZoom(zoom, 14.4, 0.08, 1.08);

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '种下时间未记录';
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
};

export default function CityPlantingMap() {
  const plantings = readPocketPlantings();
  const markerRefs = useRef(new Map<string, { host: HTMLButtonElement; handle: GeoMarkerHandle }>());
  const [map, setMap] = useState<CityMapRuntime | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const initialView = useMemo(() => mapViewFor(plantings), [plantings]);
  const plantingKey = plantings
    .map((planting) => `${planting.id}:${planting.assetId}:${planting.position.join(',')}`)
    .join('|');
  const selected = plantings.find((planting) => planting.id === selectedId) ?? null;
  const selectedAsset = selected
    ? POCKET_PLANT_ASSETS.find((asset) => asset.id === selected.assetId)
    : null;
  const publicCount = plantings.filter((planting) => planting.visibility === 'public').length;
  const visitCount = plantings.reduce((sum, planting) => sum + planting.revisitCount, 0);

  useEffect(() => {
    if (!map) return;
    markerRefs.current.forEach(({ handle }) => handle.remove());
    markerRefs.current.clear();

    plantings.forEach((planting) => {
      const asset = POCKET_PLANT_ASSETS.find((candidate) => candidate.id === planting.assetId);
      if (!asset) return;
      const host = document.createElement('button');
      host.type = 'button';
      host.className = 'city-planting-marker';
      host.dataset.plantingId = planting.id;
      host.dataset.selected = String(planting.id === selectedId);
      host.setAttribute('aria-label', `查看${asset.name}的种植记录`);
      host.style.setProperty('--plant-sway', `${4.8 + (hash(planting.id) % 28) / 10}s`);
      host.style.setProperty('--plant-delay', `${-(hash(`${planting.id}-delay`) % 40) / 10}s`);

      const visual = document.createElement('span');
      visual.className = 'city-planting-marker__visual';
      const image = document.createElement('img');
      image.src = asset.src;
      image.alt = '';
      image.decoding = 'async';
      image.draggable = false;
      const root = document.createElement('span');
      root.className = 'city-planting-marker__root';
      visual.append(image, root);
      host.append(visual);
      host.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setSelectedId(planting.id);
      });

      const handle = map.createMarker({
        element: host,
        position: mapPosition(planting),
        anchor: 'bottom-center',
        zIndex: planting.visibility === 'public' ? 285 : 275,
      });
      markerRefs.current.set(planting.id, { host, handle });
    });

    const syncScale = () => {
      const scale = markerScaleForZoom(map.getZoom()).toFixed(3);
      markerRefs.current.forEach(({ host }) => {
        host.style.setProperty('--garden-map-scale', scale);
      });
    };
    map.on('move', syncScale);
    syncScale();

    return () => {
      map.off('move', syncScale);
      markerRefs.current.forEach(({ handle }) => handle.remove());
      markerRefs.current.clear();
    };
    // The full stable marker signature is folded into plantingKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, plantingKey]);

  useEffect(() => {
    markerRefs.current.forEach(({ host }, id) => {
      host.dataset.selected = String(id === selectedId);
    });
  }, [selectedId]);

  const resetView = () => {
    map?.flyTo({ ...initialView, duration: 700 });
    setSelectedId(null);
  };

  return (
    <section className="city-planting-map" aria-label="我在城市里种下的植物地图">
      <AmapEarth
        center={initialView.center}
        zoom={initialView.zoom}
        onReady={setMap}
      />

      <header className="city-planting-map__summary">
        <div>
          <small>MY CITY ROOTS · 高德涂鸦地图</small>
          <strong>我在城市里种下的植物</strong>
        </div>
        <button type="button" onClick={resetView} aria-label="查看全部植物落位">
          <LocateFixed size={16} strokeWidth={2.8} />
        </button>
        <dl>
          <div><dt>{plantings.length}</dt><dd>已落位</dd></div>
          <div><dt>{publicCount}</dt><dd>城市可见</dd></div>
          <div><dt>{visitCount}</dt><dd>我的重访</dd></div>
        </dl>
      </header>

      {plantings.length === 0 && (
        <div className="city-planting-map__empty">
          <Sprout size={24} strokeWidth={2.2} />
          <strong>这张地图还没有植物落位</strong>
          <p>先挑一枚真实种子，再到城市地图上选择它的根。</p>
          <button type="button" onClick={() => requestStreetPane('种植物')}>去种下第一株</button>
        </div>
      )}

      {!selected && plantings.length > 0 && (
        <div className="city-planting-map__hint">
          <MapPin size={13} /> 轻点一株植物，查看它在城市里的记录
        </div>
      )}

      {selected && selectedAsset && (
        <article className="city-planting-map__card">
          <button type="button" className="city-planting-map__close" onClick={() => setSelectedId(null)} aria-label="收起植物记录">
            <X size={15} strokeWidth={3} />
          </button>
          <div className="city-planting-map__portrait">
            <img src={selectedAsset.src} alt={selectedAsset.name} />
          </div>
          <div className="city-planting-map__copy">
            <small>{selected.visibility === 'public' ? 'PUBLIC ROOT' : 'PRIVATE ROOT'} · {formatDate(selected.plantedAt)}</small>
            <h3>{selectedAsset.name}</h3>
            <em>{selectedAsset.scientificName}</em>
            <p className="city-planting-map__intro">{selectedAsset.description}</p>
            <p><MapPin size={11} />{selected.place}</p>
            {selected.sentence && <blockquote>“{selected.sentence}”</blockquote>}
            <div className="city-planting-map__facts">
              <span><Eye size={12} />重访 {selected.revisitCount}</span>
              <span><Users size={12} />来访 {selected.visitors.length}</span>
            </div>
          </div>
        </article>
      )}
    </section>
  );
}
