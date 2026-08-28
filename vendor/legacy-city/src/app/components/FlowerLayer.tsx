// 杭州赏花地图 .skill · 地图图层：把四季花历钉上漫游地图。
// 花期感知的标记语言：在花/盛放 = 色底黑字挂名牌（此刻值得去），盛放另加呼吸圈与「花期倒计时」意味的常亮点；
// 将开/花隐 = 白底虚线小标安静待场——同一张地图，四季各有各的亮法。
// 点标记 → 底部详情卡（诗引/花量/热度）；导入点可「校正位置」拖到准处；
// 浏览页（四季册开关/花讯列表/截图导入/导出）在 FlowerBrowser。
// 本组件由 MapSkillsLegend 按注册表挂载，地图宿主只认识注册表（与 ExhibitionLayer 同构）。
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MapLayerSkillProps } from '../lib/skills/mapLayers';
import type {
  GeoMarkerHandle,
  GeoPopupHandle,
} from '../lib/maps/runtime';
import {
  isFlowerBrowserOpen, isFlowerLayerVisible, listVisibleFlowerSpots, removeImportedFlowerSpot,
  setFlowerBrowserOpen, subscribeFlowerSkill, updateImportedFlowerSpot, type FlowerSpotView,
} from '../lib/skills/hangzhou-flowers/store';
import { BLOOM_LABEL, CROWD_LABEL, MASS_LABEL, windowLabel } from '../lib/skills/hangzhou-flowers/types';
import FlowerBrowser from './FlowerBrowser';

const YAHEI = "'Microsoft YaHei','微软雅黑','PingFang SC','Heiti SC',sans-serif";

// 详情卡经高德运行时锚在点位旁，不再用全宽底条压左下角图例。

export default function FlowerLayer({
  mapRef,
  mapReady,
  markerZooms,
}: MapLayerSkillProps) {
  const [, bump] = useState(0);
  useEffect(() => subscribeFlowerSkill(() => bump((v) => v + 1)), []);
  const markersRef = useRef<Map<string, GeoMarkerHandle>>(new Map());
  const [detail, setDetail] = useState<FlowerSpotView | null>(null);
  const [correcting, setCorrecting] = useState<string | null>(null);   // 校正中的导入点 id
  const correctingRef = useRef<GeoMarkerHandle | null>(null);
  // 详情气泡：Popup 锚在点位经纬度上（地图拖动/缩放自动吸附，靠边自动换向），内容经 portal 走 React
  const popupRef = useRef<GeoPopupHandle | null>(null);
  const [popupEl, setPopupEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady || !detail || correcting) return;
    const el = document.createElement('div');
    const p = m.createPopup({
      element: el,
      position: [detail.spot.lng, detail.spot.lat],
      offset: 20,
      className: 'pe-flower-popup',
    });
    popupRef.current = p;
    setPopupEl(el);
    return () => { p.remove(); popupRef.current = null; setPopupEl(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, correcting, mapReady, mapRef]);

  const visible = isFlowerLayerVisible();
  const views = listVisibleFlowerSpots();

  useEffect(() => {
    if (!visible) {
      setDetail(null);
      setCorrecting(null);
    }
  }, [visible]);

  // —— 标记同步：状态/坐标进重建键，花期跨档、校正落位、开关灯都触发全量重建
  //（35 枚 DOM 标记全重建很廉价，换来样式永远与花期一致——比 diff-by-id 少一类陈旧态 bug）——
  const markerKey = views.map((v) => `${v.spot.id}:${v.status}:${v.spot.lng.toFixed(5)},${v.spot.lat.toFixed(5)}`).join(',');
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady) return;
    markersRef.current.forEach((mk) => mk.remove());
    markersRef.current.clear();
    if (!visible) return;
    for (const v of views) {
      if (v.spot.id === correcting) continue;   // 校正中的点由校正 effect 管
      if (!Number.isFinite(v.spot.lng) || !Number.isFinite(v.spot.lat)) continue;
      const el = buildMarkerEl(v, () => setDetail(v));
      markersRef.current.set(
        v.spot.id,
        m.createMarker({
          element: el,
          position: [v.spot.lng, v.spot.lat],
          zooms: markerZooms,
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, visible, markerKey, correcting, mapRef, markerZooms]);

  // 仅整组件树卸载时清扫（与 ExhibitionLayer 同纪律）
  useEffect(() => () => {
    markersRef.current.forEach((mk) => mk.remove());
    markersRef.current.clear();
  }, []);

  // 浏览页「去地图↗」：镜头飞过去 + 开详情卡
  const focus = (v: FlowerSpotView) => {
    setFlowerBrowserOpen(false);
    setDetail(v);
    mapRef.current?.flyTo({ center: [v.spot.lng, v.spot.lat], zoom: 14, duration: 800 });
  };

  // —— 校正模式：该点换成可拖 marker，✓ 固定后写回（confidence 升 high——用户亲手放的）——
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady || !correcting) return;
    const v = listVisibleFlowerSpots().find((x) => x.spot.id === correcting);
    if (!v) { setCorrecting(null); return; }
    const el = buildMarkerEl(v, () => { /* 校正中不弹详情 */ });
    el.style.filter = 'drop-shadow(0 0 6px rgba(255,185,40,0.95))';
    const mk = m.createMarker({
      element: el,
      position: [v.spot.lng, v.spot.lat],
      draggable: true,
      zooms: markerZooms,
    });
    correctingRef.current = mk;
    m.flyTo({ center: [v.spot.lng, v.spot.lat], zoom: Math.max(m.getZoom(), 14), duration: 600 });
    return () => { mk.remove(); correctingRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, correcting, mapRef, markerZooms]);

  const confirmCorrect = () => {
    const mk = correctingRef.current;
    if (!mk || !correcting) return;
    correctingRef.current = null;   // 同步防重入（快速连点只落一次——confirmPlacing 同款纪律）
    const ll = mk.getPosition();
    updateImportedFlowerSpot(correcting, { lng: ll.lng, lat: ll.lat, confidence: 'high' });
    setCorrecting(null);
    setDetail(null);
  };

  return (
    <>
      {/* 校正确认条（与手帐碎片摆放条同形制） */}
      {correcting && visible && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 border-2 border-black bg-black px-2.5 py-1.5 shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
          <span className="font-pixel text-[7px] text-[#ffb928]">拖动花标到准确位置</span>
          <button onClick={confirmCorrect}
            className="font-pixel text-[7px] border border-black bg-[#00ff88] text-black px-2 py-1 active:translate-y-px">✓ 固定</button>
          <button onClick={() => setCorrecting(null)}
            className="font-pixel text-[7px] border border-white/40 bg-transparent text-white/60 px-2 py-1 active:translate-y-px">✗</button>
        </div>
      )}

      {/* 花讯详情气泡卡：方形小卡锚在点位旁，跟点走（portal 进 Popup 容器） */}
      {detail && visible && !correcting && popupEl && createPortal(
        <div className="w-[228px] border-2 border-black bg-white p-2 shadow-[3px_3px_0_#000]">
          <div className="flex items-start gap-1.5">
            <span className="shrink-0 w-5 h-5 border-2 border-black flex items-center justify-center text-[10px] font-bold mt-px"
              style={{ background: detail.volume.color, fontFamily: YAHEI }}>
              {detail.volume.flower[0]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] font-bold leading-tight">
                {detail.spot.name}
                {detail.spot.area && <span className="text-[9px] text-black/45 font-normal"> · {detail.spot.area}</span>}
              </div>
              <div className="text-[8.5px] text-black/55 mt-0.5" style={{ fontFamily: YAHEI }}>
                {BLOOM_LABEL[detail.status]} · {windowLabel(detail.spot.window ?? detail.volume.window)} · {MASS_LABEL[detail.spot.mass]} · {CROWD_LABEL[detail.spot.crowd]}
              </div>
            </div>
            <button onClick={() => setDetail(null)} aria-label="关闭花讯详情"
              className="shrink-0 w-5 h-5 border border-black bg-black text-[#7CFF6B] font-pixel text-[7px] flex items-center justify-center active:translate-y-px">✕</button>
          </div>
          {(detail.status === 'peak' || detail.status === 'blooming') && (
            <div className="mt-1.5 border px-1.5 py-0.5 text-[9px] font-bold"
              style={{ fontFamily: YAHEI, borderColor: detail.volume.color, background: `${detail.volume.color}1a`, color: '#6b4a00' }}>
              ❀ {detail.status === 'peak' ? '正当盛花，这周就去' : '已在花期，可以出发'}
            </div>
          )}
          <div className="mt-1.5 text-[10px] text-black/70 leading-snug" style={{ fontFamily: YAHEI, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {detail.spot.note}
          </div>
          {(detail.spot.quote ?? detail.volume.quote) && (
            <blockquote className="mt-1.5 pl-1.5 border-l-2 text-[9.5px] italic text-black/75 leading-snug" style={{ borderColor: detail.volume.color }}>
              「{detail.spot.quote ?? detail.volume.quote}」
              <span className="not-italic text-[8px] text-black/40 pl-1">{detail.spot.source ?? detail.volume.source}</span>
            </blockquote>
          )}
          {detail.spot.origin === 'screenshot' && (
            <div className="mt-1.5 flex items-center gap-1">
              <span className="text-[8px] text-black/45 flex-1 truncate" style={{ fontFamily: YAHEI }}>
                {detail.spot.sourceNote}{detail.spot.confidence === 'low' ? ' · 定位估算' : ''}
              </span>
              <button onClick={() => setCorrecting(detail.spot.id)}
                className="shrink-0 font-pixel text-[6px] border border-black bg-[#ffb928] text-black px-1.5 py-1 active:translate-y-px">校正</button>
              <button onClick={() => { removeImportedFlowerSpot(detail.spot.id); setDetail(null); }}
                className="shrink-0 font-pixel text-[6px] border border-black bg-white text-[#c0392b] px-1.5 py-1 active:translate-y-px">移除</button>
            </div>
          )}
        </div>,
        popupEl,
      )}

      {/* 浏览页（四季花历 / 花讯列表 / 截图导入 / 导出），全屏 overlay */}
      {isFlowerBrowserOpen() && <FlowerBrowser onFocus={focus} />}
    </>
  );
}

// —— 花期感知的标记 DOM：在花 = 色底黑字 + 名牌；盛放另加呼吸圈；将开/花隐 = 白底虚线小标 ——
function buildMarkerEl(
  v: FlowerSpotView,
  onClick: () => void,
): HTMLButtonElement {
  const lit = v.status === 'peak' || v.status === 'blooming';
  const el = document.createElement('button');
  el.type = 'button';
  el.className =
    'relative cursor-pointer border-0 bg-transparent p-0 text-left touch-manipulation';
  el.setAttribute('aria-label', `查看赏花详情：${v.spot.name}`);
  el.style.zIndex = v.status === 'peak' ? '2' : lit ? '1' : '0';

  if (v.status === 'peak') {
    const ring = document.createElement('div');
    ring.className = 'absolute inset-0 animate-ping';
    ring.style.background = v.volume.color;
    ring.style.opacity = '0.6';
    el.appendChild(ring);
  }

  const core = document.createElement('div');
  core.className = 'relative border-2 border-black flex items-center justify-center font-bold select-none';
  core.style.fontFamily = YAHEI;
  if (lit) {
    const size = v.status === 'peak' ? 26 : 22;
    core.style.width = `${size}px`;
    core.style.height = `${size}px`;
    core.style.background = v.volume.color;
    core.style.color = '#000';
    core.style.fontSize = v.status === 'peak' ? '12px' : '11px';
    core.style.boxShadow = '2px 2px 0 rgba(0,0,0,0.55)';
  } else {
    core.style.width = '18px';
    core.style.height = '18px';
    core.style.background = '#fff';
    core.style.color = v.volume.color;
    core.style.fontSize = '9px';
    core.style.borderStyle = 'dashed';
    core.style.opacity = '0.75';
  }
  core.textContent = v.volume.flower[0];
  el.appendChild(core);

  if (lit) {
    const tag = document.createElement('div');
    tag.className = 'absolute left-1/2 whitespace-nowrap bg-white border border-black px-1 py-0.5 text-[8px] font-bold shadow-[1px_1px_0_#000] pointer-events-none';
    tag.style.top = 'calc(100% + 3px)';
    tag.style.transform = 'translateX(-50%)';
    tag.style.fontFamily = YAHEI;
    tag.textContent = v.spot.name.length > 10 ? `${v.spot.name.slice(0, 10)}…` : v.spot.name;
    el.appendChild(tag);
  } else {
    el.title = `${v.spot.name} · 花期 ${windowLabel(v.spot.window ?? v.volume.window)}`;
  }

  el.addEventListener('pointerdown', (event) => event.stopPropagation());
  el.addEventListener('click', (ev) => { ev.stopPropagation(); onClick(); });
  return el;
}
