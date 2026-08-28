import type { WorldLayer } from '../city-world/types';
import type { MapLayerSkillDescriptor } from './mapLayers';

export type MapSkillWorldAccess = {
  isInstalled(skillId: string): boolean;
  isPublished(skillId: string): boolean;
};

export function ensureGlobalMapSkillsLoaded(
  skills: readonly Pick<
    MapLayerSkillDescriptor,
    'worldScope' | 'isLoaded' | 'setLoaded'
  >[],
  worldLayer?: WorldLayer,
) {
  skills.forEach((skill) => {
    if (skill.worldScope === 'global' && !skill.isLoaded(worldLayer)) {
      skill.setLoaded(true, worldLayer);
    }
  });
}

export function isMapSkillRelevantInWorld(
  skill: Pick<MapLayerSkillDescriptor, 'worldScope'>,
  worldLayer?: WorldLayer,
): boolean {
  return (
    !worldLayer ||
    skill.worldScope === 'global' ||
    skill.worldScope !== 'personal' ||
    worldLayer === 'personal'
  );
}

/**
 * One privacy gate shared by the layer host and its control surface.
 *
 * Catalog Skills live in a user's private library after installation and only
 * enter the public street after an explicit publication. Personal device
 * Skills never enter the public street; global Skills stay in both views.
 */
export function isMapSkillAvailableInWorld(
  skill: Pick<MapLayerSkillDescriptor, 'id' | 'worldScope'>,
  worldLayer: WorldLayer | undefined,
  access: MapSkillWorldAccess,
): boolean {
  if (!worldLayer || skill.worldScope === 'global') return true;
  if (skill.worldScope === 'personal') {
    return worldLayer === 'personal';
  }
  return worldLayer === 'personal'
    ? access.isInstalled(skill.id)
    : access.isPublished(skill.id);
}
