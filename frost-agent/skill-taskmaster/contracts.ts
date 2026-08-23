import type { JsonObject, JsonValue, SkillPermission } from '../taskmaster/contracts';

export const CAPABILITY_PROTOCOL = 'pocket-capability/v1' as const;
export const SKILL_GRAPH_PROTOCOL = 'pocket-skill-graph/v1' as const;
export const SKILL_RUN_PROTOCOL = 'frost-task/v1' as const;

export type SkillBlockCapability =
  | 'trigger.manual'
  | 'sensor.location'
  | 'sensor.health'
  | 'model.gemma'
  | 'model.pose'
  | 'gate.safety'
  | 'action.voice'
  | 'state.skill_completed';

export type SkillBlockStage = 'trigger' | 'sense' | 'think' | 'guard' | 'act' | 'remember';
export type CapabilityExecution = 'host' | 'browser' | 'pocketbuddy-api' | 'local-store';
export type CapabilityRuntimeBinding =
  | 'manual.confirm'
  | 'browser.geolocation'
  | 'local.health-events'
  | 'api.llm.generate'
  | 'local.pose-estimator'
  | 'local.safety-gate'
  | 'browser.speech-synthesis'
  | 'local.evidence-and-health-sync';

export interface CapabilityPortContract {
  name: 'in' | 'out';
  schema: 'pocket.context/v1';
  required: boolean;
}

export interface CapabilityContract {
  protocol: typeof CAPABILITY_PROTOCOL;
  capability: SkillBlockCapability;
  version: '1.0.0';
  stage: SkillBlockStage;
  family: '启动条件' | '数据输入' | '处理与模型' | '流程控制' | '动作输出' | '状态与证据';
  title: string;
  detail: string;
  description: string;
  execution: CapabilityExecution;
  runtime_binding: CapabilityRuntimeBinding;
  provider: string;
  inputs: CapabilityPortContract[];
  outputs: CapabilityPortContract[];
  permissions: SkillPermission[];
  data_policy: 'ephemeral' | 'local-only' | 'approved-fact-sync';
  default_config: JsonObject;
}

export interface SkillCanvasNode {
  id: string;
  capability: SkillBlockCapability;
  label: string;
  detail: string;
  config?: JsonObject;
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
  avatar_id?: string;
  avatar_name?: string;
  avatar_role?: string;
  nodes: SkillCanvasNode[];
  edges: SkillCanvasEdge[];
  created_at: string;
  updated_at: string;
}

export interface CapabilityLock {
  capability: SkillBlockCapability;
  version: '1.0.0';
  runtime_binding: CapabilityRuntimeBinding;
}

export interface CompiledSkillNode {
  id: string;
  capability: SkillBlockCapability;
  capability_version: '1.0.0';
  stage: SkillBlockStage;
  label: string;
  detail: string;
  config: JsonObject;
  provider_binding: CapabilityRuntimeBinding;
  depends_on: string[];
  order: number;
}

export interface CompiledSkillEdge {
  from: { node_id: string; port: 'out'; schema: 'pocket.context/v1' };
  to: { node_id: string; port: 'in'; schema: 'pocket.context/v1' };
}

export interface CompiledSkillGraph {
  protocol: typeof SKILL_GRAPH_PROTOCOL;
  graph_id: string;
  graph_hash: `sha256:${string}`;
  skill_id: string;
  title: string;
  description: string;
  avatar_id?: string;
  avatar_name?: string;
  avatar_role?: string;
  version: '1.0.0';
  nodes: CompiledSkillNode[];
  edges: CompiledSkillEdge[];
  capability_lockfile: CapabilityLock[];
  permissions: SkillPermission[];
  stop_rules: string[];
  compiled_at: string;
  source: 'skill-canvas';
}

export interface SkillCompileIssue {
  code:
    | 'missing_trigger'
    | 'missing_outcome'
    | 'dangling_edge'
    | 'duplicate_edge'
    | 'cycle'
    | 'unreachable_node'
    | 'empty_title'
    | 'incompatible_port';
  message: string;
  node_id?: string;
}

export interface SkillCompileResult {
  ok: boolean;
  graph?: CompiledSkillGraph;
  structured: SkillCanvasDraft;
  issues: SkillCompileIssue[];
}

export type SkillRunStepStatus = 'pending' | 'running' | 'completed' | 'blocked' | 'skipped';

export interface SkillRunStep {
  node_id: string;
  capability: SkillBlockCapability;
  label: string;
  status: SkillRunStepStatus;
  provider: string;
  evidence: string;
  started_at: string;
  completed_at?: string;
  output?: JsonObject;
  error?: { code: string; message: string };
}

export interface SkillRunTrace {
  protocol: typeof SKILL_RUN_PROTOCOL;
  run_id: string;
  graph_id: string;
  graph_hash: `sha256:${string}`;
  skill_id: string;
  mode: 'preview' | 'live';
  status: 'preview_completed' | 'running' | 'completed' | 'waiting_permission' | 'safe_stopped' | 'failed';
  started_at: string;
  completed_at?: string;
  steps: SkillRunStep[];
  note: string;
}

export interface SkillExecutionContext {
  run_id: string;
  skill_id: string;
  graph_hash: string;
  user_confirmed: boolean;
  location?: { latitude: number; longitude: number; accuracy_m?: number; captured_at: string };
  health_summary?: JsonObject;
  generated_text?: string;
  pose?: JsonObject;
  safe?: boolean;
  evidence_id?: string;
  health_event_id?: string;
  [key: string]: JsonValue | undefined;
}

export interface SkillEvidenceRecord {
  evidence_id: string;
  run_id: string;
  graph_id: string;
  graph_hash: `sha256:${string}`;
  skill_id: string;
  node_id: string;
  provider: string;
  context: JsonObject;
  created_at: string;
}

export interface CanvasSkillRecord {
  graph: CompiledSkillGraph;
  draft: SkillCanvasDraft;
  latest_run?: SkillRunTrace;
  saved_at: string;
}
