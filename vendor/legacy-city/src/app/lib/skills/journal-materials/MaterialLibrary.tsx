// ════════════════════════════════════════════════════════════════════════════
// 手帐素材库 · <MaterialLibrary> —— 分类展开 + 点击添加的素材抽屉 UI
// ────────────────────────────────────────────────────────────────────────────
// 解耦：只通过 onPick(materialId) 回调把「选了哪枚」告诉上层，自己不碰放置/持久化。
// 手帐侧挂进 JournalPane，点一枚素材 → 上层负责往当前页 addElement(type:'sticker', meta:{materialId})。
//
// 设计：手风琴式分类——默认全收起，点分类头展开看缩略图网格，再点一枚贴上。
// 解决「素材库位置不明显」：作为显眼入口常驻底栏，点开即见全部分类与素材。
// 样式内联、自成一体（牛皮纸/奶油基调），不依赖任何全局 CSS 框架。
// ════════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getMaterial, getMaterialsByCategory, MATERIAL_CATEGORIES } from './catalog';
import type { MaterialCategory } from './manifest';

export interface MaterialLibraryProps {
  onPick: (materialId: string) => void;
  defaultOpen?: MaterialCategory | null;   // 默认展开哪个分类（null=全收起）
  className?: string;
  style?: React.CSSProperties;
}

export function MaterialLibrary({ onPick, defaultOpen = null, className, style }: MaterialLibraryProps) {
  const [open, setOpen] = useState<MaterialCategory | null>(defaultOpen);

  return (
    <div
      className={className}
      style={{
        width: '100%',
        background: '#f6efe1',
        border: '1px solid #d8cbb0',
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(60,48,30,0.18)',
        overflow: 'hidden',
        fontFamily: "'PingFang SC','Hiragino Sans GB',sans-serif",
        ...style,
      }}
    >
      {MATERIAL_CATEGORIES.map((c) => {
        const items = getMaterialsByCategory(c.key);
        const isOpen = open === c.key;
        return (
          <div key={c.key} style={{ borderBottom: '1px solid #e3d8bf' }}>
            {/* 分类头：点一下展开/收起 */}
            <button
              onClick={() => setOpen(isOpen ? null : c.key)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 12px', cursor: 'pointer',
                background: isOpen ? '#ec8140' : 'transparent',
                border: 'none', color: isOpen ? '#fff' : '#4a4540',
                transition: 'background .15s',
              }}
            >
              <span style={{ fontSize: 16 }}>{c.emoji}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</span>
              <span style={{ fontSize: 11, opacity: 0.7 }}>{items.length} 件</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.6 }}>{c.hint}</span>
              <ChevronDown
                style={{
                  width: 16, height: 16, transition: 'transform .2s',
                  transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              />
            </button>
            {/* 展开后的缩略图网格 */}
            {isOpen && (
              <div
                style={{
                  display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6,
                  padding: 8, maxHeight: 280, overflowY: 'auto',
                  background: '#fffdf7',
                }}
              >
                {items.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onPick(m.id)}
                    title={m.name}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      aspectRatio: '1 / 1', background: '#fffdf7',
                      border: '1px solid #e6dcc6', borderRadius: 10,
                      cursor: 'pointer', padding: 6, overflow: 'hidden',
                    }}
                  >
                    <MaterialThumb id={m.id} />
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 素材缩略图：按原生比例等比缩放进容器（不变形、留白透明）。
 * 使用 catalog 提供的 thumbPath（_thumb.png）加速加载，加载失败自动回退到原图。 */
export function MaterialThumb({ id, size }: { id: string; size?: number }) {
  const m = getMaterial(id);
  if (!m) return null;
  return (
    <img
      src={m.thumbPath}
      alt={m.name}
      loading="lazy"
      onError={(e) => {
        // 缩略图不存在（小图未生成）时回退到原图
        const el = e.currentTarget;
        if (el.src.endsWith('_thumb.png')) {
          el.src = m.path;
        }
      }}
      style={{
        maxWidth: '100%', maxHeight: '100%',
        width: size, height: size,
        objectFit: 'contain', pointerEvents: 'none',
        // 棋盘格底（让透明区域可辨，选材更直观）
        backgroundImage:
          'linear-gradient(45deg,#ece2cd 25%,transparent 25%),' +
          'linear-gradient(-45deg,#ece2cd 25%,transparent 25%),' +
          'linear-gradient(45deg,transparent 75%,#ece2cd 75%),' +
          'linear-gradient(-45deg,transparent 75%,#ece2cd 75%)',
        backgroundSize: '10px 10px',
        backgroundPosition: '0 0,0 5px,5px -5px,-5px 0',
      }}
    />
  );
}
