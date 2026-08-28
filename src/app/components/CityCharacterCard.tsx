import { useState, type CSSProperties, type ReactNode } from 'react';
import { Eye, EyeOff, Flower2, MapPin, Minus, Plus, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react';
import {
  CITY_CHARACTER_SKILLS,
  CITY_CHARACTER_STATS,
  CITY_CHARACTER_VITALS,
  characterVitalsFrom,
  cityCharacterModifier,
  cityCharacterSerial,
  normalizeCharacterVitals,
  normalizeCharacterSheet,
  type CityCharacterSheet,
  type CityCharacterSkillId,
  type CityCharacterStatId,
  type CityCharacterVitals,
} from '../lib/crpg/character';
import './CityCharacterCard.css';

export type CityCharacterScene = 'city' | 'night' | 'pond' | 'archive' | 'rain' | 'tram' | 'market' | 'rooftop' | 'greenhouse' | 'canal' | 'deepsea' | 'relay' | 'signalroom' | 'postoffice' | 'soundstage' | 'arcade' | 'antenna' | 'metro' | 'lostfound' | 'teahouse' | 'waystation';

export type CityBotanicalCardDetails = {
  scientificName: string;
  familyLabel: string;
  description: string;
  locationLabel: string;
  coordinates?: readonly [number, number];
  statusLabel?: string;
  fieldNote?: string;
};

type CityCharacterCardProps = {
  id: string;
  name: string;
  role: string;
  kind: string;
  accent: string;
  portrait: ReactNode;
  sheet: CityCharacterSheet;
  vitals?: CityCharacterVitals;
  level?: number;
  compact?: boolean;
  blendPortrait?: boolean;
  scene?: CityCharacterScene;
  sceneVariant?: number;
  editable?: boolean;
  boundary?: string;
  onRoleChange?: (value: string) => void;
  onBoundaryChange?: (value: string) => void;
  onSheetChange?: (value: CityCharacterSheet) => void;
  onVitalsChange?: (value: CityCharacterVitals) => void;
  onFlipChange?: (flipped: boolean) => void;
  action?: ReactNode;
  botanical?: CityBotanicalCardDetails;
  honorLabel?: string;
  honorUnlocked?: boolean;
  honorRequirement?: string;
};

const clampStat = (value: number) => Math.min(16, Math.max(6, value));

type StoredCardEdits = {
  sheet?: CityCharacterSheet;
  vitals?: CityCharacterVitals;
};

const cardEditsStorageKey = (id: string) => `carrythecosmos.city-card-edits.v1.${id}`;

function readStoredCardEdits(id: string): StoredCardEdits {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(cardEditsStorageKey(id));
    return raw ? JSON.parse(raw) as StoredCardEdits : {};
  } catch {
    return {};
  }
}

function writeStoredCardEdits(id: string, patch: StoredCardEdits) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      cardEditsStorageKey(id),
      JSON.stringify({ ...readStoredCardEdits(id), ...patch }),
    );
  } catch {
    // Private browsing/storage pressure must not make the card unusable.
  }
}

export default function CityCharacterCard({
  id,
  name,
  role,
  kind,
  accent,
  portrait,
  sheet,
  vitals,
  level = 1,
  compact = false,
  blendPortrait = false,
  scene = 'city',
  sceneVariant,
  editable = false,
  boundary,
  onRoleChange,
  onBoundaryChange,
  onSheetChange,
  onVitalsChange,
  onFlipChange,
  action,
  botanical,
  honorLabel,
  honorUnlocked = true,
  honorRequirement,
}: CityCharacterCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [backArtworkCollapsed, setBackArtworkCollapsed] = useState(false);
  const [localSheet, setLocalSheet] = useState(() => {
    const stored = readStoredCardEdits(id).sheet;
    return stored ? normalizeCharacterSheet(stored) : sheet;
  });
  const [localVitals, setLocalVitals] = useState(() => {
    const stored = readStoredCardEdits(id).vitals;
    return stored ? normalizeCharacterVitals(stored) : characterVitalsFrom(id);
  });
  const currentSheet = onSheetChange ? sheet : localSheet;
  const currentVitals = vitals ?? localVitals;
  const editingEnabled = editable || backArtworkCollapsed;
  const serial = cityCharacterSerial(id);
  const normalizedSceneVariant = sceneVariant === undefined ? undefined : Math.abs(sceneVariant);
  const sceneVariantClasses = normalizedSceneVariant === undefined
    ? ''
    : ` is-layout-${normalizedSceneVariant % 4} is-plants-${Math.floor(normalizedSceneVariant / 4) % 4}`;
  const style = {
    '--ccc-accent': accent,
  } as CSSProperties;

  const patchSheet = (patch: Partial<CityCharacterSheet>) => {
    const next = { ...currentSheet, ...patch };
    setLocalSheet(next);
    writeStoredCardEdits(id, { sheet: next });
    onSheetChange?.(next);
  };

  const patchStat = (stat: CityCharacterStatId, delta: number) => {
    patchSheet({
      stats: {
        ...currentSheet.stats,
        [stat]: clampStat(currentSheet.stats[stat] + delta),
      },
    });
  };

  const toggleSkill = (skill: CityCharacterSkillId) => {
    const active = currentSheet.skills.includes(skill);
    patchSheet({
      skills: active
        ? currentSheet.skills.filter((candidate) => candidate !== skill)
        : [...currentSheet.skills.slice(-2), skill],
    });
  };

  const patchVital = (vital: keyof CityCharacterVitals, value: number) => {
    const next = normalizeCharacterVitals({ ...currentVitals, [vital]: value });
    writeStoredCardEdits(id, { vitals: next });
    if (onVitalsChange) onVitalsChange(next);
    else setLocalVitals(next);
  };

  return (
    <section
      className={`ccc-shell is-scene-${scene}${sceneVariantClasses}${flipped ? ' is-flipped' : ''}${backArtworkCollapsed ? ' is-back-art-collapsed' : ''}${compact ? ' is-compact' : ''}${blendPortrait ? ' is-portrait-blended' : ''}${botanical ? ' is-botanical' : ''}`}
      style={style}
      aria-label={`${name}的${botanical ? '城市植物卡' : '城市角色卡'}`}
    >
      <button
        type="button"
        className="ccc-flip"
        onClick={() => {
          const nextFlipped = !flipped;
          setFlipped(nextFlipped);
          onFlipChange?.(nextFlipped);
        }}
        aria-label={flipped ? `查看${name}的卡牌正面` : `查看${name}的卡牌背面${botanical ? '档案' : '属性'}`}
      >
        <RotateCcw size={compact ? 12 : 15} />
        {flipped ? '看正面' : '翻到背面'}
      </button>

      {!botanical && flipped && (
        <button
          type="button"
          className="ccc-back-art-toggle"
          aria-pressed={backArtworkCollapsed}
          aria-label={`${backArtworkCollapsed ? '显示' : '收起'}${name}卡背的 MY AGENT 与植物动作`}
          onClick={() => setBackArtworkCollapsed((collapsed) => !collapsed)}
        >
          {backArtworkCollapsed ? <Eye size={compact ? 8 : 11} /> : <EyeOff size={compact ? 8 : 11} />}
          {backArtworkCollapsed ? '显示动作' : '收起动作'}
        </button>
      )}

      <div className="ccc-card">
        <article className="ccc-face ccc-front" aria-hidden={flipped}>
          <header>
            <span>{botanical ? 'CITY BOTANICAL' : kind}</span>
            <b>NO.{serial}</b>
          </header>
          <div className="ccc-art">
            <div className="ccc-sun" />
            <Flower2 className="ccc-plant ccc-plant-a" aria-hidden="true" />
            <Flower2 className="ccc-plant ccc-plant-b" aria-hidden="true" />
            <div className="ccc-portrait">{portrait}</div>
            {honorLabel && (
              <span
                className={`ccc-honor${honorUnlocked ? ' is-unlocked' : ' is-locked'}`}
                title={honorUnlocked ? `${honorLabel}荣誉已获得` : honorRequirement}
              >
                <Sparkles size={10} />
                <b>{honorLabel}</b>
                {!honorUnlocked && honorRequirement && <small>{honorRequirement}</small>}
              </span>
            )}
            <span className="ccc-level">{botanical ? botanical.statusLabel ?? 'ROOTED' : `LV.${level}`}</span>
          </div>
          <footer>
              <small>上街去 · {botanical ? 'BOTANICAL DECK' : 'CITY DECK'}</small>
            <h2>{name}</h2>
            <p>{botanical?.scientificName ?? role}</p>
            <div>
              {botanical ? (
                <>
                  <span>{botanical.familyLabel}</span>
                  <span>城市植物图鉴</span>
                  <span>可收藏</span>
                </>
              ) : currentSheet.skills.slice(0, 3).map((skillId) => (
                  <span key={skillId}>
                    {CITY_CHARACTER_SKILLS.find((skill) => skill.id === skillId)?.label}
                  </span>
                ))}
            </div>
          </footer>
        </article>

        {botanical ? (
          <article className="ccc-face ccc-back ccc-botanical-back" aria-hidden={!flipped}>
            <header>
              <div>
                <small>NO.{serial} · BOTANICAL RECORD</small>
                <h2>{name}</h2>
              </div>
              <Flower2 size={compact ? 16 : 22} />
            </header>

            <div className="ccc-botanical-specimen" aria-hidden="true">
              {portrait}
            </div>

            <section className="ccc-botanical-intro">
              <small>{botanical.scientificName}</small>
              <p>{botanical.description}</p>
            </section>

            <dl className="ccc-botanical-facts">
              <div>
                <dt>所在地点</dt>
                <dd>{botanical.locationLabel}</dd>
              </div>
              <div>
                <dt>植物坐标</dt>
                <dd>
                  {botanical.coordinates
                    ? `E ${botanical.coordinates[0].toFixed(6)} · N ${botanical.coordinates[1].toFixed(6)}`
                    : '等待种下后生成'}
                </dd>
              </div>
              {botanical.fieldNote && (
                <div>
                  <dt>街头观察</dt>
                  <dd>{botanical.fieldNote}</dd>
                </div>
              )}
            </dl>

            <footer>
              <span><MapPin size={11} />杭州城市植物档案</span>
              {action}
            </footer>
          </article>
        ) : (
        <article className="ccc-face ccc-back" aria-hidden={!flipped}>
          <header>
            <div>
              <small>NO.{serial} · LV.{level}</small>
              {editable && onRoleChange ? (
                <input
                  value={role}
                  maxLength={24}
                  aria-label="角色身份"
                  onChange={(event) => onRoleChange(event.target.value)}
                />
              ) : (
                <h2>{name}</h2>
              )}
            </div>
            <ShieldCheck size={compact ? 16 : 21} />
          </header>

          <section className="ccc-vitals" aria-label="即时状态">
            <div className="ccc-vitals-heading">
              <strong>即时状态</strong>
              <small>随天气、步数与事件变化</small>
            </div>
            <div>
              {CITY_CHARACTER_VITALS.map((vital) => (
                <label key={vital.id}>
                  <span>
                    <b>{vital.short}</b>
                    {vital.label}
                    <output>{currentVitals[vital.id]}</output>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={currentVitals[vital.id]}
                    disabled={!editingEnabled}
                    aria-label={`${vital.label}当前值`}
                    onInput={(event) => patchVital(vital.id, Number(event.currentTarget.value))}
                  />
                </label>
              ))}
            </div>
          </section>

          <div className="ccc-stat-list" aria-label="六项成长属性">
            {CITY_CHARACTER_STATS.map((stat) => {
              const score = currentSheet.stats[stat.id];
              const modifier = cityCharacterModifier(score);
              return (
                <div key={stat.id} className="ccc-stat" title={stat.description}>
                  <span>{stat.short}</span>
                  <div>
                    <b>{stat.label}</b>
                    <i><em style={{ width: `${(score / 16) * 100}%` }} /></i>
                  </div>
                  {editingEnabled ? (
                    <span className="ccc-stepper">
                      <button type="button" onClick={() => patchStat(stat.id, -1)} aria-label={`${stat.label}减一`}><Minus size={10} /></button>
                      <output>{score}</output>
                      <button type="button" onClick={() => patchStat(stat.id, 1)} aria-label={`${stat.label}加一`}><Plus size={10} /></button>
                    </span>
                  ) : (
                    <output>{score}<small>{modifier >= 0 ? `+${modifier}` : modifier}</small></output>
                  )}
                </div>
              );
            })}
          </div>

          <section className="ccc-skills">
            <strong>擅长</strong>
            <div>
              {CITY_CHARACTER_SKILLS.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  className={currentSheet.skills.includes(skill.id) ? 'is-active' : ''}
                  disabled={!editingEnabled}
                  onClick={() => toggleSkill(skill.id)}
                >
                  {skill.label}{currentSheet.skills.includes(skill.id) ? ' +2' : ''}
                </button>
              ))}
            </div>
          </section>

          <div className="ccc-traits">
            <label>
              <span>习惯</span>
              {editingEnabled ? (
                <input
                  value={currentSheet.habit}
                  maxLength={46}
                  aria-label="习惯"
                  onChange={(event) => patchSheet({ habit: event.target.value })}
                />
              ) : <p>{currentSheet.habit}</p>}
            </label>
            {boundary !== undefined && (
              <label>
                <span>底线</span>
                {editable && onBoundaryChange ? (
                  <input value={boundary} maxLength={64} onChange={(event) => onBoundaryChange(event.target.value)} />
                ) : <p>{boundary}</p>}
              </label>
            )}
          </div>

          <footer>
            <span><Sparkles size={11} />检定：2D6＋属性修正＋技能</span>
          </footer>
        </article>
        )}
      </div>
    </section>
  );
}
