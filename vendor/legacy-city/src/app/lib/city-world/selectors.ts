import {
  CITY_AGENT_CONVERSATIONS,
  CURRENT_CITY_USER_ID,
} from './seed';
import {
  listCityAgents,
  listCityBlooms,
  listCityPostcards,
} from './store';
import { listPocketBuddies } from '../pocket-buddy/store';
import type {
  CityAgentSeed,
  CityAgentConversation,
  CityBloomSeed,
  CityPostcardSeed,
  WorldLayer,
  WorldLayerSummary,
} from './types';

export const PUBLIC_BLOOM_MEDIUM_ZOOM = 13.5;
export const PUBLIC_BLOOM_CLOSE_ZOOM = 15.5;

export function getStreetConversationForMapPlant(
  mapPlantId: string,
): CityAgentConversation | undefined {
  const conversation = CITY_AGENT_CONVERSATIONS.find(
    (candidate) => candidate.mapPlantId === mapPlantId,
  );
  return conversation ? { ...conversation } : undefined;
}

export function getSocialAgentsForMapPlant(
  mapPlantId: string,
): CityAgentSeed[] {
  const conversation = CITY_AGENT_CONVERSATIONS.find(
    (candidate) => candidate.mapPlantId === mapPlantId,
  );
  if (!conversation) return [];
  const ids = new Set([
    conversation.speakerAgentId,
    conversation.listenerAgentId,
  ]);
  return listCityAgents()
    .filter((agent) => ids.has(agent.id) && agent.visibility === "public")
    .map((agent) => ({ ...agent }));
}

export function selectBloomsForLayer(
  layer: WorldLayer,
  viewerId = CURRENT_CITY_USER_ID,
): CityBloomSeed[] {
  return listCityBlooms()
    .filter((bloom) =>
      layer === 'personal'
        ? bloom.ownerId === viewerId
        : bloom.visibility === 'public',
    )
    .sort(
      (left, right) =>
        (right.publicPriority ?? 0) - (left.publicPriority ?? 0),
    );
}

export function isGardenPlantVisible(
  mapPlantId: string,
  layer: WorldLayer,
  viewerId = CURRENT_CITY_USER_ID,
  includeLegacyPlants = true,
): boolean {
  const bloom = listCityBlooms().find(
    (candidate) => candidate.mapPlantId === mapPlantId,
  );

  // 旧 Garden 植物在迁入统一 World Store 前，按用户既有私人花园处理。
  if (!bloom) return includeLegacyPlants && layer === 'personal';

  return layer === 'personal'
    ? bloom.ownerId === viewerId
    : bloom.visibility === 'public';
}

/**
 * 公共街面在城市尺度只展示代表节点，避免 48 株成对高花缩成一团；
 * 放回街道尺度后再逐级恢复完整的双花与智能体对话。
 */
export function isPublicBloomVisibleAtZoom(
  mapPlantId: string,
  zoom: number,
): boolean {
  if (zoom >= PUBLIC_BLOOM_CLOSE_ZOOM) return true;

  const cityFlower = /^city-flower-(\d+)-([ab])$/.exec(mapPlantId);
  if (cityFlower) {
    const hubNumber = Number(cityFlower[1]);
    const side = cityFlower[2];
    if (side === 'b') return false;
    if (zoom >= PUBLIC_BLOOM_MEDIUM_ZOOM) return true;

    // 6 × 4 城市网格每行保留两个错位节点，避免远景代表花长期
    // 只落在同两列、让东侧城区看起来像从未被探索。
    const zeroBasedHub = hubNumber - 1;
    const row = Math.floor(zeroBasedHub / 6);
    const column = zeroBasedHub % 6;
    const firstColumn = row % 3;
    return column === firstColumn || column === firstColumn + 3;
  }

  if (zoom >= PUBLIC_BLOOM_MEDIUM_ZOOM) return true;
  const bloom = listCityBlooms().find(
    (candidate) => candidate.mapPlantId === mapPlantId,
  );
  return (bloom?.publicPriority ?? 0) >= 80;
}

export function isGardenPlantVisibleAtZoom(
  mapPlantId: string,
  layer: WorldLayer,
  zoom: number,
  viewerId = CURRENT_CITY_USER_ID,
  includeLegacyPlants = true,
): boolean {
  return (
    isGardenPlantVisible(
      mapPlantId,
      layer,
      viewerId,
      includeLegacyPlants,
    ) &&
    (layer !== 'public' || isPublicBloomVisibleAtZoom(mapPlantId, zoom))
  );
}

export function getCityBloomForMapPlant(
  mapPlantId: string,
): CityBloomSeed | undefined {
  const bloom = listCityBlooms().find(
    (candidate) => candidate.mapPlantId === mapPlantId,
  );
  return bloom ? { ...bloom } : undefined;
}

export function getResidentAgentForMapPlant(
  mapPlantId: string,
  layer: WorldLayer,
  viewerId = CURRENT_CITY_USER_ID,
): CityAgentSeed | undefined {
  const bloom = listCityBlooms().find(
    (candidate) => candidate.mapPlantId === mapPlantId,
  );
  if (!bloom || !isGardenPlantVisible(mapPlantId, layer, viewerId)) {
    return undefined;
  }
  const pocketBuddy = listPocketBuddies().find(
    (buddy) => buddy.status === 'resident' && buddy.homeBloomId === bloom.id,
  );
  if (pocketBuddy) {
    const visibility = pocketBuddy.privacy === 'public'
      ? 'public'
      : pocketBuddy.privacy === 'friends'
        ? 'unlisted'
        : 'private';
    if (layer === 'public' && visibility !== 'public') return undefined;
    return {
      id: pocketBuddy.id,
      ownerId: viewerId,
      name: pocketBuddy.name,
      species: pocketBuddy.category,
      role: 'resident',
      visibility,
      profileAssetUrl: pocketBuddy.visual.thumbnailUrl,
      homeBloomId: bloom.id,
      currentState: 'resting',
      activityLabel: `在${bloom.name}下整理口袋见闻`,
    };
  }
  if (!bloom.residentAgentId) return undefined;
  const agent = listCityAgents().find(
    (candidate) => candidate.id === bloom.residentAgentId,
  );
  if (!agent) return undefined;
  const visible =
    layer === 'personal'
      ? agent.ownerId === viewerId
      : agent.visibility === 'public';
  return visible ? { ...agent } : undefined;
}

export function selectPostcardsForBloom(
  bloomId: string,
  layer: WorldLayer,
  viewerId = CURRENT_CITY_USER_ID,
): CityPostcardSeed[] {
  return listCityPostcards().filter((postcard) => {
    if (postcard.bloomId !== bloomId) return false;
    return layer === 'personal'
      ? postcard.ownerId === viewerId
      : postcard.visibility === 'public';
  }).map((postcard) => ({ ...postcard }));
}

export function getWorldLayerSummary(layer: WorldLayer): WorldLayerSummary {
  const visibleBlooms = selectBloomsForLayer(layer);
  return layer === 'personal'
    ? {
        layer,
        label: '我的街道',
        description: '我的大花、花邮与留驻智能体',
        visibleBloomCount: visibleBlooms.length,
      }
    : {
        layer,
        label: '公共街道',
        description: '正在发生、值得拜访的公开城市内容',
        visibleBloomCount: visibleBlooms.length,
      };
}
