// 树根 · NFC 铭牌卡（可复用）：一棵诗树的物理锚点入口。
// 「NFC 是树根，AR 是开花，城市是花园。」把链接写进一枚 NFC 标签、贴在现场——
// 后来者用手机轻轻一碰，这棵树就会为 TA 开花。
// 两种形态：compact 细窄版（展签墙列表，整卡可点击跳到那棵树看 processing 树素材）；
// 完整版（诗树详情页的「树根·NFC 铭牌」核心功能区，含写入按钮与说明）。
import { useState } from 'react';
import { Copy, Nfc } from 'lucide-react';
import type { PoemTree } from '../lib/poemtree';
import { EXHIBITION_STOPS, treeUrl } from '../lib/poemtree/exhibition';
import { nfcWriteSupported, writeTreeNfc } from '../lib/poemtree/garden';

export default function NfcPlaqueCard(
  { tree, showTitle = false, compact = false, onOpen }:
  { tree: PoemTree; showTitle?: boolean; compact?: boolean; onOpen?: () => void },
) {
  const [copied, setCopied] = useState(false);
  const [nfcMsg, setNfcMsg] = useState('');
  const stop = EXHIBITION_STOPS.find((s) => s.treeId === tree.id);
  const url = treeUrl(tree.id);
  const nfcId = stop?.nfcId ?? `NFC_${tree.id}`;

  const copyUrl = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setNfcMsg('复制失败，请手动长按选择链接'); }
  };
  const doNfcWrite = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setNfcMsg('靠近一枚空白 NFC 标签…');
    const r = await writeTreeNfc(url);
    setNfcMsg(r.ok ? '✓ 已写入铭牌！贴到现场吧' : `写入失败：${r.error === 'unsupported' ? '此设备不支持 Web NFC' : r.error}`);
  };

  // —— 紧凑版（展签墙）：细窄两行，整卡点击跳到那棵树（详情页有 processing 树影像/代码树）——
  if (compact) {
    return (
      <div
        role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined}
        onClick={onOpen}
        onKeyDown={onOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } } : undefined}
        className={`border-2 border-black bg-white px-2.5 py-1.5 shadow-[2px_2px_0_rgba(0,0,0,0.85)] ${onOpen ? 'cursor-pointer active:translate-y-px' : ''}`}
      >
        <div className="flex items-center gap-1.5">
          <Nfc className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
          <span className="text-[11px] font-bold truncate">{tree.poem.title || tree.poem.excerpt?.slice(0, 14)}</span>
          <span className="text-[8.5px] text-black/45 truncate">{tree.poem.poet}{tree.spot?.place ? ` · ${tree.spot.place}` : ''}</span>
          <span className="ml-auto shrink-0 font-pixel text-[6px] text-black/35">{nfcId}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <code className="flex-1 min-w-0 truncate text-[8.5px] bg-[#EAEAEA] border border-black/25 px-1.5 py-1">{url}</code>
          <button onClick={copyUrl} aria-label="复制链接"
            className="shrink-0 w-6 h-6 border border-black bg-white flex items-center justify-center active:translate-y-px">
            <Copy className="w-3 h-3" strokeWidth={2.5} />
          </button>
          {nfcWriteSupported() && (
            <button onClick={doNfcWrite} aria-label="写入 NFC 铭牌"
              className="shrink-0 w-6 h-6 border border-black bg-black flex items-center justify-center active:translate-y-px" style={{ color: '#7CFF6B' }}>
              <Nfc className="w-3 h-3" strokeWidth={2.5} />
            </button>
          )}
        </div>
        {(copied || nfcMsg) && <div className="mt-0.5 text-[8px] text-black/55">{copied ? '✓ 已复制' : nfcMsg}</div>}
      </div>
    );
  }

  // —— 完整版（诗树详情页）——
  return (
    <div className="border-2 border-black bg-white p-3 shadow-[2px_2px_0_rgba(0,0,0,0.85)] space-y-2">
      <div className="flex items-center gap-2">
        <Nfc className="w-4 h-4" strokeWidth={2.5} />
        <span className="font-pixel text-[9px] tracking-widest">树根 · NFC 铭牌</span>
        <span className="ml-auto font-pixel text-[7px] text-black/40">{nfcId}</span>
      </div>
      {showTitle && (
        <div className="text-[11px] font-bold truncate">
          {tree.poem.title || tree.poem.excerpt?.slice(0, 16)}
          <span className="ml-1.5 text-[9px] font-normal text-black/45">{tree.poem.poet}{tree.spot?.place ? ` · ${tree.spot.place}` : ''}</span>
        </div>
      )}
      <p className="text-[10px] text-black/55 leading-relaxed">
        把下面的链接写进一枚 NFC 标签、贴在现场——后来者用手机轻轻一碰，这棵树就会为 TA 开花。
      </p>
      <div className="flex items-center gap-1.5">
        <code className="flex-1 min-w-0 truncate text-[9.5px] bg-[#EAEAEA] border border-black/30 px-1.5 py-1.5">{url}</code>
        <button onClick={copyUrl} aria-label="复制链接"
          className="shrink-0 w-7 h-7 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
          <Copy className="w-3.5 h-3.5" strokeWidth={2.5} />
        </button>
      </div>
      {copied && <div className="font-pixel text-[7px]" style={{ color: '#00aa55' }}>✓ 已复制</div>}
      {nfcWriteSupported() ? (
        <button onClick={doNfcWrite}
          className="w-full py-2 border-2 border-black bg-black text-[#7CFF6B] font-pixel text-[8px] uppercase tracking-widest active:translate-y-px">
          ◆ 写入 NFC 铭牌（Web NFC）
        </button>
      ) : (
        <p className="text-[9.5px] text-black/45 leading-relaxed">
          这台设备不支持网页直写 NFC（仅 Android Chrome 支持）——用任意「NFC 写卡」App 把上面的链接写成 URL 记录即可，效果相同。
        </p>
      )}
      {nfcMsg && <div className="text-[10px] text-black/60">{nfcMsg}</div>}
    </div>
  );
}
