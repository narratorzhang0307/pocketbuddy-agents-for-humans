import CityCharacterCard, { type CityCharacterScene } from './CityCharacterCard';
import NatureSpeciesBuddy from './NatureSpeciesBuddy';
import { characterSheetFrom } from '../lib/crpg/character';
import {
  findNatureSoundSpecies,
  natureSoundReferenceAudioUrl,
} from '../lib/nature-sound/speciesCatalog';
import type { NatureSoundDetection, NatureSoundObservation } from '../lib/nature-sound/types';

export const NATURE_SOUND_CARD_SCENES: readonly CityCharacterScene[] = [
  'willow',
  'lotus',
  'lakebridge',
];

export const NATURE_SOUND_CARD_ACCENTS = ['#70c6a2', '#f08e6a', '#9384df'] as const;

type NatureSoundCityCardProps = {
  detection: NatureSoundDetection;
  collectionIndex: number;
  recognized: boolean;
  locationLabel: string;
  recordedAt: string;
  observations?: readonly NatureSoundObservation[];
  onViewObservationOnMap?: (observation: NatureSoundObservation) => void;
};

const evidenceLabel = (detection: NatureSoundDetection) => {
  if (detection.startedAtSec === undefined) {
    return '原始录音已保留，等待模型返回时间段';
  }
  const end = detection.endedAtSec ?? detection.startedAtSec + 3;
  return `${detection.startedAtSec.toFixed(1)}s – ${end.toFixed(1)}s · 可回听复核`;
};

/** The single wildlife card renderer shared by the deck viewer and map tags. */
export default function NatureSoundCityCard({
  detection,
  collectionIndex,
  recognized,
  locationLabel,
  recordedAt,
  observations,
  onViewObservationOnMap,
}: NatureSoundCityCardProps) {
  const profile = findNatureSoundSpecies(detection);
  const sheet = characterSheetFrom({
    seed: detection.speciesId,
    role: '苏堤声音访客',
    traits: ['观察', '声音', '记录'],
  });

  return (
    <CityCharacterCard
      key={detection.speciesId}
      id={`nature-sound-${detection.speciesId}`}
      name={detection.commonName}
      role="苏堤声音访客"
      kind="CITY WILDLIFE"
      accent={profile?.accent ?? NATURE_SOUND_CARD_ACCENTS[collectionIndex % NATURE_SOUND_CARD_ACCENTS.length]}
      portrait={detection.assetSlug
        ? (
            <NatureSpeciesBuddy
              assetSlug={detection.assetSlug}
              name={detection.commonName}
              animated={false}
              staticAction={detection.assetSlug === 'eurasian-tree-sparrow' ? 'listen' : undefined}
            />
          )
        : <img src={detection.imageUrl} alt={`${detection.commonName}卡牌示意插画`} />}
      sheet={sheet}
      scene={profile?.scene ?? NATURE_SOUND_CARD_SCENES[collectionIndex % NATURE_SOUND_CARD_SCENES.length]}
      sceneVariant={collectionIndex * 5 + 2}
      wildlife={{
        scientificName: detection.scientificName,
        englishName: detection.englishName,
        familyLabel: detection.familyLabel,
        orderLabel: detection.orderLabel,
        description: detection.description ?? '这是一条模型候选结果，请结合证据片段与更多录音进行复核。',
        locationLabel: recognized ? locationLabel : '苏堤 · 等待听见',
        confidence: detection.confidence,
        detectedAtLabel: recognized
          ? new Date(recordedAt).toLocaleString('zh-CN', { hour12: false })
          : '尚未记录',
        activeTimeLabel: detection.activeTimeLabel,
        soundProfile: detection.soundProfile,
        distributionLabel: detection.distributionLabel,
        habitatLabel: detection.habitatLabel,
        behaviorLabel: detection.behaviorLabel,
        protectionStatus: detection.protectionStatus,
        evidenceLabel: recognized ? evidenceLabel(detection) : '完成一次有效录音后解锁证据片段',
        evidenceUrl: detection.evidenceUrl,
        referenceAudioUrl: profile ? natureSoundReferenceAudioUrl(profile) : undefined,
        statusLabel: recognized ? `${Math.round(detection.confidence * 100)}%` : '待听见',
        recognized,
        observations,
        onViewObservationOnMap,
      }}
    />
  );
}
