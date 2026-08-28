import type { FrostPlan, FrostPlanStep } from './skillRouter';
import { expertForSkill } from './expertRouter';
import { rememberTaskHandoff } from './longTermMemory';

const KEY = 'pe.frost.task-handoff.v1';

export interface FrostTaskHandoff {
  protocol: 'pocket-frost-task/v1';
  planId: string;
  stepId: string;
  skillId: string;
  skillName: string;
  target: string;
  expertId: string;
  expertName: string;
  expertRole: string;
  runId: string;
  objective: string;
  userText: string;
  status: 'dispatched';
  createdAt: string;
  taskmasterTaskId?: string;
  subagentRunId?: string;
  agentSessionId?: string;
}

/**
 * 把已确认任务以固定契约交给目标 Skill。这里只写本机 sessionStorage；
 * 不上传、不开外链，也不执行目标 Skill 的副作用。
 */
export function stageTaskHandoff(plan: FrostPlan, step: FrostPlanStep, userText: string, taskmasterTaskId?: string, agentSessionId?: string): FrostTaskHandoff {
  if (!plan.steps.some((item) => item.id === step.id && item.skillId === step.skillId && item.target === step.target)) {
    throw new Error('任务步骤不属于当前计划');
  }
  if (step.availability !== 'equipped') throw new Error('Skill 尚未装备');
  const expert = expertForSkill(step.skillId);
  const handoff: FrostTaskHandoff = {
    protocol: 'pocket-frost-task/v1', planId: plan.id, stepId: step.id,
    skillId: step.skillId, skillName: step.skillName, target: step.target,
    expertId: expert.id, expertName: expert.name, expertRole: expert.role,
    runId: `${plan.id}:${step.id}`, objective: step.objective,
    userText: userText.slice(0, 2000), status: 'dispatched', createdAt: new Date().toISOString(),
    ...(taskmasterTaskId ? { taskmasterTaskId } : {}),
    ...(agentSessionId ? { agentSessionId } : {}),
    ...(step.subagent ? { subagentRunId: step.subagent.runId } : {}),
  };
  try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(KEY, JSON.stringify(handoff)); } catch { /* private mode */ }
  // 长期层只收到交接元数据；聊天原文 userText 永远不传入持久记忆。
  void rememberTaskHandoff({
    planId: handoff.planId,
    stepId: handoff.stepId,
    skillId: handoff.skillId,
    skillName: handoff.skillName,
    target: handoff.target,
    expertId: handoff.expertId,
    expertName: handoff.expertName,
  }, 'dispatched');
  return handoff;
}

export function peekTaskHandoff(target?: string): FrostTaskHandoff | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const value = JSON.parse(sessionStorage.getItem(KEY) || 'null') as Partial<FrostTaskHandoff> | null;
    if (!value || value.protocol !== 'pocket-frost-task/v1' || value.status !== 'dispatched') return null;
    if (target && value.target !== target) return null;
    if (!value.planId || !value.stepId || !value.skillId || !value.target || !value.objective || !value.createdAt) return null;
    const expert = expertForSkill(value.skillId);
    return {
      protocol: 'pocket-frost-task/v1',
      planId: value.planId,
      stepId: value.stepId,
      skillId: value.skillId,
      skillName: value.skillName || value.skillId,
      target: value.target,
      expertId: value.expertId || expert.id,
      expertName: value.expertName || expert.name,
      expertRole: value.expertRole || expert.role,
      runId: value.runId || `${value.planId}:${value.stepId}`,
      objective: value.objective,
      userText: typeof value.userText === 'string' ? value.userText.slice(0, 2000) : '',
      status: 'dispatched',
      createdAt: value.createdAt,
      ...(typeof value.taskmasterTaskId === 'string' && value.taskmasterTaskId ? { taskmasterTaskId: value.taskmasterTaskId } : {}),
      ...(typeof value.subagentRunId === 'string' && value.subagentRunId ? { subagentRunId: value.subagentRunId } : {}),
      ...(typeof value.agentSessionId === 'string' && value.agentSessionId ? { agentSessionId: value.agentSessionId } : {}),
    };
  } catch { return null; }
}

export function clearTaskHandoff(): void {
  try { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(KEY); } catch { /* private mode */ }
}

/**
 * 目标 Skill 打开后显式接受交接，并把“已接收”写入长期记忆与 RunTrace。
 * 这不代表 Skill 已完成，更不绕过它自己的质量门或用户确认。
 */
export async function acceptTaskHandoff(target: string): Promise<FrostTaskHandoff | null> {
  const handoff = peekTaskHandoff(target);
  if (!handoff) return null;
  clearTaskHandoff();
  await rememberTaskHandoff({
    planId: handoff.planId,
    stepId: handoff.stepId,
    skillId: handoff.skillId,
    skillName: handoff.skillName,
    target: handoff.target,
    expertId: handoff.expertId,
    expertName: handoff.expertName,
  }, 'accepted');
  return handoff;
}
