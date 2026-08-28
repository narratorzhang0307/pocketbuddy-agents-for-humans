import type { FrostPlan } from '../harness/skillRouter';
import { FrostAgentLoop } from '../runtime/agentLoop';
import { IndexedDbFrostSessionLog } from '../runtime/indexedDbSessionLog';
import type { FrostSessionLog } from '../runtime/sessionLog';
import type { FrostAgentToolResult } from '../runtime/contracts';
import type { JsonObject } from './contracts';
import { FrostAgentToolRegistry } from '../runtime/toolRegistry';
import { getFrostSkillSubagent } from '../subagents/registry';
import { httpSubagentCompletion, QwenSkillSubagentModel, type SubagentCompletion } from '../subagents/qwen';

export interface SkillDelegationResult {
  agent_id: string;
  run_id: string;
  skill_id: string;
  status: 'waiting_external' | 'waiting_user' | 'blocked' | 'unavailable' | 'failed';
  reply: string;
  model: string | null;
  model_calls: number;
  evidence_ids: string[];
}

const PRIVATE_INPUT = /(身份证|护照|银行卡|手机号|电话号码|家庭住址|精确住址|病历|医疗记录|健康导出|私密照片)/;
const defaultLog = new IndexedDbFrostSessionLog();

/** Taskmaster supervision: isolated child log + fixed tools, one registered Skill, no recursive delegation. */
export async function delegateSkillTask(input: {
  skillId: string; objective: string; runId: string; userId: string; signal: AbortSignal; followup?: string;
}, options: { completion?: SubagentCompletion; log?: FrostSessionLog } = {}): Promise<SkillDelegationResult> {
  const agent = getFrostSkillSubagent(input.skillId);
  const base = { agent_id: agent?.agent_id || `skill:${input.skillId}`, run_id: input.runId, skill_id: input.skillId, model: null, model_calls: 0, evidence_ids: [] };
  if (!agent || agent.skill.availability !== 'equipped') return { ...base, status: 'unavailable', reply: '该 Skill 尚未登记或装备，未调用子 Agent。' };
  if (PRIVATE_INPUT.test(`${input.objective}\n${input.followup || ''}`)) return { ...base, status: 'blocked', reply: '输入包含隐私信息，未发送给云端子 Agent；请在本机 Skill 中处理，或提供不含隐私的目标。' };
  if (input.signal.aborted) return { ...base, status: 'failed', reply: '委派已取消。' };
  const log = options.log || defaultLog;
  // A restored run is evidence, not permission to repeat a model call or side effect.
  const previous = await log.list(input.runId);
  const request = { skill_id: input.skillId, objective: input.objective.slice(0, 1600), user_id: input.userId };
  const priorReport = [...previous].reverse().find((event) => event.type === 'subagent.report');
  if (priorReport) {
    if (JSON.stringify(priorReport.data.request) !== JSON.stringify(request)) throw new Error('subagent_run_request_conflict');
    if (!input.followup) return structuredClone(priorReport.data.result) as unknown as SkillDelegationResult;
  }
  const tools = new FrostAgentToolRegistry({ default_timeout_ms: 5000 });
  tools.register({
    name: 'skill.describe', description: '读取当前子 Agent 的唯一 Skill 契约', read_only: true, risk: 'low',
    async execute() {
      return { status: 'success', data: {
        skill_id: agent.skill.id, description: agent.skill.description, target: agent.skill.target,
        permissions: [...agent.skill.scopes, ...agent.skill.tools],
        execution: '页面运行时继续申请权限；当前子 Agent 只准备交接',
      } };
    },
  });
  tools.register({
    name: 'skill.prepare_handoff', description: '只准备当前 Skill 的页面交接，不打开页面或执行副作用', read_only: true, risk: 'low',
    validate_input(value) {
      return Object.keys(value).every((key) => key === 'note') && typeof value.note === 'string' && value.note.trim() && value.note.length <= 400 ? [] : ['short_note_required'];
    },
    async execute(value): Promise<FrostAgentToolResult> {
      if (getFrostSkillSubagent(input.skillId)?.skill.availability !== 'equipped') return { status: 'error', data: {}, message: 'skill_no_longer_equipped' };
      return { status: 'waiting_external', data: { skill_id: agent.skill.id, target: agent.skill.target, note: value.note, execution_completed: false } };
    },
  });
  const model = new QwenSkillSubagentModel(agent, options.completion || httpSubagentCompletion);
  const loop = new FrostAgentLoop(FrostAgentLoop.createSession(input.runId, input.userId), model, tools, log,
    { max_steps: 3, max_tool_calls: 2, deadline_ms: 45000 });
  await loop.initialize();
  const abort = () => { void loop.cancel('parent_cancelled'); };
  input.signal.addEventListener('abort', abort, { once: true });
  try {
    if (input.signal.aborted) { await loop.cancel('parent_cancelled'); return { ...base, status: 'failed', reply: '委派已取消。' }; }
    if (!previous.length) {
      await loop.followup({ objective: input.objective.slice(0, 1600) });
      await loop.whenIdle();
    } else if (input.followup && loop.getSession().status === 'waiting_user') {
      await loop.followup({ text: input.followup.slice(0, 1600) });
      await loop.whenIdle();
    }
    const events = await log.list(input.runId);
    const handoff = [...events].reverse().find((event) => event.type === 'tool.result' && event.data.tool === 'skill.prepare_handoff'
      && (event.data.result as { status?: string })?.status === 'waiting_external');
    const assistant = [...events].reverse().find((event) => event.type === 'assistant.message');
    const stopped = [...events].reverse().find((event) => event.type === 'session.stopped');
    const status = loop.getSession().status;
    const ready = handoff && status === 'waiting_external';
    const result: SkillDelegationResult = {
      ...base, status: ready ? 'waiting_external' : status === 'waiting_user' ? 'waiting_user' : status === 'stopped' ? 'blocked' : 'failed',
      reply: ready ? String((handoff.data.result as { data: { note: string } }).data.note)
        : String(assistant?.data.text || stopped?.data.reason || '子 Agent 未形成可靠交接；可以从原 Skill 页面继续。'),
      model: model.models[model.models.length - 1] || null, model_calls: model.calls,
      evidence_ids: events.filter((event) => event.type === 'tool.result' || event.type === 'assistant.message' || event.type === 'session.stopped').map((event) => event.event_id),
    };
    await log.append({ session_id: input.runId, type: 'subagent.report', data: { request, result: result as unknown as JsonObject } });
    return result;
  } finally { input.signal.removeEventListener('abort', abort); }
}

/** At most three delegated page Skills per parent request. Preparing plans is not completing those tasks. */
export async function delegateSkillPlan(plan: FrostPlan, input: { runId: string; userId: string; signal: AbortSignal }, options: Parameters<typeof delegateSkillTask>[1] = {}): Promise<SkillDelegationResult[]> {
  if (plan.steps.length > 3) throw new Error('subagent_delegation_budget_exceeded');
  const results: SkillDelegationResult[] = [];
  for (const step of plan.steps) {
    if (input.signal.aborted) break;
    results.push(await delegateSkillTask({ skillId: step.skillId, objective: step.objective,
      runId: `${input.runId}:subagent:${step.id}`, userId: input.userId, signal: input.signal }, options));
    if (results[results.length - 1].status === 'blocked') break;
  }
  return results;
}
