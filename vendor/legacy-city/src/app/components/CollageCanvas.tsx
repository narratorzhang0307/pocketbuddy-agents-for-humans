// 漫游手帐 · 自由拼贴画布：元素按归一坐标(0..1)绝对定位，translate(-50%,-50%) rotate scale 到位。
// 交互：单指拖动(改 x/y) · 双指捏合(改 scale/rot) · 桌面旋转/缩放手柄 · 置顶置底 · 双击编辑文字 · 二次确认删除。
// 旋转/缩放由「中心 ↔ 指针」在画布坐标系算（不受手柄自身变换影响）；手柄只反缩放自身尺寸、贴边自动翻转。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RotateCw, Trash2, ChevronUp, ChevronDown, Pencil } from 'lucide-react';
import type { JournalPage } from '../lib/journal/types';
import {
  bringToFront,
  commitJournalChanges,
  getElementUrl,
  moveElementTransient,
  pinBlobs,
  removeElement,
  sendToBack,
  updateElementTransient,
} from '../lib/journal/store';
import { INK_FONT, JournalElementView } from './JournalMaterials';
import './BirdJournal.css';

const BG: Record<JournalPage['bg'], React.CSSProperties> = {
  kraft: { background: 'linear-gradient(135deg,#d8c5a0,#c8b28a)' },
  paper: { background: '#f4efe2' },
  grid: { background: 'repeating-linear-gradient(0deg,#faf8f2 0 22px,#e7e2d4 22px 23px), repeating-linear-gradient(90deg,#faf8f2 0 22px,#e7e2d433 22px 23px), #faf8f2' },
};

type Gesture =
  | { mode: 'drag'; id: string; px: number; py: number; ox: number; oy: number }
  | { mode: 'rotate'; id: string; cx: number; cy: number }
  | { mode: 'scale'; id: string; cx: number; cy: number; startDist: number; startScale: number }
  | { mode: 'pinch'; id: string; cx: number; cy: number; startDist: number; startAngle: number; startScale: number; startRot: number };

const MIN_SCALE = 0.15, MAX_SCALE = 8;
const clampScale = (s: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
const clampCenter = (v: number) => Math.max(0.03, Math.min(0.97, v));   // 软钳：中心始终留在页内→永远抓得回

export default function CollageCanvas({ page, selectedId, onSelect, editable = true, mapBackdrop = false }: {
  page: JournalPage;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  editable?: boolean;
  mapBackdrop?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const ptsRef = useRef<Map<number, { x: number; y: number }>>(new Map());   // 活跃指针（判单指/双指）
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [pendingDel, setPendingDel] = useState<string | null>(null);
  const delTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureFrameRef = useRef(0);
  const pendingGestureMutationRef = useRef<(() => void) | null>(null);

  // 解析图类元素的 objectURL（store 引用感知 LRU 托管；对当前所有 blobId 都取一遍，刷新 recency、覆盖为最新 URL）
  useEffect(() => {
    let disposed = false;
    pinBlobs(page.elements.map((e) => e.blobId).filter(Boolean) as string[]);   // 登记在屏 blob：绝不被 LRU 淘汰
    (async () => {
      const next: Record<string, string> = {};
      for (const el of page.elements) {
        if (el.blobId) { const u = await getElementUrl(el.blobId); if (u) next[el.blobId] = u; }
      }
      // 用当前页解析结果整体替换（而非合并），修剪掉已不在页上的旧 blobId，杜绝残留已 revoke 的 URL
      if (!disposed) setUrls(next);
    })();
    return () => { disposed = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.elements.map((e) => e.blobId).join(',')]);

  useEffect(() => () => { if (delTimer.current) clearTimeout(delTimer.current); }, []);
  useEffect(() => {
    const flushPendingEdits = () => commitJournalChanges();
    const flushWhenHidden = () => {
      if (document.hidden) flushPendingEdits();
    };
    window.addEventListener('pagehide', flushPendingEdits);
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      window.removeEventListener('pagehide', flushPendingEdits);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      flushPendingEdits();
    };
  }, []);

  const rect = () => boxRef.current?.getBoundingClientRect();
  const centerOf = (id: string) => {
    const r = rect(); const el = page.elements.find((x) => x.id === id);
    if (!r || !el) return { cx: 0, cy: 0 };
    return { cx: r.left + el.x * r.width, cy: r.top + el.y * r.height };
  };

  // —— 手势：单指拖 / 双指捏合 / 手柄旋转缩放（window 级监听，跟手到松手）——
  useLayoutEffect(() => {
    if (!editable) return;
    // 高频 pointermove 只保留当前帧最后一次坐标，避免 120Hz 触控设备重复广播整页。
    const flushGestureMutation = () => {
      if (gestureFrameRef.current) {
        cancelAnimationFrame(gestureFrameRef.current);
        gestureFrameRef.current = 0;
      }
      const run = pendingGestureMutationRef.current;
      pendingGestureMutationRef.current = null;
      run?.();
    };
    const scheduleGestureMutation = (run: () => void) => {
      pendingGestureMutationRef.current = run;
      if (gestureFrameRef.current) return;
      gestureFrameRef.current = requestAnimationFrame(() => {
        gestureFrameRef.current = 0;
        const latest = pendingGestureMutationRef.current;
        pendingGestureMutationRef.current = null;
        latest?.();
      });
    };
    const onMove = (e: PointerEvent) => {
      const g = gestureRef.current; const r = rect();
      if (!g || !r) return;
      if (ptsRef.current.has(e.pointerId)) ptsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (g.mode === 'pinch') {
        const pts = [...ptsRef.current.values()];
        if (pts.length < 2) return;
        const [a, b] = pts;
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const patch = {
          scale: clampScale(g.startScale * (dist / Math.max(1, g.startDist))),
          rot: Math.round(g.startRot + (ang - g.startAngle) * 180 / Math.PI),
        };
        scheduleGestureMutation(() => updateElementTransient(page.id, g.id, patch));
      } else if (g.mode === 'drag') {
        const x = clampCenter(g.ox + (e.clientX - g.px) / r.width);
        const y = clampCenter(g.oy + (e.clientY - g.py) / r.height);
        scheduleGestureMutation(() => moveElementTransient(page.id, g.id, x, y));
      } else if (g.mode === 'rotate') {
        const rot = Math.round(Math.atan2(e.clientY - g.cy, e.clientX - g.cx) * 180 / Math.PI + 90);
        scheduleGestureMutation(() => updateElementTransient(page.id, g.id, { rot }));
      } else if (g.mode === 'scale') {
        const scale = clampScale(g.startScale * (Math.hypot(e.clientX - g.cx, e.clientY - g.cy) / Math.max(1, g.startDist)));
        scheduleGestureMutation(() => updateElementTransient(page.id, g.id, { scale }));
      }
    };
    const onUp = (e: PointerEvent) => {
      const hadGesture = gestureRef.current !== null;
      flushGestureMutation();
      if (hadGesture) commitJournalChanges();
      ptsRef.current.delete(e.pointerId);
      if (ptsRef.current.size === 0) gestureRef.current = null;
      else if (gestureRef.current?.mode === 'pinch' && ptsRef.current.size < 2) gestureRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (gestureFrameRef.current) cancelAnimationFrame(gestureFrameRef.current);
      gestureFrameRef.current = 0;
      // 若组件在手势或文字编辑中途卸载，最后一帧与未 blur 的文字仍安全落盘。
      const latest = pendingGestureMutationRef.current;
      pendingGestureMutationRef.current = null;
      latest?.();
      commitJournalChanges();
    };
  }, [page.id, editable]);

  const onElDown = (e: React.PointerEvent, id: string) => {
    if (!editable) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    ptsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    onSelect(id);
    const el = page.elements.find((x) => x.id === id);
    if (!el) return;
    if (ptsRef.current.size >= 2) {   // 第二指落到同一元素 → 捏合缩放+旋转
      const [a, b] = [...ptsRef.current.values()];
      gestureRef.current = { mode: 'pinch', id, cx: 0, cy: 0, startDist: Math.hypot(b.x - a.x, b.y - a.y), startAngle: Math.atan2(b.y - a.y, b.x - a.x), startScale: el.scale, startRot: el.rot };
    } else {
      gestureRef.current = { mode: 'drag', id, px: e.clientX, py: e.clientY, ox: el.x, oy: el.y };
    }
  };
  const startRotate = (e: React.PointerEvent, id: string) => { e.stopPropagation(); e.preventDefault(); gestureRef.current = { mode: 'rotate', id, ...centerOf(id) }; };
  const startScale = (e: React.PointerEvent, id: string) => {
    e.stopPropagation(); e.preventDefault();
    const { cx, cy } = centerOf(id);
    const el = page.elements.find((x) => x.id === id);
    gestureRef.current = { mode: 'scale', id, cx, cy, startDist: Math.hypot(e.clientX - cx, e.clientY - cy), startScale: el?.scale ?? 1 };
  };

  const askDelete = () => {
    if (!selectedId) return;
    if (pendingDel === selectedId) { if (delTimer.current) clearTimeout(delTimer.current); removeElement(page.id, selectedId); setPendingDel(null); onSelect(null); return; }
    setPendingDel(selectedId);
    if (delTimer.current) clearTimeout(delTimer.current);
    delTimer.current = setTimeout(() => setPendingDel(null), 1800);
  };

  // 地图手帐共用实时底图时，只隐藏系统首次铺页的牛皮纸衬底；用户在普通手帐里自加的纸块不受影响。
  const sorted = page.elements
    .filter((el) => !(mapBackdrop && el.id === `${page.id}-kraft`))
    .sort((a, b) => a.z - b.z);

  return (
    <div
      ref={boxRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ ...(mapBackdrop ? { background: 'transparent' } : BG[page.bg]), touchAction: 'none' }}
      onPointerDown={() => { if (editable) { onSelect(null); setEditing(null); setPendingDel(null); } }}
    >
      {sorted.map((el) => {
        const sel = el.id === selectedId;
        // 首次铺页时照片先保留同源 photoRef，IndexedDB 物化完成后再无缝切到 blob URL。
        // 这样隐私模式或存储被禁用时也不会把整页卡在“铺页中”。
        const photoRef = el.meta?.photoRef as { ref?: unknown } | undefined;
        const url = el.blobId
          ? urls[el.blobId]
          : typeof photoRef?.ref === 'string' ? photoRef.ref : undefined;
        const isText = el.type === 'bubble' || el.type === 'note';
        const inv = 1 / (el.scale || 1);
        const rotBelow = el.y < 0.14;   // 贴上/下边时手柄翻转，避免被 overflow 裁掉
        const scaleTop = el.y > 0.86;
        const scaleLeft = el.x > 0.86;
        const scalePos = `${scaleTop ? 'top' : 'bottom'}${scaleLeft ? 'L' : 'R'}`;
        const birdMotion = typeof el.meta?.birdMotion === 'string' ? el.meta.birdMotion : undefined;
        return (
          <div
            key={el.id}
            onPointerDown={(e) => onElDown(e, el.id)}
            onDoubleClick={(e) => { if (isText && editable) { e.stopPropagation(); onSelect(el.id); setEditing(el.id); } }}
            className={`absolute ${mapBackdrop ? 'pointer-events-auto' : ''}`}
            style={{
              left: `${el.x * 100}%`, top: `${el.y * 100}%`, width: `${el.w * 100}%`,
              transform: `translate(-50%,-50%) rotate(${el.rot}deg) scale(${el.scale})`,
              transformOrigin: 'center', zIndex: el.z, cursor: editable ? 'move' : 'default',
              outline: sel ? '1.5px dashed rgba(0,0,0,0.55)' : undefined, outlineOffset: 4,
              touchAction: 'none',
            }}
          >
            {editing === el.id ? (
              // 反变换：无论元素怎么转/缩，编辑面板恒正立、字号恒定，输入不别扭
              <div style={{ transform: `rotate(${-el.rot}deg) scale(${inv})`, transformOrigin: 'center' }}>
                <textarea
                  autoFocus
                  defaultValue={el.text ?? ''}
                  onChange={(e) => updateElementTransient(page.id, el.id, { text: e.target.value })}
                  onBlur={() => { commitJournalChanges(); setEditing(null); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="min-h-[3em] p-2 text-[11px] leading-relaxed bg-white/95 border-2 border-black/40 outline-none resize-none"
                  style={{ fontFamily: INK_FONT, width: 200, maxWidth: '58vw' }}
                />
              </div>
            ) : (
              birdMotion ? (
                <div
                  className={`bird-journal-motion bird-journal-motion-${birdMotion}`}
                  style={{ animationDelay: `${-(el.z % 5) * 0.37}s` }}
                >
                  <JournalElementView el={el} url={url} />
                </div>
              ) : <JournalElementView el={el} url={url} />
            )}

            {/* 选中手柄：随元素旋转，但只反缩放【自身尺寸】(1/scale)，位置留在视觉边缘；贴边自动翻转 */}
            {sel && editable && editing !== el.id && (
              <div className="absolute inset-0 pointer-events-none">
                {/* 旋转手柄定位杆（从边缘牵出，旋转可发现性更强） */}
                <div className="absolute left-1/2 -translate-x-1/2 w-px bg-black/45 pointer-events-none" style={{ height: 34, [rotBelow ? 'top' : 'bottom']: '100%' }} />
                <Handle title="旋转" inv={inv} pos={rotBelow ? 'bottomC' : 'topC'} onPointerDown={(e) => startRotate(e, el.id)}><RotateCw className="w-3.5 h-3.5" /></Handle>
                <Handle title="缩放" inv={inv} pos={scalePos} onPointerDown={(e) => startScale(e, el.id)}><span className="text-[11px] font-bold leading-none">⤡</span></Handle>
              </div>
            )}
          </div>
        );
      })}

      {/* 选中工具条（画布顶部，不随元素旋转/缩放；图标下带小字，触屏可发现） */}
      {selectedId && editable && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[999] flex items-stretch gap-0.5 border-2 border-black bg-white px-1 py-1 shadow-[2px_2px_0_#000]"
          onPointerDown={(e) => e.stopPropagation()}>
          <ToolBtn label="置顶" onClick={() => bringToFront(page.id, selectedId)}><ChevronUp className="w-4 h-4" /></ToolBtn>
          <ToolBtn label="置底" onClick={() => sendToBack(page.id, selectedId)}><ChevronDown className="w-4 h-4" /></ToolBtn>
          {isTextEl(page, selectedId) && <ToolBtn label="文字" onClick={() => setEditing(selectedId)}><Pencil className="w-4 h-4" /></ToolBtn>}
          <ToolBtn label={pendingDel === selectedId ? '再点删' : '删除'} danger active={pendingDel === selectedId} onClick={askDelete}><Trash2 className="w-4 h-4" /></ToolBtn>
        </div>
      )}
    </div>
  );
}

function isTextEl(page: JournalPage, id: string) {
  const t = page.elements.find((e) => e.id === id)?.type;
  return t === 'bubble' || t === 'note';
}

const POS: Record<string, string> = {
  topC: '-top-10 left-1/2', bottomC: '-bottom-10 left-1/2',
  bottomR: '-bottom-4 -right-4', topR: '-top-4 -right-4',
  bottomL: '-bottom-4 -left-4', topL: '-top-4 -left-4',
};
function Handle({ children, pos, inv, onPointerDown, title }: {
  children: React.ReactNode; pos: string; inv: number; onPointerDown: (e: React.PointerEvent) => void; title: string;
}) {
  const centerX = pos === 'topC' || pos === 'bottomC';
  return (
    <button
      title={title}
      onPointerDown={onPointerDown}
      // 视觉 28px、四向 -inset-2 扩大触屏热区到 ~44px；只反缩放自身尺寸，位置不缩
      className={`absolute ${POS[pos]} w-7 h-7 rounded-full border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] pointer-events-auto active:translate-y-px before:absolute before:-inset-2 before:content-['']`}
      style={{ transform: `${centerX ? 'translateX(-50%) ' : ''}scale(${inv})`, transformOrigin: 'center' }}
    >
      {children}
    </button>
  );
}
function ToolBtn({ children, onClick, label, danger, active }: { children: React.ReactNode; onClick: () => void; label: string; danger?: boolean; active?: boolean }) {
  return (
    <button title={label} onClick={onClick}
      className={`min-w-[38px] px-1.5 py-0.5 flex flex-col items-center gap-0.5 border border-black/10 active:translate-y-px ${active ? 'bg-[#c0392b] text-white' : danger ? 'text-[#c0392b] hover:bg-black/5' : 'text-black/75 hover:bg-black/5'}`}>
      {children}
      <span className="text-[7px] leading-none tracking-wide">{label}</span>
    </button>
  );
}
