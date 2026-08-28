import type {
  HungNatureSoundCard,
  NatureSoundDetection,
  NatureSoundObservation,
} from './types';

type ObservationFallback = {
  locationLabel: string;
  recordedAt: string;
};

/**
 * Builds a species encounter history without counting a recording twice when
 * the same detection has also been hung on a plant.
 */
export function buildNatureSoundObservations(
  speciesId: string,
  detections: readonly NatureSoundDetection[],
  hungCards: readonly HungNatureSoundCard[],
  fallback: ObservationFallback,
): NatureSoundObservation[] {
  const matchingHungCards = hungCards.filter((card) => card.detection.speciesId === speciesId);
  const hungByDetectionId = new Map(
    matchingHungCards.map((card) => [card.detection.id, card]),
  );
  const observations = new Map<string, NatureSoundObservation>();

  detections
    .filter((detection) => detection.speciesId === speciesId)
    .forEach((detection) => {
      const hungCard = hungByDetectionId.get(detection.id);
      observations.set(detection.id, {
        id: detection.id,
        speciesId,
        locationLabel: detection.locationLabel ?? hungCard?.locationLabel ?? fallback.locationLabel,
        recordedAt: detection.recordedAt ?? hungCard?.hungAt ?? fallback.recordedAt,
        plantingId: hungCard?.plantingId,
      });
    });

  matchingHungCards.forEach((card) => {
    if (observations.has(card.detection.id)) return;
    observations.set(card.detection.id, {
      id: card.detection.id,
      speciesId,
      locationLabel: card.detection.locationLabel ?? card.locationLabel ?? fallback.locationLabel,
      recordedAt: card.detection.recordedAt ?? card.hungAt ?? fallback.recordedAt,
      plantingId: card.plantingId,
    });
  });

  return [...observations.values()].sort((left, right) => (
    new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime()
  ));
}
