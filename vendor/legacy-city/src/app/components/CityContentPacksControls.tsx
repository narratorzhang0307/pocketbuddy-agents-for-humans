import { useEffect, useReducer, useState } from 'react';
import type { MapLayerLegendControlsProps } from '../lib/skills/mapLayers';
import {
  isMapSkillPublishedToPublic,
  listMapSkills,
} from '../lib/roam/mapSkills';
import {
  getActiveCityContentPackId,
  listCityContentPackSpots,
  loadAndActivateCityContentPack,
  removeCityContentPackFromPublic,
  setActiveCityContentPack,
  subscribeCityContentPacks,
  unloadCityContentPack,
} from '../lib/skills/city-content-packs/store';

const YAHEI = "'Microsoft YaHei','微软雅黑','PingFang SC','Heiti SC',sans-serif";

export default function CityContentPacksControls({
  onFocus,
  worldLayer = 'personal',
}: MapLayerLegendControlsProps) {
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const [open, setOpen] = useState(false);
  useEffect(() => subscribeCityContentPacks(refresh), []);

  const packs = listMapSkills().filter(
    (pack) => worldLayer === 'personal' || isMapSkillPublishedToPublic(pack.name),
  );
  const activeId = getActiveCityContentPackId(worldLayer);
  const loadedCount = packs.filter((pack) => pack.loaded).length;

  return (
    <div className="border-t border-black/25 bg-[#f5efdf] px-2 py-1.5" style={{ fontFamily: YAHEI }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-1.5 text-left active:translate-y-px"
      >
        <span className="font-pixel text-[6px] text-black/60">{open ? '▾' : '▸'}</span>
        <span className="text-[9px] font-bold">
          {worldLayer === 'public' ? '公共 Mapping Skills' : '我的 Mapping Skills'}
        </span>
        <span className="ml-auto font-pixel text-[5.5px] text-black/45">{loadedCount}/{packs.length} 已加载</span>
      </button>

      {open && (
        <div className="mt-1.5 max-h-52 space-y-0.5 overflow-y-auto pr-0.5" aria-label="Skills Plaza 城市内容包">
          {packs.map((pack) => {
            const active = activeId === pack.name;
            const pointCount = pack.books.reduce((sum, book) => sum + book.places.length, 0);
            return (
              <div key={pack.name} className={`flex items-center border border-black/25 px-1 py-1 ${active ? 'bg-[#e8ddc4]' : 'bg-white'}`}>
                <button
                  type="button"
                  disabled={!pack.loaded}
                  onClick={() => {
                    setActiveCityContentPack(pack.name, worldLayer);
                    onFocus?.();
                  }}
                  className="min-w-0 flex-1 text-left disabled:opacity-45"
                >
                  <span className="block truncate text-[8px] font-semibold">{pack.displayName}</span>
                  <span className="mt-0.5 block font-pixel text-[4.5px] text-black/40">{pointCount} POINTS {active ? '· ACTIVE' : ''}</span>
                </button>
                {pack.loaded && listCityContentPackSpots(pack.name, worldLayer).length > 0 && (
                  <button
                    type="button"
                    aria-label={`定位 ${pack.displayName}`}
                    onClick={() => {
                      setActiveCityContentPack(pack.name, worldLayer);
                      onFocus?.();
                    }}
                    className="h-7 shrink-0 border-l border-black/20 px-1.5 font-pixel text-[5px] active:bg-[#00ff88]"
                  >定位查看</button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (pack.loaded) {
                      if (worldLayer === 'public') removeCityContentPackFromPublic(pack.name);
                      else unloadCityContentPack(pack.name);
                    }
                    else {
                      void loadAndActivateCityContentPack(pack.name, worldLayer);
                      onFocus?.();
                    }
                  }}
                  className={`ml-1 shrink-0 border border-black px-1 py-1 font-pixel text-[5px] ${pack.loaded ? 'bg-white text-black/55' : 'bg-[#00ff88] text-black'}`}
                >
                  {pack.loaded
                    ? worldLayer === 'public' ? '移出公共层' : '卸载'
                    : worldLayer === 'public' ? '加载到公共层' : '加载到知识地图'}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {open && packs.length === 0 && (
        <div className="mt-1.5 border border-dashed border-black/30 bg-white p-2 text-[8px] font-bold text-black/45">
          尚未从 Skills Plaza 加载到公共层
        </div>
      )}
    </div>
  );
}
