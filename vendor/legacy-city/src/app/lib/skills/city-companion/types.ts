import type { Agent3DProfile } from '../../agent3d/types';

export type CityCompanionStageId =
  | 'identity'
  | 'turnaround'
  | 'rig'
  | 'viewer'
  | 'map-route';

export type CityCompanionStage = {
  id: CityCompanionStageId;
  label: string;
  artifact: string;
};

export type CityCompanionGuide = {
  id: string;
  label: string;
  description: string;
  portraitUrl?: string;
  turnaroundUrl?: string;
  manifestUrl?: string;
  profile: Agent3DProfile;
  stages: readonly CityCompanionStage[];
};

export type CityCompanionValidation = {
  valid: boolean;
  issues: string[];
};
