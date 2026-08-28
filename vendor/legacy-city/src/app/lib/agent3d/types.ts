import type { CityCharacterSheet } from "../crpg/character";

export type AgentSpecies =
  | "dachshund"
  | "cat"
  | "rabbit"
  | "hamster"
  | "squirrel"
  | "bird"
  | "pig"
  | "tortoise"
  | "human";

export type AgentPersonality = {
  role: string;
  voice: string;
  goal: string;
  traits: string[];
  rule?: string;
  agency?: number;
  empathy?: number;
  curiosity?: number;
  sheet?: CityCharacterSheet;
};

export type AgentMotionProfile = "biped" | "quadruped" | "hover" | "none";

export type AgentBodyPlan =
  "biped" | "quadruped" | "winged-biped" | "shelled-quadruped" | "adaptive";

export type AgentRigProfile = {
  templateId: string;
  templateVersion: string;
  bodyPlan: AgentBodyPlan;
  footCount: number | null;
  parameters: Record<string, number>;
};

export type AgentTurnaroundView =
  | "front"
  | "front-left"
  | "left"
  | "back-left"
  | "back"
  | "back-right"
  | "right"
  | "front-right";

export type AgentTurnaroundViews = Record<AgentTurnaroundView, string>;

export type AgentVisualAssets = {
  representation: "procedural-3d" | "static-3d" | "rigged-3d";
  version: string;
  heightMeters: number;
  viewerGlbUrl?: string;
  mapGlbUrl?: string;
  staticGlbUrl?: string;
  downloadUrl?: string;
  turnaroundUrl?: string;
  turnaroundIndexUrl?: string;
  turnaroundUrls?: AgentTurnaroundViews;
  clips?: string[];
  compression?: "meshopt" | "none";
  degraded?: boolean;
  palette?: {
    skin?: string;
    shirt?: string;
    shorts?: string;
    backpack?: string;
    cap?: string;
  };
};

export type AgentForgeSession = {
  jobId: string;
  accessToken: string;
};

export type DachshundRigSettings = {
  bodyLength: number;
  bodyRoundness: number;
  muzzleLength: number;
  earLength: number;
  legLength: number;
  headScale: number;
};

export type CityAgentManifest = {
  schemaVersion: 1;
  id: string;
  name: string;
  species: string;
  source: {
    path: string;
    cutoutPath?: string;
    observedViews: string[];
    inferredViews: string[];
    backgroundRemoval: "none" | "deterministic" | "service" | "fallback-mask";
    provenance?:
      "photograph" | "illustration" | "generated-turnaround" | "manual";
  };
  visual: {
    representation: "procedural-3d" | "rigged-3d";
    turnaround: string;
    turnaroundIndex?: string;
    turnaroundViews?: AgentTurnaroundViews;
    viewerGlb?: string;
    mapGlb?: string;
    primaryColor: string;
    accentColor: string;
    heightMeters: number;
    version: string;
    shadowless?: boolean;
  };
  personality: AgentPersonality & { version: number };
  navigation: {
    mode: "walking" | "hovering";
    snapToRoad: true;
    speedMetersPerSecond: number;
  };
};

export type Agent3DProfile = {
  id: string;
  name: string;
  species: AgentSpecies;
  color: string;
  accent: string;
  motionProfile?: AgentMotionProfile;
  rig?: AgentRigProfile;
  /** Legacy v2 dachshund controls kept for already-saved companions. */
  rigSettings?: DachshundRigSettings;
  sourceAsset?: string;
  portraitUrl?: string;
  personality: AgentPersonality;
  visual?: AgentVisualAssets;
  manifest?: CityAgentManifest;
  manifestUrl?: string;
  /**
   * Private refresh handle for short-lived OSS URLs. It is deliberately kept
   * outside the portable agent manifest.
   */
  forgeSession?: AgentForgeSession;
};

export type StoredCustomAgent = Agent3DProfile & {
  createdAt: string;
};
