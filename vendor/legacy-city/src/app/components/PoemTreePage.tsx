// 一棵诗歌树的完整页面 = NFC 铭牌的落地页（?tree=<id> 深链目标）。
// 「每一棵诗树都有一个现实中的根。碰一下，它就开花。」
// arrived=true（从 NFC/深链打开）时执行「点亮」：这是展览的核心仪式——真实抵达才开花。
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Globe2, MapPin } from 'lucide-react';
import { ATTR_DEFS, type PoemTree } from '../lib/poemtree';
import { EXHIBITION_STOPS, EXHIBITION_TITLE, getExhibitionTree } from '../lib/poemtree/exhibition';
import { getUserTree, isLit, lightTree, litAt } from '../lib/poemtree/garden';
import { requestMapFocus } from '../data/mapFocus';
import PoemPlantCanvas from './PoemPlantCanvas';
import PoemTreeARView from './PoemTreeARView';
import NfcPlaqueCard from './NfcPlaqueCard';

const GREEN = '#00c07f';

// 树的视觉：自制影像（用户手作杭州素材，OSS）↔ 代码树 Canvas 可切换；影像加载失败自动回退 Canvas
function TreeVisual({ tree }: { tree: PoemTree }) {
  const [useVideo, setUseVideo] = useState(!!tree.videoUrl);
  const [videoOk, setVideoOk] = useState(true);
  const showVideo = useVideo && videoOk && !!tree.videoUrl;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-center">
        {showVideo ? (
          <video key={tree.videoUrl} src={tree.videoUrl} poster={tree.coverUrl} autoPlay muted loop playsInline
            onError={() => setVideoOk(false)}
            className="w-[280px] h-[280px] object-cover border-2 border-black" />
        ) : (
          <PoemPlantCanvas attributes={tree.attributes} seed={tree.seed} size={280} />
        )}
      </div>
      {tree.videoUrl && videoOk && (
        <div className="flex justify-center gap-1">
          {(['影像', '代码树'] as const).map((m, i) => {
            const active = (i === 0) === showVideo;
            return (
              <button key={m} onClick={() => setUseVideo(i === 0)}
                className={`font-pixel text-[6px] border border-black px-1.5 py-0.5 active:translate-y-px ${active ? 'bg-black text-[#7CFF6B]' : 'bg-white text-black/55'}`}>
                {m}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PoemTreePage({ treeId, arrived, onBack }: { treeId: string; arrived?: boolean; onBack: () => void }) {
  const tree: PoemTree | undefined = useMemo(() => getExhibitionTree(treeId) ?? getUserTree(treeId), [treeId]);
  const stop = useMemo(() => EXHIBITION_STOPS.find((s) => s.treeId === treeId), [treeId]);
  const [showAR, setShowAR] = useState(false);
  const [justLit, setJustLit] = useState(false);

  // 真实抵达（NFC/深链）→ 点亮仪式
  useEffect(() => {
    if (arrived && tree) setJustLit(lightTree(tree.id));
  }, [arrived, tree]);

  if (!tree) {
    return (
      <div className="p-4">
        <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px mb-3">
          <ChevronLeft className="w-4 h-4" strokeWidth={3} />
        </button>
        <div className="border-2 border-black bg-white p-4 shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
          <div className="font-pixel text-[9px] tracking-widest">TREE NOT FOUND</div>
          <p className="text-[11px] text-black/60 mt-2">没有找到这棵树（{treeId}）。它可能还没种下，或铭牌写错了链接。</p>
        </div>
      </div>
    );
  }

  const lit = isLit(tree.id);

  return (
    <div className="space-y-3 pb-4">
      {/* 返回 + 展签编号 */}
      <div className="flex items-center gap-2.5">
        <button onClick={onBack} aria-label="返回花园"
          className="w-8 h-8 shrink-0 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
          <ChevronLeft className="w-4 h-4" strokeWidth={3} />
        </button>
        {stop ? (
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-pixel text-[13px]">NO.{String(stop.no).padStart(2, '0')}</span>
            <span className="text-[10px] text-black/50 truncate">{EXHIBITION_TITLE} · 第一回</span>
          </div>
        ) : (
          <span className="font-pixel text-[10px] tracking-wider">MY TREE · 我的树</span>
        )}
        {lit && (
          <span className="ml-auto shrink-0 font-pixel text-[6px] border border-black bg-[#00ff88] text-black px-1.5 py-1">
            ✦ 已点亮
          </span>
        )}
      </div>

      {/* 抵达仪式 */}
      {arrived && (
        <div className="border-2 border-black bg-black p-3 text-center">
          <div className="font-pixel text-[9px] tracking-widest" style={{ color: GREEN }}>
            {justLit ? '✦ 你已抵达 · 这棵树为你点亮' : '✦ 欢迎回来 · 它记得你'}
          </div>
          {litAt(tree.id) && <div className="text-[9px] text-white/40 mt-1">首次点亮 {new Date(litAt(tree.id)!).toLocaleString('zh-CN')}</div>}
        </div>
      )}

      {/* 树本体：有自制影像素材（OSS）优先播，失败/切换回代码树 Canvas */}
      <div className="border-2 border-black bg-white p-3 shadow-[2px_2px_0_rgba(0,0,0,0.85)] space-y-2.5">
        <TreeVisual tree={tree} />
        <div className="text-center space-y-1">
          {(tree.poem.title || tree.poem.poet) && (
            <div className="font-pixel text-[10px]">{tree.poem.title || ''}{tree.poem.poet ? `${tree.poem.title ? ' · ' : ''}${tree.poem.poet}` : ''}</div>
          )}
        </div>
        {tree.poem.lines.length > 0 && (
          <div className="border-l-2 pl-3 py-1 space-y-0.5" style={{ borderColor: GREEN }}>
            {tree.poem.lines.map((l, i) => (
              <div key={i} className="text-[12px] text-black/80 italic leading-relaxed">{l}</div>
            ))}
          </div>
        )}
        {tree.treeVoice && <div className="text-[10.5px] text-black/50 text-center">🌿 {tree.treeVoice}</div>}

        {/* 四维 */}
        <div className="grid grid-cols-2 gap-1.5">
          {ATTR_DEFS.map((d) => (
            <div key={d.key} className="border border-black/30 p-1.5" title={`${d.gloss}\n低：${d.low}\n高：${d.high}`}>
              <div className="flex justify-between items-baseline">
                <span className="font-pixel text-[8px]">{d.name}</span>
                <span className="font-pixel text-[9px]" style={{ color: GREEN }}>{tree.attributes[d.key]}</span>
              </div>
              <div className="h-1.5 bg-black/10 mt-1"><div className="h-full" style={{ width: tree.attributes[d.key] + '%', background: GREEN }} /></div>
              <div className="text-[8px] text-black/40 mt-0.5 truncate">{d.sub} · {d.gloss}</div>
            </div>
          ))}
        </div>

        {/* 地点 + 行动 */}
        {tree.spot && (
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            <span className="flex items-center gap-1 text-[10.5px] text-black/60"><MapPin className="w-3 h-3" />{tree.spot.place}{stop ? ` · ${EXHIBITION_STOPS.find((s) => s.treeId === tree.id)?.spotHint}` : ''}</span>
            <button onClick={() => requestMapFocus(tree.spot!.lng, tree.spot!.lat, 14, { world: 'personal' })}
              className="ml-auto flex items-center gap-1 font-pixel text-[7px] border border-black bg-black text-[#00ff88] px-1.5 py-1 active:translate-y-px">
              <Globe2 className="w-2.5 h-2.5" /> 去地球看
            </button>
          </div>
        )}
        <button onClick={() => setShowAR(true)}
          className="w-full py-2 border-2 border-black bg-black font-pixel text-[9px] uppercase tracking-widest active:translate-y-px" style={{ color: GREEN }}>
          ◆ 让它生长（AR · 会请求相机）
        </button>
      </div>

      {/* 树根 · NFC 铭牌（与「全部铭牌」展签墙共用同一张卡）*/}
      <NfcPlaqueCard tree={tree} />

      {showAR && <PoemTreeARView attributes={tree.attributes} seed={tree.seed} place={tree.spot?.place} arVideoUrl={tree.arVideoUrl} onClose={() => setShowAR(false)} />}
    </div>
  );
}
