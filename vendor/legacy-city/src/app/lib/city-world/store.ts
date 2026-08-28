import {
  CITY_AGENT_SEEDS,
  CITY_BLOOM_SEEDS,
  CITY_POSTCARD_SEEDS,
} from './seed';
import type {
  CityAgentSeed,
  CityBloomSeed,
  CityPostcardSeed,
} from './types';

export const CITY_WORLD_SCHEMA_VERSION = 1;

export function listCityBlooms(): CityBloomSeed[] {
  return CITY_BLOOM_SEEDS.map((bloom) => ({
    ...bloom,
    ...(bloom.postcardIds
      ? { postcardIds: [...bloom.postcardIds] }
      : {}),
  }));
}

export function listCityAgents(): CityAgentSeed[] {
  return CITY_AGENT_SEEDS.map((agent) => ({ ...agent }));
}

export function listCityPostcards(): CityPostcardSeed[] {
  return CITY_POSTCARD_SEEDS.map((postcard) => ({ ...postcard }));
}
