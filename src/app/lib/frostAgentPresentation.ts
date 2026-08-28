import type { FrostPlan, FrostPlanStep } from '../../../frost-agent/harness/skillRouter';
import type { FrostAgentRunResult } from './frostAgentRuntime';
import { readFrostConversationReply } from './frostConversation';
import { resolveSkillRunTarget } from './plaza/skillRoutes';

// Opening these workspaces is not permission to use their camera or write user data.
const TASK_SKILL_UI: Record<string, { id: string; name: string; target: string }> = {
  'frost.run-route': { id: 'frost.run-route', name: '跑步路线规划', target: 'frost-run-route' },
  'frost.her-motion-warmup': { id: 'pocket.her-motion', name: 'Her Motion 热身', target: 'her-motion' },
  'frost.nutrition-log': { id: 'frost.meal-lens', name: '饮食镜头', target: 'frost-meal-lens' },
  'frost.phone-free-run': { id: 'frost.running-coach', name: '无手机跑步', target: 'frost-running-coach' },
  'frost.nature-moment': { id: 'frost.nature-moment', name: '自然时刻', target: 'earth' },
  'frost.daily-review': { id: 'frost.daily-review', name: '每日健康总结', target: 'agent-skills' },
};

function taskPlan(result: FrostAgentRunResult, userText: string): FrostPlan | undefined {
  if (!result.task || result.task.status === 'failed' || result.task.status === 'safe_stopped') return undefined;
  const ui = TASK_SKILL_UI[result.task.skill_id];
  if (!ui) return undefined;
  const step: FrostPlanStep = {
    id: `${result.task.task_id}:step`, skillId: ui.id, skillName: ui.name, target: ui.target,
    objective: userText.slice(0, 240), reason: `Taskmaster 已选择 ${result.task.skill_id}`,
    availability: 'equipped', permissions: result.task.actions.map((action) => action.permission),
    requiresConfirmation: result.task.status === 'waiting_confirmation',
  };
  return {
    id: result.task.task_id, mode: 'single', source: 'local-fallback', summary: `Taskmaster · ${ui.name}`,
    steps: [step], ready: true, createdAt: result.task.created_at,
  };
}

function replyText(result: FrostAgentRunResult): string {
  const stopped = [...result.events].reverse().find((event) => event.type === 'session.stopped');
  if (stopped) return `Frost 已停止本轮任务：${String(stopped.data.reason || result.session.status)}`;
  const assistant = [...result.events].reverse().find((event) => event.type === 'assistant.message' && typeof event.data.text === 'string');
  if (assistant && typeof assistant.data.text === 'string') return assistant.data.text;
  if (!result.task) return result.session.status === 'failed' ? 'Frost 没有安全完成这次决策。' : 'Frost 已处理这次目标。';
  if (result.task.status === 'waiting_confirmation') return 'Taskmaster 已准备好任务，需要你明确确认后继续。';
  if (result.task.status === 'waiting_external') return `Taskmaster 已启动 ${TASK_SKILL_UI[result.task.skill_id]?.name || result.task.skill_id}，正在等待 Skill 返回真实结果。`;
  if (result.task.status === 'completed') return 'Taskmaster 已完成任务，并只写入了经过校验的事实。';
  if (result.task.status === 'failed' || result.task.status === 'safe_stopped') return `Taskmaster 已停止：${result.task.error || result.task.status}`;
  return `Taskmaster 正在处理 ${TASK_SKILL_UI[result.task.skill_id]?.name || result.task.skill_id}。`;
}

/** UI projection only: no model calls, task execution, permission requests or navigation. */
export function presentFrostAgentRun(result: FrostAgentRunResult, userText: string): {
  text: string; trace: string[]; plan?: FrostPlan; taskmasterTaskId?: string; autoStep?: FrostPlanStep;
  routeChoices?: string[]; routeSessionId?: string;
} {
  const reply = readFrostConversationReply(result.events);
  const closed = result.session.status === 'failed' || result.session.status === 'stopped';
  const plan = closed || reply?.routeSessionId ? undefined : reply?.plan || taskPlan(result, userText);
  const trace = result.events.flatMap((event) => {
    if (event.type === 'decision.recorded' && typeof event.data.decision === 'object' && event.data.decision) {
      const action = (event.data.decision as { next_action?: { type?: string } }).next_action?.type;
      return action ? [`DECISION · ${action}`] : [];
    }
    if (event.type === 'tool.called') return [`TOOL · ${event.data.tool}`];
    if (event.type === 'tool.result') return [`OBSERVATION · ${event.data.tool}`];
    if (event.type === 'session.status_changed') return [`STATE · ${event.data.status}`];
    return [];
  });
  const canOpen = reply?.plan || result.task?.status === 'waiting_external';
  const autoStep = canOpen && plan?.mode === 'single'
    ? plan.steps.find((step) => step.availability === 'equipped' && !step.requiresConfirmation
      && (!step.subagent || step.subagent.status === 'waiting_external') && resolveSkillRunTarget(step.target))
    : undefined;
  return { text: replyText(result), trace: [...trace, ...(reply?.trace || [])].slice(-10), plan, taskmasterTaskId: result.task?.task_id, autoStep,
    routeChoices: reply?.needsInput ? reply.routeDialogue?.choices : undefined,
    routeSessionId: closed ? undefined : reply?.routeSessionId };
}
