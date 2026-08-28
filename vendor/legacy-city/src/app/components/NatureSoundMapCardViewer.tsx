import { useEffect, useMemo, useState } from 'react';
import { Maximize2, Minimize2, X } from 'lucide-react';
import NatureSoundCityCard from './NatureSoundCityCard';
import {
  readHungNatureSoundCards,
  readNatureSoundRecognition,
  subscribeHungNatureSoundCards,
} from '../lib/nature-sound/store';
import { buildNatureSoundObservations } from '../lib/nature-sound/observations';
import {
  catalogPreviewDetection,
  NATURE_SOUND_SPECIES,
} from '../lib/nature-sound/speciesCatalog';
import type { NatureSoundObservation } from '../lib/nature-sound/types';
import './NatureSoundMapCardViewer.css';

type NatureSoundMapCardViewerProps = {
  speciesId: string | null;
  onClose: () => void;
  onViewObservationOnMap?: (observation: NatureSoundObservation) => void;
};

export default function NatureSoundMapCardViewer({
  speciesId,
  onClose,
  onViewObservationOnMap,
}: NatureSoundMapCardViewerProps) {
  const [cards, setCards] = useState(readHungNatureSoundCards);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeHungNatureSoundCards(() => {
      setCards(readHungNatureSoundCards());
    });
    return () => { unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!speciesId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, speciesId]);

  useEffect(() => {
    setExpanded(false);
  }, [speciesId]);

  const card = useMemo(() => {
    const hungCard = cards.find((candidate) => candidate.detection.speciesId === speciesId);
    if (hungCard) return hungCard;
    const detection = readNatureSoundRecognition()?.detections.find(
      (candidate) => candidate.speciesId === speciesId,
    );
    const profile = NATURE_SOUND_SPECIES.find((candidate) => candidate.speciesId === speciesId);
    const resolvedDetection = detection ?? (profile ? catalogPreviewDetection(profile) : undefined);
    return resolvedDetection ? {
      detection: resolvedDetection,
      plantingId: '',
      hungAt: resolvedDetection.recordedAt ?? new Date().toISOString(),
      locationLabel: resolvedDetection.locationLabel ?? '西湖 · 鸟类挂卡模块',
    } : undefined;
  },
    [cards, speciesId],
  );

  if (!card) return null;

  const collectionIndex = Math.max(
    0,
    NATURE_SOUND_SPECIES.findIndex((item) => item.speciesId === card.detection.speciesId),
  );
  const recognition = readNatureSoundRecognition();
  const recognized = Boolean(
    cards.some((candidate) => candidate.detection.speciesId === card.detection.speciesId)
    || recognition?.detections.some(
      (candidate) => candidate.speciesId === card.detection.speciesId,
    ),
  );
  const observations = buildNatureSoundObservations(
    card.detection.speciesId,
    recognition?.detections ?? [],
    cards,
    {
      locationLabel: recognition?.locationLabel ?? card.locationLabel,
      recordedAt: recognition?.recordedAt ?? card.hungAt,
    },
  );

  return (
    <div
      className={`ns-map-card-viewer${expanded ? ' is-expanded' : ''}`}
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${card.detection.commonName}的地图声音卡`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="ns-map-card-viewer__close"
          onClick={onClose}
          aria-label="收起地图声音卡"
        >
          <X size={17} strokeWidth={2.7} />
        </button>
        <NatureSoundCityCard
          detection={card.detection}
          collectionIndex={collectionIndex}
          recognized={recognized}
          locationLabel={card.locationLabel}
          recordedAt={card.detection.recordedAt ?? card.hungAt}
          observations={observations}
          onViewObservationOnMap={onViewObservationOnMap}
        />
        <button
          type="button"
          className="ns-map-card-viewer__resize"
          onClick={() => setExpanded((current) => !current)}
          aria-label={expanded ? '缩小地图声音卡' : '放大地图声音卡'}
          aria-pressed={expanded}
        >
          {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </section>
    </div>
  );
}
