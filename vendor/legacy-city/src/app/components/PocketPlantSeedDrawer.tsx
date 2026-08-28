import { Check, Sprout, X } from 'lucide-react';
import type { PocketPlantAsset } from '../lib/pocket-plants/catalog';
import { POCKET_SEED_POUCH_LIMIT } from '../lib/pocket-plants/planting';
import ProgressiveImage from './ProgressiveImage';

type PocketPlantSeedDrawerProps = {
  assets: readonly PocketPlantAsset[];
  pouchIds: readonly string[];
  seedCounts: Readonly<Record<string, number>>;
  activeId: string | null;
  onToggle: (assetId: string) => void;
  onClose: () => void;
  onChooseLocation: () => void;
  actionLabel?: string;
};

export default function PocketPlantSeedDrawer({
  assets,
  pouchIds,
  seedCounts,
  activeId,
  onToggle,
  onClose,
  onChooseLocation,
  actionLabel = '去地图选择落点',
}: PocketPlantSeedDrawerProps) {
  const active = assets.find((asset) => asset.id === activeId) ?? null;

  return (
    <section
      className="sg-seed-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sg-seed-drawer-title"
      data-ignore-map-destination
    >
      <header>
        <span aria-hidden="true"><Sprout size={18} strokeWidth={2.6} /></span>
        <div>
          <small>POCKET PLANTS · 今日种子袋</small>
          <h2 id="sg-seed-drawer-title">挑几枚种子装进口袋</h2>
          <p>种子由城市步数解锁，本次最多携带 {POCKET_SEED_POUCH_LIMIT} 枚。</p>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭种子袋">
          <X size={15} strokeWidth={2.8} />
        </button>
      </header>

      <div className="sg-seed-catalog" role="group" aria-label="选择植物种子">
        {assets.map((asset) => {
          const selected = pouchIds.includes(asset.id);
          const count = seedCounts[asset.id] ?? 0;
          const locked = count <= 0;
          return (
            <button
              key={asset.id}
              type="button"
              className={`${selected ? 'is-selected' : ''}${activeId === asset.id ? ' is-active' : ''}`}
              onClick={() => onToggle(asset.id)}
              disabled={locked}
              aria-pressed={selected}
              title={locked ? `${asset.name}尚未解锁` : `${asset.name} · ${asset.description}`}
            >
              <span>
                <ProgressiveImage
                  src={asset.src}
                  previewSrc={asset.thumbSrc ?? asset.src}
                  alt=""
                  draggable={false}
                />
              </span>
              <strong>{asset.name}</strong>
              <em>{asset.scientificName}</em>
              <p>{asset.description}</p>
              <small>{locked ? '步数解锁' : selected ? '已装袋' : `种子 × ${count}`}</small>
              <i aria-hidden="true"><Check size={10} strokeWidth={3} /></i>
            </button>
          );
        })}
      </div>

      <footer>
        <div>
          <small>口袋容量</small>
          <strong>{pouchIds.length} / {POCKET_SEED_POUCH_LIMIT}</strong>
          <span>{active ? `${active.name} · ${active.description}` : '先选择至少一枚种子'}</span>
        </div>
        <button type="button" onClick={onChooseLocation} disabled={!active}>
          <Sprout size={15} strokeWidth={2.7} />
          {actionLabel}
        </button>
      </footer>
    </section>
  );
}
