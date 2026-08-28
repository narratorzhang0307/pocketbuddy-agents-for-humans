import { useMemo, useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  Check,
  Clock3,
  Eye,
  EyeOff,
  MapPin,
  Sparkles,
  Sprout,
} from 'lucide-react';
import { requestMapFocus } from '../data/mapFocus';
import { POCKET_PLANT_ASSETS } from '../lib/pocket-plants/catalog';
import {
  POCKET_SEED_POUCH_LIMIT,
  readPocketSeedPouch,
  writePocketSeedPouch,
} from '../lib/pocket-plants/planting';
import { readPocketPlantProgress } from '../lib/pocket-plants/progression';
import { getRoamCity, listRoamCities } from '../lib/roam/city';
import {
  createPocketPoemDraft,
  inferPocketPoemMagic,
  recommendPocketPoemPlants,
  savePocketPoemDraft,
  type PocketPoemVisibility,
} from '../lib/poemtree/pocketPoem';
import './PoemSeedStudio.css';

const SAMPLE_SENTENCE = '今晚的风，也替我记住了这条路。';

const seedPreviewStyle = (previewScale = 1) => ({
  '--poem-seed-preview-scale': previewScale,
} as CSSProperties);

function formatBirthTime(date: Date | string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(typeof date === 'string' ? new Date(date) : date);
}
export function PoemSeedStudio({ onPrepared }: { onPrepared?: () => void }) {
  const [sentence, setSentence] = useState(SAMPLE_SENTENCE);
  const [visibility, setVisibility] =
    useState<PocketPoemVisibility>('hidden');
  const progress = readPocketPlantProgress();
  const availableAssets = POCKET_PLANT_ASSETS.filter(
    (asset) => (progress.inventory[asset.id] ?? 0) > 0,
  );
  const recommendations = useMemo(
    () => recommendPocketPoemPlants(sentence, availableAssets),
    [availableAssets, sentence],
  );
  const [chosenId, setChosenId] = useState<string | null>(null);
  const chosen =
    recommendations.find((plant) => plant.id === chosenId) ??
    recommendations[0] ??
    null;
  const magic = inferPocketPoemMagic(sentence);
  const bornAt = useMemo(() => new Date(), []);
  const city = getRoamCity();
  const cityInfo = listRoamCities().find((item) => item.name === city);

  const takeSeedToStreet = () => {
    if (!chosen || !sentence.trim()) return;
    savePocketPoemDraft(
      createPocketPoemDraft({
        text: sentence,
        assetId: chosen.id,
        visibility,
        city,
        now: bornAt,
      }),
    );
    const pouch = readPocketSeedPouch().filter((id) => id !== chosen.id);
    writePocketSeedPouch(
      [chosen.id, ...pouch].slice(0, POCKET_SEED_POUCH_LIMIT),
    );
    onPrepared?.();
    requestMapFocus(
      cityInfo?.geo.lng ?? 120.14,
      cityInfo?.geo.lat ?? 30.246,
      17.2,
      { world: 'public' },
    );
  };

  return (
    <div className="space-y-3" data-poem-seed-studio>
      <section className="border-2 border-black bg-black p-4 shadow-[3px_3px_0_rgba(0,0,0,0.85)]">
        <div className="font-pixel text-[7px] tracking-[0.2em] text-white/40">
          PLANT A SENTENCE · 01
        </div>
        <h2 className="mt-2 text-[18px] font-bold leading-tight text-white">
          先留下一句话，<br />再为它挑一枚种子。
        </h2>
        <p className="mt-2 text-[10px] leading-relaxed text-white/50">
          一句话不会被画成另一棵树。它只会唤醒一枚真实种子，并决定这株植物往后怎样被城市记住。
        </p>
      </section>

      <section className="poem-seed-card">
        <header className="poem-seed-card__header">
          <span>01</span>
          <div>
            <small>THE SENTENCE</small>
            <strong>今天想让什么在城市里生根？</strong>
          </div>
        </header>
        <textarea
          value={sentence}
          onChange={(event) => {
            setSentence(event.target.value.slice(0, 80));
            setChosenId(null);
          }}
          aria-label="要种下的话"
          placeholder="写下一句话……"
          rows={3}
        />
        <div className="poem-magic-row">
          <Sparkles size={13} strokeWidth={2.4} />
          <span>话语魔力</span>
          {magic.map((trait) => <b key={trait}>{trait}</b>)}
        </div>
      </section>

      <section className="poem-seed-card">
        <header className="poem-seed-card__header">
          <span>02</span>
          <div>
            <small>POCKET SEEDS</small>
            <strong>这三枚种子听见了你的话</strong>
          </div>
        </header>
        <div className="poem-seed-options" role="radiogroup" aria-label="选择种子">
          {recommendations.map((plant) => {
            const active = chosen?.id === plant.id;
            return (
              <button
                type="button"
                role="radio"
                aria-checked={active}
                key={plant.id}
                className={active ? 'is-active' : ''}
                onClick={() => setChosenId(plant.id)}
              >
                <span style={seedPreviewStyle(plant.previewScale)}>
                  <img src={plant.src} alt="" />
                </span>
                <strong>{plant.name}</strong>
                <em>{plant.scientificName}</em>
                <p>{plant.description}</p>
                <small>{active ? '这一枚' : `库存 × ${progress.inventory[plant.id] ?? 0}`}</small>
                {active && <i><Check size={10} strokeWidth={3} /></i>}
              </button>
            );
          })}
        </div>
      </section>

      {recommendations.length === 0 && (
        <section className="poem-seed-card text-center">
          <strong className="block text-[12px]">口袋里暂时没有可用种子</strong>
          <small className="mt-1 block text-[9px] text-black/45">继续走路，下一批种子会在步数成就中解锁。</small>
        </section>
      )}

      <section className="poem-seed-card poem-birth-card">
        <header className="poem-seed-card__header">
          <span>03</span>
          <div>
            <small>ROOT CERTIFICATE</small>
            <strong>确认它的出生方式</strong>
          </div>
        </header>
        <div className="poem-birth-preview">
          {chosen && (
            <span
              className="poem-birth-preview__art"
              style={seedPreviewStyle(chosen.previewScale)}
            >
              <img src={chosen.src} alt={chosen.name} />
            </span>
          )}
          <div>
            <span><Clock3 size={12} /> {formatBirthTime(bornAt)}</span>
            <span><MapPin size={12} /> {city} · 到街头选择准确落点</span>
            <span><Sprout size={12} /> {chosen?.name ?? '等待一枚种子'}</span>
            {chosen && <small>{chosen.scientificName} · {chosen.description}</small>}
          </div>
        </div>
        <button
          type="button"
          className="poem-visibility"
          onClick={() => setVisibility((value) => value === 'hidden' ? 'public' : 'hidden')}
          aria-pressed={visibility === 'public'}
        >
          {visibility === 'hidden' ? <EyeOff size={14} /> : <Eye size={14} />}
          <span>
            <strong>{visibility === 'hidden' ? '只让人意会' : '公开原句'}</strong>
            <small>{visibility === 'hidden' ? '地图不挂文字牌；点击后只看见它的魔力' : '点击植物后可以读到这句话'}</small>
          </span>
        </button>
      </section>

      <section className="poem-growth-contract" aria-label="诗植生长契约">
        <header>
          <small>HOW IT GROWS · 04</small>
          <strong>种下只是开始，关系才让它长大</strong>
        </header>
        <div>
          {[
            ['时间', '土壤', '每天自然生长'],
            ['重访', '水', '真实回来才计算'],
            ['回声', '光', '路人与伙伴来探望'],
            ['伙伴', '守护者', '驻守并带回见闻'],
          ].map(([source, role, note]) => (
            <span key={source}>
              <b>{source}</b>
              <em>{role}</em>
              <small>{note}</small>
            </span>
          ))}
        </div>
      </section>

      <button
        type="button"
        className="poem-plant-cta"
        disabled={!chosen || !sentence.trim()}
        onClick={takeSeedToStreet}
      >
        <span><Sprout size={18} strokeWidth={2.5} /></span>
        <div>
          <small>NEXT · CITY GROUND</small>
          <strong>装进口袋 · 去街头选址</strong>
        </div>
        <ArrowRight size={17} strokeWidth={2.7} />
      </button>
      <p className="px-2 text-center text-[8.5px] leading-relaxed text-black/40">
        种下后，时间和坐标不可修改。时间是土壤，真实重访是水。
      </p>
    </div>
  );
}
