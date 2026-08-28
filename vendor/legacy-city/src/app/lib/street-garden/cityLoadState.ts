import {
  PUBLIC_GARDEN_CITY_PACKAGES,
  type PublicGardenCityId,
} from "./cities";

type CityLoadStorage = Pick<Storage, "getItem" | "setItem">;

export const PUBLIC_GARDEN_CITY_LOAD_SESSION_KEY =
  "shangjie.publicGardenCities.loaded.v1";

const allGardenCityIds = () =>
  PUBLIC_GARDEN_CITY_PACKAGES.map((city) => city.id);

function browserSessionStorage(): CityLoadStorage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function normalizeLoadedGardenCityIds(
  cityIds: readonly unknown[],
): PublicGardenCityId[] {
  const requestedIds = new Set(cityIds);
  return allGardenCityIds().filter((cityId) => requestedIds.has(cityId));
}

export function readLoadedGardenCityIds(
  storage: CityLoadStorage | null = browserSessionStorage(),
): PublicGardenCityId[] {
  const defaults = allGardenCityIds();
  if (!storage) return defaults;

  try {
    const stored = storage.getItem(PUBLIC_GARDEN_CITY_LOAD_SESSION_KEY);
    if (stored === null) return defaults;
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return defaults;
    const normalized = normalizeLoadedGardenCityIds(parsed);
    // [] is the user's explicit "unload every city" choice. A non-empty
    // array containing no current catalogue ids is stale or damaged state.
    return parsed.length > 0 && normalized.length === 0
      ? defaults
      : normalized;
  } catch {
    return defaults;
  }
}

export function persistLoadedGardenCityIds(
  cityIds: readonly PublicGardenCityId[],
  storage: CityLoadStorage | null = browserSessionStorage(),
) {
  if (!storage) return;
  try {
    storage.setItem(
      PUBLIC_GARDEN_CITY_LOAD_SESSION_KEY,
      JSON.stringify(normalizeLoadedGardenCityIds(cityIds)),
    );
  } catch {
    // The visible in-memory selection remains authoritative for this tab.
  }
}
