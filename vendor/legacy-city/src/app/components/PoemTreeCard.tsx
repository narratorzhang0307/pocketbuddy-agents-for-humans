// 诗歌树详情卡（地球点开 poemtree marker 时展示：诗 + 四维 + 那棵会长的树）。
// 自成一体：接独立 props（不依赖 MarkerDetailData 类型），MarkerDetail 接线时只需传值一行。
// 共享详情层反向 import 诗歌树展示件（PoemPlantCanvas）——不违反「lib/poemtree 不 import 其他 agent」。
import PoemPlantCanvas from './PoemPlantCanvas';
import { ATTR_DEFS, type PoemAttributes } from '../lib/poemtree';

const GREEN = '#8bc34a';

export default function PoemTreeCard({ poet, title, lines, excerpt, attributes, seed, place }: {
  poet?: string; title?: string; lines?: string[]; excerpt?: string;
  attributes: PoemAttributes; seed: number; place?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-center"><PoemPlantCanvas attributes={attributes} seed={seed} size={220} /></div>
      {(title || poet) && <div className="font-pixel text-[9px] text-center">{title ? title + ' · ' : ''}{poet || ''}</div>}
      {place && <div className="font-pixel text-[7px] text-center" style={{ color: GREEN }}>◆ 种在 {place}</div>}
      {lines && lines.length > 0 ? (
        <div className="text-[11px] text-black/70 leading-relaxed text-center italic max-h-[120px] overflow-y-auto">
          {lines.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      ) : excerpt ? <div className="text-[11px] text-black/70 italic text-center">「{excerpt}」</div> : null}
      <div className="grid grid-cols-2 gap-1.5">
        {ATTR_DEFS.map((d) => (
          <div key={d.key} className="border border-black/30 p-1">
            <div className="flex justify-between items-baseline"><span className="font-pixel text-[8px]">{d.name}</span><span className="font-pixel text-[9px]" style={{ color: GREEN }}>{attributes[d.key]}</span></div>
            <div className="h-1.5 bg-black/10 mt-0.5"><div className="h-full" style={{ width: attributes[d.key] + '%', background: GREEN }} /></div>
            <div className="text-[8px] text-black/40 mt-0.5 truncate">{d.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
