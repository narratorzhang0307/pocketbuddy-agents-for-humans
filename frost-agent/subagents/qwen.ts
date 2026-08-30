import type { FrostAgentModelAdapter, FrostAgentModelContext } from '../runtime/contracts';
import type { FrostSkillSubagent } from './registry';

export interface SubagentCompletion {
  complete(input: { agent: FrostSkillSubagent; prompt: string; signal: AbortSignal }): Promise<{ text: string; model: string }>;
}

/** Uses the server-selected model provider (Gemini on the competition deployment). No client credentials. */
export const httpSubagentCompletion: SubagentCompletion = {
  async complete({ agent, prompt, signal }) {
    const response = await fetch('/api/frost-llm', {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal,
      body: JSON.stringify({ prompt, system: agent.instruction, json: true, task: `subagent:${agent.skill.id}` }),
    });
    if (!response.ok) throw new Error(`subagent_model_http_${response.status}`);
    const data = await response.json();
    if (!data || typeof data.text !== 'string' || !data.text.trim() || typeof data.model !== 'string') throw new Error('subagent_model_unavailable');
    return { text: data.text, model: data.model };
  },
};

export class ServerSkillSubagentModel implements FrostAgentModelAdapter {
  readonly models: string[] = [];
  calls = 0;

  constructor(private readonly agent: FrostSkillSubagent, private readonly completion: SubagentCompletion) {}

  async decide(context: FrostAgentModelContext): Promise<unknown> {
    if (++this.calls > 3) throw new Error('subagent_model_budget_exceeded');
    const events = context.events.filter((event) => ['user.message', 'tool.result', 'assistant.message'].includes(event.type));
    const prompt = [
      '你运行在独立、有限预算的子 Agent 会话中。只输出一个 frost-agent-decision/v1 JSON，不要 Markdown 或思维过程。',
      '必填字段：protocol, goal, observations(简短事实数组), next_action, confidence(0..1), risk(low|medium|high), success_condition。',
      '允许动作：call_tool、ask_user、safe_stop。不能 start_task、load_skill、调用其他 Agent 或工具。',
      '工具 skill.describe，arguments:{}：获取当前 Skill 的已登记说明与权限声明。',
      '工具 skill.prepare_handoff，arguments:{note:string}：准备交给当前 Skill 页面；note 是简短执行建议，不是成功证明。',
      '需要相机/位置/个人数据时，交给该页面向用户请求授权和采集。不得编造数据或声称任务已完成。',
      '目标不清时用 {type:"ask_user",question:"...",reason:"..."}；危险或越权时用 {type:"safe_stop",reason:"..."}。',
      '最多 3 次模型决策、2 次工具调用；本轮不执行页面内副作用。',
      JSON.stringify({ agent_id: this.agent.agent_id, skill_id: this.agent.skill.id, events }),
    ].join('\n');
    if (prompt.length > 16000) throw new Error('subagent_context_budget_exceeded');
    const response = await this.completion.complete({ agent: this.agent, prompt, signal: context.signal });
    this.models.push(response.model);
    const raw = response.text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    const value = JSON.parse(raw);
    if (!['call_tool', 'ask_user', 'safe_stop'].includes(value?.next_action?.type)) throw new Error('subagent_action_not_allowed');
    return value;
  }
}
