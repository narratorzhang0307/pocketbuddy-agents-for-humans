import { Check, ChevronRight } from 'lucide-react';
import type { PocketPlantAsset } from '../lib/pocket-plants/catalog';
import './OutingBagRitual.css';

export const OUTING_SEED_DISPLAY_LIMIT = 8;

type OutingBagRitualProps = {
  guideLabel: string;
  seeds: readonly PocketPlantAsset[];
  selectedSeedIds: readonly string[];
  seedCounts: Readonly<Record<string, number>>;
  onToggleSeed: (seedId: string) => void;
  onManageSeeds: () => void;
};

export default function OutingBagRitual({
  guideLabel,
  seeds,
  selectedSeedIds,
  seedCounts,
  onToggleSeed,
  onManageSeeds,
}: OutingBagRitualProps) {
  const selectedSeeds = seeds.filter((seed) => selectedSeedIds.includes(seed.id));
  const visibleSeeds = [
    ...selectedSeeds,
    ...seeds.filter((seed) => !selectedSeedIds.includes(seed.id)),
  ].slice(0, OUTING_SEED_DISPLAY_LIMIT);

  return (
    <section
      className="outing-bag-ritual"
      aria-label={`${guideLabel}的植物种子选择`}
    >
      <header className="outing-bag-ritual__header">
        <span>PLANTING KIT · 今日植物</span>
        <strong>每次出门至少带 1 枚</strong>
      </header>

      <div className="outing-bag-ritual__seed-grid" role="group" aria-label="选择本次出门携带的植物种子">
        {visibleSeeds.map((seed) => {
          const selected = selectedSeedIds.includes(seed.id);
          const available = (seedCounts[seed.id] ?? 0) > 0;
          return (
            <button
              key={seed.id}
              type="button"
              role="checkbox"
              aria-checked={selected}
              className={selected ? 'is-packed' : ''}
              disabled={!available}
              onClick={() => onToggleSeed(seed.id)}
            >
              <img src={seed.thumbSrc ?? seed.src} alt="" />
              <span>
                <strong>{seed.name}</strong>
                <small>{available ? `种子 × ${seedCounts[seed.id]}` : '尚未解锁'}</small>
              </span>
              <i aria-hidden="true"><Check size={9} strokeWidth={3} /></i>
            </button>
          );
        })}
      </div>

      <footer>
        <span>
          {selectedSeeds.length
            ? `${selectedSeeds.map((seed) => seed.name).join('、')} · 途中可种下`
            : '正在装入第一枚已解锁种子'}
        </span>
        <button type="button" onClick={onManageSeeds}>
          管理种子 <ChevronRight size={11} strokeWidth={2.7} />
        </button>
      </footer>
    </section>
  );
}
