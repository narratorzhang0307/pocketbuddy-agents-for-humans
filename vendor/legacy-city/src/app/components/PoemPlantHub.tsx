import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Camera,
  ChevronRight,
  Eye,
  Footprints,
  ImagePlus,
  LockKeyhole,
  LoaderCircle,
  MapPin,
  PawPrint,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Sprout,
  Users,
  X,
} from 'lucide-react';
import { requestMapFocus } from '../data/mapFocus';
import { characterSheetFrom, stableCharacterHash } from '../lib/crpg/character';
import { gcj02ToWgs84 } from '../lib/location/chinaCoordinates';
import { POCKET_PLANT_ASSETS, type PocketPlantAsset } from '../lib/pocket-plants/catalog';
import { refreshPocketPlantVisitors } from '../lib/pocket-plants/ecology';
import {
  markPocketPlantVisitorsSeen,
  pocketPlantGrowth,
  publishPocketPlanting,
  readPocketPlantings,
  readPocketSeedPouch,
  subscribePocketPlantings,
  writePocketSeedPouch,
  type PocketPlanting,
  type PocketPlantVisitor,
} from '../lib/pocket-plants/planting';
import {
  grantRecognizedPocketSeed,
  getPublicPlantQuota,
  POCKET_SEED_MILESTONES,
  readPocketPlantProgress,
  subscribePocketPlantProgress,
} from '../lib/pocket-plants/progression';
import {
  preparePlantRecognitionImage,
  recognizePocketPlant,
  type PlantRecognitionResult,
} from '../lib/pocket-plants/recognition';
import CityCharacterCard from './CityCharacterCard';
import { PoemSeedStudio } from './PoemSeedStudio';
import './PoemPlantHub.css';

type PlantCardSelection = { assetId: string; plantingId?: string };

const BOTANICAL_CARD_ACCENTS = ['#3fbf77', '#f06443', '#e0a72d', '#6f78d8', '#d85f91'] as const;
const BOTANICAL_CARD_SCENES = ['greenhouse', 'pond', 'canal', 'rooftop', 'teahouse'] as const;
const BOTANICAL_FAMILY_LABELS: Record<PocketPlantAsset['family'], string> = {
  meadow: '草地花本',
  houseplant: '室内绿植',
  botanical: '植物图鉴',
};

const seedPreviewStyle = (previewScale = 1) => ({
  '--poem-seed-preview-scale': previewScale,
} as CSSProperties);

const formatDate = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(value));

const visitorIcon = (visitor: PocketPlantVisitor) => {
  if (visitor.kind === 'agent') return <Users size={12} strokeWidth={2.5} />;
  if (visitor.kind === 'scout') return <Footprints size={12} strokeWidth={2.5} />;
  return <PawPrint size={12} strokeWidth={2.5} />;
};

export default function PoemPlantHub() {
  const [plantings, setPlantings] = useState(readPocketPlantings);
  const [progress, setProgress] = useState(readPocketPlantProgress);
  const [studioOpen, setStudioOpen] = useState(false);
  const [visitorPlantId, setVisitorPlantId] = useState<string | null>(null);
  const [showAllSeeds, setShowAllSeeds] = useState(false);
  const [plantCardSelection, setPlantCardSelection] = useState<PlantCardSelection | null>(null);
  const [recognitionPreview, setRecognitionPreview] = useState('');
  const [recognitionResult, setRecognitionResult] = useState<PlantRecognitionResult | null>(null);
  const [recognitionError, setRecognitionError] = useState('');
  const [recognizingPlant, setRecognizingPlant] = useState(false);
  const recognitionInputRef = useRef<HTMLInputElement>(null);
  const [, setClock] = useState(0);

  useEffect(() => {
    refreshPocketPlantVisitors();
    setPlantings(readPocketPlantings());
    const offPlantings = subscribePocketPlantings(() => setPlantings(readPocketPlantings()));
    const offProgress = subscribePocketPlantProgress(() => setProgress(readPocketPlantProgress()));
    const timer = window.setInterval(() => {
      refreshPocketPlantVisitors();
      setClock((value) => value + 1);
    }, 4_000);
    return () => {
      offPlantings();
      offProgress();
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!plantCardSelection) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPlantCardSelection(null);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [plantCardSelection]);

  const publicQuota = getPublicPlantQuota(progress);
  const publicCount = plantings.filter((planting) => planting.visibility === 'public').length;
  const unseenCount = plantings.reduce(
    (sum, planting) => sum + planting.visitors.filter((visitor) => !visitor.seenAt).length,
    0,
  );
  const seedCount = Object.values(progress.inventory).reduce((sum, count) => sum + Math.max(0, count), 0);
  const nextMilestone = POCKET_SEED_MILESTONES.find((item) => item.threshold > progress.totalSteps);
  const previousThreshold = [...POCKET_SEED_MILESTONES]
    .reverse()
    .find((item) => item.threshold <= progress.totalSteps)?.threshold ?? 0;
  const nextThreshold = nextMilestone?.threshold ?? progress.totalSteps;
  const stepProgress = nextMilestone
    ? Math.min(1, (progress.totalSteps - previousThreshold) / (nextThreshold - previousThreshold))
    : 1;

  const seedAssets = showAllSeeds
    ? POCKET_PLANT_ASSETS
    : POCKET_PLANT_ASSETS.filter((asset) => (progress.inventory[asset.id] ?? 0) > 0).slice(0, 9);
  const selectedCardAsset = plantCardSelection
    ? POCKET_PLANT_ASSETS.find((asset) => asset.id === plantCardSelection.assetId) ?? null
    : null;
  const selectedCardPlanting = plantCardSelection?.plantingId
    ? plantings.find((planting) => planting.id === plantCardSelection.plantingId) ?? null
    : null;
  const selectedCardId = selectedCardPlanting?.id ?? selectedCardAsset?.id ?? '';
  const selectedCardHash = selectedCardId ? stableCharacterHash(selectedCardId) : 0;
  const selectedSeedCount = selectedCardAsset ? progress.inventory[selectedCardAsset.id] ?? 0 : 0;

  const openVisitors = (planting: PocketPlanting) => {
    setVisitorPlantId((current) => current === planting.id ? null : planting.id);
    if (planting.visitors.some((visitor) => !visitor.seenAt)) {
      markPocketPlantVisitorsSeen(planting.id);
    }
  };

  const focusOnMap = (planting: PocketPlanting) => {
    // 植物是用户直接点在高德底图上的，持久化坐标属于 GCJ-02；
    // 跨页相机 API 的业务边界统一接收 WGS84，避免二次偏移后植物跑出屏幕。
    const [lng, lat] = gcj02ToWgs84(planting.position);
    requestMapFocus(
      lng,
      lat,
      17.4,
      { world: 'public', plantingId: planting.id },
    );
  };

  const publish = (planting: PocketPlanting) => {
    if (planting.visibility === 'public' || publicCount >= publicQuota) return;
    if (pocketPlantGrowth(planting.plantedAt).progress < 1) return;
    publishPocketPlanting(planting.id);
  };

  const identifyPlant = async (file: File | null) => {
    if (!file || recognizingPlant) return;
    setRecognitionError('');
    setRecognitionResult(null);
    setRecognizingPlant(true);
    try {
      const image = await preparePlantRecognitionImage(file);
      setRecognitionPreview(image);
      const result = await recognizePocketPlant(image);
      setRecognitionResult(result);
      if (result.asset) {
        const next = grantRecognizedPocketSeed(result.asset.id);
        setProgress(next);
        writePocketSeedPouch([
          result.asset.id,
          ...readPocketSeedPouch().filter((id) => id !== result.asset?.id),
        ]);
        setShowAllSeeds(false);
      }
    } catch (error) {
      setRecognitionError(error instanceof Error ? error.message : '植物识别暂时不可用');
    } finally {
      setRecognizingPlant(false);
      if (recognitionInputRef.current) recognitionInputRef.current.value = '';
    }
  };

  if (studioOpen) {
    return (
      <div className="poem-hub-studio">
        <button type="button" onClick={() => setStudioOpen(false)} className="poem-hub-studio__back">
          <X size={14} strokeWidth={2.8} /> 收起种植台
        </button>
        <PoemSeedStudio onPrepared={() => setStudioOpen(false)} />
      </div>
    );
  }

  return (
    <div className="poem-hub" data-poem-plant-hub>
      <section className="poem-hub-section">
        <header className="poem-hub-section__title">
          <h3>我的花迹</h3>
          {unseenCount > 0 && <b>{unseenCount} 条新痕迹</b>}
        </header>

        <section className={`poem-plant-recognizer${recognitionResult ? ' has-result' : ''}`} aria-live="polite">
          <input
            ref={recognitionInputRef}
            id="poem-plant-photo-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            capture="environment"
            onChange={(event) => { void identifyPlant(event.currentTarget.files?.[0] ?? null); }}
          />
          {!recognitionPreview && !recognizingPlant ? (
            <div className="poem-plant-recognizer__empty">
              <span><ScanSearch size={25} strokeWidth={1.8} /></span>
              <div>
                <small>AI PLANT SCAN · 后端视觉模型</small>
                <strong>拍下一株植物，认出它的名字</strong>
                <p>模型会按叶形、花序与生长形态识别，再匹配成一张可收藏、可种下的植物卡牌。</p>
              </div>
              <button type="button" className="poem-plant-photo-button" onClick={() => recognitionInputRef.current?.click()}>
                <Camera size={15} strokeWidth={2.6} /> 拍照 / 上传
              </button>
            </div>
          ) : (
            <div className="poem-plant-recognizer__result">
              <div className="poem-plant-recognizer__photo">
                {recognitionPreview && <img src={recognitionPreview} alt="待识别植物" />}
                {recognizingPlant && <span><LoaderCircle size={20} className="is-spinning" /> 正在识别</span>}
              </div>
              <div className="poem-plant-recognizer__readout">
                {recognitionResult ? (
                  <>
                    <small><ShieldCheck size={11} /> 模型识别 · {Math.round(recognitionResult.confidence * 100)}%</small>
                    <h4>{recognitionResult.commonName || recognitionResult.asset?.name}</h4>
                    <em>{recognitionResult.scientificName}</em>
                    <p>{recognitionResult.visibleEvidence || recognitionResult.matchReason || '已完成植物形态匹配。'}</p>
                    {recognitionResult.asset ? (
                      <div className="poem-plant-recognizer__matched">
                        <img src={recognitionResult.asset.thumbSrc ?? recognitionResult.asset.src} alt="" />
                        <span><b>{recognitionResult.asset.name}卡牌</b><small>已收入种子口袋 · 种子 × 1</small></span>
                      </div>
                    ) : (
                      <div className="poem-plant-recognizer__unmatched">已识别物种，但当前卡牌库还没有它；没有强行匹配错误卡牌。</div>
                    )}
                  </>
                ) : (
                  <><small>BOTANICAL VISION</small><h4>正在比对植物图鉴…</h4><p>读取花、叶、果实与枝干的可见特征。</p></>
                )}
              </div>
              <div className="poem-plant-recognizer__actions">
                <button type="button" className="poem-plant-photo-button" onClick={() => recognitionInputRef.current?.click()}><ImagePlus size={13} /> 换一张</button>
                {recognitionResult?.asset && (
                  <button type="button" onClick={() => setPlantCardSelection({ assetId: recognitionResult.asset!.id })}>
                    打开植物卡 <ChevronRight size={12} />
                  </button>
                )}
              </div>
            </div>
          )}
          {recognitionError && (
            <div className="poem-plant-recognizer__error">
              <span>{recognitionError}</span>
              <button type="button" onClick={() => recognitionInputRef.current?.click()}>重新选择</button>
            </div>
          )}
          <footer><ShieldCheck size={11} /> 上传即表示同意将这张植物照片发送到后端模型识别；照片不写入植物卡牌。</footer>
        </section>

        <div className="poem-plant-list">
          {plantings.map((planting) => {
            const asset = POCKET_PLANT_ASSETS.find((candidate) => candidate.id === planting.assetId);
            if (!asset) return null;
            const growth = pocketPlantGrowth(planting.plantedAt);
            const unseen = planting.visitors.filter((visitor) => !visitor.seenAt).length;
            const visitorOpen = visitorPlantId === planting.id;
            const canPublish = growth.progress >= 1 && publicCount < publicQuota;
            return (
              <article key={planting.id} className={`poem-plant-card${unseen ? ' has-new' : ''}`}>
                <div className="poem-plant-card__body">
                  <div className="poem-plant-card__visual">
                    <img src={asset.src} alt={asset.name} />
                    <span>{growth.progress < 1 ? '正在扎根' : planting.visibility === 'public' ? '城市可见' : '仅自己可见'}</span>
                  </div>
                  <div className="poem-plant-card__content">
                    <small>{formatDate(planting.plantedAt)} 种下{planting.source === 't5' ? ' · T5 硬件' : ''}</small>
                    <h4>{asset.name}</h4>
                    <em className="poem-plant-card__species">{asset.scientificName}</em>
                    <p className="poem-plant-card__description">{asset.description}</p>
                    <p className="poem-plant-card__location"><MapPin size={10} /> {planting.place}</p>
                    {planting.sentence && (
                      <blockquote>{planting.sentenceVisibility === 'public' ? `“${planting.sentence}”` : '这句话只留在植物的根里。'}</blockquote>
                    )}
                    <div className="poem-plant-magic">
                      {(planting.magic.length ? planting.magic : ['向光', '缓慢']).map((trait) => <span key={trait}>{trait}</span>)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="poem-plant-card__open"
                    onClick={() => setPlantCardSelection({ assetId: asset.id, plantingId: planting.id })}
                    aria-label={`打开${asset.name}的 Agents 植物卡牌`}
                  />
                </div>
                <div className="poem-plant-card__stats">
                  <span><Eye size={11} /> 重访 {planting.revisitCount}</span>
                  <span><PawPrint size={11} /> 来访 {planting.visitors.length}</span>
                  <span>{unseen ? `${unseen} 条未读` : '痕迹已读'}</span>
                </div>
                <div className="poem-plant-card__actions">
                  <button type="button" onClick={() => focusOnMap(planting)}><MapPin size={12} /> 地图查看</button>
                  <button type="button" onClick={() => openVisitors(planting)}><PawPrint size={12} /> 访客记录</button>
                  <button
                    type="button"
                    disabled={planting.visibility === 'public' || !canPublish}
                    onClick={() => publish(planting)}
                    title={publicCount >= publicQuota ? '公共植物额度已满' : growth.progress < 1 ? '等待植物扎根' : undefined}
                  >
                    {planting.visibility === 'public' ? '已公开' : '转为公共植物'}
                  </button>
                </div>
                {visitorOpen && (
                  <div className="poem-visitor-ledger">
                    <header><strong>来访痕迹</strong><small>相遇前，城市只给你一些线索。</small></header>
                    {planting.visitors.length === 0 ? (
                      <p>暂时没有访客。重访它，或者让腊肠犬替你来值日。</p>
                    ) : planting.visitors.map((visitor) => (
                      <div key={visitor.id}>
                        <i>{visitorIcon(visitor)}</i>
                        <span><strong>{visitor.name}</strong><small>{visitor.note}</small></span>
                        <time>{formatDate(visitor.visitedAt)}</time>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="poem-hub-section">
        <header className="poem-hub-section__title">
          <h3>种子口袋</h3>
          <b>{seedCount} 枚可用</b>
        </header>
        <div className="poem-seed-inventory">
          {seedAssets.map((asset) => {
            const count = progress.inventory[asset.id] ?? 0;
            const milestone = POCKET_SEED_MILESTONES.find((item) => item.assetIds.includes(asset.id));
            return (
              <div key={asset.id} className={count > 0 ? 'is-unlocked' : 'is-locked'}>
                <span style={seedPreviewStyle(asset.previewScale)}>
                  <img src={asset.src} alt="" />
                </span>
                <strong>{asset.name}</strong>
                <em>{asset.scientificName}</em>
                <p>{asset.description}</p>
                <small>{count > 0 ? `种子 × ${count}` : `${milestone?.threshold.toLocaleString('zh-CN')} 步`}</small>
                {count <= 0 && <i><LockKeyhole size={11} /></i>}
                <button
                  type="button"
                  className="poem-seed-card__open"
                  onClick={() => setPlantCardSelection({ assetId: asset.id })}
                  aria-label={`打开${asset.name}的 Agents 植物卡牌`}
                />
              </div>
            );
          })}
        </div>
        <button type="button" className="poem-hub-more" onClick={() => setShowAllSeeds((value) => !value)}>
          {showAllSeeds ? '只看已经拥有的种子' : `查看全部 ${POCKET_PLANT_ASSETS.length} 种植物`} <ChevronRight size={12} />
        </button>
      </section>

      <section className="poem-step-card">
        <header><span><Footprints size={18} strokeWidth={2.5} /></span><div><small>03 · WALK TO UNLOCK</small><h3>脚步会带来下一批种子</h3></div></header>
        <div className="poem-step-card__number"><strong>{progress.totalSteps.toLocaleString('zh-CN')}</strong><span>累计城市步数</span></div>
        <div className="poem-step-card__bar"><span style={{ width: `${stepProgress * 100}%` }} /></div>
        {nextMilestone ? (
          <p>再走 <b>{Math.max(0, nextMilestone.threshold - progress.totalSteps).toLocaleString('zh-CN')}</b> 步，获得“{nextMilestone.title}”与 {nextMilestone.assetIds.length} 种新植物。</p>
        ) : <p>基础种子图鉴已经全部解锁。季节限定仍会在城市活动中出现。</p>}
        <div className="poem-step-card__today"><Sparkles size={12} /><span>今日 {progress.todaySteps.toLocaleString('zh-CN')} 步</span><b>{progress.todaySteps >= 3_000 ? '相遇资格已开启' : '继续走路以开启相遇资格'}</b></div>
      </section>

      <button type="button" className="poem-hub-bottom-cta" onClick={() => setStudioOpen(true)}>
        <Sprout size={17} strokeWidth={2.7} /><span><small>ONE SENTENCE · ONE REAL SEED</small><strong>种下一株新的城市植物</strong></span><ChevronRight size={16} />
      </button>

      {selectedCardAsset && (
        <div
          className="poem-plant-card-viewer"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setPlantCardSelection(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedCardAsset.name}的 Agents 城市植物卡`}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="poem-plant-card-viewer__close"
              onClick={() => setPlantCardSelection(null)}
              aria-label="收起植物卡"
            >
              <X size={17} strokeWidth={2.7} />
            </button>
            <CityCharacterCard
              key={selectedCardId}
              id={selectedCardId}
              name={selectedCardAsset.name}
              role={selectedCardAsset.scientificName}
              kind="CITY BOTANICAL"
              accent={BOTANICAL_CARD_ACCENTS[selectedCardHash % BOTANICAL_CARD_ACCENTS.length]}
              portrait={(
                <img
                  src={selectedCardAsset.src}
                  alt={selectedCardAsset.name}
                  draggable={false}
                />
              )}
              sheet={characterSheetFrom({
                seed: selectedCardId,
                role: '城市植物图鉴',
                traits: [selectedCardAsset.family, '植物'],
              })}
              scene={BOTANICAL_CARD_SCENES[selectedCardHash % BOTANICAL_CARD_SCENES.length]}
              sceneVariant={selectedCardHash % 16}
              botanical={{
                scientificName: selectedCardAsset.scientificName,
                familyLabel: BOTANICAL_FAMILY_LABELS[selectedCardAsset.family],
                description: selectedCardAsset.description,
                locationLabel: selectedCardPlanting?.place ?? '种子口袋 · 尚未种下',
                coordinates: selectedCardPlanting?.wgs84Position ?? selectedCardPlanting?.position,
                statusLabel: selectedCardPlanting ? 'ROOTED' : 'SEED',
                fieldNote: selectedCardPlanting
                  ? selectedCardPlanting.sentenceVisibility === 'public' && selectedCardPlanting.sentence
                    ? `“${selectedCardPlanting.sentence}”`
                    : `${formatDate(selectedCardPlanting.plantedAt)}，在这里留下了一株。`
                  : '走到喜欢的城市角落，再为它留下第一组坐标。',
              }}
              action={selectedCardPlanting ? (
                <button
                  type="button"
                  onClick={() => {
                    setPlantCardSelection(null);
                    focusOnMap(selectedCardPlanting);
                  }}
                >
                  地图查看
                </button>
              ) : selectedSeedCount > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setPlantCardSelection(null);
                    setStudioOpen(true);
                  }}
                >
                  用它种一株
                </button>
              ) : (
                <button type="button" disabled>等待解锁</button>
              )}
            />
          </section>
        </div>
      )}
    </div>
  );
}
