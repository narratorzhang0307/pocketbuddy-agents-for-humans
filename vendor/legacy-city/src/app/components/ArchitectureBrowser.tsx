// 杭州古建筑地图 .skill · 浏览页（全屏图鉴）：按形制分卷罗列，逐条引文 + 考据小注 + 去地图。
// 由 ArchitectureLayer 在 isArchBrowserOpen() 时挂载；关闭走 setArchBrowserOpen(false)。
import { useEffect, useState } from 'react';
import {
  archSummary, isKindOn, listArchSites, setArchBrowserOpen, subscribeArchSkill, toggleKind,
} from '../lib/skills/hangzhou-architecture/store';
import {
  KIND_COLOR, KIND_LABEL, KIND_MARK, KIND_ORDER, STATUS_LABEL, type ArchSite,
} from '../lib/skills/hangzhou-architecture/types';

const SONG = "'Songti SC','STSong','Source Han Serif SC','SimSun',serif";

export default function ArchitectureBrowser({ onFocus }: { onFocus: (s: ArchSite) => void }) {
  const [, bump] = useState(0);
  useEffect(() => subscribeArchSkill(() => bump((v) => v + 1)), []);
  const sites = listArchSites();

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/45" style={{ fontFamily: SONG }}
      onClick={() => setArchBrowserOpen(false)}>
      <div className="w-full sm:w-[420px] max-h-[86vh] overflow-y-auto border-2 border-black bg-[#f2ead8] shadow-[4px_4px_0_#000]"
        onClick={(e) => e.stopPropagation()}>

        {/* 页眉 */}
        <div className="sticky top-0 bg-[#2f2921] text-[#f2ead8] px-3.5 py-2.5 flex items-center justify-between border-b-2 border-black">
          <div>
            <div className="text-[15px] font-bold tracking-wide">杭州古建筑图鉴</div>
            <div className="text-[9px] text-[#d8c9a3] mt-0.5">《武林梵志》· 明 吴之鲸 &nbsp;·&nbsp; {archSummary()}</div>
          </div>
          <button onClick={() => setArchBrowserOpen(false)} aria-label="关闭图鉴"
            className="w-6 h-6 border border-[#d8c9a3] text-[#e8c06a] font-pixel text-[8px] flex items-center justify-center active:translate-y-px">✕</button>
        </div>

        {/* 形制筛选（塔/幢/寺/造像 各一盏灯） */}
        <div className="flex flex-wrap gap-1.5 px-3.5 py-2.5 border-b border-[#ddceac]">
          {KIND_ORDER.map((k) => {
            const on = isKindOn(k);
            return (
              <button key={k} onClick={() => toggleKind(k)}
                className="text-[10px] border-2 border-black px-2 py-0.5 font-bold active:translate-y-px"
                style={{ background: on ? KIND_COLOR[k] : '#fff', color: on ? '#fff' : '#8a7d63', opacity: on ? 1 : 0.7 }}>
                {KIND_MARK[k]} {KIND_LABEL[k]}
              </button>
            );
          })}
        </div>

        {/* 分卷图鉴 */}
        <div className="px-3.5 py-3">
          {KIND_ORDER.map((k) => {
            const group = sites.filter((s) => s.kind === k);
            if (!group.length) return null;
            return (
              <section key={k} className="mb-4">
                <h3 className="text-[12px] font-bold mb-2 flex items-center gap-1.5 text-[#2f2921]">
                  <span className="w-3.5 h-3.5 border border-black inline-block" style={{ background: KIND_COLOR[k], transform: 'rotate(45deg)' }} />
                  {KIND_LABEL[k]}<span className="text-[9px] text-[#8a7d63] font-normal">{group.length}</span>
                </h3>
                <div className="flex flex-col gap-2">
                  {group.map((s) => (
                    <article key={s.id} className="border border-[#ddceac] bg-[#fbf6e9] p-2.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="text-[13px] font-bold text-[#2f2921]">
                          {s.name}
                          {s.modernName && <span className="text-[9px] text-black/40 font-normal"> · 今{s.modernName}</span>}
                        </div>
                        <span className="shrink-0 text-[9px]" style={{ color: s.status === 'extant' ? '#3f7a4e' : '#b5402f' }}>{STATUS_LABEL[s.status]}</span>
                      </div>
                      <div className="text-[9px] text-black/45 mt-0.5">{s.era}</div>
                      {s.quote && (
                        <blockquote className="mt-1.5 pl-2 border-l-[3px] text-[11px] leading-snug text-[#3a2f22]" style={{ borderColor: '#b5402f' }}>
                          {s.quote}
                          <span className="block text-[8px] text-black/35 mt-0.5">——《武林梵志》{s.chapter}</span>
                        </blockquote>
                      )}
                      <div className="mt-1.5 text-[10px] text-black/70 leading-relaxed">{s.note}</div>
                      <div className="mt-1.5 text-right">
                        <button onClick={() => onFocus(s)}
                          className="text-[9px] font-bold border-2 border-black bg-[#b5402f] text-white px-2 py-0.5 active:translate-y-px">去地图 ↗</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <div className="px-3.5 pb-3 text-[8.5px] text-[#8a7d63] leading-relaxed border-t border-[#ddceac] pt-2">
          引文全部在维基文库《武林梵志》(四库全书本) 原文页逐字核验后收录，核不到只留考据小注 · 坐标为真实经纬度。
        </div>
      </div>
    </div>
  );
}
