export type NatureSoundAnimalGroup = 'bird' | 'frog' | 'insect' | 'other';

export type NatureSoundDetection = {
  id: string;
  speciesId: string;
  commonName: string;
  scientificName?: string;
  familyLabel?: string;
  orderLabel?: string;
  englishName?: string;
  group: NatureSoundAnimalGroup;
  confidence: number;
  startedAtSec?: number;
  endedAtSec?: number;
  activeTimeLabel?: string;
  soundProfile?: string;
  description?: string;
  distributionLabel?: string;
  habitatLabel?: string;
  behaviorLabel?: string;
  protectionStatus?: string;
  assetSlug?: string;
  imageUrl?: string;
  evidenceUrl?: string;
  recordedAt?: string;
  locationLabel?: string;
  modelLabel?: string;
  demo?: boolean;
};

export type NatureSoundRecognition = {
  recordingId: string;
  recordedAt: string;
  locationLabel: string;
  modelLabel: string;
  demo: boolean;
  detections: NatureSoundDetection[];
};

export type HungNatureSoundCard = {
  detection: NatureSoundDetection;
  plantingId: string;
  hungAt: string;
  locationLabel: string;
};

/** One real encounter shown on a wildlife card and addressable on the Su Causeway map. */
export type NatureSoundObservation = {
  id: string;
  speciesId: string;
  locationLabel: string;
  recordedAt: string;
  plantingId?: string;
};
