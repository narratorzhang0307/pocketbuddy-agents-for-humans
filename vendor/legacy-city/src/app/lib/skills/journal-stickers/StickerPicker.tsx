// ════════════════════════════════════════════════════════════════════════════
// 手帐贴纸 · 选择器 <StickerPicker> —— 可选的贴纸抽屉 UI（分类切换 + 网格 + 搜索）
// ────────────────────────────────────────────────────────────────────────────
// 解耦：只通过 onPick(stickerId) 回调把「选了哪枚」告诉上层，自己不碰放置/持久化。
// 手帐侧可把它挂进材质抽屉（JournalMaterials），点一下贴纸 → 上层负责往当前页 addElement(type:'sticker', meta:{stickerId})。
// 样式内联、自成一体（牛皮纸/奶油基调），不依赖任何全局 CSS 框架。
// ════════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react';
import { getStickersByCategory, searchStickers, STICKER_CATEGORIES } from './catalog';
import type { StickerCategory } from './manifest';
import { StickerArt } from './StickerArt';

export interface StickerPickerProps {
  onPick: (stickerId: string) => void;
  defaultCategory?: StickerCategory;
  className?: string;
  style?: React.CSSProperties;
}

export function StickerPicker({ onPick, defaultCategory = 'camera', className, style }: StickerPickerProps) {
  const [cat, setCat] = useState<StickerCategory>(defaultCategory);
  const [q, setQ] = useState('');

  const list = useMemo(() => (q.trim() ? searchStickers(q) : getStickersByCategory(cat)), [q, cat]);

  return (
    <div
      className={className}
      style={{
        width: 300,
        maxWidth: '90vw',
        background: '#f6efe1',
        border: '1px solid #d8cbb0',
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(60,48,30,0.18)',
        padding: 10,
        fontFamily: "'PingFang SC','Hiragino Sans GB',sans-serif",
        ...style,
      }}
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="搜贴纸：相机 / 小动物 / 胶带…"
        style={{
          width: '100%', boxSizing: 'border-box', marginBottom: 8, padding: '6px 10px',
          border: '1px solid #d8cbb0', borderRadius: 8, background: '#fffdf7',
          fontSize: 13, color: '#4a4540', outline: 'none',
        }}
      />

      {!q.trim() && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {STICKER_CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setCat(c.key)}
              style={{
                border: 'none', cursor: 'pointer', borderRadius: 999,
                padding: '3px 9px', fontSize: 12,
                background: cat === c.key ? '#ec8140' : '#ece2cd',
                color: cat === c.key ? '#fff' : '#6b6152',
              }}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
      )}

      <div
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6,
          maxHeight: 300, overflowY: 'auto', paddingRight: 2,
        }}
      >
        {list.map((s) => (
          <button
            key={s.id}
            onClick={() => onPick(s.id)}
            title={s.name}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              aspectRatio: '1 / 1', background: '#fffdf7', border: '1px solid #e6dcc6',
              borderRadius: 10, cursor: 'pointer', padding: 6,
            }}
          >
            <StickerArt id={s.id} size={44} />
          </button>
        ))}
        {list.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#a99b82', fontSize: 12, padding: 16 }}>
            没有匹配的贴纸
          </div>
        )}
      </div>
    </div>
  );
}
