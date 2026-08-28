// 通用「地图图层技能」注册表：任何 skill 想在中间高德地图放一个可开关的图层，
// 在这里登记一个 descriptor 即可——地图宿主只认识本注册表和 MapSkillsLegend，
// 不认识任何具体 skill（解耦：加新图层技能 = 改这一个文件 + 新建自己的目录）。
//
// 与 lib/roam/mapSkills.ts（.skill 内容包：书+地点，走书架管线）互补不重叠：
// 那套管「内容进书架再上图」，这套管「skill 自渲染的整层地图叠加」。

import type { ComponentType, RefObject } from 'react';
import type { CityMapRuntime } from '../maps/runtime';
import type { MapSkillFocus } from './mapSkillFocus';
import type { WorldLayer } from '../city-world/types';
import { EXHIBITION_LAYER_SKILL } from './hangzhou-exhibitions';
import { MUSEUM_LAYER_SKILL } from './hangzhou-museums';
import { FLOWER_LAYER_SKILL } from './hangzhou-flowers';
import { ARCH_LAYER_SKILL } from './hangzhou-architecture';
import { CITY_SOUND_LAYER_SKILL } from './city-sounds/mapLayer';
import { HERITAGE_CAPTURE_LAYER_SKILL } from '../heritage/mapLayer';
import { CITY_CONTENT_PACKS_LAYER_SKILL } from './city-content-packs';
import { BOOK_DATA_PACK_LAYER_SKILL } from './book-data-pack';

export interface MapLayerSkillProps {
  mapRef: RefObject<CityMapRuntime | null>;
  mapReady: boolean;
  markerZooms?: [number, number];
  worldLayer?: WorldLayer;
}

export interface MapLayerLegendControlsProps {
  onFocus?: () => void;
  worldLayer?: WorldLayer;
}

export interface MapLayerSkillDescriptor {
  id: string;                 // kebab-case，如 hangzhou-exhibition-map
  displayName: string;        // 杭州展览地图
  legendLabel: string;        // 图例短名：展览
  color: string;              // 图例色块
  isLoaded(worldLayer?: WorldLayer): boolean; // 已加载（卸载后进图例「可加载」区）
  setLoaded(v: boolean, worldLayer?: WorldLayer): void;
  isVisible(worldLayer?: WorldLayer): boolean; // 图层开关（ON/OFF）
  setVisible(v: boolean, worldLayer?: WorldLayer): void;
  count(worldLayer?: WorldLayer): number;      // 图例右侧计数
  focus?(worldLayer?: WorldLayer): MapSkillFocus | null; // Skill 自己提供真实坐标聚合；空数据不伪造落点
  canUnload?: boolean;        // 常驻聚合层可显式禁止卸载
  urgentCount?(): number;     // 需要重点提醒的条数（图例上亮红点）
  subscribe(fn: () => void): () => void;
  openBrowser?(): void;       // 点图例行名字 → skill 自己的浏览页
  LegendControls?: ComponentType<MapLayerLegendControlsProps>; // Skill 自带分层控制，例如城市古籍总层下的单书开关
  legendItemCounts?(worldLayer?: WorldLayer): { loaded: number; total: number };
  worldScope?: 'catalog' | 'personal' | 'global'; // global 在我的街道与公共街面都常驻
  /** 图层本体：skill 自带组件，拿到地图实例自渲染/自清理（含详情卡、浏览页等一切 UI） */
  Layer: ComponentType<MapLayerSkillProps>;
}

export const MAP_LAYER_SKILLS: MapLayerSkillDescriptor[] = [
  HERITAGE_CAPTURE_LAYER_SKILL,
  EXHIBITION_LAYER_SKILL,
  MUSEUM_LAYER_SKILL,
  FLOWER_LAYER_SKILL,
  ARCH_LAYER_SKILL,
  CITY_SOUND_LAYER_SKILL,
  CITY_CONTENT_PACKS_LAYER_SKILL,
  BOOK_DATA_PACK_LAYER_SKILL,
];
