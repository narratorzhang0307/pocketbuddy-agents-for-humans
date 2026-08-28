import type { FrostTaskAction, FrostTaskRequest, HealthSkillDefinition, JsonObject, SkillPermission } from './contracts';

export interface PolicyDecision {
  allowed: boolean;
  requires_confirmation: boolean;
  reason: string;
}

const ALWAYS_CONFIRM = new Set<SkillPermission>(['capture:camera', 'capture:microphone', 'publish:map']);
const DANGER_MARKERS = ['chest_pain', 'dizziness', 'severe_shortness_of_breath', 'fainting'];

export function evaluateSafety(input: JsonObject): { safe: boolean; reason?: string } {
  const safety = typeof input.safety === 'object' && input.safety && !Array.isArray(input.safety)
    ? input.safety as JsonObject : input;
  for (const marker of DANGER_MARKERS) if (safety[marker] === true) return { safe: false, reason: `safety_stop:${marker}` };
  if (typeof safety.pain_level === 'number' && safety.pain_level >= 7) return { safe: false, reason: 'safety_stop:high_pain' };
  return { safe: true };
}

export function authorizeAction(skill: HealthSkillDefinition, action: FrostTaskAction): PolicyDecision {
  if (!skill.permissions.includes(action.permission)) {
    return { allowed: false, requires_confirmation: false, reason: `permission_not_declared:${action.permission}` };
  }
  return {
    allowed: true,
    requires_confirmation: action.requires_confirmation || ALWAYS_CONFIRM.has(action.permission),
    reason: 'allowed_by_skill_manifest',
  };
}

export function authorizeTask(request: FrostTaskRequest): PolicyDecision {
  const safety = evaluateSafety(request.input);
  if (!safety.safe) return { allowed: false, requires_confirmation: false, reason: safety.reason || 'safety_stop' };
  return { allowed: true, requires_confirmation: false, reason: 'task_input_safe' };
}

export function blurRouteEndpoint(latitude: number, longitude: number, radiusM = 300): { latitude: number; longitude: number; radius_m: number } {
  const bounded = Math.max(200, Math.min(500, radiusM));
  const latitudeStep = bounded / 111_320;
  const longitudeStep = bounded / (111_320 * Math.max(0.2, Math.cos(latitude * Math.PI / 180)));
  return {
    latitude: Math.round(latitude / latitudeStep) * latitudeStep,
    longitude: Math.round(longitude / longitudeStep) * longitudeStep,
    radius_m: bounded,
  };
}
