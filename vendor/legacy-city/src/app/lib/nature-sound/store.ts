import type { HungNatureSoundCard, NatureSoundDetection, NatureSoundRecognition } from './types';

export const NATURE_SOUND_CARDS_STORAGE_KEY = 'shengsheng:nature-sound-cards:v1';
export const NATURE_SOUND_HISTORY_STORAGE_KEY = 'shengsheng:nature-sound-history:v1';

const storage = () => (typeof window === 'undefined' ? null : window.localStorage);
const subscribers = new Set<() => void>();
let storageListenerAttached = false;

const emit = () => subscribers.forEach((subscriber) => subscriber());

const isDetection = (value: unknown): value is NatureSoundDetection => (
  Boolean(value)
  && typeof value === 'object'
  && typeof (value as NatureSoundDetection).id === 'string'
  && typeof (value as NatureSoundDetection).speciesId === 'string'
  && typeof (value as NatureSoundDetection).commonName === 'string'
  && typeof (value as NatureSoundDetection).confidence === 'number'
);

export function createEmptyNatureSoundRecognition(
  locationLabel: string,
  now = new Date(),
): NatureSoundRecognition {
  return {
    recordingId: `sound-history-${now.getTime()}`,
    recordedAt: now.toISOString(),
    locationLabel,
    modelLabel: '本地声音记录',
    demo: false,
    detections: [],
  };
}

export function appendNatureSoundRecognition(
  current: NatureSoundRecognition,
  incoming: NatureSoundRecognition,
): NatureSoundRecognition {
  const added = incoming.detections.map((detection) => ({
    ...detection,
    id: detection.id.startsWith(`${incoming.recordingId}:`)
      ? detection.id
      : `${incoming.recordingId}:${detection.id}`,
    recordedAt: detection.recordedAt ?? incoming.recordedAt,
    locationLabel: detection.locationLabel ?? incoming.locationLabel,
    modelLabel: detection.modelLabel ?? incoming.modelLabel,
    demo: detection.demo ?? incoming.demo,
  }));
  const addedIds = new Set(added.map((detection) => detection.id));
  return {
    ...incoming,
    detections: [
      ...added,
      ...current.detections.filter((detection) => !addedIds.has(detection.id)),
    ].slice(0, 200),
  };
}

export function readNatureSoundRecognition(): NatureSoundRecognition | null {
  try {
    const raw = storage()?.getItem(NATURE_SOUND_HISTORY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NatureSoundRecognition>;
    if (
      typeof parsed.recordingId !== 'string'
      || typeof parsed.recordedAt !== 'string'
      || typeof parsed.locationLabel !== 'string'
      || typeof parsed.modelLabel !== 'string'
      || typeof parsed.demo !== 'boolean'
      || !Array.isArray(parsed.detections)
    ) return null;
    return {
      ...parsed,
      detections: parsed.detections.filter(isDetection).map((detection) => ({
        ...detection,
        recordedAt: detection.recordedAt ?? parsed.recordedAt,
        locationLabel: detection.locationLabel ?? parsed.locationLabel,
        modelLabel: detection.modelLabel ?? parsed.modelLabel,
        demo: detection.demo ?? parsed.demo,
      })),
    } as NatureSoundRecognition;
  } catch {
    return null;
  }
}

export function saveNatureSoundRecognition(recognition: NatureSoundRecognition) {
  const persisted = {
    ...recognition,
    detections: recognition.detections.map((detection) => (
      detection.evidenceUrl?.startsWith('blob:')
        ? { ...detection, evidenceUrl: undefined }
        : detection
    )),
  };
  try {
    storage()?.setItem(NATURE_SOUND_HISTORY_STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // The current page still keeps the latest records in memory.
  }
}

export function subscribeHungNatureSoundCards(subscriber: () => void) {
  if (!storageListenerAttached && typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === NATURE_SOUND_CARDS_STORAGE_KEY) emit();
    });
    storageListenerAttached = true;
  }
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

export function readHungNatureSoundCards(): HungNatureSoundCard[] {
  try {
    const parsed = JSON.parse(storage()?.getItem(NATURE_SOUND_CARDS_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is HungNatureSoundCard => (
      value
      && typeof value === 'object'
      && typeof value.plantingId === 'string'
      && typeof value.hungAt === 'string'
      && typeof value.locationLabel === 'string'
      && value.detection
      && typeof value.detection === 'object'
      && typeof value.detection.id === 'string'
      && typeof value.detection.commonName === 'string'
    ));
  } catch {
    return [];
  }
}

export function saveHungNatureSoundCard(card: HungNatureSoundCard): HungNatureSoundCard[] {
  const cards = readHungNatureSoundCards();
  const withoutDuplicate = cards.filter((candidate) => !(
    candidate.plantingId === card.plantingId
    && candidate.detection.speciesId === card.detection.speciesId
  ));
  const persistedCard = card.detection.evidenceUrl?.startsWith('blob:')
    ? { ...card, detection: { ...card.detection, evidenceUrl: undefined } }
    : card;
  const next = [persistedCard, ...withoutDuplicate].slice(0, 120);
  try {
    storage()?.setItem(NATURE_SOUND_CARDS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The current page still keeps the newly hung card in memory.
  }
  emit();
  return next;
}
