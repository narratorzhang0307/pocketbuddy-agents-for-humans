import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { requestMappingPane } from '../data/mappingFocus';
import type { GeoMarkerHandle } from '../lib/maps/runtime';
import type { MapLayerSkillProps } from '../lib/skills/mapLayers';
import {
  consumeHeritageRecordFocus, isHeritageMapVisible, listHeritageRecords, subscribeHeritageRecords,
} from '../lib/heritage/store';
import type { HeritageRecord } from '../lib/heritage/types';

const PAPER = '#f5efdf';
const INK = '#2b2620';
const MINCHO = "'Huiwen Mincho Guji Standard','Huiwen Mincho Guji Standard Rare','Songti SC','STSong','Noto Serif CJK SC','Source Han Serif SC',serif";

export default function HeritageMapLayer({ mapRef, mapReady, markerZooms }: MapLayerSkillProps) {
  const [, refresh] = useState(0);
  const [selected, setSelected] = useState<HeritageRecord | null>(null);
  const markersRef = useRef<Map<string, GeoMarkerHandle>>(new Map());
  useEffect(() => subscribeHeritageRecords(() => refresh((value) => value + 1)), []);

  const visible = isHeritageMapVisible();
  const records = listHeritageRecords().filter((record) => record.geo);
  const markerKey = records.map((record) => `${record.id}:${record.geo!.lng}:${record.geo!.lat}`).join(',');

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();
    if (!visible) { setSelected(null); return; }
    records.forEach((record) => {
      const element = buildMarker(record, () => setSelected(record));
      markersRef.current.set(record.id, map.createMarker({
        element,
        position: [record.geo!.lng, record.geo!.lat],
        anchor: 'bottom-center',
        zIndex: 128,
        zooms: markerZooms,
      }));
    });
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
    };
    // markerKey 折叠了所有参与地图渲染的稳定字段。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, mapRef, markerKey, markerZooms, visible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !visible) return;
    const focusId = consumeHeritageRecordFocus();
    if (!focusId) return;
    const record = records.find((item) => item.id === focusId);
    if (!record?.geo) return;
    setSelected(record);
    map.flyTo({ center: [record.geo.lng, record.geo.lat], zoom: 16.4, duration: 900 });
  }, [mapReady, mapRef, markerKey, records, visible]);

  if (!visible || !selected) return null;

  const text = selected.result.punctuated || selected.result.visual.transcription;
  const isBook = selected.material === 'guji';
  return (
    <section className="absolute inset-x-4 bottom-4 z-[48] pointer-events-auto" onClick={(event) => event.stopPropagation()}>
      <div className={`relative mx-auto ${isBook ? 'w-[80%] max-w-[600px]' : 'w-[86%] max-w-[520px]'}`}>
        {isBook && (
          <>
            <img src="/assets/street-garden/ui/archive-hand-grip-v2.png" alt="" aria-hidden className="pointer-events-none absolute left-0 top-1/2 z-20 w-[42%] max-w-[132px] -translate-x-[82%] -translate-y-1/2 select-none" />
            <img src="/assets/street-garden/ui/archive-hand-grip-v2.png" alt="" aria-hidden className="pointer-events-none absolute right-0 top-1/2 z-20 w-[42%] max-w-[132px] translate-x-[82%] -translate-y-1/2 scale-x-[-1] select-none" />
          </>
        )}
        <button onClick={() => setSelected(null)} aria-label="关闭活化记录" className="absolute -right-2 -top-3 z-30 grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-[#43584f] text-white shadow-[2px_2px_0_rgba(0,0,0,.45)]">
          <X className="h-5 w-5" strokeWidth={3} />
        </button>
        <article className={`relative z-10 border-2 border-black shadow-[5px_6px_0_rgba(0,0,0,.58)] ${isBook ? 'bg-[#f5efdf]' : 'bg-[#20231f] text-[#f4f0dd]'}`} style={{ fontFamily: MINCHO }}>
          <div className="flex items-center gap-2 border-b border-current/25 px-3 py-2">
            <span className={`grid h-8 w-8 place-items-center border border-current text-[18px] ${isBook ? 'text-[#9e3c2f]' : ''}`}>{isBook ? '籍' : '拓'}</span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[13px] font-bold">{selected.title}</h3>
              <div className="mt-0.5 text-[8px] opacity-55">{selected.city} · {selected.scope === 'private' ? '我的漫步' : '公共层草稿'}</div>
            </div>
          </div>
          <div className="border-b border-current/20 px-3 py-2 font-sans">
            <div className="font-pixel text-[6px] tracking-wider opacity-55">KNOWLEDGE MAP · 采集坐标</div>
            <div className="mt-1 text-[9px] font-bold">{selected.locationLabel || `${selected.geo?.lng.toFixed(5)}, ${selected.geo?.lat.toFixed(5)}`}</div>
            <div className="mt-0.5 text-[7.5px] opacity-55">{selected.geo?.lng.toFixed(5)}, {selected.geo?.lat.toFixed(5)}</div>
          </div>
          {selected.sourceTitle && (
            <div className="border-b border-current/20 bg-[#eadfbe] px-3 py-2 font-sans text-[#2b2620]">
              <div className="font-pixel text-[6px] tracking-wider opacity-55">SOURCE · PUBLIC DOMAIN</div>
              <div className="mt-1 text-[8.5px] font-bold">{selected.sourceTitle}</div>
              <div className="mt-0.5 text-[7px] opacity-60">{selected.sourcePage} · {selected.evidenceMethod}</div>
            </div>
          )}
          <div className="flex gap-2 p-3">
            <img src={selected.enhancedUrl} alt="" className={`h-[112px] w-[82px] shrink-0 border border-current/30 object-cover ${isBook ? 'grayscale-[.35]' : 'grayscale'}`} />
            <div className="h-[112px] min-w-0 flex-1 overflow-x-auto text-[12px] leading-relaxed" style={{ writingMode: 'vertical-rl', color: isBook ? INK : undefined }}>
              {text.slice(0, 260)}
            </div>
          </div>
          {selected.result.modernText && (
            <div className="mx-3 mb-2 max-h-24 overflow-y-auto border-t border-current/20 pt-2 font-sans text-[9px] leading-relaxed">
              <div className="mb-1 font-pixel text-[6px] tracking-wider opacity-55">QWEN · 内容解释</div>
              <p className="opacity-75">{selected.result.modernText}</p>
              {selected.locationNote && <p className="mt-1.5 border-t border-current/15 pt-1.5 text-[7.5px] opacity-50">{selected.locationNote}</p>}
            </div>
          )}
          <div className="flex items-center gap-2 border-t border-current/20 px-3 py-2 font-sans">
            <span className="font-pixel text-[6px] tracking-wider opacity-55">{selected.result.adapter} · MNN</span>
            {selected.sourceUrl && <a href={selected.sourceUrl} target="_blank" rel="noreferrer" className="text-[6px] underline opacity-55">原扫描 ↗</a>}
            <button onClick={() => requestMappingPane('书籍')} className={`ml-auto border border-current px-2 py-1 font-pixel text-[6px] ${isBook ? 'bg-white' : 'bg-[#f4f0dd] text-black'}`}>回古籍工作台 ↗</button>
          </div>
        </article>
      </div>
    </section>
  );
}

function buildMarker(record: HeritageRecord, onOpen: () => void): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', `打开${record.title}`);
  button.style.cssText = [
    'width:30px', 'height:36px', 'display:grid', 'place-items:center', 'border:2px solid #000',
    `background:${record.material === 'guji' ? PAPER : '#20231f'}`,
    `color:${record.material === 'guji' ? '#9e3c2f' : '#f4f0dd'}`,
    'box-shadow:2px 3px 0 rgba(0,0,0,.72)', 'font-family:serif', 'font-size:18px', 'font-weight:800',
    'cursor:pointer',
  ].join(';');
  button.textContent = record.material === 'guji' ? '籍' : '拓';
  button.onclick = (event) => { event.stopPropagation(); onOpen(); };
  return button;
}
