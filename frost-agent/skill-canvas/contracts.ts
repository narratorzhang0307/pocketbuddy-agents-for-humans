import type { SkillPermission } from '../taskmaster/contracts';

export const SKILL_GRAPH_PROTOCOL = 'pocket-skill-graph/v1' as const;

export type SkillBlockCapability =
  | 'trigger.manual'
  | 'sensor.location'
  | 'sensor.health'
  | 'model.qwen'
  | 'model.pose'
  | 'gate.safety'
  | 'action.voice'
  | 'store.local';

export type SkillBlockStage = 'trigger' | 'sense' | 'think' | 'guard' | 'act' | 'remember';

export interface SkillCanvasNode {
  id: string;
  capability: SkillBlockCapability;
  label: string;
  detail: string;
  x: number;
  y: number;
}

export interface SkillCanvasEdge {
  from: string;
  to: string;
}

export interface SkillCanvasDraft {
  id: string;
  title: string;
  prompt: string;
  nodes: SkillCanvasNode[];
  edges: SkillCanvasEdge[];
  created_at: string;
  updated_at: string;
}

export interface CompiledSkillNode {
  id: string;
  capability: SkillBlockCapability;
  stage: SkillBlockStage;
  label: string;
  detail: string;
  depends_on: string[];
  order: number;
}

export interface CompiledSkillGraph {
  protocol: typeof SKILL_GRAPH_PROTOCOL;
  skill_id: string;
  title: string;
  description: string;
  version: '0.1.0';
  nodes: CompiledSkillNode[];
  edges: SkillCanvasEdge[];
  permissions: SkillPermission[];
  stop_rules: string[];
  compiled_at: string;
  source: 'skill-canvas';
}

export interface SkillCompileIssue {
  code: 'missing_trigger' | 'missing_outcome' | 'dangling_edge' | 'duplicate_edge' | 'cycle' | 'unreachable_node' | 'empty_title';
  message: string;
  node_id?: string;
}

export interface SkillCompileResult {
  ok: boolean;
  graph?: CompiledSkillGraph;
  structured: SkillCanvasDraft;
  issues: SkillCompileIssue[];
}

export type SkillRunStepStatus = 'verified' | 'simulated' | 'blocked';

export interface SkillRunStep {
  node_id: string;
  label: string;
  status: SkillRunStepStatus;
  evidence: string;
  occurred_at: string;
}

export interface SkillRunTrace {
  run_id: string;
  skill_id: string;
  mode: 'preview';
  status: 'preview_completed' | 'blocked';
  started_at: string;
  completed_at: string;
  steps: SkillRunStep[];
  note: string;
}

export interface CanvasSkillRecord {
  graph: CompiledSkillGraph;
  draft: SkillCanvasDraft;
  latest_run?: SkillRunTrace;
  saved_at: string;
}
