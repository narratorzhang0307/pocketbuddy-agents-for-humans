export type WorldLayer = 'personal' | 'public';
export type Visibility = 'private' | 'unlisted' | 'public';
export type BloomRole = 'memory' | 'resident' | 'hybrid';
export type ProvenanceLevel =
  | 'firsthand'
  | 'agent-report'
  | 'retold'
  | 'dream';

export interface CityBloomSeed {
  id: string;
  mapPlantId: string;
  ownerId: string;
  name: string;
  role: BloomRole;
  lifecycle?: 'seed' | 'sprout' | 'bloom' | 'resident' | 'archive';
  visibility: Visibility;
  activityLabel: string;
  postcardIds?: string[];
  residentAgentId?: string;
  publicPriority?: number;
}

export interface CityAgentSeed {
  id: string;
  ownerId: string;
  name: string;
  species: string;
  role: 'identity-proxy' | 'resident' | 'visitor' | 'editorial';
  visibility: Visibility;
  profileAssetUrl: string;
  homeBloomId?: string;
  currentState: 'idle' | 'walking' | 'visiting' | 'reporting' | 'resting';
  activityLabel: string;
}

export interface CityAgentConversation {
  id: string;
  mapPlantId: string;
  speakerAgentId: string;
  listenerAgentId: string;
  line: string;
  side: 'left' | 'right';
  visibility: 'public';
}

export interface CityPostcardSeed {
  id: string;
  ownerId: string;
  bloomId: string;
  visibility: Visibility;
  title: string;
  place: string;
  city: string;
  date: string;
  author: string;
  stamp: string;
  accent: string;
  imageUrl: string;
  message: string;
}

export interface WorldLayerSummary {
  layer: WorldLayer;
  label: string;
  description: string;
  visibleBloomCount: number;
}

export interface CitySkillDefinition {
  id: string;
  title: string;
  description: string;
  city: string;
  versionLabel: string;
  placeCount: number;
  sourceLabel: string;
  visibility: 'public';
  status: 'verified' | 'published';
}

export interface CitySkillInstallation {
  id: string;
  skillId: string;
  ownerId: string;
  installedAt: string;
  versionLabel: string;
  visibility: 'private';
}

export interface CitySkillPublication {
  id: string;
  installationId: string;
  skillId: string;
  ownerId: string;
  publishedAt: string;
  visibility: 'public';
}

export interface GeoPoint {
  /** 产品数据域统一使用 WGS84；只在高德渲染边界转换为 GCJ-02。 */
  lat: number;
  lng: number;
  accuracy?: number;
}

export type DutyMode = 'test' | 'gps-companion' | 'delegated';
export type DutyStatus =
  | 'draft'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled';

export interface DutySession {
  id: string;
  ownerId: string;
  agentId: string;
  mode: DutyMode;
  status: DutyStatus;
  allowedArea: {
    center: GeoPoint;
    radiusMeters: number;
  };
  route: GeoPoint[];
  startedAt?: string;
  completedAt?: string;
  eventIds: string[];
}

export type CityEventKind =
  | 'duty-started'
  | 'duty-completed'
  | 'arrived'
  | 'passed-bloom'
  | 'agent-encounter'
  | 'postcard-delivered'
  | 'skill-discovered'
  | 'skill-installed'
  | 'skill-published'
  | 'newspaper-picked-up'
  | 'dream';

export interface CityEvent {
  id: string;
  ownerId: string;
  kind: CityEventKind;
  createdAt: string;
  actorAgentIds: string[];
  dutySessionId?: string;
  bloomId?: string;
  geo?: GeoPoint;
  visibility: Visibility;
  provenance: ProvenanceLevel;
  payload: Record<string, unknown>;
}
