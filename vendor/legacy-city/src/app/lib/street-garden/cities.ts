import type { GiantFlowerGardenSite } from "./grove";
import {
  BEIJING_GARDEN_REGIONS,
  BEIJING_GIANT_FLOWER_SITES,
  BEIJING_OVERVIEW_CENTER,
  BEIJING_OVERVIEW_ZOOM,
} from "./districts/beijing";
import {
  GUANGZHOU_GARDEN_REGIONS,
  GUANGZHOU_GIANT_FLOWER_SITES,
  GUANGZHOU_OVERVIEW_CENTER,
  GUANGZHOU_OVERVIEW_ZOOM,
} from "./districts/guangzhou";
import {
  HANGZHOU_GARDEN_REGIONS,
  HANGZHOU_GIANT_FLOWER_SITES,
  HANGZHOU_OVERVIEW_CENTER,
  HANGZHOU_OVERVIEW_ZOOM,
} from "./districts/hangzhou";
import {
  NANJING_GARDEN_REGIONS,
  NANJING_GIANT_FLOWER_SITES,
  NANJING_OVERVIEW_CENTER,
  NANJING_OVERVIEW_ZOOM,
} from "./districts/nanjing";
import {
  SHANGHAI_GARDEN_REGIONS,
  SHANGHAI_GIANT_FLOWER_SITES,
  SHANGHAI_OVERVIEW_CENTER,
  SHANGHAI_OVERVIEW_ZOOM,
} from "./districts/shanghai";

export type PublicGardenCityId =
  | "guangzhou"
  | "beijing"
  | "nanjing"
  | "hangzhou"
  | "shanghai";

export type PublicGardenRegion = {
  id: string;
  label: string;
  center: [number, number];
  zoom: number;
  sites: readonly GiantFlowerGardenSite[];
};

export type PublicGardenCityPackage = {
  id: PublicGardenCityId;
  label: string;
  scopeLabel: string;
  overviewLabel: string;
  overviewCenter: [number, number];
  overviewZoom: number;
  regions: readonly PublicGardenRegion[];
  sites: readonly GiantFlowerGardenSite[];
  profileOffset: number;
  dialogueOffset: number;
};

// 每座城市是一个完整数据包：地图渲染、城市居民与对话都只从这里装配。
// 广州、北京、南京、杭州、上海可以分别加载或卸载，彼此不共享地区数据。
export const PUBLIC_GARDEN_CITY_PACKAGES: readonly PublicGardenCityPackage[] = [
  {
    id: "guangzhou",
    label: "广州",
    scopeLabel: "全域",
    overviewLabel: "全广州",
    overviewCenter: GUANGZHOU_OVERVIEW_CENTER,
    overviewZoom: GUANGZHOU_OVERVIEW_ZOOM,
    regions: GUANGZHOU_GARDEN_REGIONS,
    sites: GUANGZHOU_GIANT_FLOWER_SITES,
    profileOffset: 2,
    dialogueOffset: 9,
  },
  {
    id: "beijing",
    label: "北京",
    scopeLabel: "全域",
    overviewLabel: "全北京",
    overviewCenter: BEIJING_OVERVIEW_CENTER,
    overviewZoom: BEIJING_OVERVIEW_ZOOM,
    regions: BEIJING_GARDEN_REGIONS,
    sites: BEIJING_GIANT_FLOWER_SITES,
    profileOffset: 8,
    dialogueOffset: 5,
  },
  {
    id: "nanjing",
    label: "南京",
    scopeLabel: "全域",
    overviewLabel: "全南京",
    overviewCenter: NANJING_OVERVIEW_CENTER,
    overviewZoom: NANJING_OVERVIEW_ZOOM,
    regions: NANJING_GARDEN_REGIONS,
    sites: NANJING_GIANT_FLOWER_SITES,
    profileOffset: 6,
    dialogueOffset: 7,
  },
  {
    id: "hangzhou",
    label: "杭州",
    scopeLabel: "全域",
    overviewLabel: "全杭州",
    overviewCenter: HANGZHOU_OVERVIEW_CENTER,
    overviewZoom: HANGZHOU_OVERVIEW_ZOOM,
    regions: HANGZHOU_GARDEN_REGIONS,
    sites: HANGZHOU_GIANT_FLOWER_SITES,
    profileOffset: 0,
    dialogueOffset: 0,
  },
  {
    id: "shanghai",
    label: "上海",
    scopeLabel: "全域",
    overviewLabel: "全上海",
    overviewCenter: SHANGHAI_OVERVIEW_CENTER,
    overviewZoom: SHANGHAI_OVERVIEW_ZOOM,
    regions: SHANGHAI_GARDEN_REGIONS,
    sites: SHANGHAI_GIANT_FLOWER_SITES,
    profileOffset: 4,
    dialogueOffset: 3,
  },
];
