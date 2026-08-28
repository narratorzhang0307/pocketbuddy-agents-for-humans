import type { CityBuddyGardenHomeSpec } from './cityBuddyGarden';
import { getPocketBuddyCharacterPackage } from './buddyPackages.generated';
import type { BuddyEncounterTarget } from './encounter';
import type { MagicalAnimalMapFieldSpec } from './magicalAnimalMapField';

/**
 * The single bridge between map placement data and the reusable CRPG encounter.
 * Keep marker layers concerned with geography only; encounter UI/rules consume
 * this stable target shape regardless of which city layer spawned the Buddy.
 */
export function createMagicalAnimalEncounterTarget(
  animal: MagicalAnimalMapFieldSpec,
  cityName = '杭州',
): BuddyEncounterTarget {
  const characterPackage = getPocketBuddyCharacterPackage(animal.buddyPackageId);
  return {
    catalogId: animal.buddyPackageId,
    name: animal.name,
    role: animal.role,
    assetUrl: characterPackage?.visual.portraitUrl ?? animal.assetUrl,
    accent: characterPackage?.identity.accent ?? animal.accent,
    cityName,
    locationName: animal.habitatName,
    openingLine:
      characterPackage?.dialogue.encounter.openings[0] ?? animal.line,
  };
}

export function createCityBuddyGardenEncounterTarget(
  home: CityBuddyGardenHomeSpec,
): BuddyEncounterTarget {
  const characterPackage = getPocketBuddyCharacterPackage(home.buddyPackageId);
  return {
    catalogId: home.buddyPackageId,
    name: home.buddyName,
    role: home.buddyRole,
    assetUrl: characterPackage?.visual.portraitUrl ?? home.buddyAssetUrl,
    accent: characterPackage?.identity.accent ?? home.buddyAccent,
    cityName: home.cityName,
    locationName: `${home.districtName} · ${home.siteName}`,
    openingLine:
      characterPackage?.dialogue.encounter.openings[0] ?? home.line,
  };
}
