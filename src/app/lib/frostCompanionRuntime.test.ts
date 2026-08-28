import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexedDbFrostSessionLog, FROST_AGENT_EVENT_PROTOCOL, completeDecision } from '../../../frost-agent/runtime';
import { readFrostAgentEvents, readFrostAgentSnapshot, recordFrostPeripheralInput, sendFrostAgentMessage, subscribeFrostAgentEvents, subscribeFrostAgentRuns } from './frostAgentRuntime';
import { createFrostAutoNavigation, createFrostVoiceConversation, prepareFrostAgentHandoff } from './frostAgentNavigation';
import { peekTaskHandoff } from '../../../frost-agent/harness/taskHandoff';
import { setFrostBrain, stubBrain } from '../../../frost-agent/harness/brain';
import { BUILTIN_SKILLS, ensureBuiltinSkills } from './skill';
import { planLocalFrostTask } from '../../../frost-agent/harness/skillRouter';
import { shouldAutoStartLianlema } from './health/lianlemaConnection';
import { resolveSkillRunTarget } from './plaza/skillRoutes';

vi.mock('../../../frost-agent/edge/contract', () => ({ edgeSafe: { async chat() { return ''; } } }));

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => values.get(`session:${key}`) ?? null,
    setItem: (key: string, value: string) => values.set(`session:${key}`, value), removeItem: (key: string) => values.delete(`session:${key}`) });
  // Every network call is replaced: these tests never spend speech/model API credits.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ model: 'qwen3.8-max',
    text: JSON.stringify({ ...completeDecision('准备任务'), next_action: { type: 'call_tool', tool: 'skill.prepare_handoff', arguments: { note: '请在手机继续。' } } }) }) })));
  ensureBuiltinSkills(); setFrostBrain(stubBrain);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('badge inputs use the main Frost runtime', () => {
  it.each(['帮我打开下健康咨询agent', '帮我打开一下医院agent', '打开健康咨询', '调用医疗咨询'])('opens health consultation directly with no paid preparation: %s', async text => {
    const origin = { channel: 'badge_voice' as const, inputId: `badge:test:health:${Array.from(text).map(c => c.codePointAt(0)!.toString(16)).join('')}` };
    const intermediate = vi.fn(), show = createFrostVoiceConversation({ isActive: () => true, open: intermediate });
    const release = subscribeFrostAgentEvents(show);
    try {
      const result = await sendFrostAgentMessage(text, origin);
      const open = vi.fn(), navigate = createFrostAutoNavigation({ isActive: () => true, open });
      expect(await navigate({ result, input: { text, origin } })).toBe(true);
      expect(open).toHaveBeenCalledExactlyOnceWith('health-consultation');
      expect(intermediate).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expect(result.task).toBeNull();
    } finally { release(); }
  });
  it.each(['phone', 'badge_voice'] as const)('opens the bird recording Skill directly for the reported phrase from %s', async channel => {
    const text = '帮我打开下识别鸟类声音的agent';
    const origin = channel === 'phone' ? { channel } : { channel, inputId: 'badge:test:bird:direct-open' };
    const intermediate = vi.fn();
    const show = createFrostVoiceConversation({ isActive: () => true, open: intermediate });
    const release = subscribeFrostAgentEvents(event => { show(event); });
    let result: Awaited<ReturnType<typeof sendFrostAgentMessage>>;
    try { result = await sendFrostAgentMessage(text, origin); } finally { release(); }
    const open = vi.fn(), navigate = createFrostAutoNavigation({ isActive: () => true, open });
    expect(await navigate({ result, input: { text, origin } })).toBe(true);
    expect(await navigate({ result, input: { text, origin } })).toBe(false);
    expect(intermediate).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledExactlyOnceWith('frost-bird-listener');
    expect(peekTaskHandoff('frost-bird-listener')).toMatchObject({ skillId: 'frost.bird-listener', userText: text });
    expect(result.task).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(BUILTIN_SKILLS.flatMap(manifest => (['phone', 'badge_voice'] as const).map(channel => ({ manifest, channel }))))(
    'opens registered $manifest.identity.id directly from $channel without a homepage or paid preparation call', async ({ manifest, channel }) => {
      const text = `帮我调取${manifest.identity.name}`;
      const origin = channel === 'phone' ? { channel } : { channel, inputId: `badge:test:all-skills:${manifest.identity.id.replace(/\./g, '-')}` };
      const intermediate = vi.fn(), show = createFrostVoiceConversation({ isActive: () => true, open: intermediate });
      const release = subscribeFrostAgentEvents(event => { show(event); });
      let result: Awaited<ReturnType<typeof sendFrostAgentMessage>>;
      try { result = await sendFrostAgentMessage(text, origin); } finally { release(); }
      const open = vi.fn(), navigate = createFrostAutoNavigation({ isActive: () => true, open });
      expect(await navigate({ result, input: { text, origin } })).toBe(true);
      expect(intermediate).not.toHaveBeenCalled();
      expect(open).toHaveBeenCalledExactlyOnceWith(manifest.entry.target);
      expect(open.mock.calls.map(([target]) => resolveSkillRunTarget(target))).not.toContain(null);
      expect(peekTaskHandoff(manifest.entry.target)).toMatchObject({ skillId: manifest.identity.id, userText: text, agentSessionId: result.session.session_id });
      expect(result.task).toBeNull(); // Opening a page must not guess a route/workout request.
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('rejects an unsupported manual target before staging or opening a homepage', async () => {
    const plan = planLocalFrostTask('打开睡眠侦探')!;
    const step = { ...plan.steps[0], target: 'earth' };
    const before = await readFrostAgentEvents();
    await expect(prepareFrostAgentHandoff({ ...plan, steps: [step] }, step, '打开睡眠侦探')).rejects.toThrow('尚无可用页面入口');
    expect(await readFrostAgentEvents()).toEqual(before);
  });

  it('shows the same Frost conversation on voice input before opening the actual returned skill', async () => {
    const text = '请把我带到能纠正深蹲动作的助手';
    const origin = { channel: 'badge_voice' as const, inputId: 'badge:test:recording:show-conversation' };
    // Exercise the real Skills page resolver, not just the navigation callback.
    const open = vi.fn();
    const show = createFrostVoiceConversation({ isActive: () => true, open });
    const release = subscribeFrostAgentEvents(event => { show(event); });
    let result: Awaited<ReturnType<typeof sendFrostAgentMessage>>;
    try { result = await sendFrostAgentMessage(text, origin); } finally { release(); }
    expect(open).toHaveBeenCalledExactlyOnceWith('frost');
    expect(open.mock.calls.map(([target]) => resolveSkillRunTarget(target))).toEqual(['frost']);
    const input = result.events.find(event => event.type === 'user.message' && event.data.source === 'user')!;
    expect(input.data.content).toMatchObject({ text, input_channel: 'badge_voice', input_id: origin.inputId });
    expect(show(input)).toBe(false);
    const navigate = createFrostAutoNavigation({ isActive: () => true, open });
    expect(await navigate({ result, input: { text, origin } })).toBe(true);
    expect(open.mock.calls).toEqual([['frost'], ['lianlema-coach']]);
    const other = createFrostVoiceConversation({ isActive: () => false, open });
    expect(other(input)).toBe(false);
    expect(show({ ...input, event_id: 'phone-message', data: { ...input.data, content: { text, input_channel: 'phone' } } })).toBe(false);
    expect(show({ ...input, event_id: 'peripheral-metadata', type: 'peripheral.input' })).toBe(false);
  });
  it.each([
    ['调用女性运动agent', 'exact'], ['帮我打开一下女性运动', 'spoken'], ['帮我打开一下女性运动卷', 'asr-suffix'],
  ])('opens Her Motion once from hardware text %s without a mounted chat or network call', async (text, id) => {
    const origin = { channel: 'badge_voice' as const, inputId: `badge:test:recording:her-motion:${id}` };
    const result = await sendFrostAgentMessage(text, origin);
    expect(fetch).not.toHaveBeenCalled();
    const open = vi.fn(), navigate = createFrostAutoNavigation({ isActive: () => true, open });
    expect(await navigate({ result, input: { text, origin } })).toBe(true);
    expect(await navigate({ result, input: { text, origin } })).toBe(false);
    expect(open).toHaveBeenCalledExactlyOnceWith('her-motion');
    expect(peekTaskHandoff('her-motion')).toMatchObject({ skillId: 'pocket.her-motion', userText: text, agentSessionId: result.session.session_id });
    const input = result.events.find(event => event.type === 'user.message');
    expect(input?.data.content).toMatchObject({ text, input_channel: 'badge_voice', input_id: origin.inputId });
  });
  it.each(['phone', 'badge_voice'] as const)('automatically opens the hosted Lianlema fitness agent from %s text once, not the undeployed Her Motion page', async channel => {
    const text = channel === 'badge_voice' ? '调用健身agent' : '帮我调用健身agent';
    const origin = channel === 'phone' ? { channel } : { channel, inputId: 'badge:test:recording:fitness' };
    const intermediate = vi.fn();
    const show = createFrostVoiceConversation({ isActive: () => true, open: intermediate });
    const release = subscribeFrostAgentEvents(event => { show(event); });
    let result: Awaited<ReturnType<typeof sendFrostAgentMessage>>;
    try { result = await sendFrostAgentMessage(text, origin); } finally { release(); }
    expect(intermediate).not.toHaveBeenCalled(); // No list/chat detour for a clear open command.
    expect(fetch).not.toHaveBeenCalled();
    const notice = { result, input: { text, origin } };
    const open = vi.fn(); let active = false;
    const navigate = createFrostAutoNavigation({ isActive: () => active, open });
    expect(await navigate(notice)).toBe(false); // Background never steals the page.
    active = true;
    expect(await navigate({ result })).toBe(false); // History or a task signal is not a new user command.
    const outcomes = await Promise.all([navigate(notice), navigate(notice)]);
    expect(outcomes).toEqual([true, false]);
    expect(open).toHaveBeenCalledExactlyOnceWith('lianlema-coach');
    expect(open.mock.calls.map(([target]) => resolveSkillRunTarget(target))).toEqual(['lianlema']);
    const handoff = peekTaskHandoff('lianlema-coach');
    expect(handoff).toMatchObject({ skillId: 'pocket.lianlema', userText: text, agentSessionId: result.session.session_id });
    expect(handoff?.subagentRunId).toBeUndefined(); // Opening a workspace does not need a cloud preparation turn.
    expect(shouldAutoStartLianlema(handoff)).toBe(true);
    expect(handoff?.taskmasterTaskId).toBeUndefined(); // Do not create an unrelated Her Motion workout.
    const events = await readFrostAgentEvents();
    expect(events.filter(event => event.type === 'skill.dispatched' && event.data.run_id === handoff?.runId)).toHaveLength(1);
  });

  it('does not auto-open when the same fitness subagent still needs clarification', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ model: 'qwen3.8-max',
      text: JSON.stringify({ ...completeDecision('请补充'), next_action: { type: 'ask_user', question: '想练什么动作？', reason: 'need_exercise' } }) }) } as Response);
    const text = '用练了吗纠正动作';
    const result = await sendFrostAgentMessage(text);
    const open = vi.fn();
    const navigate = createFrostAutoNavigation({ isActive: () => true, open });
    expect(result.session.status).toBe('waiting_user');
    expect(await navigate({ result, input: { text, origin: { channel: 'phone' } } })).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('records peripheral metadata idempotently without waking the model, creating inbox input or granting permission', async () => {
    const before = await readFrostAgentEvents();
    const observed: string[] = [];
    const release = subscribeFrostAgentEvents(event => { observed.push(event.type); throw new Error('observer only'); });
    await recordFrostPeripheralInput({ id: 'badge:test:touch:1', kind: 'touch', count: 1 });
    await recordFrostPeripheralInput({ id: 'badge:test:touch:1', kind: 'touch', count: 1 });
    const added = (await readFrostAgentEvents()).slice(before.length);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ session_id: before[0].session_id, type: 'peripheral.input', data: { source: 'badge', kind: 'touch', count: 1 } });
    expect(observed).toEqual(['peripheral.input']);
    release();
    await expect(recordFrostPeripheralInput({ id: 'bad/id', kind: 'touch' })).rejects.toThrow('invalid_peripheral_event_id');
    await expect(recordFrostPeripheralInput({ id: 'badge:bad', kind: 'recording_ready', bytes: 960001 })).rejects.toThrow('invalid_peripheral_event');
  });
  it('routes voice text into the same session as phone text and blocks concurrent/replayed recordings', async () => {
    const before = await readFrostAgentEvents();
    const origin = { channel: 'badge_voice' as const, inputId: 'badge:test:recording:1' };
    const results = await Promise.allSettled([
      sendFrostAgentMessage('帮我规划一条 3 公里的跑步路线', origin),
      sendFrostAgentMessage('帮我规划一条 3 公里的跑步路线', origin),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const events = await readFrostAgentEvents();
    const voice = events.slice(before.length).filter(event => event.type === 'user.message' && (event.data.content as { input_channel?: string })?.input_channel === 'badge_voice');
    expect(voice).toHaveLength(1);
    expect(voice[0].session_id).toBe(before[0].session_id);
    expect(voice[0].data.content).toMatchObject({ input_id: origin.inputId });
    expect(events.slice(before.length).filter(event => event.type === 'tool.called').some(event => event.data.tool === 'frost.run_route_dialogue')).toBe(true);
    const delivered = results.find(result => result.status === 'fulfilled');
    expect(delivered?.status === 'fulfilled' && delivered.value.task?.status).toBe('completed');
    await expect(sendFrostAgentMessage('再次发送', origin)).rejects.toThrow('已发送');
  });
  it('does not turn a recognized affirmative into a Taskmaster permission receipt', async () => {
    const events = await readFrostAgentEvents();
    const spy = vi.spyOn(IndexedDbFrostSessionLog.prototype, 'list').mockResolvedValueOnce([{
      protocol: FROST_AGENT_EVENT_PROTOCOL, event_id: 'pending', session_id: events[0].session_id,
      seq: 100, occurred_at: new Date().toISOString(), type: 'tool.result', data: {
        tool: 'taskmaster.get', result: { data: { task: { task_id: 'waiting-task', status: 'waiting_confirmation' } } },
      },
    }]);
    await expect(sendFrostAgentMessage('确认', { channel: 'badge_voice', inputId: 'badge:test:recording:approval' })).rejects.toThrow('不能用识别出的语音代替授权');
    spy.mockRestore();
    expect(await readFrostAgentEvents()).toEqual(events);
    await expect(sendFrostAgentMessage('测试', { channel: 'badge_voice' })).rejects.toThrow('invalid_frost_input_origin');
  });
  it('requires phone confirmation even when voice says to start a permission-gated workout', async () => {
    const requested = await sendFrostAgentMessage('带我做 10 分钟瑜伽', { channel: 'badge_voice', inputId: 'badge:test:recording:workout' });
    expect(requested.task?.status).toBe('waiting_confirmation');
    const open = vi.fn();
    const navigate = createFrostAutoNavigation({ isActive: () => true, open });
    expect(await navigate({ result: requested, input: { text: '带我做 10 分钟瑜伽', origin: { channel: 'badge_voice', inputId: 'badge:test:recording:workout' } } })).toBe(false);
    expect(open).not.toHaveBeenCalled();
    await expect(sendFrostAgentMessage('确认', { channel: 'badge_voice', inputId: 'badge:test:recording:yes' })).rejects.toThrow('不能用识别出的语音代替授权');
    const confirmed = await sendFrostAgentMessage('确认');
    expect(confirmed.session.session_id).toBe(requested.session.session_id);
    expect(confirmed.task?.status).toBe('waiting_external');
    expect(confirmed.task?.task_id).toBe(requested.task?.task_id);
  });
  it('publishes the same completed run to all surfaces and does not restore a previous task after a new memory query', async () => {
    const listener = vi.fn(); const release = subscribeFrostAgentRuns(listener);
    const result = await sendFrostAgentMessage('你还记得什么');
    expect(listener).toHaveBeenCalledExactlyOnceWith({ result, input: { text: '你还记得什么', origin: { channel: 'phone' } } });
    const snapshot = await readFrostAgentSnapshot();
    expect(snapshot.session.session_id).toBe(result.session.session_id);
    expect(snapshot.task).toBeNull(); release();
  });
});
