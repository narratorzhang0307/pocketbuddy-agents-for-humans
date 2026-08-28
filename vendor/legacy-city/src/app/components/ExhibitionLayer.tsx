// 杭州展览地图 .skill · 地图图层：把精选展讯钉上漫游地图。
// 画框式标记：S 殿堂级=金框✦（常亮呼吸圈）、A 高水准=紫框、B 顺路=白框；
// 闭幕倒计时（S/A 且 ≤ 提醒窗口）挂红色 D-N 角标——「7 月底就要闭幕的好展，别错过」。
// 点标记 → 底部详情卡；浏览页（列表/导入/规则）在 ExhibitionBrowser。
// 本组件由 MapSkillsLegend 按注册表挂载，地图宿主只认识注册表。
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MapLayerSkillProps } from '../lib/skills/mapLayers';
import type {
  GeoMarkerHandle,
  GeoPopupHandle,
  GeoPosition,
} from '../lib/maps/runtime';
import {
  hideExhibition, isExBrowserOpen, isExLayerVisible, listExhibitions,
  removeImportedExhibition, setExBrowserOpen, subscribeExhibitionSkill,
} from '../lib/skills/hangzhou-exhibitions/store';
import { HANGZHOU_EXHIBITION_SKILL } from '../lib/skills/hangzhou-exhibitions/catalog';
import { daysLeft, exStatus, type ExTier, type ExhibitionEntry } from '../lib/skills/hangzhou-exhibitions/types';
import ExhibitionBrowser from './ExhibitionBrowser';

const YAHEI = "'Microsoft YaHei','微软雅黑','PingFang SC','Heiti SC',sans-serif";

export const TIER_COLOR: Record<ExTier, string> = { S: '#ffd23d', A: '#b388ff', B: '#ffffff' };
export const TIER_LABEL: Record<ExTier, string> = { S: '殿堂级', A: '高水准', B: '顺路看' };

const URGENT_DAYS = HANGZHOU_EXHIBITION_SKILL.rules.urgentWithinDays;

/** 展期一行字：6.12 – 10.8（还剩 N 天 / 常设） */
function periodText(e: ExhibitionEntry): string {
  const fmt = (s?: string) => (s ? s.slice(5).replace('-', '.').replace(/^0/, '').replace(/\.0/, '.') : '');
  const range = e.dateStart || e.dateEnd ? `${fmt(e.dateStart)} – ${fmt(e.dateEnd) || '…'}` : '展期未知';
  const left = daysLeft(e);
  if (left === null) return e.dateStart ? range : `${range} · 常设/待核`;
  if (left < 0) return `${range} · 已闭幕`;
  if (left === 0) return `${range} · 今天最后一天！`;
  return `${range} · 还剩 ${left} 天`;
}

export default function ExhibitionLayer({
  mapRef,
  mapReady,
  markerZooms,
}: MapLayerSkillProps) {
  const [, bump] = useState(0);
  useEffect(() => subscribeExhibitionSkill(() => bump((v) => v + 1)), []);
  const markersRef = useRef<Map<string, GeoMarkerHandle>>(new Map());
  const popupRef = useRef<GeoPopupHandle | null>(null);
  const [detail, setDetail] = useState<ExhibitionEntry | null>(null);
  const [detailAnchor, setDetailAnchor] = useState<GeoPosition | null>(null);
  const [popupElement, setPopupElement] = useState<HTMLDivElement | null>(null);

  const visible = isExLayerVisible();
  const entries = listExhibitions();
  const markerKey = entries
    .map((entry) => `${entry.id}:${entry.lng.toFixed(6)}:${entry.lat.toFixed(6)}`)
    .join(',');

  useEffect(() => {
    if (!visible) setDetail(null);
  }, [visible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !visible || !detail) return;
    const element = document.createElement('div');
    const popup = map.createPopup({
      element,
      position: detailAnchor ?? [detail.lng, detail.lat],
      offset: 18,
      className: 'pe-exhibition-popup',
    });
    popupRef.current = popup;
    setPopupElement(element);
    return () => {
      popup.remove();
      if (popupRef.current === popup) popupRef.current = null;
      setPopupElement(null);
    };
  }, [detail, detailAnchor, mapReady, mapRef, visible]);

  // —— 标记同步（增删随目录/开关走，diff by id，同 cutouts 图层模式）——
  useEffect(() => {
    const m = mapRef.current;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();
    if (!m || !mapReady) return;
    const want = visible ? entries.filter((e) => Number.isFinite(e.lng) && Number.isFinite(e.lat) && !(e.lng === 0 && e.lat === 0)) : [];
    // 同馆多展抖散：同坐标（4 位小数）的展按序绕圈小幅偏移，名签不再互相叠死
    const groups = new Map<string, ExhibitionEntry[]>();
    for (const e of want) {
      const k = `${e.lng.toFixed(4)},${e.lat.toFixed(4)}`;
      const g = groups.get(k) ?? [];
      g.push(e);
      groups.set(k, g);
    }
    for (const g of groups.values()) {
      g.forEach((e, i) => {
        const spread = g.length > 1 ? [
          e.lng + 0.0022 * Math.cos((2 * Math.PI * i) / g.length),
          e.lat + 0.0015 * Math.sin((2 * Math.PI * i) / g.length),
        ] as [number, number] : [e.lng, e.lat] as [number, number];
        const el = buildMarkerEl(e, () => {
          setDetailAnchor(spread);
          setDetail(e);
          if (!m.getBounds().contains(spread)) {
            m.flyTo({ center: spread, zoom: 14.5, duration: 800 });
          }
        });
        markersRef.current.set(
          e.id,
          m.createMarker({
            element: el,
            position: spread,
            zooms: markerZooms,
          }),
        );
      });
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

  // 浏览页「去地图↗」：镜头飞过去 + 开详情卡
  const focus = (e: ExhibitionEntry) => {
    setExBrowserOpen(false);
    setDetailAnchor([e.lng, e.lat]);
    setDetail(e);
    mapRef.current?.flyTo({ center: [e.lng, e.lat], zoom: 14.5, duration: 800 });
  };

  const status = detail ? exStatus(detail, URGENT_DAYS) : null;
  const left = detail ? daysLeft(detail) : null;

  return (
    <>
      {/* 详情卡锚在展览点旁，随地图移动，不再覆盖底部 Skill 控制台。 */}
      {detail && visible && popupElement && createPortal(
        <div className="w-[244px] border-2 border-black bg-white p-2.5 shadow-[3px_3px_0_#000]">
          <div className="flex items-start gap-2">
            <span className="shrink-0 font-pixel text-[8px] border-2 border-black px-1.5 py-1 mt-0.5"
              style={{ background: TIER_COLOR[detail.tier], color: '#000' }}>
              {detail.tier === 'S' ? '✦ S' : detail.tier}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-bold leading-snug">{detail.title}</div>
              <div className="text-[9.5px] text-black/55 mt-0.5" style={{ fontFamily: YAHEI }}>
                {detail.venueName} · {periodText(detail)}
              </div>
            </div>
            <button onClick={() => setDetail(null)} aria-label="关闭展览详情"
              className="shrink-0 font-pixel text-[7px] border border-black bg-black text-[#7CFF6B] px-2 py-1 active:translate-y-px">关闭</button>
          </div>
          {status === 'closing' && (
            <div className="mt-1.5 border border-[#ff5a5a] bg-[#ff5a5a]/10 px-2 py-1 text-[9.5px] font-bold text-[#c0392b]" style={{ fontFamily: YAHEI }}>
              ⚠ 闭幕倒计时{left === 0 ? '：今天是最后一天' : `：还剩 ${left} 天`}——{TIER_LABEL[detail.tier]}，别错过
            </div>
          )}
          {detail.highlight && (
            <div className="mt-1.5 pl-2 border-l-2 text-[10.5px] text-black/75 leading-snug"
              style={{ borderColor: TIER_COLOR[detail.tier] === '#ffffff' ? '#000' : TIER_COLOR[detail.tier], fontFamily: YAHEI }}>
              {detail.highlight}
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[9px] text-black/45" style={{ fontFamily: YAHEI }}>
              {detail.ticket ? `票价 ${detail.ticket}` : '票价待核'}
              {detail.source === 'screenshot' ? ' · 截图导入' : ' · 已核实'}
              {detail.confidence !== 'high' ? '（信息待核）' : ''}
            </span>
            <div className="ml-auto shrink-0">
              {detail.source === 'screenshot' ? (
                <button onClick={() => { removeImportedExhibition(detail.id); setDetail(null); }}
                  className="font-pixel text-[7px] border border-black bg-white text-[#c0392b] px-2 py-1 active:translate-y-px">移除</button>
              ) : (
                <button onClick={() => { hideExhibition(detail.id); setDetail(null); }}
                  className="font-pixel text-[7px] border border-black bg-white text-black/55 px-2 py-1 active:translate-y-px">看过了 · 隐藏</button>
              )}
            </div>
          </div>
        </div>,
        popupElement,
      )}

      {/* 浏览页（列表 / 截图导入 / 规则），全屏 overlay */}
      {isExBrowserOpen() && <ExhibitionBrowser onFocus={focus} />}
    </>
  );
}

// —— 画框式标记 DOM（S 金✦ / A 紫 / B 白 + 闭幕角标 + 名签）——
function buildMarkerEl(
  e: ExhibitionEntry,
  onClick: () => void,
): HTMLButtonElement {
  const urgent = e.tier !== 'B' && exStatus(e, URGENT_DAYS) === 'closing';
  const left = daysLeft(e);
  const size = e.tier === 'S' ? 30 : e.tier === 'A' ? 26 : 22;

  const el = document.createElement('button');
  el.type = 'button';
  el.className =
    'relative cursor-pointer border-0 bg-transparent p-0 text-left touch-manipulation';
  el.setAttribute('aria-label', `查看展览详情：${e.title}`);
  el.style.zIndex = e.tier === 'S' ? '2' : '1';

  if (e.tier === 'S') {
    const ring = document.createElement('div');
    ring.className = 'absolute inset-0 animate-ping';
    ring.style.background = TIER_COLOR.S;
    ring.style.opacity = '0.6';
    el.appendChild(ring);
  }

  // 画框：外黑框 + 内衬白线，中间「展」/✦——展览就是一枚小画框钉在城市上
  const core = document.createElement('div');
  core.className = 'relative border-2 border-black flex items-center justify-center font-bold select-none';
  core.style.width = `${size}px`;
  core.style.height = `${size}px`;
  core.style.background = TIER_COLOR[e.tier];
  core.style.boxShadow = 'inset 0 0 0 2px rgba(255,255,255,0.75), 2px 2px 0 rgba(0,0,0,0.55)';
  core.style.fontFamily = YAHEI;
  core.style.fontSize = e.tier === 'S' ? '13px' : '11px';
  core.textContent = e.tier === 'S' ? '✦' : '展';
  el.appendChild(core);

  if (urgent && left !== null) {
    const chip = document.createElement('div');
    chip.className = 'absolute font-pixel border border-black';
    chip.style.top = '-9px';
    chip.style.right = '-12px';
    chip.style.background = '#ff5a5a';
    chip.style.color = '#fff';
    chip.style.fontSize = '6px';
    chip.style.padding = '2px 3px';
    chip.textContent = left === 0 ? 'LAST' : `D-${left}`;
    el.appendChild(chip);
  }

  const tag = document.createElement('div');
  tag.className = 'absolute left-1/2 whitespace-nowrap bg-white border border-black px-1 py-0.5 text-[8px] font-bold shadow-[1px_1px_0_#000] pointer-events-none';
  tag.style.top = 'calc(100% + 3px)';
  tag.style.transform = 'translateX(-50%)';
  tag.style.fontFamily = YAHEI;
  tag.textContent = e.title.length > 12 ? `${e.title.slice(0, 12)}…` : e.title;
  el.appendChild(tag);

  el.addEventListener('pointerdown', (event) => event.stopPropagation());
  el.addEventListener('click', (ev) => { ev.stopPropagation(); onClick(); });
  return el;
}
