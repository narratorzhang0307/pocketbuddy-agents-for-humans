import type { GeoPosition } from '../maps/runtime';
import { gcj02ToWgs84 } from '../location/chinaCoordinates';
import { SUDI_ROUTE } from './sudiRoute';

export type NatureSoundPlantCardModule = {
  id: string;
  place: string;
  position: GeoPosition;
  plantAssetId: string;
  plantSize: number;
  stemAnchor: readonly [number, number];
  cardSpeciesIds: readonly string[];
};

const amapPoint = (lng: number, lat: number): GeoPosition =>
  gcj02ToWgs84([lng, lat]);

/**
 * Unified West Lake plant-card modules. The renderer is fixed; each entry only
 * swaps the map position, plant art, stem anchor, size, and attached cards.
 */
export const WEST_LAKE_PLANT_CARD_MODULES = [
  {
    id: 'xihu-plant-card-sudi-liuan', place: '苏堤 · 柳岸', position: SUDI_ROUTE[1],
    plantAssetId: 'vintage-floral-11', plantSize: 50, stemAnchor: [65, 40],
    cardSpeciesIds: ['pycnonotus-sinensis'],
  },
  {
    id: 'xihu-plant-card-sudi-humian', place: '苏堤 · 湖面', position: SUDI_ROUTE[4],
    plantAssetId: 'vintage-floral-02', plantSize: 38, stemAnchor: [63, 43],
    cardSpeciesIds: ['passer-montanus'],
  },
  {
    id: 'xihu-plant-card-sudi-linxia', place: '苏堤 · 林下', position: SUDI_ROUTE[7],
    plantAssetId: 'vintage-floral-14', plantSize: 46, stemAnchor: [51, 46],
    cardSpeciesIds: ['turdus-mandarinus'],
  },
  {
    id: 'xihu-plant-card-yingbo', place: '映波桥', position: SUDI_ROUTE[10],
    plantAssetId: 'vintage-floral-03', plantSize: 42, stemAnchor: [53, 45],
    cardSpeciesIds: ['spilopelia-chinensis'],
  },
  {
    id: 'xihu-plant-card-yadi', place: '压堤桥', position: SUDI_ROUTE[13],
    plantAssetId: 'vintage-floral-22', plantSize: 44, stemAnchor: [50, 44],
    cardSpeciesIds: ['copsychus-saularis'],
  },
  {
    id: 'xihu-plant-card-kuahong', place: '跨虹桥', position: SUDI_ROUTE[17],
    plantAssetId: 'vintage-floral-57', plantSize: 40, stemAnchor: [52, 46],
    cardSpeciesIds: ['pycnonotus-sinensis'],
  },
  {
    id: 'xihu-plant-card-duanqiao', place: '断桥残雪', position: amapPoint(120.1470, 30.2609),
    plantAssetId: 'vintage-floral-51', plantSize: 44, stemAnchor: [52, 43],
    cardSpeciesIds: ['passer-montanus'],
  },
  {
    id: 'xihu-plant-card-baidi', place: '白堤', position: amapPoint(120.1438, 30.2582),
    plantAssetId: 'vintage-floral-65', plantSize: 40, stemAnchor: [54, 44],
    cardSpeciesIds: ['pica-serica'],
  },
  {
    id: 'xihu-plant-card-pinghu', place: '平湖秋月', position: amapPoint(120.1416, 30.2542),
    plantAssetId: 'vintage-floral-34', plantSize: 42, stemAnchor: [55, 42],
    cardSpeciesIds: ['spilopelia-chinensis'],
  },
  {
    id: 'xihu-plant-card-quyuan', place: '曲院风荷', position: amapPoint(120.1287, 30.2522),
    plantAssetId: 'vintage-floral-24', plantSize: 46, stemAnchor: [50, 45],
    cardSpeciesIds: ['turdus-mandarinus'],
  },
  {
    id: 'xihu-plant-card-huagang', place: '花港观鱼', position: amapPoint(120.1374, 30.2344),
    plantAssetId: 'vintage-floral-58', plantSize: 42, stemAnchor: [54, 44],
    cardSpeciesIds: ['pycnonotus-sinensis'],
  },
  {
    id: 'xihu-plant-card-leifeng', place: '雷峰夕照', position: amapPoint(120.1450, 30.2339),
    plantAssetId: 'vintage-floral-62', plantSize: 43, stemAnchor: [52, 42],
    cardSpeciesIds: ['lanius-schach'],
  },
  {
    id: 'xihu-plant-card-liulang', place: '柳浪闻莺', position: amapPoint(120.1578, 30.2427),
    plantAssetId: 'vintage-floral-50', plantSize: 40, stemAnchor: [50, 45],
    cardSpeciesIds: ['copsychus-saularis'],
  },
  {
    id: 'xihu-plant-card-hubin', place: '湖滨', position: amapPoint(120.1605, 30.2580),
    plantAssetId: 'vintage-floral-04', plantSize: 45, stemAnchor: [51, 43],
    cardSpeciesIds: ['passer-montanus'],
  },
] as const satisfies readonly NatureSoundPlantCardModule[];
