import { useState } from 'react';
import { ArrowRight, Eye, ImageIcon, Trash2 } from 'lucide-react';
import { FOOD_DEMO_REGIONS, FOOD_PHOTO_DEMOS } from '../data/foodPhotoDemo';

type DemoView = 'recognition' | 'records';
type Props = { onRemove: () => void; initialView?: DemoView };
const outline = 'border-2 border-black';

export default function FoodPhotoDemo({ onRemove, initialView = 'recognition' }: Props) {
  const [view, setView] = useState<DemoView>(initialView);
  const [selected, setSelected] = useState(0);
  const [showOriginal, setShowOriginal] = useState(false);
  const meal = FOOD_PHOTO_DEMOS[selected];
  return <section aria-label="餐食示范预览" data-food-demo="preview-only" className="space-y-3">
    <div className={outline + ' bg-[#fff4b7] p-2'}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-[12px]">先看看怎么用 · 示例预览</span>
        <button type="button" onClick={onRemove} className="flex shrink-0 items-center gap-1 border border-black bg-white px-2 py-1.5 text-[10px]"><Trash2 size={12} />移除示例</button>
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-black/65">示例照片与估算，非实时识别；不会写入健康记忆。</p>
      <ol className="mt-1 grid grid-cols-3 gap-1 text-[10px] font-bold">
        <li>① 拍照或选照片</li><li>② 识别后核对</li><li>③ 确认实际吃过</li>
      </ol>
    </div>
    <div aria-label="示例页面" className="grid grid-cols-2 gap-2 bg-black p-1.5">
      <button type="button" aria-pressed={view === 'recognition'} onClick={() => setView('recognition')} className={'p-1.5 text-[12px] font-bold ' + (view === 'recognition' ? 'bg-[#7cff6b]' : 'bg-white')}>识别示例</button>
      <button type="button" aria-pressed={view === 'records'} onClick={() => setView('records')} className={'p-1.5 text-[12px] font-bold ' + (view === 'records' ? 'bg-[#7cff6b]' : 'bg-white')}>餐食记录示例</button>
    </div>
    {view === 'recognition' ? <>
      <div className={outline + ' bg-[#f5f0e4] p-2'}>
        <div className="flex items-end justify-between gap-2"><div><p className="font-pixel text-[8px] text-black/50">DEMO · ONE DAY</p><h2 className="mt-1 text-[14px] font-bold">示例能量账本</h2></div><div className="text-right"><strong className="font-pixel text-[23px]">1,326</strong><span className="ml-1 text-[9px] text-black/50">/ 2,100 kcal</span></div></div>
        <div aria-hidden="true" className="mt-2 h-2 border border-black bg-white"><div className="h-full w-[63%] border-r border-black bg-[#7cff6b]" /></div>
        <div className="mt-1.5 grid grid-cols-3 gap-1 text-[9px]">{['蛋白质 74g', '蔬果 4份', '饮水 1.4L'].map(label => <span key={label} className="border border-black/30 bg-white px-1 py-1 font-bold">{label}</span>)}</div>
        <p className="mt-1 text-[9px] text-black/50">演示数值，非个人目标或真实统计。</p>
      </div>
      <article className={outline + ' overflow-hidden bg-white'}>
        <div className="flex items-center justify-between gap-2 bg-black p-3 text-white"><div><p className="text-[11px] font-bold">{meal.time} · 示例</p><p className="mt-1 text-[9px] text-white/60">DATASET UI SAMPLE · FOODSENSE</p></div><span className="border border-[#7cff6b] px-2 py-1 font-pixel text-[8px] text-[#7cff6b]">{meal.regions} REGIONS</span></div>
        <div className="relative aspect-[16/10] overflow-hidden bg-[#f5f0e4]">
          <img src={meal.image} alt={`${meal.title}示例照片`} className="h-full w-full object-cover" />
          {selected === 0 && !showOriginal && FOOD_DEMO_REGIONS.map((region, index) => <div aria-hidden="true" key={region.name} className="pointer-events-none absolute border-2" style={{ left: `${region.box[0]}%`, top: `${region.box[1]}%`, width: `${region.box[2]}%`, height: `${region.box[3]}%`, borderColor: region.color }}><span className="absolute -top-4 left-0 bg-black px-1 font-pixel text-[9px] text-white">{index + 1}</span></div>)}
          <span className="absolute bottom-2 left-2 border border-black bg-white/95 px-2 py-1 text-[9px] font-bold">{selected === 0 && !showOriginal ? '示意框 · 非 SAM 分割结果' : '数据集示例照片'}</span>
          {selected === 0 && <button type="button" onClick={() => setShowOriginal(value => !value)} className="absolute bottom-2 right-2 flex items-center gap-1 border border-white/50 bg-black/75 px-2 py-1 text-[9px] text-white"><Eye size={11} />{showOriginal ? '显示示意框' : '查看原图'}</button>}
        </div>
        <div className="space-y-3 border-t-2 border-black p-3">
          <div className="flex items-start justify-between gap-2"><div><h3 className="text-[15px] font-bold">{meal.title}</h3><p className="mt-1 text-[10px] text-black/50">{selected === 0 ? '估计食用 411g · 示例估算' : '示例估算 · 不计入实际摄入'}</p></div><div className="shrink-0 text-right"><strong className="font-pixel text-[17px] text-[#087a43]">{meal.energy}</strong><p className="mt-1 text-[9px] text-black/50">KCAL · 演示范围</p></div></div>
          {selected === 0 && <>
            <div className="grid grid-cols-4 divide-x divide-black/25 border-y border-black/25 py-2">{[['45', '蛋白质', '#7cff6b'], ['28', '碳水', '#ffe46b'], ['24', '脂肪', '#ed77cb'], ['9', '膳食纤维', '#91cff4']].map(([value, label, color]) => <div key={label} className="text-center"><strong className="font-pixel text-[13px]">{value}<span className="text-[8px]">g</span></strong><p className="mt-1 flex items-center justify-center gap-1 text-[9px] text-black/55"><span className="h-1.5 w-1.5 rounded-full border border-black" style={{ background: color }} />{label}</p></div>)}</div>
            {FOOD_DEMO_REGIONS.map((region, index) => <div key={region.name} className="flex items-center gap-2 border border-black/30 bg-[#f8f8f5] p-2"><span className="grid h-7 w-7 shrink-0 place-items-center border border-black font-pixel text-[11px]" style={{ background: region.color }}>{index + 1}</span><div className="min-w-0 flex-1"><p className="text-[11px] font-bold">{region.name}</p><p className="mt-1 text-[9px] text-black/50">{region.detail} · 示例</p></div><div className="text-right"><strong className="text-[11px]">{region.portion}</strong><p className="mt-1 text-[9px] text-black/50">{region.energy}</p></div></div>)}
          </>}
          <button type="button" onClick={() => setView('records')} className="flex w-full items-center justify-between border-t border-black/20 pt-3 text-[11px] font-bold">看看餐食记录长什么样<ArrowRight size={15} /></button>
        </div>
      </article>
    </> : <>
      <div className={outline + ' bg-[#7cff6b] p-3'}><h2 className="font-pixel text-[11px]">DEMO WEEK <span className="font-sans text-[11px]">/ 示例周报</span></h2><div className="mt-3 grid grid-cols-3 gap-2">{[['12', '示例餐食'], ['86%', '示例蛋白质达成'], ['7', '示例蔬果份数']].map(([value, label]) => <div key={label} className="border border-black bg-white px-1 py-3 text-center"><strong className="font-pixel text-[19px]">{value}</strong><p className="mt-2 text-[9px] text-black/50">{label}</p></div>)}</div></div>
      <div className="flex items-center justify-between gap-2 border-b-2 border-black pb-2"><h2 className="font-pixel text-[11px]">MEAL MEMORY</h2><span className="text-[10px] text-black/55">餐食记录示例 · 非真实记忆</span></div>
      <div className="grid grid-cols-2 gap-2">{FOOD_PHOTO_DEMOS.map((item, index) => <button type="button" key={item.id} onClick={() => { setSelected(index); setShowOriginal(false); setView('recognition'); }} aria-label={`查看${item.title}示例`} className={outline + ' overflow-hidden bg-white text-left'}><div className="relative aspect-[4/3]"><img src={item.image} alt={item.title} loading="lazy" className="h-full w-full object-cover" /><span className="absolute left-1.5 top-1.5 border border-black bg-[#7cff6b] px-1 py-0.5 font-pixel text-[9px]">{item.energy}</span></div><div className="space-y-2 border-t-2 border-black p-2"><h3 className="text-[11px] font-bold leading-relaxed">{item.title}</h3><p className="text-[9px] text-black/50">{item.time}</p><p className="flex items-center justify-between border-t border-black/20 pt-2 text-[9px]">{item.regions} 个示例食物区域<ArrowRight size={12} /></p></div></button>)}</div>
    </>}
    <div className="flex items-start gap-2 border border-black/25 bg-white p-3 text-[10px] leading-relaxed text-black/60"><ImageIcon size={16} className="shrink-0" /><p>看完示例，使用上方“拍一餐”或“从相册选择”开始。只有你确认实际吃过的餐食，才进入今天记忆；示例不会自动成为识别结果。</p></div>
  </section>;
}
