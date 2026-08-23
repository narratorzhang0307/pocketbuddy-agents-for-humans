import type { FrostTaskAction, FrostTaskSession, HealthEvent, HealthSkillDefinition } from './contracts';
import { validateHealthEvent } from './contracts';
import { authorizeAction } from './policy';

export function beforeToolUse(skill: HealthSkillDefinition, action: FrostTaskAction, confirmed: boolean): { outcome: 'allow' | 'ask' | 'block'; reason: string } {
  const decision = authorizeAction(skill, action);
  if (!decision.allowed) return { outcome: 'block', reason: decision.reason };
  if (decision.requires_confirmation && !confirmed) return { outcome: 'ask', reason: 'explicit_user_confirmation_required' };
  return { outcome: 'allow', reason: decision.reason };
}

export function afterToolUse(events: HealthEvent[] = []): void {
  for (const event of events) {
    const validation = validateHealthEvent(event);
    if (!validation.ok) throw new Error(`invalid_tool_event:${validation.errors.join('|')}`);
  }
}

export function beforeTaskComplete(session: FrostTaskSession): void {
  if (session.actions.some((action) => !['completed', 'skipped'].includes(action.status))) throw new Error('task_has_incomplete_actions');
  if (session.request.kind === 'run_skill') {
    const graphHash = typeof session.request.input.graph_hash === 'string' ? session.request.input.graph_hash : '';
    if (!graphHash) {
      if (!session.actions.some((action) => action.result && typeof action.result === 'object')) throw new Error('task_has_no_skill_result');
      return;
    }
    const completed = session.actions.some((action) => {
      const run = action.result?.skill_run;
      return run && typeof run === 'object' && !Array.isArray(run)
        && run.status === 'completed' && run.graph_hash === graphHash;
    });
    if (!completed) throw new Error('task_has_no_verified_skill_run');
    return;
  }
  if (!['daily_review', 'start_workout', 'plan_run_route'].includes(session.request.kind) && session.source_event_ids.length === 0) {
    throw new Error('task_has_no_evidence_event');
  }
}
