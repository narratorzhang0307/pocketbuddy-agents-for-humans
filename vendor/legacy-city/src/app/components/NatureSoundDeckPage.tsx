import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AudioLines, Bird, X } from 'lucide-react';
import NatureSpeciesBuddy from './NatureSpeciesBuddy';
import NatureSoundCityCard, { NATURE_SOUND_CARD_ACCENTS } from './NatureSoundCityCard';
import { readHungNatureSoundCards } from '../lib/nature-sound/store';
import { buildNatureSoundObservations } from '../lib/nature-sound/observations';
import {
  catalogPreviewDetection,
  findNatureSoundSpecies,
  NATURE_SOUND_SPECIES,
} from '../lib/nature-sound/speciesCatalog';
import type {
  NatureSoundAnimalGroup,
  NatureSoundDetection,
  NatureSoundObservation,
  NatureSoundRecognition,
} from '../lib/nature-sound/types';
import './NatureSoundDeckPage.css';

const TARGET_SPECIES_COUNT = 21;

type DeckGroup = Exclude<NatureSoundAnimalGroup, 'other'>;

const DECK_GROUPS: readonly { id: DeckGroup; label: string }[] = [
  { id: 'bird', label: '鸟' },
  { id: 'insect', label: '虫' },
  { id: 'frog', label: '蛙' },
];

const CARD_ACCENTS = NATURE_SOUND_CARD_ACCENTS;

type NatureSoundDeckPageProps = {
  recognition: NatureSoundRecognition;
  onOpenListen: () => void;
  openSpeciesId?: string | null;
  onViewObservationOnMap?: (observation: NatureSoundObservation) => void;
  embedded?: boolean;
};

const uniqueSpecies = (detections: NatureSoundDetection[]) => {
  const seen = new Set<string>();
  return detections.filter((detection) => {
    if (seen.has(detection.speciesId)) return false;
    seen.add(detection.speciesId);
    return true;
  });
};

export default function NatureSoundDeckPage({
  recognition,
  onOpenListen,
  openSpeciesId,
  onViewObservationOnMap,
  embedded = false,
}: NatureSoundDeckPageProps) {
  const [hungCards] = useState(() => readHungNatureSoundCards());
  const recognizedCollection = useMemo(() => uniqueSpecies([
    ...recognition.detections,
    ...hungCards.map((card) => card.detection),
  ]), [hungCards, recognition.detections]);
  const collection = useMemo(() => {
    const recognizedBySpecies = new Map(recognizedCollection.map((detection) => [detection.speciesId, detection]));
    const catalog = NATURE_SOUND_SPECIES.map((profile) => (
      recognizedBySpecies.get(profile.speciesId) ?? catalogPreviewDetection(profile)
    ));
    const catalogIds = new Set(NATURE_SOUND_SPECIES.map((profile) => profile.speciesId));
    return [...catalog, ...recognizedCollection.filter((detection) => !catalogIds.has(detection.speciesId))];
  }, [recognizedCollection]);
  const [activeGroup, setActiveGroup] = useState<DeckGroup>('bird');
  const [selectedSpeciesId, setSelectedSpeciesId] = useState(collection[0]?.speciesId ?? '');
  const [cardOpen, setCardOpen] = useState(false);
  const filteredCollection = useMemo(
    () => collection.filter((detection) => detection.group === activeGroup),
    [activeGroup, collection],
  );

  useEffect(() => {
    if (!collection.some((item) => item.speciesId === selectedSpeciesId)) {
      setSelectedSpeciesId(collection[0]?.speciesId ?? '');
    }
  }, [collection, selectedSpeciesId]);
  useEffect(() => {
    const openSpecies = collection.find((item) => item.speciesId === openSpeciesId);
    if (!openSpecies) return;
    if (openSpecies.group !== 'other') setActiveGroup(openSpecies.group);
    setSelectedSpeciesId(openSpecies.speciesId);
    setCardOpen(true);
  }, [collection, openSpeciesId]);
  useEffect(() => {
    if (!cardOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCardOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [cardOpen]);

  const selected = collection.find((item) => item.speciesId === selectedSpeciesId) ?? collection[0];
  const selectedIndex = selected ? Math.max(0, collection.indexOf(selected)) : 0;
  const selectedRecognized = Boolean(selected && recognizedCollection.some((item) => item.speciesId === selected.speciesId));
  const selectedObservations = useMemo(() => (
    selected
      ? buildNatureSoundObservations(
          selected.speciesId,
          recognition.detections,
          hungCards,
          {
            locationLabel: recognition.locationLabel,
            recordedAt: recognition.recordedAt,
          },
        )
      : []
  ), [hungCards, recognition.detections, recognition.locationLabel, recognition.recordedAt, selected]);

  const selectGroup = (group: DeckGroup) => {
    setActiveGroup(group);
    const firstSpecies = collection.find((item) => item.group === group);
    if (firstSpecies) setSelectedSpeciesId(firstSpecies.speciesId);
    setCardOpen(false);
  };

  if (!selected) {
    return (
      <div className="nsd-empty">
        <Bird size={35} /><h1>图鉴还在等第一声鸟鸣</h1><p>先去“听见”录一段自然声音。</p>
        <button type="button" onClick={onOpenListen}>开始听</button>
      </div>
    );
  }

  return (
    <div className="nsd-page">
      {!embedded && (
        <header className="nsd-hero">
          <div><small><Bird size={12} /> 生声不息 · 03 图鉴</small><h1>神奇动物在哪里</h1><p>一路听见的动物，最后都回到我种下的植物上。</p></div>
          <div className="nsd-progress" aria-label={`已听见 ${recognizedCollection.length} 种，目标 ${TARGET_SPECIES_COUNT} 种`}>
            <strong>{recognizedCollection.length}<i>/</i>{TARGET_SPECIES_COUNT}</strong><span>已听见</span>
          </div>
        </header>
      )}

      <section className="nsd-collection">
        <div className="nsd-heading"><div><small>选择一张</small><h2>我的声音卡组</h2></div><button type="button" onClick={onOpenListen}><AudioLines size={11} />继续去听</button></div>
        <div className="nsd-species-tabs" role="tablist" aria-label="动物类别">
          {DECK_GROUPS.map((group) => (
            <button
              key={group.id}
              type="button"
              role="tab"
              aria-selected={activeGroup === group.id}
              className={activeGroup === group.id ? 'is-active' : ''}
              onClick={() => selectGroup(group.id)}
            >
              <strong>{group.label}</strong>
              <span>{collection.filter((item) => item.group === group.id).length}</span>
            </button>
          ))}
        </div>
        <div className="nsd-species-grid" aria-label="动物声音卡牌图鉴">
          {filteredCollection.map((detection, index) => {
            const profile = findNatureSoundSpecies(detection);
            const recognized = recognizedCollection.some((item) => item.speciesId === detection.speciesId);
            return (
              <article
                key={detection.speciesId}
                className={recognized ? 'is-recognized' : 'is-pending'}
                style={{ '--nsd-card-accent': profile?.accent ?? CARD_ACCENTS[index % CARD_ACCENTS.length] } as CSSProperties}
              >
                <div className="nsd-species-card__art">
                  {detection.assetSlug
                    ? <NatureSpeciesBuddy assetSlug={detection.assetSlug} name={detection.commonName} compact animated={false} staticAction={detection.assetSlug === 'eurasian-tree-sparrow' ? 'listen' : detection.assetSlug === 'grey-nightjar' ? 'call' : undefined} />
                    : <Bird aria-hidden="true" />}
                  <span>{recognized ? `已听见 ${Math.round(detection.confidence * 100)}%` : '等待听见'}</span>
                </div>
                <div className="nsd-species-card__copy">
                  <strong>{detection.commonName}</strong>
                  <em>{detection.scientificName ?? profile?.scientificName ?? 'Nature sound visitor'}</em>
                  <p>{detection.description ?? profile?.description ?? '完成一次有效录音后，解锁这位自然声音访客的完整档案。'}</p>
                  <small>{[detection.familyLabel, detection.activeTimeLabel].filter(Boolean).join(' · ') || '自然声音访客'}</small>
                </div>
                <button
                  type="button"
                  className="nsd-species-card__open"
                  onClick={() => {
                    setSelectedSpeciesId(detection.speciesId);
                    setCardOpen(true);
                  }}
                  aria-label={`展开${detection.commonName}的声音简历卡`}
                />
              </article>
            );
          })}
        </div>
      </section>

      {cardOpen && (
        <div
          className="nsd-card-viewer"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setCardOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.commonName}的自然声音动物卡`}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="nsd-card-viewer__close"
              onClick={() => setCardOpen(false)}
              aria-label="收起动物卡"
            >
              <X size={17} strokeWidth={2.7} />
            </button>
            <NatureSoundCityCard
              detection={selected}
              collectionIndex={selectedIndex}
              recognized={selectedRecognized}
              locationLabel={selected.locationLabel ?? recognition.locationLabel}
              recordedAt={selected.recordedAt ?? recognition.recordedAt}
              observations={selectedObservations}
              onViewObservationOnMap={onViewObservationOnMap}
            />
          </section>
        </div>
      )}
    </div>
  );
}
