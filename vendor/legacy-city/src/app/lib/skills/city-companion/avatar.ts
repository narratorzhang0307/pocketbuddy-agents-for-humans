import type {
  Agent3DProfile,
  AgentPersonality,
} from '../../agent3d/types';

export type AvatarForgeSettings = {
  name: string;
  skin: string;
  shirt: string;
  shorts: string;
  backpack: string;
  cap: string;
  headScale: number;
  bodyScale: number;
  shoulderWidth: number;
  armLength: number;
  legLength: number;
  backpackScale: number;
};

const numberParameter = (
  profile: Agent3DProfile,
  key: string,
  fallback: number,
) => {
  const value = profile.rig?.parameters[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : fallback;
};

export function avatarSettingsFromProfile(
  profile: Agent3DProfile,
): AvatarForgeSettings {
  const palette = profile.visual?.palette;
  return {
    name: profile.name,
    skin: palette?.skin || '#d99162',
    shirt: palette?.shirt || profile.color,
    shorts: palette?.shorts || profile.accent,
    backpack: palette?.backpack || '#253c50',
    cap: palette?.cap || '#d94436',
    headScale: numberParameter(profile, 'headScale', 1),
    bodyScale: numberParameter(profile, 'bodyScale', 1),
    shoulderWidth: numberParameter(profile, 'shoulderWidth', 1),
    armLength: numberParameter(profile, 'armLength', 1),
    legLength: numberParameter(profile, 'avatarLegLength', 1),
    backpackScale: numberParameter(profile, 'backpackScale', 1),
  };
}

export function buildPersonalAvatarProfile(
  base: Agent3DProfile,
  settings: AvatarForgeSettings,
  preview = false,
  personality: AgentPersonality = base.personality,
): Agent3DProfile {
  const id = preview ? `preview-${base.id}` : `my-avatar-${base.id}`;
  const visualVersion = `${base.visual?.version || 'avatar'}-personal-v1`;
  const name = settings.name.trim() || '我的城市形象';
  const manifest = base.manifest
    ? {
        ...base.manifest,
        id,
        name,
        visual: {
          ...base.manifest.visual,
          primaryColor: settings.shirt,
          accentColor: settings.shorts,
          version: visualVersion,
        },
        personality: {
          ...base.manifest.personality,
          ...personality,
        },
      }
    : undefined;

  return {
    ...base,
    id,
    name,
    color: settings.shirt,
    accent: settings.shorts,
    personality,
    rig: {
      templateId: base.rig?.templateId || 'city-biped-v1',
      templateVersion:
        base.rig?.templateVersion || 'rounded-city-biped-v1',
      bodyPlan: 'biped',
      footCount: 2,
      parameters: {
        headScale: settings.headScale,
        bodyScale: settings.bodyScale,
        shoulderWidth: settings.shoulderWidth,
        armLength: settings.armLength,
        avatarLegLength: settings.legLength,
        backpackScale: settings.backpackScale,
      },
    },
    visual: base.visual
      ? {
          ...base.visual,
          version: visualVersion,
          palette: {
            skin: settings.skin,
            shirt: settings.shirt,
            shorts: settings.shorts,
            backpack: settings.backpack,
            cap: settings.cap,
          },
        }
      : undefined,
    manifest,
  };
}
