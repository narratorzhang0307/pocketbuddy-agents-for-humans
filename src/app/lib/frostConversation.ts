import { runGeneral } from '../../../frost-agent/agents/general';
import { answerFrostMemoryRecallRequest, isFrostMemoryRecallRequest } from '../../../frost-agent/harness/longTermMemory';
import { planLocalFrostTask, runFrostOrchestrator, type FrostPlan } from '../../../frost-agent/harness/skillRouter';
import type { ChatTurn, FrostContext } from '../../../frost-agent/harness/types';
import { completeDecision } from '../../../frost-agent/runtime/agentLoop';
import { FROST_AGENT_DECISION_PROTOCOL, type FrostAgentEvent, type FrostAgentModelAdapter, type FrostAgentModelContext, type FrostAgentToolDefinition, type FrostAgentToolResult } from '../../../frost-agent/runtime/contracts';
import { createFrostGoal, type FrostGoalStore } from '../../../frost-agent/runtime/goalDriver';
import { routeHealthIntent } from '../../../frost-agent/runtime/localHealthModel';
import { isExplicitTaskConfirmation, latestFrostInput, pendingFrostTask } from '../../../frost-agent/runtime/turnContext';
import type { JsonObject } from '../../../frost-agent/taskmaster';
import { delegateSkillPlan, delegateSkillTask, type SkillDelegationResult } from '../../../frost-agent/taskmaster/subagentDelegation';
import { getFrostSkillSubagent } from '../../../frost-agent/subagents/registry';
import { resolveSkillRunTarget } from './plaza/skillRoutes';

import { answerFrostSkill, selectFrostAnswerSkill, type FrostSkillAnswer } from './frostSkillAnswer';
import { askHealthAdvice, healthSettings, isHealthAdviceRequest, readHealthMemory, type HealthAdvice } from './frostHealthMemory';
import { HEALTH_GREETING } from './health/healthConsultation';
import { advanceRunRouteDialogue, isRunRouteCancellation, isRunRouteFollowup, isRunRouteRequest, parseRunRouteFields, type RunRouteDialogue } from './runRouteDialogue';
import { startRunRouteTask } from './frostHealthTaskmaster';
import { getActiveRunRouteSessionId, readRunRouteSession } from './runRouteSkill';

const REPLY_TOOLS = new Set(['frost.skill_answer', 'frost.skill_plan', 'frost.memory', 'frost.schedule', 'frost.health_advice', 'frost.run_route_dialogue']);
const HEALTH_SUBAGENTS: Record<string, string> = {
  'frost.her-motion-warmup': 'pocket.her-motion', 'frost.nutrition-log': 'frost.meal-lens',
  'frost.run-route': 'frost.run-route', 'frost.phone-free-run': 'frost.running-coach',
};

export interface FrostConversationReply {
  reply: string;
  trace: string[];
  answerSkillId?: string;
  question?: string;
  needsInput?: boolean;
  speech?: FrostSkillAnswer['speech'];
  plan?: FrostPlan;
  delegations?: SkillDelegationResult[];
  healthDecision?: Pick<HealthAdvice, 'revision' | 'expires_at' | 'next_skill' | 'evidence_ids'>;
  routeDialogue?: RunRouteDialogue;
  routeSessionId?: string;
  routeTaskId?: string;
  routeRequest?: boolean;
}

function pendingRunRoute(events: FrostAgentEvent[]): RunRouteDialogue | undefined {
  const previous = [...events].reverse().find(event => event.type === 'tool.result');
  const reply = previous?.data.tool === 'frost.run_route_dialogue'
    ? (previous.data.result as { data?: FrostConversationReply })?.data : undefined;
  return reply?.routeDialogue?.needsInput && isRunRouteFollowup(inputText(events)) ? reply.routeDialogue : undefined;
}

function pendingSkillQuestion(events: FrostAgentEvent[]): { plan: FrostPlan; delegations: SkillDelegationResult[]; child: SkillDelegationResult } | null {
  const event = [...events].reverse().find((item) => item.type === 'tool.result');
  if (event?.data.tool !== 'frost.skill_plan') return null;
  const result = (event.data.result as { data?: FrostConversationReply })?.data;
  const child = result?.delegations?.find((item) => item.status === 'waiting_user');
  if (!result?.plan || !result.delegations || !child) return null;
  const text = inputText(events);
  const nextPlan = planLocalFrostTask(text);
  if (nextPlan ? nextPlan.steps.some((step) => step.skillId !== child.skill_id) : Boolean(routeHealthIntent(text))) return null;
  return { plan: result.plan, delegations: result.delegations, child };
}

type PreparedHealthDelegation = SkillDelegationResult & { objective: string; intent: FrostAgentModelContext['task_intent'] };

function pendingHealthQuestion(events: FrostAgentEvent[]): PreparedHealthDelegation | null {
  const event = [...events].reverse().find((item) => item.type === 'tool.result');
  if (event?.data.tool !== 'frost.task_delegate') return null;
  const result = (event.data.result as { data?: PreparedHealthDelegation })?.data;
  if (result?.status !== 'waiting_user' || !result.objective) return null;
  const plan = planLocalFrostTask(inputText(events));
  if (plan && plan.steps.some((step) => step.skillId !== result.skill_id)) return null;
  return result;
}

function delegationReply(original: FrostPlan, delegations: SkillDelegationResult[], summary: string, originalTrace: string[]): FrostAgentToolResult {
  const trace = [...originalTrace, ...delegations.map((item) => `SUBAGENT · ${item.agent_id} · ${item.model || '未形成模型结果'} · ${item.status}`)];
  const blocked = delegations.find((item) => item.status === 'blocked');
  if (blocked) return { status: 'success', data: { reply: blocked.reply, trace, delegations: delegations as unknown as JsonObject[] } };
  const plan: FrostPlan = { ...original, steps: original.steps.map((step, index) => {
    const child = delegations[index];
    return child ? { ...step,
      reason: child.status === 'waiting_external' ? child.reply : step.reason,
      subagent: { agentId: child.agent_id, runId: child.run_id, model: child.model, status: child.status },
    } : step;
  }) };
  const questions = delegations.filter((item) => item.status === 'waiting_user').map((item) => item.reply);
  const incomplete = delegations.some((item) => item.status === 'failed');
  const reply = questions.length ? questions.join('\n') : `${summary}${incomplete ? '部分子 Agent 暂不可用，已保留原 Skill 的手动入口，未声称任务已完成。' : '子 Agent 的准备结果已记录，真实执行仍由对应 Skill 完成。'}`;
  return { status: 'success', data: { reply, trace, plan: plan as unknown as JsonObject, delegations: delegations as unknown as JsonObject[] } };
}

function inputText(events: FrostAgentEvent[]): string {
  const content = latestFrostInput(events)?.content;
  return String(content?.text || content?.objective || '').trim();
}

/** Shared phone/ASR intent: open an equipped Skill workspace, not execute its task.
 * Resolve the target through the original registry; do not replace the recorded transcript
 * or depend on an English "Agent" suffix being transcribed correctly.
 */
export function planFrostWorkspaceLaunch(text: string): FrostPlan | null {
  const command = text.trim().replace(/^(?:(?:嗯+|呃+|那个)[，,\s]*)+/, '');
  if (!/^(?:请(?:你|帮我)?|麻烦(?:你)?|帮我|我想(?:要)?|我需要)?\s*(?:打开|调用|调取|进入|切换到|启动)\s*(?:一下|下)?/.test(command)) return null;
  // Questions, negations and compound instructions still go through normal Frost planning.
  if (/[？?\n]|然后|之后|接着|同时|并|顺便|不要|不想|别(?:开|启|用|拍|录|调用)|取消|停止|如何|怎么|为什么|能不能|是否|删除|购买|付款|上传|发送|授权|允许/.test(command)
    || (/吗[。！!]?\s*$/.test(command) && !/练了吗[。！!]?\s*$/.test(command))
    || /(?:练|做|训练)\s*[\d一二三四五六七八九十百半]+|[\d一二三四五六七八九十百半]+\s*(?:分钟|小时|秒|组|次)/.test(command)) return null;
  const plan = planLocalFrostTask(text);
  const step = plan?.steps[0];
  if (step?.skillId === 'frost.run-route' && Object.keys(parseRunRouteFields(text)).length > 0) return null;
  return plan?.mode === 'single' && plan.steps.length === 1 && step?.availability === 'equipped'
    && !step.requiresConfirmation && resolveSkillRunTarget(step.target) ? plan : null;
}

function workspaceLaunchInput(events: FrostAgentEvent[]): FrostPlan | null {
  return latestFrostInput(events)?.event.data.source === 'user' ? planFrostWorkspaceLaunch(inputText(events)) : null;
}

/** Only this input's registered adapter result may supply a UI plan. Never reuse an older plan. */
export function readFrostConversationReply(events: FrostAgentEvent[]): FrostConversationReply | null {
  const inputSeq = latestFrostInput(events)?.event.seq || 0;
  const event = [...events].reverse().find((item) => item.seq > inputSeq && item.type === 'tool.result' && REPLY_TOOLS.has(String(item.data.tool)));
  const result = event?.data.result as { status?: string; data?: FrostConversationReply } | undefined;
  return result?.status === 'success' && typeof result.data?.reply === 'string' ? result.data : null;
}

function legacyContext(events: FrostAgentEvent[]): FrostContext {
  const current = latestFrostInput(events);
  const history: ChatTurn[] = [];
  for (const event of events) {
    if (current && event.seq >= current.event.seq) break;
    if (event.type === 'assistant.message' && typeof event.data.text === 'string') history.push({ role: 'frost', text: event.data.text });
    if (event.type === 'user.message' && event.data.source === 'user') {
      const content = event.data.content as JsonObject | undefined;
      if (typeof content?.text === 'string') history.push({ role: 'user', text: content.text });
    }
  }
  return { now: new Date(), surface: 'frost', userText: inputText(events), history: history.slice(-6) };
}

export function dailyFrostGoal(text: string, now = new Date()): { objective: string; run_at: string } | null {
  const match = text.match(/^每天(?:(早上|上午|中午|下午|晚上))?\s*(\d{1,2})?\s*点?\s*/);
  if (!match) return null;
  const objective = text.slice(match[0].length).trim();
  if (!objective || !routeHealthIntent(objective)) return null;
  let hour = Number(match[2] || 8);
  if (hour > 23) return null;
  if ((match[1] === '下午' || match[1] === '晚上') && hour < 12) hour += 12;
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return { objective, run_at: next.toISOString() };
}

function toolDecision(tool: string) {
  return {
    protocol: FROST_AGENT_DECISION_PROTOCOL,
    goal: '处理当前 Frost 请求', observations: ['根据当前请求选择已登记的宿主能力'],
    next_action: { type: 'call_tool' as const, tool, arguments: {} },
    confidence: 1, risk: tool === 'frost.schedule' ? 'medium' as const : 'low' as const,
    success_condition: '返回真实的任务状态、页面计划或回答',
  };
}

/** One loop/session for every Frost message. Legacy pages are adapters, not a second Agent. */
export class FrostConversationModel implements FrostAgentModelAdapter {
  constructor(private readonly taskModel: FrostAgentModelAdapter) {}

  async decide(context: FrostAgentModelContext): Promise<unknown> {
    const input = latestFrostInput(context.events);
    if (input?.event.data.source === 'skill' && typeof input.content.page_result_id === 'string') {
      const report = context.events.find(event => event.event_id === input.content.page_result_id
        && event.type === 'skill.result' && event.session_id === context.session.session_id);
      if (!report || typeof report.data.summary !== 'string') return completeDecision('能力结果缺少交接证据，未标记为完成。');
      const summary = `${report.data.status === 'completed' ? '能力页面已返回实际结果' : '能力尚未完成'}：${report.data.summary}`;
      return { ...completeDecision(summary), observations: [report.event_id],
        next_action: report.data.status === 'completed'
          ? { type: 'complete', summary, evidence_ids: [report.event_id] }
          : { type: 'ask_user', question: summary, reason: 'skill_page_needs_attention' } };
    }
    const text = inputText(context.events);
    const sinceInput = context.events.filter((event) => event.seq > (input?.event.seq || 0));
    const reply = readFrostConversationReply(context.events);
    if (reply?.routeRequest && input?.event.data.source === 'user') return toolDecision('frost.run_route_dialogue');
    if (reply) return reply.needsInput || reply.delegations?.some((item) => item.status === 'waiting_user')
      ? { ...completeDecision(reply.reply), next_action: { type: 'ask_user', question: reply.reply, reason: 'subagent_needs_user' } }
      : completeDecision(reply.reply);
    const failed = sinceInput.find((event) => event.type === 'tool.result' && REPLY_TOOLS.has(String(event.data.tool)));
    if (failed) return completeDecision('这次能力调用没有完成，请重试；没有把它记作任务成功。');

    const delegated = sinceInput.find((event) => event.type === 'tool.result' && event.data.tool === 'frost.task_delegate');
    const delegation = (delegated?.data.result as { data?: PreparedHealthDelegation } | undefined)?.data;
    if (delegation?.status === 'blocked' || delegation?.status === 'waiting_user') return {
      ...completeDecision(delegation.reply || '子 Agent 需要你补充信息。'),
      next_action: { type: 'ask_user', question: delegation.reply || '请补充任务信息。', reason: 'subagent_needs_user' },
    };
    // Resume the same health execution after delegation/load/start/get, or a correlated Skill signal.
    if (sinceInput.some((event) => event.type === 'tool.called')
      || (input?.event.data.source === 'skill' && typeof input.content.task_id === 'string')) return this.taskModel.decide({ ...context, task_intent: delegation?.intent });
    const health = routeHealthIntent(text);
    if (health?.goal === 'safe_stop') return this.taskModel.decide(context);
    const pending = pendingFrostTask(context.events);
    if (pending && isExplicitTaskConfirmation(text)) return this.taskModel.decide(context);
    if (workspaceLaunchInput(context.events)) return toolDecision('frost.skill_plan');
    if (input?.event.data.source === 'user' && (isRunRouteRequest(text) || pendingRunRoute(context.events))) return toolDecision('frost.run_route_dialogue');
    // A concrete read-only Skill query keeps its data adapter and speech ticket.
    // Broad advice words (today/exercise/steps/calories) must not steal it.
    if (answerRequest(context.events)) return toolDecision('frost.skill_answer');
    if (input?.event.data.source === 'user' && (isHealthAdviceRequest(text) || isHealthAdviceAcceptance(text))) return toolDecision('frost.health_advice');
    if (isFrostMemoryRecallRequest(text)) return toolDecision('frost.memory');
    if (pendingHealthQuestion(context.events)) return toolDecision('frost.task_delegate');
    if (pendingSkillQuestion(context.events)) return toolDecision('frost.skill_plan');
    // Goal Driver inputs execute the objective; only an explicit user message creates a schedule.
    if (input?.event.data.source === 'user' && dailyFrostGoal(text)) return toolDecision('frost.schedule');
    const pagePlan = planLocalFrostTask(text);
    // "调用健身 Agent" asks for its workspace, not an implicit ten-minute workout.
    // Keep this in the shared text gateway so phone and ASR follow exactly the same route.
    const openPage = /^(?:请(?:你|帮我)?|麻烦(?:你)?|帮我|我想(?:要)?|我需要)?\s*(?:打开|调用|进入|切换到|启动)\s*[^。！？\n]{1,60}(?:agent|智能体|技能|页面)\s*(?:吧|一下)?[。！!？?]?$/i.test(text);
    if (pagePlan && openPage) return toolDecision('frost.skill_plan');
    const specializedPage = pagePlan && (pagePlan.steps.length > 1 || pagePlan.steps.some((step) => step.skillId !== HEALTH_SUBAGENTS[health?.skill || '']));
    if (health && !specializedPage) {
      const subagent = getFrostSkillSubagent(HEALTH_SUBAGENTS[health.skill]);
      return subagent?.skill.availability === 'equipped' ? toolDecision('frost.task_delegate') : this.taskModel.decide(context);
    }
    return toolDecision('frost.skill_plan');
  }
}

export function isHealthAdviceAcceptance(text: string): boolean { return /^(?:好[的啊]?[，, ]*)?(?:开始这个训练|按这个建议开始|就按这个做|开始建议的运动)[。！!\s]*$/.test(text.trim()); }

function answerRequest(events: FrostAgentEvent[]): { id: string; question: string } | null {
  const text = inputText(events);
  if (latestFrostInput(events)?.event.data.source !== 'user') return null;
  const selected = selectFrostAnswerSkill(text);
  if (selected) return { id: selected, question: text };
  const previous = [...events].reverse().find(e => e.type === 'tool.result');
  const data = previous?.data.tool === 'frost.skill_answer' ? (previous.data.result as { data?: FrostSkillAnswer })?.data : null;
  // Short answers may complete a missing city/food. Do not hijack a new command.
  if (data?.needsInput && data.question && text.length <= 60 && !/打开|调用|调取|取消|停止|不要|你好|天气|健身|摄像头|查询|保存|删除/.test(text))
    return { id: data.answerSkillId, question: `${data.question}。用户补充：${text}` };
  return null;
}

/** Host tools derive text from the inbox, never from model-supplied replacement instructions. */
export function createFrostConversationTools(goals: FrostGoalStore): FrostAgentToolDefinition[] {
  return [
    {
      name: 'frost.run_route_dialogue', description: '在同一 Frost 对话补齐跑步条件，再交给 Taskmaster 和高德；不把模型文字当作道路。',
      read_only: false, risk: 'low', model_visible: false, timeout_ms: 30000,
      async execute(_input, context): Promise<FrostAgentToolResult> {
        const inbox = latestFrostInput(context.events);
        if (inbox?.event.data.source !== 'user') return { status: 'error', data: {}, message: 'user_request_required' };
        const text = inputText(context.events);
        if (isRunRouteCancellation(text)) return { status: 'success', data: { reply: '已取消这次路线规划，没有开启定位或导航。', trace: ['RUN ROUTE · cancelled'] } };
        const dialogue = await advanceRunRouteDialogue(text, pendingRunRoute(context.events)?.draft, inbox.content.input_channel === 'badge_voice', context.signal);
        context.signal.throwIfAborted();
        let routeSessionId: string | undefined;
        let routeTaskId: string | undefined;
        if (dialogue.input) {
          const activeId = getActiveRunRouteSessionId();
          const active = activeId ? readRunRouteSession(activeId) : null;
          if (active && ['navigating', 'off_route'].includes(active.status)) return { status: 'success', data: { reply: '已有路线正在导航，请先在中间的行动地图暂停或结束，再规划新路线；蓝牙无需断开。', trace: ['RUN ROUTE · existing navigation preserved'] } };
          const task = await startRunRouteTask(dialogue.input, `${context.session.session_id}:route:${inbox.event.seq}`);
          routeTaskId = task.task_id;
          routeSessionId = task.actions.map(action => action.result?.route_session_id).find((id): id is string => typeof id === 'string');
          if (!routeSessionId) return { status: 'success', data: { reply: '条件已收齐，但路线任务未创建，请重试。没有开启导航。', trace: ['RUN ROUTE · handoff failed'] } };
        }
        return { status: 'success', data: {
          reply: dialogue.reply, needsInput: dialogue.needsInput,
          routeDialogue: dialogue as unknown as JsonObject,
          ...(routeSessionId ? { routeSessionId, routeTaskId: routeTaskId! } : {}),
          trace: [dialogue.parser, routeSessionId ? `ROUTE SESSION · ${routeSessionId} · 高德待计算` : 'RUN ROUTE · waiting for conditions'],
        } };
      },
    },
    {
      name: 'frost.health_advice', description: '读取已确认的今日/长期记忆，让Qwen提出建议；仅明确接受后交接Skill。',
      read_only: true, risk: 'low', model_visible: false, timeout_ms: 90000,
      async execute(_input, context): Promise<FrostAgentToolResult> {
        const question = inputText(context.events);
        if (latestFrostInput(context.events)?.event.data.source !== 'user') return { status: 'error', data: {}, message: 'user_request_required' };
        if (isHealthAdviceAcceptance(question)) {
          const previous = [...context.events].reverse().find(event => event.type === 'tool.result' || event.type === 'skill.result');
          const decision = previous?.data.tool === 'frost.health_advice' ? (previous.data.result as { data?: FrostConversationReply } | undefined)?.data?.healthDecision : undefined;
          if (!healthSettings().cloud || !decision?.next_skill || !['pocket.lianlema', 'pocket.her-motion', 'frost.run-route'].includes(decision.next_skill)
            || !Number.isFinite(Date.parse(decision.expires_at)) || Date.parse(decision.expires_at) <= Date.now() || (await readHealthMemory()).revision !== decision.revision)
            return { status: 'success', data: { reply: '建议已过期、记忆已变化或没有可执行运动。请重新问我今天适合做什么；没有打开摄像头。', trace: ['HEALTH · stale or missing decision'] } };
          const command = { 'pocket.lianlema': '调用练了吗', 'pocket.her-motion': '调用女性运动', 'frost.run-route': '调用跑步路线规划' }[decision.next_skill];
          const plan = planFrostWorkspaceLaunch(command);
          if (!plan || plan.steps[0].skillId !== decision.next_skill) return { status: 'error', data: {}, message: 'skill_not_available' };
          return { status: 'success', data: { reply: `已接受建议，正在打开${plan.steps[0].skillName}；以真实训练结果记账，系统权限仍需授权。`,
            plan: plan as unknown as JsonObject, trace: ['HEALTH · accepted current evidence revision · original Skill handoff'] } };
        }
        try {
          const answer = await askHealthAdvice(question, context.signal);
          return { status: 'success', data: { reply: answer.reply, answerSkillId: 'frost.health-memory', question,
            speech: { text: answer.speech, ticket: answer.speechTicket },
            healthDecision: { revision: answer.revision, expires_at: answer.expires_at, next_skill: answer.next_skill, evidence_ids: answer.evidence_ids },
            trace: [`HEALTH MEMORY · ${answer.revision.slice(0, 10)} · ${answer.evidence_ids.length} evidence`, `QWEN · ${answer.model} · advice only, no health write`] } };
        } catch (error) {
          if (context.signal.aborted) return { status: 'cancelled', data: {} };
          return { status: 'success', data: { reply: error instanceof Error ? error.message : '健康分析暂不可用；未生成建议或写入事实。', trace: ['HEALTH · not completed · no automatic retry'] } };
        }
      },
    },
    {
      name: 'frost.skill_answer', description: '以已登记 Skill 的只读工具查询真实数据，由 Qwen 回答；不跳页面、不启动任务。',
      read_only: true, risk: 'low', model_visible: false, timeout_ms: 120000,
      async execute(_input, context): Promise<FrostAgentToolResult> {
        const request = answerRequest(context.events);
        if (!request) return { status: 'error', data: {}, message: 'read_skill_request_required' };
        const answer = await answerFrostSkill(request.question, request.id, context.signal);
        return { status: 'success', data: answer as unknown as JsonObject };
      },
    },
    {
      name: 'frost.skill_plan', description: '兼容已登记的页面型 Skill；只生成交接计划，无匹配时回答，不执行页面内任务。',
      read_only: true, risk: 'low', model_visible: false, timeout_ms: 150000,
      async execute(_input, context): Promise<FrostAgentToolResult> {
        const ctx = legacyContext(context.events);
        const workspace = workspaceLaunchInput(context.events);
        if (workspace) return { status: 'success', data: {
          reply: workspace.steps[0].skillId === 'frost.health-consultation' ? HEALTH_GREETING
            : `正在打开${workspace.steps[0].skillName}。使用原有 Skill 页面和服务，沿用已有权限；首次系统权限仍需授权。`,
          plan: workspace as unknown as JsonObject,
          trace: ['WORKSPACE OPEN · 同一 Frost 入口 · 已装备页面直接交接 · 未调用云端子 Agent 准备'],
        } };
        const pending = pendingSkillQuestion(context.events);
        if (pending) {
          const step = pending.plan.steps.find((item) => item.skillId === pending.child.skill_id)!;
          const child = await delegateSkillTask({ skillId: step.skillId, objective: step.objective, followup: ctx.userText,
            runId: pending.child.run_id, userId: context.session.user_id, signal: context.signal });
          return delegationReply(pending.plan, pending.delegations.map((item) => item.run_id === child.run_id ? child : item), '子 Agent 已收到你的补充。', []);
        }
        const routed = await runFrostOrchestrator(ctx);
        if (context.signal.aborted) return { status: 'cancelled', data: {} };
        if (routed.plan) {
          if (routed.plan.mode === 'single' && routed.plan.steps.length === 1
            && routed.plan.steps[0].skillId === 'frost.run-route' && routed.plan.steps[0].availability === 'equipped'
            && latestFrostInput(context.events)?.event.data.source === 'user') {
            // The router may understand wording outside the fast local intent gate.
            // Return a request for the registered route tool, not a blank form or an invented route.
            return { status: 'success', data: { reply: '正在核对跑步路线条件。', routeRequest: true, trace: routed.trace || [] } };
          }
          const delegations = await delegateSkillPlan(routed.plan, { runId: context.call_id, userId: context.session.user_id, signal: context.signal });
          return delegationReply(routed.plan, delegations, routed.reply, routed.trace || []);
        }
        const answered = await runGeneral(ctx);
        return { status: 'success', data: { reply: answered.reply, trace: [...(routed.trace || []), ...(answered.trace || [])] } };
      },
    },
    {
      name: 'frost.task_delegate', description: '调用健康 Skill 的独立 Qwen 子 Agent 准备任务；真实副作用仍交给健康 Taskmaster。',
      read_only: true, risk: 'low', model_visible: false, timeout_ms: 50000,
      async execute(_input, context): Promise<FrostAgentToolResult> {
        const text = inputText(context.events);
        const pending = pendingHealthQuestion(context.events);
        const objective = pending?.objective || text;
        const health = routeHealthIntent(pending ? `${objective}。用户补充：${text}` : text);
        const skillId = pending?.skill_id || (health && HEALTH_SUBAGENTS[health.skill]);
        if (!skillId) return { status: 'error', data: {}, message: 'subagent_not_registered' };
        const result = await delegateSkillTask({ skillId, objective, runId: pending?.run_id || `${context.call_id}:subagent:${skillId}`,
          userId: context.session.user_id, signal: context.signal, ...(pending ? { followup: text } : {}) });
        return { status: 'success', data: { ...result as unknown as JsonObject, objective, ...(health ? { intent: health as unknown as JsonObject } : {}) } };
      },
    },
    {
      name: 'frost.memory', description: '只检索本机已确认的长期记忆，不调用模型或云端。',
      read_only: true, risk: 'low', model_visible: false,
      async execute(_input, context): Promise<FrostAgentToolResult> {
        const reply = await answerFrostMemoryRecallRequest(inputText(context.events));
        if (reply === null) return { status: 'error', data: {}, message: 'memory_recall_not_requested' };
        return { status: 'success', data: { reply, trace: ['本机长期记忆检索 · 未调用 Qwen/MNN', '只读取已确认交接摘要 · 不含聊天、图片与 OCR 正文'] } };
      },
    },
    {
      name: 'frost.schedule', description: '按用户明确要求创建本地每日健康目标；最多 30 轮，仅宿主运行时唤醒。',
      read_only: false, risk: 'medium', model_visible: false,
      async execute(_input, context): Promise<FrostAgentToolResult> {
        const input = latestFrostInput(context.events);
        const scheduled = dailyFrostGoal(inputText(context.events));
        if (input?.event.data.source !== 'user' || !scheduled || context.signal.aborted) return { status: 'error', data: {}, message: 'explicit_schedule_required' };
        const goalId = `${context.session.session_id}:goal:${input.event.event_id}`;
        if (!await goals.get(goalId)) await goals.create(createFrostGoal({
          goal_id: goalId, session_id: context.session.session_id, user_id: context.session.user_id,
          objective: scheduled.objective, run_at: scheduled.run_at, interval_ms: 24 * 60 * 60 * 1000, max_rounds: 30,
        }));
        return { status: 'success', data: {
          reply: `已创建本地每日目标，首次计划时间为 ${new Date(scheduled.run_at).toLocaleString()}，最多 30 轮。需要应用保持运行；应用关闭时不会后台执行。`,
          trace: [`GOAL · ${goalId}`, 'SCHEDULE · 24H', 'BUDGET · 30 ROUNDS'],
        } };
      },
    },
  ];
}
