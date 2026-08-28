import { useState } from 'react';
import type { RoamPlaceStatus } from '../lib/roam';
import { ROAM_STATUS_LABEL } from '../lib/roam';

// 总舆图（MY MAP · mapping 视图）左下角图例：城市开关 + 存续状态筛选。
// 与知识库视图的 MapLegend 各管各的图层——两套 LAYERS 不再混在一个面板里。
// 纸色底呼应舆图气质；默认折叠成小标签，交互形制与 MapLegend 一致。

const YAHEI = "'Microsoft YaHei','微软雅黑','PingFang SC','Heiti SC',sans-serif";
const STATUS_COLOR: Record<RoamPlaceStatus, string> = {
  extant: '#7CFF6B',
  rebuilt: '#ff8a3d',
  'memory-only': '#9aa7b5',
};
const STATUS_ORDER: RoamPlaceStatus[] = ['extant', 'rebuilt', 'memory-only'];

export interface AtlasCityRow { name: string; count: number; lat: number; lng: number }

interface Props {
  cities: AtlasCityRow[];
  citiesOff: Set<string>;
  onToggleCity: (name: string) => void;
  statusOff: Set<string>;
  onToggleStatus: (st: RoamPlaceStatus) => void;
  onJumpCity: (name: string) => void;
}

export default function AtlasLegend({ cities, citiesOff, onToggleCity, statusOff, onToggleStatus, onJumpCity }: Props) {
  const [open, setOpen] = useState(false);
  const offCount = citiesOff.size + statusOff.size;
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className="absolute bottom-3 left-3 z-20 bg-[#f5efdf]/95 backdrop-blur-md border-[1.5px] border-black shadow-[1.5px_1.5px_0_#000] px-2 py-1.5 pointer-events-auto select-none flex items-center gap-1.5 active:translate-y-px"
      >
        <span className="font-pixel text-[7px] tracking-widest text-black/65">▸ LAYERS</span>
        {offCount > 0 && <span className="font-pixel text-[6px] text-black/40">{offCount} OFF</span>}
      </button>
    );
  }
  return (
    <div className="absolute bottom-3 left-3 z-20 bg-[#f5efdf]/95 backdrop-blur-md border-[1.5px] border-black shadow-[1.5px_1.5px_0_#000] p-2 pointer-events-auto select-none max-w-[168px]">
      <button onClick={() => setOpen(false)} aria-expanded className="w-full flex items-center font-pixel text-[7px] tracking-widest mb-1.5 text-black/65 active:translate-y-px">
        <span>▾ LAYERS · 漫游</span>
        <span className="ml-auto text-black/40">收起</span>
      </button>

      {/* 城市段：开关该城全部考据点；↗ 镜头跳过去（纯看，不改 mapping 的城市语境） */}
      <div className="font-pixel text-[7px] tracking-widest mb-1.5 text-black/65">CITIES · 城市</div>
      <div className="space-y-1">
        {cities.map((c) => {
          const on = !citiesOff.has(c.name);
          return (
            <div key={c.name} className={`flex items-center gap-2 w-full ${on ? '' : 'opacity-45'}`}>
              <button onClick={() => onToggleCity(c.name)} aria-pressed={on} className="flex items-center gap-2 min-w-0 flex-1 min-h-[24px] active:translate-y-px">
                <div className={`w-3 h-3 shrink-0 border-2 border-black ${on ? 'bg-[#9e3c2f]' : 'bg-white'}`} />
                <span className="text-[9px] leading-none font-bold" style={{ fontFamily: YAHEI }}>{c.name}</span>
                <span className="ml-auto pl-2 text-[7px] text-black/70 leading-none font-bold" style={{ fontFamily: YAHEI }}>{c.count} 处</span>
              </button>
              <button onClick={() => onJumpCity(c.name)} aria-label={`镜头去${c.name}`} className="shrink-0 inline-flex items-center justify-center min-w-[22px] min-h-[24px] text-[9px] text-black/55 hover:text-black active:translate-y-px">↗</button>
            </div>
          );
        })}
      </div>

      {/* 存续段：尚在 / 重建 / 已无 */}
      <div className="font-pixel text-[7px] tracking-widest mt-2 mb-1.5 text-black/65">STATUS · 存续</div>
      <div className="space-y-1">
        {STATUS_ORDER.map((st) => {
          const on = !statusOff.has(st);
          return (
            <button key={st} onClick={() => onToggleStatus(st)} aria-pressed={on}
              className={`flex items-center gap-2 w-full min-h-[24px] active:translate-y-px ${on ? '' : 'opacity-45'}`}>
              <div className="w-3 h-3 shrink-0 border-2 border-black" style={{ background: on ? STATUS_COLOR[st] : '#fff' }} />
              <span className="text-[9px] leading-none font-bold" style={{ fontFamily: YAHEI }}>{ROAM_STATUS_LABEL[st]}</span>
              <span className="ml-auto pl-2 font-pixel text-[6px] text-black/70 leading-none">{on ? 'ON' : 'OFF'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
