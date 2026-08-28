import { useState } from 'react';
import { MARKER_KINDS, type MarkerKind } from '../data/mapMarkers';
import type { Planet } from '../data/planets';
import { X } from 'lucide-react';

// 地球左下角图例 + 图层开关：标明每种颜色代表什么，点一下开/闭该类点。
// 上段=基础各类（从 MARKER_KINDS 自动列出），下段=用户建立的「星球」（圆点，可开关 / 删除）。

// 图例文字字体：微软雅黑（Windows）→ 其它平台对应黑体兜底
const YAHEI = "'Microsoft YaHei','微软雅黑','PingFang SC','Heiti SC',sans-serif";

export type PackLayerStatus = 'unloaded' | 'ready' | 'mapped';

interface Props {
  visibleKinds: Set<MarkerKind>;
  onToggle: (k: MarkerKind) => void;
  packLayerStates?: Partial<Record<MarkerKind, PackLayerStatus>>;
  planets?: Planet[];
  onTogglePlanet?: (id: string) => void;
  onRemovePlanet?: (id: string) => void;
}

export default function MapLegend({ visibleKinds, onToggle, packLayerStates = {}, planets = [], onTogglePlanet, onRemovePlanet }: Props) {
  const [open, setOpen] = useState(false);
  const activeCount = MARKER_KINDS.filter((item) => visibleKinds.has(item.kind) && packLayerStates[item.kind] !== 'unloaded').length;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className="pointer-events-auto absolute bottom-3 left-3 z-20 flex h-[42px] w-[calc(50%_-_18px)] max-w-[176px] min-w-0 select-none items-center gap-1 border-2 border-black bg-[#f5efdf] px-2 shadow-[2px_2px_0_#000] active:translate-y-px"
      >
        <span className="min-w-0 truncate whitespace-nowrap font-pixel text-[6px] tracking-wide text-black/65">▸ LAYERS · 图层</span>
        <span className="border border-black bg-[#00ff88] px-1 py-0.5 font-pixel text-[6px]">{activeCount}/{MARKER_KINDS.length}</span>
      </button>
    );
  }

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-20 max-h-[58%] w-[calc(50%_-_18px)] max-w-[176px] select-none overflow-y-auto overscroll-contain border-2 border-black bg-[#f5efdf] p-2 shadow-[3px_3px_0_#000] sm:max-h-[calc(100%_-_24px)]">
      <button type="button" onClick={() => setOpen(false)} aria-expanded className="mb-1.5 flex w-full items-center font-pixel text-[7px] tracking-widest text-black/65 active:translate-y-px">
        <span>▾ LAYERS · 图层</span>
        <span className="ml-auto text-black/40">收起</span>
      </button>
      <div className="space-y-1">
        {MARKER_KINDS.map((k) => {
          const on = visibleKinds.has(k.kind);
          const packState = packLayerStates[k.kind];
          const interactive = !packState || packState === 'mapped';
          const status = packState === 'unloaded' ? '未加载' : packState === 'ready' ? '待落位' : on ? 'ON' : 'OFF';
          const contentOpacity = packState === 'unloaded' ? 0.35 : packState === 'ready' || !on ? 0.55 : 1;
          return (
            <button
              key={k.kind}
              onClick={() => onToggle(k.kind)}
              disabled={!interactive}
              aria-label={`${k.label} ${status}`}
              aria-pressed={interactive ? on : undefined}
              className="flex min-h-[24px] w-full items-center gap-2 active:translate-y-px disabled:cursor-default"
            >
              {/* 方块（粗黑边 + 满彩色，呼应地图上的标记点）*/}
              <div className="w-3 h-3 shrink-0 border-2 border-black" style={{ background: k.color, opacity: contentOpacity }} />
              <span className="text-[9px] leading-none font-bold" style={{ fontFamily: YAHEI, opacity: contentOpacity }}>{k.label}</span>
              <span
                className={`ml-auto min-w-[34px] whitespace-nowrap border px-1 py-0.5 text-center text-[7px] font-bold leading-none ${status === 'ON' ? 'border-black bg-black text-[#7CFF6B]' : status === '待落位' ? 'border-[#A97A00] bg-[#FFF0B8] text-[#785600]' : status === '未加载' ? 'border-black/15 bg-black/5 text-black/40' : 'border-black/25 bg-white text-black/55'}`}
                style={{ fontFamily: YAHEI }}
              >
                {status}
              </span>
            </button>
          );
        })}
      </div>

      {/* 星球段（圆点，区别于基础类的方块）*/}
      {planets.length > 0 && (
        <>
          <div className="font-pixel text-[7px] tracking-widest mt-2 mb-1.5 text-black/65">PLANETS · 星球</div>
          <div className="space-y-1">
            {planets.map((p) => (
              <div key={p.id} className={`flex items-center gap-2 w-full ${p.visible ? '' : 'opacity-45'}`}>
                <button onClick={() => onTogglePlanet?.(p.id)} aria-pressed={!!p.visible} className="flex items-center gap-2 min-w-0 flex-1 min-h-[24px] active:translate-y-px">
                  <div className="w-3 h-3 shrink-0 rounded-full border-[1.5px] border-black" style={{ background: p.color }} />
                  <span className="text-[9px] leading-none truncate font-bold" style={{ fontFamily: YAHEI }}>{p.name}</span>
                  <span className="ml-auto pl-1 text-[7px] text-black/70 leading-none shrink-0 font-bold" style={{ fontFamily: YAHEI }}>{p.photos.length}</span>
                </button>
                {onRemovePlanet && (
                  <button onClick={() => onRemovePlanet(p.id)} aria-label={`删除星球 ${p.name}`} className="shrink-0 inline-flex items-center justify-center min-w-[24px] min-h-[24px] text-black/55 hover:text-[#d23b3b] active:translate-y-px"><X className="w-2.5 h-2.5" strokeWidth={3} /></button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
