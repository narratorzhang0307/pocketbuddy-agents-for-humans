import { BIRD_ASSETS, type BirdStatus } from './birdListener';
import { NATURE_SOUND_SPECIES } from '../../../vendor/legacy-city/src/app/lib/nature-sound/speciesCatalog';

// The native catalog owns membership, artwork and audio. The existing nature
// profiles only supply field-guide copy; they must not bring back legacy art.
export const BIRD_DECK = BIRD_ASSETS.flatMap(asset => {
  if (typeof asset.source !== 'object') return [];
  return [{
    id: asset.id,
    name: asset.name,
    imageUrl: asset.webUrl,
    spriteUrl: asset.source.sprite.webp.url,
    backgroundUrl: asset.source.background.pngUrl,
    audioUrl: asset.source.audioUrl,
    profile: NATURE_SOUND_SPECIES.find(profile => profile.speciesId === asset.id),
  }];
});

export type BirdDeckEntry = (typeof BIRD_DECK)[number];

export function isCurrentBirdCandidate(bird: BirdStatus | undefined, speciesId: string): boolean {
  return bird?.state === 'result' && bird.speciesId === speciesId;
}

export function birdConfidenceLabel(confidence: number | undefined): string {
  return confidence !== undefined && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
    ? `模型置信度 ${Math.round(confidence * 100)}%`
    : '模型未提供有效置信度';
}
