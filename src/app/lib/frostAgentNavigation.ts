import type { FrostPlan, FrostPlanStep } from '../../../frost-agent/harness/skillRouter';
import { stageFrostAgentHandoff, type FrostAgentRunNotice } from './frostAgentRuntime';
import { presentFrostAgentRun } from './frostAgentPresentation';
import { startHerMotionTask, startMealTask } from './frostHealthTaskmaster';
import type { FrostAgentEvent } from '../../../frost-agent/runtime/contracts';
import { planFrostWorkspaceLaunch } from './frostConversation';
import { resolveSkillRunTarget } from './plaza/skillRoutes';
import { openRunRouteSession } from './runRouteSkill';

/** Show the actual main-Agent inbox before its result, without interpreting or resending the text. */
export function createFrostVoiceConversation(options: { isActive(): boolean; open(target: string): void }) {
  const seen = new Set<string>();
  return (event: FrostAgentEvent): boolean => {
    const content = event.data.content as { input_channel?: string; input_id?: string; text?: string } | undefined;
    if (event.type !== 'user.message' || event.data.source !== 'user' || content?.input_channel !== 'badge_voice'
      || !content.input_id || !content.text?.trim() || seen.has(event.event_id) || !options.isActive()) return false;
    seen.add(event.event_id);
    if (seen.size > 256) seen.delete(seen.values().next().value!);
    // A clear workspace command goes straight to its actual result page. Keep
    // the current view until the same Frost loop produces that handoff.
    if (planFrostWorkspaceLaunch(content.text)) return false;
    options.open('frost');
    return true;
  };
}

/** Typed and recognized launch commands use the same existing fitness/task entry. */
export async function prepareFrostAgentHandoff(plan: FrostPlan, step: FrostPlanStep, userText: string, existingTaskId?: string) {
  if (!resolveSkillRunTarget(step.target)) throw new Error(`此 Skill 尚无可用页面入口：${step.target}。未跳转主页。`);
  let taskmasterTaskId = existingTaskId;
  const motion = step.skillId === 'pocket.her-motion' || step.skillId === 'frost.mediapipe-motion';
  const start = motion ? startHerMotionTask
    : step.skillId === 'frost.meal-lens' ? startMealTask : undefined;
  if (start) {
    const task = await start({ taskId: existingTaskId || `${plan.id}:${step.id}`, planId: plan.id,
      stepId: step.id, objective: step.objective,
      ...(motion ? { confirmCamera: true } : {}) });
    if (task.status === 'failed' || task.status === 'safe_stopped') throw new Error(task.error || 'taskmaster_start_failed');
    taskmasterTaskId = task.task_id;
  }
  return stageFrostAgentHandoff(plan, step, userText, taskmasterTaskId);
}

/** Consume live main-Agent completions, not history, timer signals or another input pipeline. */
export function createFrostAutoNavigation(options: { isActive(): boolean; open(target: string): void }) {
  const seen = new Set<string>();
  return async ({ result, input }: FrostAgentRunNotice): Promise<boolean> => {
    if (!input || !options.isActive()) return false;
    const reply = [...result.events].reverse().find(event => event.type === 'assistant.message');
    if (!reply || seen.has(reply.event_id)) return false;
    const view = presentFrostAgentRun(result, input.text);
    if (!view.routeSessionId && (!view.plan || !view.autoStep)) return false;
    // Mark before awaiting storage so duplicate notices cannot dispatch the same task twice.
    seen.add(reply.event_id);
    if (seen.size > 256) seen.delete(seen.values().next().value!);
    if (view.routeSessionId) {
      try { openRunRouteSession(view.routeSessionId); }
      catch (error) { seen.delete(reply.event_id); throw error; }
      return true;
    }
    await prepareFrostAgentHandoff(view.plan!, view.autoStep!, input.text, view.taskmasterTaskId);
    if (!options.isActive()) return false;
    options.open(view.autoStep!.target);
    console.info(`[FrostVoice] skill_page_requested target=${view.autoStep!.target} source=${input.origin.channel} same_runtime=true`);
    return true;
  };
}
