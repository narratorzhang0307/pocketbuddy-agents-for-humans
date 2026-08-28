// 生声不息的观鸟手帐：将声音识别历史和已挂到植物的鸟类卡牌，
// 直接铺成可编辑的拼贴页，不再读取旧的城市漫游照片。
import { useEffect, useState } from 'react';
import JournalPane, { type JournalPhoto, type JournalPlace } from './JournalPane';
import {
  readHungNatureSoundCards,
  readNatureSoundRecognition,
  subscribeHungNatureSoundCards,
} from '../lib/nature-sound/store';
import type { NatureSoundDetection } from '../lib/nature-sound/types';

type BirdJournalRecord = {
  detection: NatureSoundDetection;
  locationLabel: string;
  recordedAt: string;
};

const fingerprint = (values: readonly string[]) => {
  let hash = 2166136261;
  values.forEach((value) => {
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  });
  return (hash >>> 0).toString(36);
};

const readBirdJournalRecords = (): BirdJournalRecord[] => {
  const recognition = readNatureSoundRecognition();
  const hungCards = readHungNatureSoundCards();
  const records = new Map<string, BirdJournalRecord>();

  (recognition?.detections ?? [])
    .filter((detection) => detection.group === 'bird')
    .forEach((detection) => records.set(detection.id, {
      detection,
      locationLabel: detection.locationLabel ?? recognition?.locationLabel ?? '苏堤',
      recordedAt: detection.recordedAt ?? recognition?.recordedAt ?? new Date().toISOString(),
    }));

  hungCards
    .filter((card) => card.detection.group === 'bird')
    .forEach((card) => {
      if (records.has(card.detection.id)) return;
      records.set(card.detection.id, {
        detection: card.detection,
        locationLabel: card.detection.locationLabel ?? card.locationLabel,
        recordedAt: card.detection.recordedAt ?? card.hungAt,
      });
    });

  return [...records.values()].sort((left, right) => (
    new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime()
  ));
};

export default function ZinePane({ active, onBack }: { active: boolean; onBack: () => void }) {
  const [, refresh] = useState(0);
  useEffect(() => {
    const unsubscribe = subscribeHungNatureSoundCards(() => refresh((value) => value + 1));
    return () => { unsubscribe(); };
  }, []);

  const records = active ? readBirdJournalRecords() : [];
  const photos: JournalPhoto[] = records.flatMap(({ detection, locationLabel, recordedAt }) => {
    const url = detection.assetSlug
      ? `/assets/shengsheng-species/${detection.assetSlug}/frames/listen.png`
      : detection.imageUrl;
    return url ? [{
      id: detection.id,
      url,
      place: `${detection.commonName} · ${locationLabel}`,
      date: recordedAt,
    }] : [];
  });
  const places: JournalPlace[] = records.slice(0, 5).map(({ detection, locationLabel }, order) => ({
    name: detection.commonName,
    quote: `${locationLabel} · ${detection.soundProfile ?? detection.description ?? `声音置信度 ${Math.round(detection.confidence * 100)}%`}`,
    status: 'extant',
    order,
  }));
  const recordFingerprint = fingerprint(records.map(({ detection, recordedAt }) => (
    `${detection.id}:${recordedAt}`
  )));

  return (
    <JournalPane
      key={recordFingerprint}
      city="杭州"
      photos={photos}
      places={places}
      date={new Date().toISOString().slice(0, 7)}
      journalKind="birding"
      onBack={onBack}
    />
  );
}
