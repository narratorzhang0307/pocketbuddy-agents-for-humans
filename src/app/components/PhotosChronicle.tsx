import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { calendarMonths, magazineYears, hasPhotos, photoCredit, timelineGroups, type CalendarMonth } from '../data/photos';
import { mergePhotoChronicleData, type PhotoChronicleData } from '../lib/photo';

// 「杂志」结果页 —— 先按年份浏览封面，再进入该年份的月历。
// 数据全部来自解耦的 photos 数据源（换照片只换数据源，这里不动）。

const WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
type Lightbox = { img: string; caption: string; sub?: string };

const padMonth = (value: number) => String(value).padStart(2, '0');
const calendarYear = (source: CalendarMonth[], year: number): CalendarMonth[] => {
  const sourceByLabel = new Map(source.map((month) => [month.label, month]));
  return Array.from({ length: 12 }, (_, index) => {
    const month = 12 - index;
    const label = `${year}.${padMonth(month)}`;
    return sourceByLabel.get(label) ?? { label, dim: new Date(year, month, 0).getDate(), days: {} };
  });
};

// OSS 图片加载失败时优雅降级：隐藏失败图，露出父级灰底占位
const onImgErr = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.opacity = '0'; };


interface PhotosChronicleProps {
  embedded?: boolean;
  data?: PhotoChronicleData;
  appendToDemo?: boolean;
  onOpenAsset?: (assetKey: string) => boolean | void;
}

export default function PhotosChronicle({ embedded = false, data, appendToDemo = false, onOpenAsset }: PhotosChronicleProps) {
  const resolvedData = useMemo(() => {
    if (!data) return undefined;
    return appendToDemo
      ? mergePhotoChronicleData({ timelineGroups, calendarMonths, magazineYears, hasPhotos }, data)
      : data;
  }, [appendToDemo, data]);
  const sourceCalendarMonths = resolvedData?.calendarMonths ?? calendarMonths;
  const sourceMagazineYears = resolvedData?.magazineYears ?? magazineYears;
  const sourceHasPhotos = resolvedData?.hasPhotos ?? hasPhotos;
  const [lightbox, setLightbox] = useState<Lightbox | null>(null);
  const [openYear, setOpenYear] = useState<number | null>(null);
  const [magMode, setMagMode] = useState<'single' | 'mix'>('single');
  const [monthIdx, setMonthIdx] = useState(0);
  const selectedCalendarMonths = useMemo(
    () => calendarYear(sourceCalendarMonths, openYear ?? sourceMagazineYears[0]?.year ?? new Date().getFullYear()),
    [openYear, sourceCalendarMonths, sourceMagazineYears],
  );
  const month = selectedCalendarMonths[monthIdx] ?? selectedCalendarMonths[0];
  const [monthYear, monthNumber] = month.label.split('.').map(Number);
  const firstWeekday = new Date(monthYear, monthNumber - 1, 1).getDay();
  const monthCells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day >= 1 && day <= month.dim ? day : null;
  });
  const moveMonth = (delta: number) => setMonthIdx((index) => Math.max(0, Math.min(selectedCalendarMonths.length - 1, index + delta)));
  const openCalendarYear = (year: number) => {
    const months = calendarYear(sourceCalendarMonths, year);
    const firstLitMonth = months.findIndex((candidate) => Object.keys(candidate.days).length > 0);
    setMonthIdx(firstLitMonth >= 0 ? firstLitMonth : 0);
    setOpenYear(year);
  };
  const open = (assetKey: string | undefined, fallback: Lightbox) => {
    if (assetKey && onOpenAsset && onOpenAsset(assetKey) !== false) return;
    setLightbox(fallback);
  };

  useEffect(() => {
    setMonthIdx((current) => Math.min(current, selectedCalendarMonths.length - 1));
    setOpenYear((current) => current != null && !sourceMagazineYears.some((issue) => issue.year === current) ? null : current);
  }, [resolvedData, selectedCalendarMonths.length, sourceMagazineYears]);

  return (
    <div className={`flex flex-col bg-[#EAEAEA] font-sans relative ${embedded ? 'min-h-[560px] overflow-visible' : 'h-full overflow-hidden'}`}>
      {/* 顶栏状态 */}
      {!embedded && <div className="flex justify-center items-center h-[30px] px-4 border-b-2 border-black bg-[#EAEAEA] shrink-0">
        <div className="font-pixel text-[10.4px] uppercase tracking-widest leading-none">POCKET EARTH</div>
      </div>}

      {/* 标题 */}
      {!embedded && <div className="px-4 py-4 border-b-2 border-black bg-white shrink-0">
        <h1 className="font-pixel text-xl uppercase tracking-wider mb-2">PHOTOS</h1>
        <p className="text-xs text-black/70 tracking-wide font-medium">
          按年份杂志与月历整理你的照片<br />
          <span className="opacity-60 text-[9px] font-pixel block mt-1">Your moments, year by year.</span>
        </p>
      </div>}

      {/* 内容区 */}
      <div className={embedded ? (openYear != null ? 'min-h-[560px]' : 'overflow-visible') : `min-h-0 flex-1 ${openYear != null ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {!sourceHasPhotos ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-8 gap-2 py-16">
            <div className="font-pixel text-[10px] text-black/40 tracking-widest uppercase">照片库为空</div>
            <div className="text-[11px] text-black/40 leading-relaxed">没有找到可显示的照片，请检查照片数据源。</div>
          </div>
        ) : (
          <>
            {/* —— 年份详情：该年份的月份网格 —— */}
            {openYear != null && (
              <div data-photo-calendar={month.label} className="flex h-full min-h-0 items-center justify-center overflow-hidden px-4 py-2">
                <div className="w-full max-w-[380px]">
                <div className="grid grid-cols-[32px_1fr_auto] items-center gap-2 mb-3">
                  <button aria-label="返回杂志年份" onClick={() => setOpenYear(null)} className="w-7 h-7 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
                    <ChevronLeft className="w-3.5 h-3.5 text-black" strokeWidth={3} />
                  </button>
                  <div className="min-w-0 text-center">
                    <div className="font-pixel text-[7px] text-black/45 tracking-widest">{openYear} CALENDAR</div>
                    <h2 className="font-pixel text-base tracking-wider">{month.label}</h2>
                  </div>
                  <div className="flex gap-1.5">
                    <button aria-label="上一个月" disabled={monthIdx === selectedCalendarMonths.length - 1} onClick={() => moveMonth(1)} className="w-7 h-7 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-25 disabled:shadow-none">
                      <ChevronLeft className="w-3.5 h-3.5 text-black" strokeWidth={3} />
                    </button>
                    <button aria-label="下一个月" disabled={monthIdx === 0} onClick={() => moveMonth(-1)} className="w-7 h-7 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-25 disabled:shadow-none">
                      <ChevronLeft className="w-3.5 h-3.5 text-black rotate-180" strokeWidth={3} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {WEEK.map((d) => (
                    <div key={d} className="text-center font-pixel text-[7px] text-black/45">{d}</div>
                  ))}
                </div>
                <div data-calendar-grid className="grid grid-cols-7 gap-1">
                  {monthCells.map((day, index) => {
                    if (day == null) return <div key={`blank-${index}`} aria-hidden="true" className="aspect-square" />;
                    const p = month.days[day];
                    if (p) {
                      return (
                        <button
                          key={day}
                          onClick={() => open(p.assetKey, { img: p.full, caption: `${month.label} · ${day}`, sub: `${p.count} 张 · LOC_SYNC` })}
                          className="aspect-square relative overflow-hidden border-2 border-black shadow-[1px_1px_0_#000] active:translate-y-px bg-[#d8d8d6]"
                        >
                          <img src={p.thumb} onError={onImgErr} alt={`${month.label} ${day}`} className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all" />
                          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent" />
                          <span className="absolute top-0.5 left-1 font-pixel text-[8px] text-[#7CFF6B] leading-none z-10">{day}</span>
                          {p.count > 1 && (
                            <div className="absolute top-0.5 right-0.5 bg-black border border-[#7CFF6B] px-1 z-10">
                              <span className="font-pixel text-[6px] text-[#7CFF6B] leading-none">{p.count}</span>
                            </div>
                          )}
                        </button>
                      );
                    }
                    return (
                      <div key={day} className="aspect-square relative border border-black/20 bg-[#E2E2E0]">
                        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-pixel text-[8px] text-black/35">{day}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 text-center font-pixel text-[8px] text-black/30 tracking-widest">
                  {Object.keys(month.days).length} DAYS LIT · {monthIdx + 1}/{selectedCalendarMonths.length}
                </div>
                </div>
              </div>
            )}

            {/* —— 杂志：年份封面 → 进入该年月历 —— */}
            {openYear == null && (
                <div className={embedded ? 'flex flex-col' : 'h-full flex flex-col'}>
                  {/* 单页大图 / 瀑布混搭 切换（右上角）*/}
                  <div className="px-4 py-2 flex justify-between items-center shrink-0 border-b border-black/10">
                    <span className="font-pixel text-[10px] tracking-widest">MAGAZINE</span>
                    <button
                      onClick={() => setMagMode((m) => (m === 'single' ? 'mix' : 'single'))}
                      title="单页大图 / 瀑布混搭"
                      className="border-2 border-black px-2 py-1 hover:bg-[#7CFF6B] transition-colors active:translate-y-px"
                    >
                      <span className="font-pixel text-[12px] leading-none">{magMode === 'single' ? '▣' : '▦'}</span>
                    </button>
                  </div>

                  {magMode === 'single' ? (
                    /* 单页大图：一年一页，照片撑满整页（无文字，仅角落年份）*/
                    <div className={`${embedded ? '' : 'flex-1 overflow-y-auto'} snap-y snap-mandatory px-4 py-3 space-y-4`}>
                      {sourceMagazineYears.map((y, i) => (
                        <button
                          key={y.year}
                          onClick={() => openCalendarYear(y.year)}
                          className="snap-center block w-full h-[72vh] min-h-[460px] max-h-[660px] relative border-2 border-black shadow-[6px_6px_0_#000] overflow-hidden bg-[#d8d8d6] active:translate-y-px text-left"
                        >
                          <img src={y.photos[0]?.full || y.cover} onError={onImgErr} alt={`${y.year} 年杂志封面`} className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-500" />
                          {/* 封面暗角，让杂志排版清晰 */}
                          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.8) 100%)' }} />
                          {/* 刊头 */}
                          <div className="absolute top-0 inset-x-0 px-4 pt-3 flex justify-between items-start">
                            <div>
                              <div className="font-pixel text-[15px] text-white tracking-wider drop-shadow-[1px_1px_0_#000] leading-none">POCKET EARTH</div>
                              <div className="font-pixel text-[7px] text-white/70 tracking-[0.3em] mt-1.5">PHOTO MAGAZINE · 月刊</div>
                            </div>
                            <div className="text-right">
                              <div className="font-pixel text-[6px] text-white/60 tracking-widest">ISSUE</div>
                              <div className="font-pixel text-[13px] text-[#7CFF6B] drop-shadow-[1px_1px_0_#000]">№{String(sourceMagazineYears.length - i).padStart(2, '0')}</div>
                            </div>
                          </div>
                          {/* 主视觉：大年份 + 本期专题 + 翻开 + 条码 */}
                          <div className="absolute bottom-0 inset-x-0 px-4 pb-4">
                            <div className="font-pixel text-[7px] text-white/75 tracking-wider mb-1.5 truncate">本期 · {y.photos.length} 帧 · {[...new Set(y.photos.map((p) => p.city).filter(Boolean))].slice(0, 3).join(' / ') || '环球'}</div>
                            <div className="flex items-end justify-between">
                              <span className="font-pixel text-[58px] leading-[0.8] text-white drop-shadow-[3px_3px_0_#000]">{y.year}</span>
                              <span className="font-pixel text-[9px] text-black bg-[#7CFF6B] border-2 border-black px-2 py-1 shadow-[2px_2px_0_#000] mb-1">翻开 ▶</span>
                            </div>
                            <div className="mt-2.5 flex items-center gap-2">
                              <div className="h-4 flex-1 max-w-[96px]" style={{ background: 'repeating-linear-gradient(90deg,#fff 0 1px,transparent 1px 2px,#fff 2px 4px,transparent 4px 5px,#fff 5px 8px,transparent 8px 9px)' }} />
                              <span className="font-pixel text-[6px] text-white/55 tracking-widest">PE-{y.year}-MAGAZINE</span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    /* 瀑布混搭：一年一刊，年份封面不同高度混排（黑白，触碰变彩色）*/
                    <div className={`${embedded ? '' : 'flex-1 overflow-y-auto'} px-3 py-3`}>
                      <div className="columns-2 gap-2">
                        {sourceMagazineYears.map((y, i) => (
                          <button
                            key={y.year}
                            onClick={() => openCalendarYear(y.year)}
                            className="break-inside-avoid mb-2 block w-full relative border-2 border-black shadow-[3px_3px_0_#000] overflow-hidden bg-[#d8d8d6] active:translate-y-px"
                          >
                            <img src={y.cover} onError={onImgErr} alt={`${y.year} 年杂志封面`} className="w-full object-cover grayscale hover:grayscale-0 transition-all" style={{ aspectRatio: ['3 / 4', '1 / 1', '4 / 5', '1 / 1', '3 / 4', '4 / 5'][i % 6] }} />
                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 flex items-end justify-between">
                              <span className="font-pixel text-xl text-[#7CFF6B] drop-shadow-[1px_1px_0_#000]">{y.year}</span>
                              <span className="font-pixel text-[7px] text-white/80 mb-1">{y.photos.length} 张</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
            )}
          </>
        )}
      </div>

      {/* Lightbox（三视图共用） */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setLightbox(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="w-[300px] bg-white border-[3px] border-black shadow-[6px_6px_0_#000] p-2 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setLightbox(null)}
                className="absolute -top-3 -right-3 w-7 h-7 bg-black border-2 border-[#7CFF6B] flex items-center justify-center z-10"
              >
                <X className="w-3.5 h-3.5 text-[#7CFF6B]" strokeWidth={3} />
              </button>
              <div className="w-full aspect-square bg-[#d8d8d6] border border-black overflow-hidden">
                <img src={lightbox.img} onError={onImgErr} alt={lightbox.caption} className="w-full h-full object-cover" />
              </div>
              <div className="py-2 text-center">
                <div className="font-pixel text-[9px] tracking-widest">{lightbox.caption}</div>
                {lightbox.sub && <div className="text-[10px] text-black/45 mt-0.5">{lightbox.sub}</div>}
                {(() => {
                  const c = photoCredit(lightbox.img);
                  return c?.author ? (
                    <div className="text-[10px] text-black/45 mt-0.5">
                      Photo by <a href={c.photoLink || c.authorLink} target="_blank" rel="noopener noreferrer" className="underline">{c.author}</a> on <a href="https://unsplash.com/?utm_source=pocket_earth&utm_medium=referral" target="_blank" rel="noopener noreferrer" className="underline">Unsplash</a>
                    </div>
                  ) : null;
                })()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
