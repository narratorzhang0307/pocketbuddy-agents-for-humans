import { useRef, type CSSProperties } from 'react';
import CityCharacterCard from '../../../vendor/legacy-city/src/app/components/CityCharacterCard';
import { characterSheetFrom } from '../../../vendor/legacy-city/src/app/lib/crpg/character';
import { isCurrentBirdCandidate, type BirdDeckEntry } from '../lib/birdDeck';
import type { BirdStatus } from '../lib/birdListener';

/** Adapter for the shared front/back renderer, using only approved bird assets. */
export default function BirdSoundCard({ entry, bird }: { entry: BirdDeckEntry; bird?: BirdStatus }) {
  const root = useRef<HTMLDivElement>(null);
  const current = isCurrentBirdCandidate(bird, entry.id);
  const profile = entry.profile;
  return <div ref={root} className="bird-sound-card" style={{ '--bird-card-scene': `url("${entry.backgroundUrl}")` } as CSSProperties}>
    <CityCharacterCard
      id={`bird-listener-${entry.id}`}
      name={entry.name}
      role="鸟声图鉴"
      kind="BIRD LISTENER"
      accent={profile?.accent ?? '#7cff6b'}
      portrait={<img src={entry.spriteUrl} alt={`${entry.name}鸟卡插画`} />}
      sheet={characterSheetFrom({ seed: entry.id, role: '鸟声图鉴', traits: ['观察', '声音'] })}
      scene={profile?.scene}
      onFlipChange={flipped => {
        if (!flipped) root.current?.querySelectorAll('audio').forEach(audio => audio.pause());
      }}
      wildlife={{
        scientificName: profile?.scientificName,
        englishName: profile?.englishName,
        familyLabel: profile?.familyLabel,
        orderLabel: profile?.orderLabel,
        description: profile?.description ?? '请结合真实外形、环境和鸣声辨认；卡面为鸟类插画。',
        activeTimeLabel: profile?.activeTimeLabel,
        soundProfile: profile?.soundProfile,
        habitatLabel: profile?.habitatLabel,
        behaviorLabel: profile?.behaviorLabel,
        locationLabel: '未采集位置',
        detectedAtLabel: '本次识别',
        confidence: current ? bird?.confidence : undefined,
        recognized: current,
        statusLabel: current ? '本次候选' : '图鉴参考',
        evidenceLabel: '本次原始录音不落盘，未保留可回听片段。模型候选需结合环境与外形确认。',
        referenceAudioUrl: entry.audioUrl,
        referenceAudioLabel: '物种参考鸟声 · 非本次录音',
        deckLabel: 'POCKET BUDDY · BIRD DECK',
        protectionStatus: '参考鸟声不代表本次识别；请勿用回放诱鸟。',
      }}
    />
  </div>;
}
