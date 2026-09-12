import type { CompiledSkillGraph, CompiledSkillNode, SkillBlockCapability } from '../skill-canvas/contracts';
import type { JsonObject, SkillPermission } from '../taskmaster/contracts';

export * from '../skill-canvas/contracts';

export const SKILL_EXECUTION_PROTOCOL = 'pocket-skill-run/v1' as const;

export type SkillExecutionStatus = 'completed' | 'blocked' | 'failed' | 'safe_stopped';
export type SkillExecutionStepStatus = 'completed' | 'blocked' | 'failed' | 'safe_stopped';
export type SkillEvidenceKind = 'user_action' | 'sensor' | 'model' | 'policy' | 'effect' | 'store' | 'runtime';

export interface SkillExecutionEvidence {
  evidence_id: string;
  node_id: string;
  capability: SkillBlockCapability;
  kind: SkillEvidenceKind;
  summary: string;
  occurred_at: string;
  data: JsonObject;
}

export interface SkillExecutionStep {
  node_id: string;
  capability: SkillBlockCapability;
  label: string;
  status: SkillExecutionStepStatus;
  started_at: string;
  completed_at: string;
  permission_decisions: Array<{ permission: SkillPermission; granted: boolean }>;
  output?: JsonObject;
  evidence_ids: string[];
  error?: string;
}

export interface SkillExecutionTrace {
  protocol: typeof SKILL_EXECUTION_PROTOCOL;
  run_id: string;
  skill_id: string;
  mode: 'execute';
  status: SkillExecutionStatus;
  started_at: string;
  completed_at: string;
  steps: SkillExecutionStep[];
  evidence: SkillExecutionEvidence[];
  output: JsonObject;
  error?: string;
}

export interface SkillAdapterEvidence {
  kind: SkillEvidenceKind;
  summary: string;
  data?: JsonObject;
}

export interface SkillAdapterResult {
  status: 'completed' | 'blocked' | 'safe_stopped';
  output: JsonObject;
  evidence: SkillAdapterEvidence[];
  error?: string;
}

export interface SkillAdapterContext {
  graph: CompiledSkillGraph;
  node: CompiledSkillNode;
  input: JsonObject;
  prior_outputs: Record<string, JsonObject>;
  run_id: string;
  idempotency_key: string;
  signal: AbortSignal;
}

export interface SkillCapabilityAdapter {
  capability: SkillBlockCapability;
  execute(context: SkillAdapterContext): Promise<SkillAdapterResult>;
}

export interface SkillPermissionRequest {
  graph: CompiledSkillGraph;
  node: CompiledSkillNode;
  permission: SkillPermission;
  run_id: string;
}

export interface RunSkillGraphOptions {
  input?: JsonObject;
  authorize?: (request: SkillPermissionRequest) => boolean | Promise<boolean>;
  now?: () => Date;
  createRunId?: () => string;
  timeoutMs?: number;
  maxSteps?: number;
  signal?: AbortSignal;
  onStep?: (step: SkillExecutionStep) => void;
}

export interface SkillBindingReport {
  ready: boolean;
  missing_capabilities: SkillBlockCapability[];
}
