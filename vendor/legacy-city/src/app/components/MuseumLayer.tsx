// 杭州博物馆地图 .skill · 地图图层：把精选好馆钉上漫游地图（场馆本位，与展览图层互补）。
// 钤印式标记（菱形印章）：S 镇馆级=朱砂印（常亮呼吸圈）、A 高水准=青瓷印、B 顺路=素白印；
// 今天闭馆挂「休」角标（周一白跑警示）；馆内重磅特展临闭幕挂红色 D-N 角标。
// 点标记 → 锚在该标记上的浮框馆卡（随图移动、不压图例）；图鉴页在 MuseumBrowser。
// 本组件由 MapSkillsLegend 按注册表挂载，地图宿主只认识注册表。
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MapLayerSkillProps } from '../lib/skills/mapLayers';
import type {
  GeoMarkerHandle,
  GeoPopupHandle,
} from '../lib/maps/runtime';
import {
  hideMuseum, isMuseumBrowserOpen, isMuseumLayerVisible, listMuseums,
  removeImportedMuseum, setMuseumBrowserOpen, subscribeMuseumSkill,
} from '../lib/skills/hangzhou-museums/store';
import { HANGZHOU_MUSEUM_SKILL } from '../lib/skills/hangzhou-museums/catalog';
import {
  closedDayLabel, isClosedToday, liveShows, showDaysLeft, urgentShowDays,
  type MuseumEntry, type MuseumTier,
} from '../lib/skills/hangzhou-museums/types';
import MuseumBrowser from './MuseumBrowser';

const YAHEI = "'Microsoft YaHei','微软雅黑','PingFang SC','Heiti SC',sans-serif";

// 朱砂印 / 青瓷釉 / 素白——博物馆的三色（与展览图层的金/紫/白并列成一套图鉴）
export const MTIER_COLOR: Record<MuseumTier, string> = { S: '#e0502e', A: '#8fc1a9', B: '#ffffff' };
export const MTIER_LABEL: Record<MuseumTier, string> = { S: '镇馆级', A: '高水准', B: '顺路看' };

const URGENT_DAYS = HANGZHOU_MUSEUM_SKILL.rules.urgentWithinDays;

export default function MuseumLayer({
  mapRef,
  mapReady,
  markerZooms,
}: MapLayerSkillProps) {
  const [, bump] = useState(0);
  useEffect(() => subscribeMuseumSkill(() => bump((v) => v + 1)), []);
  const markersRef = useRef<Map<string, GeoMarkerHandle>>(new Map());
  const [detail, setDetail] = useState<MuseumEntry | null>(null);
  // 馆卡的家：常驻 DOM 节点交给当前地图运行时托管，用 portal 渲染 React 卡片。
  const popupRef = useRef<GeoPopupHandle | null>(null);
  const popupNodeRef = useRef<HTMLDivElement | null>(null);
  if (popupNodeRef.current === null) popupNodeRef.current = document.createElement('div');

  const visible = isMuseumLayerVisible();
  const entries = listMuseums();
  const markerKey = entries
    .map((entry) => `${entry.id}:${entry.lng.toFixed(6)}:${entry.lat.toFixed(6)}`)
    .join(',');

  useEffect(() => {
    if (!visible) setDetail(null);
  }, [visible]);

  // —— 标记同步（增删随目录/开关走，diff by id，同展览图层模式）——
  useEffect(() => {
    const m = mapRef.current;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();
    if (!m || !mapReady) return;
    const want = visible ? entries : [];
    for (const e of want) {
      if (!Number.isFinite(e.lng) || !Number.isFinite(e.lat) || (e.lng === 0 && e.lat === 0)) continue;
      const el = buildSealEl(e, () => setDetail(e));
      markersRef.current.set(
        e.id,
        m.createMarker({
          element: el,
          position: [e.lng, e.lat],
          zooms: markerZooms,
        }),
      );
    }
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, visible, markerKey, mapRef, markerZooms]);

  // 卸载组件（切城市不卸载——地图常驻；仅整组件树卸载时清扫）
  useEffect(() => () => {
    markersRef.current.forEach((mk) => mk.remove());
    markersRef.current.clear();
  }, []);

  // 馆卡浮框：随选中的馆锚在其经纬度上，随地图缩放平移一起走。
  // 图层关灯 / 无坐标 / 无选中 → 收起浮框。
  useEffect(() => {
    const m = mapRef.current;
    popupRef.current?.remove();
    popupRef.current = null;
    if (!m || !mapReady) return;
    const geoOK = !!detail && Number.isFinite(detail.lng) && Number.isFinite(detail.lat) && !(detail.lng === 0 && detail.lat === 0);
    if (!detail || !visible || !geoOK) return;
    const popup = m.createPopup({
      element: popupNodeRef.current!,
      position: [detail.lng, detail.lat],
      offset: 16,
      className: 'museum-popup',
    });
    popupRef.current = popup;
    return () => {
      popup.remove();
      if (popupRef.current === popup) popupRef.current = null;
    };
  }, [detail, visible, mapReady, mapRef]);

  // 卸载清扫浮框
  useEffect(() => () => { popupRef.current?.remove(); popupRef.current = null; }, []);

  // 图鉴页「去地图↗」：镜头飞过去 + 开馆卡
  const focus = (e: MuseumEntry) => {
    setMuseumBrowserOpen(false);
    setDetail(e);
    mapRef.current?.flyTo({ center: [e.lng, e.lat], zoom: 14.5, duration: 800 });
  };

  const urgentLeft = detail ? urgentShowDays(detail, URGENT_DAYS) : null;
  const detailShows = detail ? liveShows(detail) : [];

  return (
    <>
      {/* 馆卡：紧凑浮框，用 portal 渲染进 Popup 的常驻节点——框附在被点标记附近、随图走，不再压图例/名签 */}
      {detail && visible && popupNodeRef.current && createPortal(
        <div className="border-2 border-black bg-white p-2.5 shadow-[3px_3px_0_#000]" style={{ width: 236 }}>
          <div className="flex items-start gap-2">
            <span className="shrink-0 font-pixel text-[8px] border-2 border-black px-1.5 py-1 mt-0.5"
              style={{ background: MTIER_COLOR[detail.tier], color: detail.tier === 'S' ? '#fff' : '#000' }}>
              {detail.tier === 'S' ? '✦ S' : detail.tier}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-bold leading-snug">{detail.name}</div>
              <div className="text-[9.5px] text-black/55 mt-0.5" style={{ fontFamily: YAHEI }}>
                {[detail.area, detail.ticket, closedDayLabel(detail)].filter(Boolean).join(' · ') || '信息待核'}
              </div>
            </div>
            <button onClick={() => setDetail(null)} aria-label="关闭博物馆详情"
              className="shrink-0 font-pixel text-[7px] border border-black bg-black text-[#7CFF6B] px-2 py-1 active:translate-y-px">关闭</button>
          </div>
          {isClosedToday(detail) && (
            <div className="mt-1.5 border border-black bg-[#EAEAEA] px-2 py-1 text-[9.5px] font-bold text-black/70" style={{ fontFamily: YAHEI }}>
              休 今天闭馆——改天再去，别白跑
            </div>
          )}
          {urgentLeft !== null && (
            <div className="mt-1.5 border border-[#ff5a5a] bg-[#ff5a5a]/10 px-2 py-1 text-[9.5px] font-bold text-[#c0392b]" style={{ fontFamily: YAHEI }}>
              ⚠ 馆内重磅特展{urgentLeft === 0 ? '今天最后一天' : `还剩 ${urgentLeft} 天`}——别错过
            </div>
          )}
          {detail.blurb && (
            <div className="mt-1.5 pl-2 border-l-2 text-[10.5px] text-black/75 leading-snug"
              style={{ borderColor: MTIER_COLOR[detail.tier] === '#ffffff' ? '#000' : MTIER_COLOR[detail.tier], fontFamily: YAHEI }}>
              {detail.blurb}
            </div>
          )}
          {(detail.treasures?.length ?? 0) > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {detail.treasures!.slice(0, 4).map((t) => (
                <span key={t} className="border border-black bg-[#f5efdf] px-1.5 py-0.5 text-[9px] font-bold" style={{ fontFamily: YAHEI }}>
                  宝 {t}
                </span>
              ))}
            </div>
          )}
          {detailShows.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {detailShows.slice(0, 3).map((s) => {
                const left = showDaysLeft(s);
                const closing = s.major && left !== null && left <= URGENT_DAYS;
                return (
                  <div key={s.title} className="flex items-center gap-1.5 text-[9.5px]" style={{ fontFamily: YAHEI }}>
                    <span className={`shrink-0 font-pixel text-[6px] border border-black px-1 py-0.5 ${closing ? 'bg-[#ff5a5a] text-white' : 'bg-white'}`}>
                      {closing ? (left === 0 ? 'LAST' : `D-${left}`) : '在展'}
                    </span>
                    <span className="truncate text-black/75">{s.title}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[9px] text-black/45" style={{ fontFamily: YAHEI }}>
              {detail.source === 'screenshot' ? '截图导入' : '已核实'}
              {detail.confidence !== 'high' ? '（信息待核）' : ''}
            </span>
            <div className="ml-auto shrink-0">
              {detail.source === 'screenshot' ? (
                <button onClick={() => { removeImportedMuseum(detail.id); setDetail(null); }}
                  className="font-pixel text-[7px] border border-black bg-white text-[#c0392b] px-2 py-1 active:translate-y-px">移除</button>
              ) : (
                <button onClick={() => { hideMuseum(detail.id); setDetail(null); }}
                  className="font-pixel text-[7px] border border-black bg-white text-black/55 px-2 py-1 active:translate-y-px">去过了 · 隐藏</button>
              )}
            </div>
          </div>
        </div>,
        popupNodeRef.current,
      )}

      {/* 图鉴页（列表 / 截图导入 / 规则），全屏 overlay */}
      {isMuseumBrowserOpen() && <MuseumBrowser onFocus={focus} />}
    </>
  );
}

// —— 钤印式标记 DOM（菱形印章：S 朱砂+呼吸圈 / A 青瓷 / B 素白 + 「休」与 D-N 角标 + 名签）——
function buildSealEl(
  e: MuseumEntry,
  onClick: () => void,
): HTMLButtonElement {
  const urgentLeft = urgentShowDays(e, URGENT_DAYS);
  const closed = isClosedToday(e);
  const size = e.tier === 'S' ? 30 : e.tier === 'A' ? 26 : 22;

  const el = document.createElement('button');
  el.type = 'button';
  el.className =
    'relative cursor-pointer border-0 bg-transparent p-0 text-left touch-manipulation';
  el.setAttribute('aria-label', `查看博物馆详情：${e.name}`);
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.zIndex = e.tier === 'S' ? '2' : '1';

  if (e.tier === 'S') {
    const ring = document.createElement('div');
    ring.className = 'absolute inset-0 animate-ping';
    ring.style.background = MTIER_COLOR.S;
    ring.style.opacity = '0.55';
    ring.style.transform = 'rotate(45deg)';
    el.appendChild(ring);
  }

  // 印面：方章转 45° 成菱形，外黑框 + 内衬白线——博物馆就是一枚收藏印钤在城市上
  const core = document.createElement('div');
  core.className = 'absolute inset-0 border-2 border-black flex items-center justify-center font-bold select-none';
  core.style.background = MTIER_COLOR[e.tier];
  core.style.transform = 'rotate(45deg)';
  core.style.boxShadow = 'inset 0 0 0 2px rgba(255,255,255,0.7), 2px 2px 0 rgba(0,0,0,0.5)';
  const glyph = document.createElement('span');
  glyph.style.transform = 'rotate(-45deg)';
  glyph.style.fontFamily = YAHEI;
  glyph.style.fontSize = e.tier === 'S' ? '12px' : '10px';
  glyph.style.color = e.tier === 'S' ? '#fff' : '#000';
  glyph.textContent = '博';
  core.appendChild(glyph);
  el.appendChild(core);

  if (closed) {
    const rest = document.createElement('div');
    rest.className = 'absolute font-bold border border-black';
    rest.style.top = '-9px';
    rest.style.left = '-11px';
    rest.style.background = '#EAEAEA';
    rest.style.color = '#000';
    rest.style.fontSize = '8px';
    rest.style.lineHeight = '1';
    rest.style.padding = '2px 3px';
    rest.style.fontFamily = YAHEI;
    rest.textContent = '休';
    el.appendChild(rest);
  }

  if (urgentLeft !== null) {
    const chip = document.createElement('div');
    chip.className = 'absolute font-pixel border border-black';
    chip.style.top = '-9px';
    chip.style.right = '-12px';
    chip.style.background = '#ff5a5a';
    chip.style.color = '#fff';
    chip.style.fontSize = '6px';
    chip.style.padding = '2px 3px';
    chip.textContent = urgentLeft === 0 ? 'LAST' : `D-${urgentLeft}`;
    el.appendChild(chip);
  }

  const tag = document.createElement('div');
  tag.className = 'absolute left-1/2 whitespace-nowrap bg-white border border-black px-1 py-0.5 text-[8px] font-bold shadow-[1px_1px_0_#000] pointer-events-none';
  tag.style.top = 'calc(100% + 5px)';
  tag.style.transform = 'translateX(-50%)';
  tag.style.fontFamily = YAHEI;
  tag.textContent = e.name.length > 10 ? `${e.name.slice(0, 10)}…` : e.name;
  el.appendChild(tag);

  el.addEventListener('pointerdown', (event) => event.stopPropagation());
  el.addEventListener('click', (ev) => { ev.stopPropagation(); onClick(); });
  return el;
}
