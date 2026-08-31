import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FrostAgentLoop, completeDecision } from '../../../frost-agent/runtime/agentLoop';
import { InMemoryFrostSessionLog } from '../../../frost-agent/runtime/sessionLog';
import { FrostAgentToolRegistry } from '../../../frost-agent/runtime/toolRegistry';
import { InMemoryFrostApprovalStore, issueFrostApproval, ReceiptApprovalGate } from '../../../frost-agent/runtime/approval';
import { InMemoryFrostGoalStore } from '../../../frost-agent/runtime/goalDriver';
import { TaskmasterSkillProvider, createSkillAgentTools } from '../../../frost-agent/runtime/skillCatalog';
import { createTaskmasterAgentTools } from '../../../frost-agent/runtime/taskmasterAdapter';
import { LocalHealthFallbackModel } from '../../../frost-agent/runtime/localHealthModel';
import { isExplicitTaskConfirmation, pendingTaskConfirmation, taskFromEvents } from '../../../frost-agent/runtime/turnContext';
import { FrostHealthTaskmaster, InMemoryTaskmasterStore, InMemoryTraceSink, createDefaultTools } from '../../../frost-agent/taskmaster';
import { setFrostBrain, stubBrain } from '../../../frost-agent/harness/brain';
import { ensureBuiltinSkills, resetSkillRegistryForTests } from './skill';
import { createFrostConversationTools, dailyFrostGoal, FrostConversationModel } from './frostConversation';
import { presentFrostAgentRun } from './frostAgentPresentation';
import { FROST_ANSWER_SKILLS } from './frostSkillAnswer';
import { readRunRouteSession } from './runRouteSkill';

vi.mock('../../../frost-agent/agents/general', () => ({ runGeneral: vi.fn(async () => ({ reply: '通用回答', trace: ['general'], plan: null })) }));
let counter = 0;

function childReply(action: Record<string, unknown> = { type: 'call_tool', tool: 'skill.prepare_handoff', arguments: { note: '请在对应页面继续任务。' } }) {
  return { ok: true, json: async () => ({ model: 'qwen3.8-max', text: JSON.stringify({ ...completeDecision('准备任务'), next_action: action }) }) };
}

async function runtime() {
  const sessionId = `conversation-test-${++counter}`;
  const log = new InMemoryFrostSessionLog();
  const store = new InMemoryTaskmasterStore();
  const taskmaster = new FrostHealthTaskmaster(store, createDefaultTools(), new InMemoryTraceSink());
  const goals = new InMemoryFrostGoalStore();
  const approvals = new InMemoryFrostApprovalStore();
  const tools = new FrostAgentToolRegistry({ approval_gate: new ReceiptApprovalGate(approvals) });
  for (const tool of [...createSkillAgentTools(new TaskmasterSkillProvider()), ...createTaskmasterAgentTools(taskmaster), ...createFrostConversationTools(goals)]) tools.register(tool);
  const loop = new FrostAgentLoop(FrostAgentLoop.createSession(sessionId, 'local-user'), new FrostConversationModel(new LocalHealthFallbackModel()), tools, log);
  await loop.initialize();
  return { log, loop, goals, taskmaster, async send(text: string) {
    const before = await log.list(sessionId);
    const pending = pendingTaskConfirmation(before);
    if (pending && isExplicitTaskConfirmation(text)) {
      await issueFrostApproval(approvals, { approval_id: `approval-${before.length}`, session_id: sessionId, tool: 'taskmaster.confirm',
        arguments: { task_id: pending.task_id, action_id: pending.actions[pending.next_action_index].action_id }, decision: 'allow', reason: 'explicit_confirmation' });
    }
    await loop.followup({ text }); await loop.whenIdle();
    const events = await log.list(sessionId, before[before.length - 1]?.seq || 0);
    const result = { session: loop.getSession(), events, task: taskFromEvents(events) };
    return { ...result, view: presentFrostAgentRun(result, text) };
  } };
}

describe('one Frost conversation entry, registered subagents and UI compatibility', () => {
  beforeEach(() => { resetSkillRegistryForTests(); ensureBuiltinSkills(); setFrostBrain(stubBrain); vi.stubGlobal('fetch', vi.fn(async () => childReply())); });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['打开跑步路线规划', 'frost-run-route'],
    ['进入动作信号', 'frost-motion-vision'],
    ['打开包装食品', 'frost-openfoodfacts'],
    ['帮我打开中国健康库', 'frost-cn-health-library'],
    ['调取户外窗口', 'frost-outdoor-window'],
    ['打开睡眠侦探', 'frost-sleep-detective'],
    ['调用饮食镜头', 'frost-meal-lens'],
  ])('recognizes the visible card name in %s and opens %s', async (text, target) => {
    const result = await (await runtime()).send(text);
    expect(result.view.autoStep?.target).toBe(target);
    expect(result.task).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['打开训练计划', 'frost.wger-planner', 'frost-wger-planner'],
    ['调用恢复厨房', 'frost.mealie-kitchen', 'frost-mealie-kitchen'],
    ['打开健康同步', 'frost.healthsync', 'frost-healthsync'],
  ])('keeps the unconfigured connector in %s as setup guidance without opening or starting a child worker', async (text, skillId, target) => {
    const result = await (await runtime()).send(text);
    expect(result.view.plan?.steps[0]).toMatchObject({ skillId, target, availability: 'installed' });
    expect(result.view.plan?.steps[0].subagent).toBeUndefined();
    expect(result.view.autoStep).toBeUndefined();
    expect(result.task).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['调用女性运动agent', '打开女性运动', '请帮我调用 Her Motion 子Agent', '帮我打开一下女性运动'])('opens %s locally without invoking a cloud subagent or granting new camera permission', async text => {
    const app = await runtime();
    const result = await app.send(text);
    expect(result.task).toBeNull();
    expect(result.view.autoStep).toMatchObject({ skillId: 'pocket.her-motion', target: 'her-motion' });
    expect(fetch).not.toHaveBeenCalled();
    expect(result.events.some(event => event.type === 'tool.called' && event.data.tool === 'taskmaster.confirm')).toBe(false);
  });

  it.each(['帮我调用健身agent', '打开健身智能体', '进入动作识别页面', '调用下健身agent', '嗯调用下健身A卷程', '嗯，帮我打开一下健身 Agent'])('treats %s as opening the existing skill without waiting for a cloud preparation turn', async text => {
    vi.mocked(fetch).mockRejectedValue(new Error('simulated_cloud_unavailable'));
    const app = await runtime();
    const result = await app.send(text);
    expect(result.task).toBeNull();
    expect(result.view.autoStep).toMatchObject({ skillId: 'pocket.lianlema', target: 'lianlema-coach' });
    expect(result.view.autoStep?.subagent).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    expect(result.events.some(event => event.type === 'tool.called' && event.data.tool === 'taskmaster.start_intent')).toBe(false);
  });

  it('opens a newly requested workout workspace instead of treating it as an answer to an old child question', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(childReply({ type: 'ask_user', question: '想纠正哪个动作？', reason: 'need_exercise' }) as unknown as Response);
    const app = await runtime();
    expect((await app.send('用练了吗纠正动作')).session.status).toBe('waiting_user');
    vi.mocked(fetch).mockClear();
    const next = await app.send('调用下健身agent');
    expect(next.view.autoStep?.target).toBe('lianlema-coach');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['要问一下健身A俊臣', '不要打开健身agent', '打开健身agent然后制定计划', '打开健身agent练20分钟', '打开健身agent可以吗'])('does not turn %s into the immediate workspace-only path', async text => {
    vi.mocked(fetch).mockResolvedValue(childReply({ type: 'ask_user', question: '请说明具体需求', reason: 'clarify' }) as unknown as Response);
    const app = await runtime();
    const result = await app.send(text);
    expect(result.view.autoStep).toBeUndefined();
    expect(fetch).toHaveBeenCalled();
  });

  it('keeps an unconfigured training connector out of Her Motion and does not start a child worker', async () => {
    const app = await runtime();
    const result = await app.send('用 wger 做力量训练计划');
    expect(result.task).toBeNull();
    expect(result.view.plan?.steps[0]).toMatchObject({ skillId: 'frost.wger-planner', target: 'frost-wger-planner', availability: 'installed' });
    expect(result.view.plan?.steps[0].subagent).toBeUndefined();
    expect(result.events.some((event) => event.type === 'tool.called' && event.data.tool === 'taskmaster.start_intent')).toBe(false);
    expect(result.view.autoStep).toBeUndefined();
  });

  it('uses the same session for a page Skill, chat and local memory, without stale plans or extra model calls', async () => {
    const app = await runtime();
    const page = await app.send('用练了吗纠正深蹲');
    const chat = await app.send('你好');
    expect(chat.session.session_id).toBe(page.session.session_id);
    expect(chat.view.text).toBe('通用回答'); expect(chat.view.plan).toBeUndefined();
    vi.mocked(fetch).mockClear();
    const memory = await app.send('你还记得什么');
    expect(memory.view.text).toContain('本机长期记忆'); expect(fetch).not.toHaveBeenCalled();
  });

  it('continues an explicit confirmation on the existing Taskmaster task instead of creating another', async () => {
    const app = await runtime();
    const first = await app.send('瑜伽');
    expect(first.task?.status).toBe('waiting_confirmation');
    expect(first.view.autoStep).toBeUndefined();
    const confirmed = await app.send('确认');
    expect(confirmed.task).toMatchObject({ task_id: first.task!.task_id, status: 'waiting_external' });
    expect(confirmed.view.taskmasterTaskId).toBe(first.task!.task_id);
    expect(confirmed.events.filter((event) => event.type === 'tool.called').map((event) => event.data.tool)).toEqual(['taskmaster.confirm']);
  });

  it.each(['不可以', '先别确认', '还不想开始', '继续是什么意思'])('never grants task approval for %s', async (text) => {
    expect(isExplicitTaskConfirmation(text)).toBe(false);
    const app = await runtime();
    const first = await app.send('瑜伽');
    await app.send(text);
    expect((await app.taskmaster.get(first.task!.task_id))?.status).toBe('waiting_confirmation');
  });

  it('does not confirm an old health task after the conversation has switched to a different Skill', async () => {
    const app = await runtime(); const first = await app.send('瑜伽');
    await app.send('查看食品条码'); await app.send('确认');
    expect((await app.taskmaster.get(first.task!.task_id))?.status).toBe('waiting_confirmation');
  });

  it('retains the health Taskmaster path when the actual UI registry contains the route Skill', async () => {
    const app = await runtime(); const route = await app.send('帮我规划 5 公里跑步路线');
    expect(route.session.status).toBe('waiting_user');
    expect(route.view.autoStep).toBeUndefined();
    expect(route.view.routeChoices).toContain('Loop');
    const ready = await app.send('环线，风景好、少路口');
    expect(ready.events.some(event => event.data.tool === 'frost.run_route_dialogue')).toBe(true);
    const reply = ready.events.find(event => event.type === 'tool.result')?.data.result as { data?: { routeSessionId?: string; routeTaskId?: string } };
    expect(reply.data?.routeSessionId).toBeTruthy(); expect(reply.data?.routeTaskId).toBeTruthy();
    expect(ready.view.routeSessionId).toBe(reply.data?.routeSessionId);
    expect(ready.view.autoStep).toBeUndefined(); // The real route opens Earth, never the old input form.
  });

  it.each([
    '帮我设计一条杭州西湖白堤的跑步线路，三公里，环线，风景好、少路口',
    '打开跑步路线规划，三公里，环线，风景好、少路口',
  ])('plans the supplied conditions instead of opening a default form: %s', async text => {
    const result = await (await runtime()).send(text);
    expect(result.view.routeSessionId).toBeTruthy();
    expect(result.view.autoStep).toBeUndefined();
    expect(readRunRouteSession(result.view.routeSessionId!)?.input).toMatchObject({
      goal: { type: 'distance', distance_m: 3000 }, shape: 'loop', preferences: ['scenic', 'low_crossings'],
      ...(text.includes('白堤') ? { start: 'place', start_query: '杭州西湖白堤' } : {}),
    });
  });

  it('hands a model-selected running Skill to the route dialogue instead of a page-only child', async () => {
    const complete = vi.fn(async () => JSON.stringify({ mode: 'single', summary: '准备跑步线路', steps: [
      { skillId: 'frost.run-route', objective: '根据用户条件规划路线', reason: '用户需要运动线路' },
    ] }));
    setFrostBrain({ complete });
    const app = await runtime();
    const first = await app.send('给我一条适合今天出门的线路');
    expect(complete).toHaveBeenCalled();
    expect(first.view.autoStep).toBeUndefined();
    expect(first.view.routeChoices).toContain('3 km');
    expect(first.events.filter(event => event.type === 'tool.called').map(event => event.data.tool))
      .toEqual(['frost.skill_plan', 'frost.run_route_dialogue']);
    const ready = await app.send('三公里，环线，风景好、少路口');
    expect(ready.view.routeSessionId).toBeTruthy();
  });

  it('cancels a pending route and does not steal an unrelated workspace launch', async () => {
    const app = await runtime();
    await app.send('帮我规划5公里跑步路线');
    expect((await app.send('取消规划')).view.text).toContain('Route planning cancelled');
    await app.send('帮我规划5公里跑步路线');
    expect((await app.send('打开包装食品')).view.autoStep?.target).toBe('frost-openfoodfacts');
  });

  it('plans an English request through the same route dialogue and cancels it with the English button text', async () => {
    const app = await runtime();
    const first = await app.send('Plan a 5 km running route, scenic, few crossings');
    expect(first.session.status).toBe('waiting_user');
    expect(first.view.autoStep).toBeUndefined();
    expect(first.events.some(event => event.data.tool === 'frost.run_route_dialogue')).toBe(true);
    const ready = await app.send('loop');
    expect(ready.view.routeSessionId).toBeTruthy();
    expect(readRunRouteSession(ready.view.routeSessionId!)?.input).toMatchObject({
      goal: { type: 'distance', distance_m: 5000 }, shape: 'loop', preferences: ['scenic', 'low_crossings'],
    });
    const second = await runtime();
    await second.send('Plan a running route around West Lake');
    expect((await second.send('cancel route planning')).view.text).toContain('Route planning cancelled');
  });

  it('continues a page subagent question in the same child context', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(childReply({ type: 'ask_user', question: '要纠正哪个动作？', reason: 'need_exercise' }) as unknown as Response);
    const app = await runtime(); const first = await app.send('用练了吗纠正动作');
    expect(first.session.status).toBe('waiting_user'); expect(first.view.autoStep).toBeUndefined();
    const next = await app.send('深蹲');
    expect(next.view.plan?.steps[0].subagent?.runId).toBe(first.view.plan?.steps[0].subagent?.runId);
    expect(next.view.plan?.steps[0].subagent?.status).toBe('waiting_external');
    const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(body.prompt).toContain('要纠正哪个动作'); expect(body.prompt).toContain('深蹲');
  });

  it('keeps scheduled goals bounded and does not recursively schedule Goal Driver inputs', async () => {
    const app = await runtime();
    const result = await app.send('每天晚上8点生成今日健康总结');
    expect(result.view.text).toContain('will not run in the background when the app is closed');
    const goals = await app.goals.listSession(result.session.session_id);
    expect(goals).toHaveLength(1); expect(goals[0]).toMatchObject({ objective: '生成今日健康总结', budget: { max_rounds: 30 } });
    await app.loop.followup({ objective: goals[0].objective }, 'goal'); await app.loop.whenIdle();
    expect(await app.goals.listSession(result.session.session_id)).toHaveLength(1);
    expect(dailyFrostGoal('每天25点运动')).toBeNull();
  });

  it('returns health child clarifications to Taskmaster without losing the original goal', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(childReply({ type: 'ask_user', question: '想练几分钟？', reason: 'need_duration' }) as unknown as Response);
    const app = await runtime();
    const first = await app.send('瑜伽');
    expect(first.task).toBeNull(); expect(first.session.status).toBe('waiting_user');
    const clarified = await app.send('15分钟');
    expect(clarified.task?.request).toMatchObject({ kind: 'start_workout', input: { exercise: '瑜伽', duration_sec: 900 } });
    expect(clarified.task?.status).toBe('waiting_confirmation');
  });
});


describe('read-only answer in the shared main Frost loop', () => {
  beforeEach(() => { resetSkillRegistryForTests(); ensureBuiltinSkills(); setFrostBrain(stubBrain); });
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    ...FROST_ANSWER_SKILLS.map(skill => [skill.example, skill.id]),
    ['杭州今天空气质量适合户外运动吗', 'frost.outdoor-window'],
    ['查询苹果健康今天步数', 'frost.healthsync'],
    ['今天吃的白米饭100克有多少热量', 'frost.cn-health-library'],
  ])('keeps %s in the answer tool instead of a page or generic advice', async (text, id) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/frost-llm') {
        const body = JSON.parse(String(init?.body));
        return Response.json({ text: JSON.stringify(body.task.endsWith(':arguments') ? { entity: '' }
          : { reply: '测试缺项说明。', speech: '测试缺项说明。' }), model: 'qwen3.8-max', speechTicket: 'test-only-ticket' });
      }
      return Response.json({ localBridgeEnabled: false, healthsync: { available: false }, garmin: { available: false } });
    }));
    const result = await (await runtime()).send(text);
    expect(result.events.filter(e => e.type === 'tool.called').map(e => e.data.tool)).toEqual(['frost.skill_answer']);
    const data = (result.events.find(e => e.type === 'tool.result')?.data.result as { data: Record<string, unknown> }).data;
    expect(data.answerSkillId).toBe(id);
    expect(data.speech).toEqual({ text: '测试缺项说明。', ticket: 'test-only-ticket' });
    expect(result.view.autoStep).toBeUndefined();
    expect(result.task).toBeNull();
  });
  it('answers a weather question with no navigation/task and resumes a missing city in the same session', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ text: JSON.stringify({ entity: '' }), model: 'qwen3.8-max' }))
      .mockResolvedValueOnce(Response.json({ text: JSON.stringify({ reply: '哪个城市？', speech: '哪个城市？' }), model: 'qwen3.8-max', speechTicket: 'ticket1' }))
      .mockResolvedValueOnce(Response.json({ text: JSON.stringify({ entity: '杭州' }), model: 'qwen3.8-max' }))
      .mockResolvedValueOnce(Response.json({ city: '杭州', source: 'Open-Meteo', current: { temperature_2m: 25 } }))
      .mockResolvedValueOnce(Response.json({ text: JSON.stringify({ reply: '杭州当前25度。', speech: '杭州当前25度。' }), model: 'qwen3.8-max', speechTicket: 'ticket2' })));
    const app = await runtime();
    const first = await app.send('查天气');
    expect(first.session.status).toBe('waiting_user'); expect(first.view.plan).toBeUndefined();
    const next = await app.send('杭州');
    expect(next.session.session_id).toBe(first.session.session_id);
    expect(next.view.text).toBe('杭州当前25度。'); expect(next.view.autoStep).toBeUndefined(); expect(next.task).toBeNull();
    expect(next.events.filter(e => e.type === 'tool.called').map(e => e.data.tool)).toEqual(['frost.skill_answer']);
  });
});
