import type { Agent3DProfile } from '../../agent3d/types';
import {
  CITY_COMPANION_GUIDES,
  CITY_COMPANION_STAGES,
} from './catalog';
import type { CityCompanionGuide } from './types';

const STORAGE_KEY = 'street-garden.custom-guides.v1';
const EVENT_NAME = 'street-garden:guides-changed';

type StoredAvatarProfile = Agent3DProfile & { createdAt: string };

const canUseStorage = () => {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage);
  } catch {
    return false;
  }
};

export function readCustomAvatarProfiles(): StoredAvatarProfile[] {
  if (!canUseStorage()) return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value)
      ? value
          .filter(
            (profile): profile is StoredAvatarProfile =>
              profile?.species === 'human' &&
              profile?.visual?.representation === 'rigged-3d',
          )
          .slice(0, 4)
      : [];
  } catch {
    return [];
  }
}

const avatarGuide = (profile: Agent3DProfile): CityCompanionGuide => ({
  id: profile.id,
  label: profile.name,
  description: '我的形象 · 已保存到本机',
  portraitUrl: profile.portraitUrl,
  turnaroundUrl: profile.visual?.turnaroundUrl,
  profile,
  stages: CITY_COMPANION_STAGES,
});

export function listCityCompanionGuides(): CityCompanionGuide[] {
  const custom = readCustomAvatarProfiles().map(avatarGuide);
  return [
    ...custom,
    ...CITY_COMPANION_GUIDES.filter(
      (builtin) => !custom.some((saved) => saved.id === builtin.id),
    ),
  ];
}

export function saveCustomAvatarProfile(profile: Agent3DProfile) {
  if (!canUseStorage()) return false;
  const stored: StoredAvatarProfile = {
    ...profile,
    createdAt: new Date().toISOString(),
  };
  const next = [
    stored,
    ...readCustomAvatarProfiles().filter((item) => item.id !== stored.id),
  ].slice(0, 4);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
    return true;
  } catch {
    return false;
  }
}

export function subscribeCityCompanionGuides(listener: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(EVENT_NAME, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT_NAME, listener);
    window.removeEventListener('storage', listener);
  };
}
