// 杭州古建筑地图 .skill · 地图图层：把《武林梵志》领读的塔·幢·梵刹·造像钉上漫游地图。
// 标记语言：印章式方标按形制配色（塔朱/幢金/寺青/造像竹），尚存=实心、重建=虚线描边；
// 点标记 → 底部详情气泡（朝代/存废 + 逐字核验古志引文 + 考据小注）。
// 浏览页（按形制分卷·图鉴列表·去地图）在 ArchitectureBrowser。
// 本组件由 MapSkillsLegend 按注册表挂载，地图宿主只认识注册表（与 FlowerLayer 同构）。
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MapLayerSkillProps } from '../lib/skills/mapLayers';
import type {
  GeoMarkerHandle,
  GeoPopupHandle,
} from '../lib/maps/runtime';
import {
  isArchBrowserOpen, isArchLayerVisible, listVisibleArchSites,
  setArchBrowserOpen, subscribeArchSkill,
} from '../lib/skills/hangzhou-architecture/store';
import {
  KIND_COLOR, KIND_LABEL, KIND_MARK, STATUS_LABEL, type ArchSite,
} from '../lib/skills/hangzhou-architecture/types';
import ArchitectureBrowser from './ArchitectureBrowser';

const SONG = "'Songti SC','STSong','Source Han Serif SC','SimSun',serif";

// 详情卡经高德运行时锚在点位旁。

export default function ArchitectureLayer({
  mapRef,
  mapReady,
  markerZooms,
}: MapLayerSkillProps) {
  const [, bump] = useState(0);
  useEffect(() => subscribeArchSkill(() => bump((v) => v + 1)), []);
  const markersRef = useRef<Map<string, GeoMarkerHandle>>(new Map());
  const [detail, setDetail] = useState<ArchSite | null>(null);
  const popupRef = useRef<GeoPopupHandle | null>(null);
  const [popupEl, setPopupEl] = useState<HTMLDivElement | null>(null);

  // 详情气泡：Popup 锚在点位经纬度上，内容经 portal 走 React
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady || !detail) return;
    const el = document.createElement('div');
    const p = m.createPopup({
      element: el,
      position: [detail.lng, detail.lat],
      offset: 18,
      className: 'pe-arch-popup',
    });
    popupRef.current = p;
    setPopupEl(el);
    return () => { p.remove(); popupRef.current = null; setPopupEl(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, mapReady, mapRef]);

  const visible = isArchLayerVisible();
  const sites = listVisibleArchSites();

  useEffect(() => {
    if (!visible) setDetail(null);
  }, [visible]);

  // 标记全量重建（17 枚 DOM 标记很廉价，换来样式永远与开关一致，少一类陈旧态 bug）
  const markerKey = sites
    .map(
      (site) =>
        `${site.id}:${site.status}:${site.kind}:${site.lng.toFixed(6)}:${site.lat.toFixed(6)}`,
    )
    .join(',');
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady) return;
    markersRef.current.forEach((mk) => mk.remove());
    markersRef.current.clear();
    if (!visible) return;
    for (const s of sites) {
      if (!Number.isFinite(s.lng) || !Number.isFinite(s.lat)) continue;
      const el = buildMarkerEl(s, () => setDetail(s));
      markersRef.current.set(
        s.id,
        m.createMarker({
          element: el,
          position: [s.lng, s.lat],
          zooms: markerZooms,
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, visible, markerKey, mapRef, markerZooms]);

  // 整组件树卸载时清扫（与 FlowerLayer 同纪律）
  useEffect(() => () => {
    markersRef.current.forEach((mk) => mk.remove());
    markersRef.current.clear();
  }, []);

  // 浏览页「去地图↗」：镜头飞过去 + 开详情卡
  const focus = (s: ArchSite) => {
    setArchBrowserOpen(false);
    setDetail(s);
    mapRef.current?.flyTo({ center: [s.lng, s.lat], zoom: 14.5, duration: 800 });
  };

  return (
    <>
      {/* 古建筑详情气泡卡：锚在点位旁，跟点走（portal 进 Popup 容器） */}
      {detail && visible && popupEl && createPortal(
        <div
          className="w-[244px] border-2 border-black p-2.5 shadow-[3px_3px_0_#000]"
          style={{
            fontFamily: SONG,
            backgroundColor: '#fbf6e9',
            opacity: 1,
            isolation: 'isolate',
          }}
        >
          <div className="flex items-start gap-1.5">
            <span className="shrink-0 w-6 h-6 border-2 border-black flex items-center justify-center text-[13px] font-bold text-white mt-px"
              style={{ background: KIND_COLOR[detail.kind], borderRadius: 3 }}>
              {KIND_MARK[detail.kind]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold leading-tight text-[#2f2921]">
                {detail.name}
                {detail.modernName && <span className="text-[9px] text-black/45 font-normal"> · 今{detail.modernName}</span>}
              </div>
              <div className="text-[9px] text-black/55 mt-0.5">
                {KIND_LABEL[detail.kind]} · {detail.era} · <span style={{ color: detail.status === 'extant' ? '#3f7a4e' : '#b5402f' }}>{STATUS_LABEL[detail.status]}</span>
              </div>
            </div>
            <button onClick={() => setDetail(null)} aria-label="关闭古建筑详情"
              className="shrink-0 w-5 h-5 border border-black bg-black text-[#e8c06a] font-pixel text-[7px] flex items-center justify-center active:translate-y-px">✕</button>
          </div>

          {detail.quote && (
            <blockquote className="mt-2 pl-2 border-l-[3px] text-[11.5px] leading-snug text-[#3a2f22]" style={{ borderColor: '#b5402f' }}>
              {detail.quote}
              <div className="text-[8.5px] text-black/40 mt-0.5">——《武林梵志》{detail.chapter}</div>
            </blockquote>
          )}

          <div className="mt-2 text-[10.5px] text-black/72 leading-relaxed" style={{ display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {detail.note}
          </div>
        </div>,
        popupEl,
      )}

      {/* 浏览页（按形制分卷 · 图鉴 · 去地图），全屏 overlay */}
      {isArchBrowserOpen() && <ArchitectureBrowser onFocus={focus} />}
    </>
  );
}

// —— 印章式标记 DOM：方标按形制配色 + 形制字；尚存=实心 / 重建=虚线描边；名牌宋体 ——
function buildMarkerEl(
  site: ArchSite,
  onClick: () => void,
): HTMLButtonElement {
  const color = KIND_COLOR[site.kind];
  const rebuilt = site.status === 'rebuilt';
  const el = document.createElement('button');
  el.type = 'button';
  el.className =
    'relative cursor-pointer border-0 bg-transparent p-0 text-left touch-manipulation';
  el.setAttribute('aria-label', `查看古建筑详情：${site.name}`);

  const core = document.createElement('div');
  core.className = 'relative border-2 border-black flex items-center justify-center font-bold select-none';
  core.style.width = '22px';
  core.style.height = '22px';
  core.style.borderRadius = '3px';
  core.style.fontFamily = SONG;
  core.style.fontSize = '12px';
  core.style.boxShadow = '2px 2px 0 rgba(0,0,0,0.5)';
  if (rebuilt) {
    core.style.background = '#fff';
    core.style.color = color;
    core.style.borderStyle = 'dashed';
  } else {
    core.style.background = color;
    core.style.color = '#fff';
  }
  core.textContent = KIND_MARK[site.kind];
  el.appendChild(core);

  const tag = document.createElement('div');
  tag.className = 'absolute left-1/2 whitespace-nowrap bg-white border border-black px-1 py-0.5 text-[8.5px] font-bold shadow-[1px_1px_0_#000] pointer-events-none text-[#2f2921]';
  tag.style.top = 'calc(100% + 3px)';
  tag.style.transform = 'translateX(-50%)';
  tag.style.fontFamily = SONG;
  tag.textContent = site.name.length > 8 ? `${site.name.slice(0, 8)}…` : site.name;
  el.appendChild(tag);

  el.addEventListener('pointerdown', (event) => event.stopPropagation());
  el.addEventListener('click', (ev) => { ev.stopPropagation(); onClick(); });
  return el;
}
