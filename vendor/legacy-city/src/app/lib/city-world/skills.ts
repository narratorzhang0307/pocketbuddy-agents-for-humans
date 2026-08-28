import { MAP_LAYER_SKILLS } from '../skills/mapLayers';
import { HANGZHOU_ARCH_SKILL } from '../skills/hangzhou-architecture';
import { HANGZHOU_FLOWER_SKILL } from '../skills/hangzhou-flowers';
import { HANGZHOU_MUSEUM_SKILL } from '../skills/hangzhou-museums';
import { HANGZHOU_EXHIBITION_SKILL } from '../skills/hangzhou-exhibitions';
import { CURRENT_CITY_USER_ID } from './seed';
import { appendCityEvent, listCityEvents } from './events';
import type {
  CitySkillDefinition,
  CitySkillInstallation,
  CitySkillPublication,
} from './types';

const STORAGE_KEY = 'shangjie.cityWorld.skills.v1';
const DEFAULT_PUBLIC_SEED_KEY = 'shangjie.cityWorld.defaultPublicSkills.v1';
const DEFAULT_PUBLIC_SKILL_IDS = ['hangzhou-museum-map'] as const;

interface SkillWorldState {
  schemaVersion: 1;
  installations: CitySkillInstallation[];
  publications: CitySkillPublication[];
}

const SKILL_DEFINITIONS: readonly CitySkillDefinition[] = [
  {
    id: HANGZHOU_MUSEUM_SKILL.name,
    title: HANGZHOU_MUSEUM_SKILL.displayName,
    description: HANGZHOU_MUSEUM_SKILL.description,
    city: '杭州',
    versionLabel: HANGZHOU_MUSEUM_SKILL.version,
    placeCount: HANGZHOU_MUSEUM_SKILL.museums.length,
    sourceLabel: '馆方资料与公开地图核验',
    visibility: 'public',
    status: 'published',
  },
  {
    id: HANGZHOU_FLOWER_SKILL.name,
    title: HANGZHOU_FLOWER_SKILL.displayName,
    description: HANGZHOU_FLOWER_SKILL.description,
    city: '杭州',
    versionLabel: HANGZHOU_FLOWER_SKILL.version,
    placeCount: HANGZHOU_FLOWER_SKILL.spots.length,
    sourceLabel: '城市花期与现场笔记',
    visibility: 'public',
    status: 'published',
  },
  {
    id: HANGZHOU_ARCH_SKILL.name,
    title: HANGZHOU_ARCH_SKILL.displayName,
    description: HANGZHOU_ARCH_SKILL.description,
    city: '杭州',
    versionLabel: HANGZHOU_ARCH_SKILL.version,
    placeCount: HANGZHOU_ARCH_SKILL.sites.length,
    sourceLabel: HANGZHOU_ARCH_SKILL.sourceBook,
    visibility: 'public',
    status: 'published',
  },
  {
    id: HANGZHOU_EXHIBITION_SKILL.name,
    title: HANGZHOU_EXHIBITION_SKILL.displayName,
    description: HANGZHOU_EXHIBITION_SKILL.description,
    city: '杭州',
    versionLabel: HANGZHOU_EXHIBITION_SKILL.version,
    placeCount: HANGZHOU_EXHIBITION_SKILL.exhibitions.length,
    sourceLabel: '场馆公开展讯',
    visibility: 'public',
    status: 'published',
  },
];

const DEFINITION_BY_ID = new Map(
  SKILL_DEFINITIONS.map((definition) => [definition.id, definition]),
);
const DESCRIPTOR_BY_ID = new Map(
  MAP_LAYER_SKILLS.map((descriptor) => [descriptor.id, descriptor]),
);

function defaults(): SkillWorldState {
  return {
    schemaVersion: 1,
    installations: [],
    publications: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Number.isFinite(Date.parse(value))
  );
}

function assertValidTimestamp(value: string, label: string) {
  if (!isValidTimestamp(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function hasStringFields(
  value: Record<string, unknown>,
  fields: readonly string[],
) {
  return fields.every(
    (field) => typeof value[field] === 'string' && value[field] !== '',
  );
}

function normalizeInstallation(
  value: unknown,
): CitySkillInstallation | null {
  if (
    !isRecord(value) ||
    !hasStringFields(value, [
      'id',
      'skillId',
      'ownerId',
      'installedAt',
      'versionLabel',
    ]) ||
    !isValidTimestamp(value.installedAt) ||
    value.visibility !== 'private'
  ) {
    return null;
  }
  return {
    id: value.id as string,
    skillId: value.skillId as string,
    ownerId: value.ownerId as string,
    installedAt: value.installedAt as string,
    versionLabel: value.versionLabel as string,
    visibility: 'private',
  };
}

function normalizePublication(
  value: unknown,
): CitySkillPublication | null {
  if (
    !isRecord(value) ||
    !hasStringFields(value, [
      'id',
      'installationId',
      'skillId',
      'ownerId',
      'publishedAt',
    ]) ||
    !isValidTimestamp(value.publishedAt) ||
    value.visibility !== 'public'
  ) {
    return null;
  }
  return {
    id: value.id as string,
    installationId: value.installationId as string,
    skillId: value.skillId as string,
    ownerId: value.ownerId as string,
    publishedAt: value.publishedAt as string,
    visibility: 'public',
  };
}

function uniqueByIdentity<T extends { id: string }>(
  items: T[],
  getIdentity: (item: T) => string,
) {
  const ids = new Set<string>();
  const identities = new Set<string>();
  return items.filter((item) => {
    const identity = getIdentity(item);
    if (ids.has(item.id) || identities.has(identity)) return false;
    ids.add(item.id);
    identities.add(identity);
    return true;
  });
}

export function migrateSkillWorldState(raw: unknown): SkillWorldState {
  if (!isRecord(raw) || raw.schemaVersion !== 1) return defaults();
  const installations = uniqueByIdentity(
    (Array.isArray(raw.installations) ? raw.installations : [])
      .map(normalizeInstallation)
      .filter(
        (installation): installation is CitySkillInstallation =>
          installation !== null,
      ),
    (installation) =>
      JSON.stringify([installation.ownerId, installation.skillId]),
  );
  const publications = uniqueByIdentity(
    (Array.isArray(raw.publications) ? raw.publications : [])
      .map(normalizePublication)
      .filter(
        (publication): publication is CitySkillPublication =>
          publication !== null,
      )
      .filter((publication) =>
        installations.some(
          (installation) =>
            installation.id === publication.installationId &&
            installation.skillId === publication.skillId &&
            installation.ownerId === publication.ownerId,
        ),
      ),
    (publication) =>
      JSON.stringify([publication.ownerId, publication.skillId]),
  );
  return {
    schemaVersion: 1,
    installations,
    publications,
  };
}

function load(): SkillWorldState {
  if (typeof localStorage === 'undefined') return defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return migrateSkillWorldState(raw ? JSON.parse(raw) : null);
  } catch {
    return defaults();
  }
}

let state = load();
const subscribers = new Set<() => void>();

function persist() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 内存态仍可用；隐私模式下不阻断地图。
  }
}

function emit() {
  subscribers.forEach((subscriber) => {
    try {
      subscriber();
    } catch (error) {
      console.error('City Skill subscriber failed.', error);
    }
  });
}

export function subscribeCitySkills(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

export function listCitySkillDefinitions(): CitySkillDefinition[] {
  return SKILL_DEFINITIONS.map((definition) => ({ ...definition }));
}

export function getCitySkillDefinition(
  skillId: string,
): CitySkillDefinition | undefined {
  const definition = DEFINITION_BY_ID.get(skillId);
  return definition ? { ...definition } : undefined;
}

export function listSkillInstallations(
  ownerId = CURRENT_CITY_USER_ID,
): CitySkillInstallation[] {
  return state.installations
    .filter((installation) => installation.ownerId === ownerId)
    .map((installation) => ({ ...installation }));
}

export function getSkillInstallation(
  skillId: string,
  ownerId = CURRENT_CITY_USER_ID,
): CitySkillInstallation | undefined {
  const installation = state.installations.find(
    (candidate) =>
      candidate.skillId === skillId && candidate.ownerId === ownerId,
  );
  return installation ? { ...installation } : undefined;
}

export function installCitySkill(
  skillId: string,
  ownerId = CURRENT_CITY_USER_ID,
  installedAt = new Date().toISOString(),
): CitySkillInstallation {
  const definition = DEFINITION_BY_ID.get(skillId);
  if (!definition) throw new Error(`Unknown city skill: ${skillId}`);

  const existing = getSkillInstallation(skillId, ownerId);
  if (!existing) {
    assertValidTimestamp(installedAt, 'Skill installation time');
  }
  const installation: CitySkillInstallation = existing ?? {
    id: `install:${ownerId}:${skillId}`,
    skillId,
    ownerId,
    installedAt,
    versionLabel: definition.versionLabel,
    visibility: 'private',
  };

  if (!existing) {
    const previousState = state;
    state = {
      ...state,
      installations: [...state.installations, installation],
    };
    try {
      appendCityEvent({
        id: `event:${installation.id}`,
        kind: 'skill-installed',
        createdAt: installedAt,
        actorAgentIds: [],
        ownerId,
        visibility: 'private',
        provenance: 'firsthand',
        payload: {
          skillId,
          installationId: installation.id,
        },
      });
    } catch (error) {
      state = previousState;
      throw error;
    }
    persist();
  }

  const descriptor = DESCRIPTOR_BY_ID.get(skillId);
  descriptor?.setLoaded(true, 'personal');
  descriptor?.setVisible(true, 'personal');
  emit();
  return { ...installation };
}

export function isCitySkillInstalled(
  skillId: string,
  ownerId = CURRENT_CITY_USER_ID,
): boolean {
  return Boolean(getSkillInstallation(skillId, ownerId));
}

export function getSkillPublication(
  skillId: string,
  ownerId = CURRENT_CITY_USER_ID,
): CitySkillPublication | undefined {
  const publication = state.publications.find(
    (candidate) =>
      candidate.skillId === skillId && candidate.ownerId === ownerId,
  );
  return publication ? { ...publication } : undefined;
}

export function listSkillPublications(
  ownerId = CURRENT_CITY_USER_ID,
): CitySkillPublication[] {
  return state.publications
    .filter((publication) => publication.ownerId === ownerId)
    .map((publication) => ({ ...publication }));
}

export function publishInstalledCitySkill(
  skillId: string,
  ownerId = CURRENT_CITY_USER_ID,
  publishedAt = new Date().toISOString(),
): CitySkillPublication {
  const installation = getSkillInstallation(skillId, ownerId);
  if (!installation) {
    throw new Error('Only an installed personal Skill can be published.');
  }

  const existing = getSkillPublication(skillId, ownerId);
  if (existing) return existing;
  assertValidTimestamp(publishedAt, 'Skill publication time');

  const publicationIdBase =
    `publication:${ownerId}:${skillId}:${publishedAt}`;
  const historicalEventIds = new Set(
    listCityEvents(ownerId).map((event) => event.id),
  );
  let publicationId = publicationIdBase;
  let occurrence = 2;
  while (
    state.publications.some(
      (publication) => publication.id === publicationId,
    ) ||
    historicalEventIds.has(`event:${publicationId}`)
  ) {
    publicationId = `${publicationIdBase}:${occurrence}`;
    occurrence += 1;
  }

  const publication: CitySkillPublication = {
    // A withdrawal removes the active publication but deliberately keeps its
    // historical CityEvent, so a repeated timestamp needs a fresh occurrence.
    id: publicationId,
    installationId: installation.id,
    skillId,
    ownerId,
    publishedAt,
    visibility: 'public',
  };
  const previousState = state;
  state = {
    ...state,
    publications: [...state.publications, publication],
  };
  try {
    appendCityEvent({
      id: `event:${publication.id}`,
      kind: 'skill-published',
      createdAt: publishedAt,
      actorAgentIds: [],
      ownerId,
      visibility: 'public',
      provenance: 'firsthand',
      payload: {
        skillId,
        installationId: installation.id,
        publicationId: publication.id,
      },
    });
  } catch (error) {
    state = previousState;
    throw error;
  }
  persist();
  emit();
  return { ...publication };
}

export function unpublishCitySkill(
  skillId: string,
  ownerId = CURRENT_CITY_USER_ID,
) {
  const next = state.publications.filter(
    (publication) =>
      publication.skillId !== skillId || publication.ownerId !== ownerId,
  );
  if (next.length === state.publications.length) return;
  state = { ...state, publications: next };
  persist();
  emit();
}

export function isCitySkillPublished(
  skillId: string,
  ownerId = CURRENT_CITY_USER_ID,
): boolean {
  return Boolean(getSkillPublication(skillId, ownerId));
}

/** One-time product seed for a useful first public map; later withdrawal is respected. */
export function ensureDefaultPublicCitySkills() {
  if (typeof localStorage === 'undefined') return;
  try {
    if (localStorage.getItem(DEFAULT_PUBLIC_SEED_KEY) === '1') return;
    for (const skillId of DEFAULT_PUBLIC_SKILL_IDS) {
      if (!isCitySkillInstalled(skillId)) installCitySkill(skillId);
      if (!isCitySkillPublished(skillId)) publishInstalledCitySkill(skillId);
    }
    localStorage.setItem(DEFAULT_PUBLIC_SEED_KEY, '1');
  } catch (error) {
    console.info('[city-skills] default public seed deferred', error);
  }
}

export function resetCitySkillWorld() {
  state = defaults();
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(DEFAULT_PUBLIC_SEED_KEY);
    } catch {
      // noop
    }
  }
  emit();
}
