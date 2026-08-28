import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FrostAgentLoop } from '../../../frost-agent/runtime/agentLoop';
import { FROST_AGENT_EVENT_PROTOCOL, type FrostAgentEvent } from '../../../frost-agent/runtime/contracts';
import type { FrostAgentRunNotice, FrostAgentRunResult } from './frostAgentRuntime';
import type { BadgeStatus } from './frostBadge';
import { FrostCompanion } from './frostCompanion';
import { registerVoiceTreeMap, tryVoiceTreeCommand, type VoiceTreeContext } from '../../../vendor/legacy-city/src/app/lib/pocket-plants/voicePlanting';
import { readPocketPlantings } from '../../../vendor/legacy-city/src/app/lib/pocket-plants/planting';
import { claimVoiceMapMode, getVoiceMapState, reportVoiceMapReady, tryVoiceMapCommand, VOICE_MAP_READY_MESSAGE } from '../../../vendor/legacy-city/src/app/lib/location/voiceMapMode';

const session = FrostAgentLoop.createSession('session-a', 'local-user');
const event = (seq: number, type: FrostAgentEvent['type'], data: FrostAgentEvent['data']): FrostAgentEvent => ({
  protocol: FROST_AGENT_EVENT_PROTOCOL, event_id: `event:${seq}`, session_id: session.session_id, seq,
  type, data, occurred_at: new Date().toISOString(),
});
const created = event(1, 'session.created', { user_id: 'local-user', status: 'idle' });
const result: FrostAgentRunResult = { session, task: null, events: [event(5, 'assistant.message', { text: '今天的总结已显示在手机上。' })] };
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());
function setup(initialBadge: Partial<BadgeStatus> = {}) {
  let badge: BadgeStatus = { status: 'connected', connectionId: 'badge:a', devices: [], endpoints: [], recording: false, receivedBytes: 0, ...initialBadge };
  let badgeChanged = () => {}, observed = (_: FrostAgentEvent) => {}, completed = (_: FrostAgentRunNotice) => {};
  const voice = { transcribe: vi.fn(async () => ({ text: '生成今日总结', inputId: badge.pcmId! })),
    handleLocalCommand: vi.fn(async (_text: string, _inputId: string, _signal: AbortSignal): Promise<boolean | { message: string }> => false),
    send: vi.fn(async (_text: string, _origin: unknown) => result), speak: vi.fn(async (_text: string) => {}),
    speakAnswer: vi.fn(async (_text: string, _ticket: string, _signal: AbortSignal) => {}),
    stop: vi.fn(async () => {}), cancel: vi.fn(async () => {}),
    observe: (fn: typeof completed) => { completed = fn; return () => { completed = () => {}; }; } };
  const projectPose = vi.fn(async () => {});
  const companion = new FrostCompanion({ history: async () => [created], observe: fn => { observed = fn; return () => {}; },
    record: vi.fn(async () => {}), voice, badge: { snapshot: () => badge, subscribe: fn => { badgeChanged = fn; return () => {}; },
      projectPose, testSpeaker: vi.fn(async () => {}) } });
  const release = companion.start();
  const patch = (part: Partial<BadgeStatus>) => { badge = { ...badge, ...part }; badgeChanged(); };
  const capture = (id = '1', stats: Partial<NonNullable<BadgeStatus['captureStats']>> = {}) => {
    patch({ recording: true, pcm: undefined, pcmId: undefined, captureStats: undefined });
    patch({ recording: false, pcm: Uint8Array.of(12, 0, 24, 0), pcmId: `${badge.connectionId}:recording:${id}`,
      captureStats: { complete: true, peak: 24, samples: 2, reason: 1, dropped: 0, ...stats } });
  };
  return { companion, voice, projectPose, patch, capture, release, event: (e: FrostAgentEvent) => observed(e), run: (n: FrostAgentRunNotice) => completed(n) };
}

describe('default-on foreground voice mode', () => {
  it('dispatches a recognized bird command once without a duplicate main-agent turn', async () => {
    const x = setup(); await flush();
    x.voice.transcribe.mockResolvedValueOnce({ text: '帮我识别下鸟叫', inputId: 'badge:a:recording:bird' });
    x.voice.handleLocalCommand.mockResolvedValueOnce(true);
    x.capture('bird'); await flush(); x.patch({ receivedBytes: 4 }); await flush();
    expect(x.voice.handleLocalCommand).toHaveBeenCalledExactlyOnceWith('帮我识别下鸟叫', 'badge:a:recording:bird', expect.any(AbortSignal));
    expect(x.voice.send).not.toHaveBeenCalled();
    expect(x.companion.snapshot().voice.phase).toBe('ready'); x.release();
  });
  it.each(['gps', 'preview', 'no-fix'] as const)('routes fresh badge speech to the real map with %s, never to the cloud Agent', async mode => {
    vi.stubGlobal('window', { localStorage });
    vi.stubGlobal('document', { visibilityState: 'visible' });
    const context: VoiceTreeContext = { walking: true, mode: mode === 'preview' ? 'preview' : 'gps',
      fix: mode === 'no-fix' ? null : { position: [120.15, 30.25], wgs84Position: [120.145, 30.253], timestamp: Date.now(), accuracyM: 8 } };
    const onResult = vi.fn();
    const unmap = registerVoiceTreeMap({ context: () => context, onResult });
    const x = setup(); await flush();
    const id = `tree-${mode}`;
    x.voice.transcribe.mockResolvedValueOnce({ text: '帮我种下一颗树', inputId: `badge:a:recording:${id}` });
    x.voice.handleLocalCommand.mockImplementation(async (text, inputId) => tryVoiceTreeCommand(text, inputId) ?? false);
    try {
      x.capture(id); await flush(); x.patch({ receivedBytes: 4 }); await flush();
      expect(x.voice.send).not.toHaveBeenCalled();
      expect(onResult).toHaveBeenCalledTimes(1);
      expect(readPocketPlantings()).toHaveLength(mode === 'gps' ? 1 : 0);
      expect(x.voice.speak).toHaveBeenCalledExactlyOnceWith(onResult.mock.calls[0][0].message);
      expect(x.companion.snapshot().attention).toBe(onResult.mock.calls[0][0].message);
      expect(x.companion.snapshot().voice.phase).toBe('ready');
    } finally { unmap(); x.release(); }
  });
  it('retains a local planting receipt when badge speech fails, without replanting or sending it to the Agent', async () => {
    const x = setup(); await flush();
    x.voice.handleLocalCommand.mockResolvedValueOnce({ message: '已种下一棵树，仅保存在本机地图。' });
    x.voice.speak.mockRejectedValueOnce(new Error('speaker unavailable'));
    x.capture('tree-speech-failed'); await flush(); x.patch({ receivedBytes: 4 }); await flush();
    expect(x.voice.handleLocalCommand).toHaveBeenCalledTimes(1);
    expect(x.voice.send).not.toHaveBeenCalled();
    expect(x.companion.snapshot().attention).toContain('已种下');
    expect(x.companion.snapshot().voice.error).toContain('结果已留在手机');
    x.release();
  });
  it('runs enter-map → real GPS readiness → badge reply → plant at that GPS without a cloud turn', async () => {
    vi.stubGlobal('window', { localStorage });
    vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
    const context: VoiceTreeContext = { walking: false, mode: 'preview', fix: null };
    const unmap = registerVoiceTreeMap({ context: () => context, onResult: vi.fn() });
    const x = setup(); await flush();
    x.voice.handleLocalCommand.mockImplementation(async (text, inputId, signal) =>
      tryVoiceMapCommand(text, inputId, signal) ?? tryVoiceTreeCommand(text, inputId) ?? false);
    x.voice.transcribe.mockResolvedValueOnce({ text: '进入地图模式', inputId: 'badge:a:recording:enter-map' });
    try {
      x.capture('enter-map'); await flush();
      expect(getVoiceMapState()?.status).toBe('opening');
      expect(x.voice.speak).not.toHaveBeenCalled();
      claimVoiceMapMode('badge:a:recording:enter-map');
      x.run({ result }); // An older main-Agent reply must not interrupt this local GPS request.
      await flush(); expect(x.voice.speak).not.toHaveBeenCalled();
      context.walking = true; context.mode = 'gps';
      context.fix = { position: [120.15, 30.25], wgs84Position: [120.145, 30.253], timestamp: Date.now(), accuracyM: 8 };
      reportVoiceMapReady('badge:a:recording:enter-map', context.fix); await flush();
      expect(x.voice.speak).toHaveBeenCalledExactlyOnceWith(VOICE_MAP_READY_MESSAGE);
      expect(x.companion.snapshot().voice.phase).toBe('ready');
      x.voice.transcribe.mockResolvedValueOnce({ text: '帮我种下一棵树', inputId: 'badge:a:recording:plant-after-map' });
      x.capture('plant-after-map'); await flush(); x.patch({ receivedBytes: 4 }); await flush();
      expect(readPocketPlantings()).toEqual([expect.objectContaining({ position: context.fix.position, wgs84Position: context.fix.wgs84Position })]);
      expect(x.voice.speak).toHaveBeenCalledTimes(2);
      expect(x.voice.send).not.toHaveBeenCalled();
    } finally { x.release(); unmap(); }
  });
  it.each(['background', 'disconnect', 'new-capture', 'phone-input', 'off'] as const)('cancels pending map entry on %s and never speaks late GPS readiness', async reason => {
    vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
    const x = setup(); await flush();
    const captureId = `map-cancel-${reason}`, inputId = `badge:a:recording:${captureId}`;
    x.voice.handleLocalCommand.mockImplementation(async (text, id, signal) => tryVoiceMapCommand(text, id, signal) ?? false);
    x.voice.transcribe.mockResolvedValueOnce({ text: '进入地图模式', inputId });
    x.capture(captureId); await flush(); claimVoiceMapMode(inputId);
    if (reason === 'background') x.companion.setForeground(false);
    if (reason === 'disconnect') x.patch({ status: 'disconnected', connectionId: undefined });
    if (reason === 'new-capture') x.patch({ recording: true, pcmId: undefined });
    if (reason === 'phone-input') x.event(event(2, 'user.message', { source: 'user', content: { text: '新的手机指令' } }));
    if (reason === 'off') x.companion.setVoiceMode(false);
    await flush();
    expect(getVoiceMapState()?.status).toBe('cancelled');
    expect(reportVoiceMapReady(inputId, { position: [120, 30], wgs84Position: [120, 30], accuracyM: 8, timestamp: Date.now() })).toBe(false);
    expect(x.voice.speak).not.toHaveBeenCalled(); expect(x.voice.send).not.toHaveBeenCalled();
    x.release();
  });
  it('does not send a stale command after waiting for native skill dispatch', async () => {
    const x = setup(); await flush();
    let resolve!: (handled: boolean) => void;
    x.voice.handleLocalCommand.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    x.capture(); await flush(); x.companion.setForeground(false); resolve(false); await flush();
    expect(x.voice.send).not.toHaveBeenCalled(); x.release();
  });
  it('still sends a complete new recording to Frost when an independent avatar reply times out', async () => {
    const x = setup(); await flush();
    x.projectPose.mockRejectedValue(new Error('圆屏状态同步回执超时'));
    x.event(event(2, 'session.status_changed', { status: 'waiting_user' })); await flush();
    expect(x.companion.snapshot().projectionError).toContain('回执超时');
    x.companion.setVoiceMode(true); x.capture('after-timeout'); await flush();
    expect(x.voice.send).toHaveBeenCalledExactlyOnceWith('生成今日总结', { channel: 'badge_voice', inputId: 'badge:a:recording:after-timeout' });
    expect(x.companion.snapshot().voice.error).toBeUndefined();
    x.release();
  });
  it('forwards the recognized fitness command verbatim without a second Send button or command parser', async () => {
    const x = setup(); await flush();
    x.voice.transcribe.mockResolvedValueOnce({ text: '帮我调用健身agent', inputId: 'badge:a:recording:fitness' });
    x.companion.setVoiceMode(true); x.capture('fitness'); await flush();
    expect(x.voice.send).toHaveBeenCalledExactlyOnceWith('帮我调用健身agent', { channel: 'badge_voice', inputId: 'badge:a:recording:fitness' });
    x.patch({ receivedBytes: 4 }); await flush();
    expect(x.voice.transcribe).toHaveBeenCalledTimes(1); expect(x.voice.send).toHaveBeenCalledTimes(1);
    x.release();
  });
  it('defaults on but only recognizes a new physical recording, once, through the same gateway', async () => {
    const x = setup(); await flush();
    expect(x.companion.snapshot().voice).toMatchObject({ autoSend: true, enabled: true, phase: 'ready' });
    expect(x.voice.transcribe).not.toHaveBeenCalled();
    x.capture(); await flush();
    expect(x.voice.send).toHaveBeenCalledExactlyOnceWith('生成今日总结', { channel: 'badge_voice', inputId: 'badge:a:recording:1' });
    x.patch({ receivedBytes: 4 }); await flush();
    expect(x.voice.transcribe).toHaveBeenCalledTimes(1); expect(x.voice.send).toHaveBeenCalledTimes(1);
    x.release();
  });
  it('never replays a recording made while manually off when re-enabled', async () => {
    const x = setup(); await flush(); x.companion.setVoiceMode(false); x.capture(); await flush();
    expect(x.voice.transcribe).not.toHaveBeenCalled();
    x.companion.setVoiceMode(true); x.patch({ receivedBytes: 4 }); await flush();
    expect(x.voice.transcribe).not.toHaveBeenCalled();
    x.capture('2'); await flush();
    expect(x.voice.send).toHaveBeenCalledExactlyOnceWith('生成今日总结', { channel: 'badge_voice', inputId: 'badge:a:recording:2' });
    x.patch({ receivedBytes: 4 }); await flush();
    expect(x.voice.send).toHaveBeenCalledTimes(1);
    x.release();
  });
  it.each([{ complete: false }, { peak: 0 }, { dropped: 1 }])('does not recognize or send an invalid capture %j', async stats => {
    const x = setup(); await flush(); x.companion.setVoiceMode(true); x.capture('1', stats); await flush();
    expect(x.voice.transcribe).not.toHaveBeenCalled(); expect(x.voice.send).not.toHaveBeenCalled();
    expect(x.companion.snapshot().voice.phase).toBe('error'); x.release();
  });
  it('cancels ASR in the background, resumes automatically, but never sends the cancelled recording', async () => {
    const x = setup(); await flush();
    let resolve!: (draft: { text: string; inputId: string }) => void;
    x.voice.transcribe.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    x.capture(); await flush();
    x.companion.setForeground(false); resolve({ text: '不要发送', inputId: 'badge:a:recording:1' }); await flush();
    expect(x.voice.send).not.toHaveBeenCalled(); expect(x.voice.cancel).toHaveBeenCalled();
    expect(x.companion.snapshot().voice).toMatchObject({ autoSend: true, enabled: false });
    x.companion.setForeground(true); expect(x.companion.snapshot().voice.enabled).toBe(true);
    x.patch({ receivedBytes: 4 }); await flush(); expect(x.voice.send).not.toHaveBeenCalled();
    x.capture('new'); await flush();
    expect(x.voice.send).toHaveBeenCalledExactlyOnceWith('生成今日总结', { channel: 'badge_voice', inputId: 'badge:a:recording:new' });
    x.release();
  });
  it('automatically resumes on a new connection without replaying the old PCM', async () => {
    const x = setup(); await flush(); x.capture(); await flush();
    x.patch({ status: 'disconnected', connectionId: undefined });
    expect(x.companion.snapshot().voice).toMatchObject({ autoSend: true, enabled: false });
    x.patch({ status: 'connected', connectionId: 'badge:b' }); await flush();
    expect(x.companion.snapshot().voice.enabled).toBe(true);
    expect(x.voice.send).toHaveBeenCalledTimes(1);
    x.capture('new'); await flush();
    expect(x.voice.send).toHaveBeenLastCalledWith('生成今日总结', { channel: 'badge_voice', inputId: 'badge:b:recording:new' });
    expect(x.voice.send).toHaveBeenCalledTimes(2); x.release();
  });
  it('remembers an explicit off choice across reconnect, foreground and a new App instance', async () => {
    const x = setup(); await flush(); x.companion.setVoiceMode(false);
    x.companion.setForeground(false); x.companion.setForeground(true);
    x.patch({ status: 'disconnected', connectionId: undefined });
    x.patch({ status: 'connected', connectionId: 'badge:b' }); x.capture(); await flush();
    expect(x.companion.snapshot().voice).toMatchObject({ autoSend: false, enabled: false });
    expect(x.voice.send).not.toHaveBeenCalled(); x.release();
    const next = setup(); await flush(); next.capture(); await flush();
    expect(next.companion.snapshot().voice.autoSend).toBe(false);
    expect(next.voice.transcribe).not.toHaveBeenCalled();
    next.companion.setVoiceMode(true); next.release();
    const restarted = setup(); await flush();
    expect(restarted.companion.snapshot().voice).toMatchObject({ autoSend: true, enabled: true }); restarted.release();
  });
  it('does not send buffered audio present when the App starts', async () => {
    const x = setup({ pcm: Uint8Array.of(12, 0), pcmId: 'badge:a:recording:old',
      captureStats: { complete: true, peak: 12, samples: 1, dropped: 0, reason: 1 } });
    await flush(); x.patch({ receivedBytes: 2 }); await flush();
    expect(x.voice.transcribe).not.toHaveBeenCalled();
    x.capture('new'); await flush(); expect(x.voice.send).toHaveBeenCalledTimes(1); x.release();
  });
  it.each(['startup', 'foreground', 'manual-enable'])('ignores an already held button at %s, waiting for a fresh press', async mode => {
    const x = setup(mode === 'startup' ? { recording: true } : {}); await flush();
    if (mode === 'foreground') { x.companion.setForeground(false); x.patch({ recording: true }); x.companion.setForeground(true); }
    if (mode === 'manual-enable') { x.companion.setVoiceMode(false); x.patch({ recording: true }); x.companion.setVoiceMode(true); }
    x.patch({ recording: false });
    x.patch({ pcm: Uint8Array.of(12, 0), pcmId: 'badge:a:recording:in-progress',
      captureStats: { complete: true, peak: 12, samples: 1, dropped: 0, reason: 1 } }); await flush();
    expect(x.companion.snapshot().voice.enabled).toBe(true);
    expect(x.voice.transcribe).not.toHaveBeenCalled();
    x.capture('new'); await flush(); expect(x.voice.send).toHaveBeenCalledTimes(1); x.release();
  });
  it('does not send a pre-background capture whose tail finishes after returning to foreground', async () => {
    const x = setup(); await flush(); x.patch({ recording: true });
    x.companion.setForeground(false); x.patch({ recording: false }); x.companion.setForeground(true);
    x.patch({ pcm: Uint8Array.of(12, 0), pcmId: 'badge:a:recording:late-tail',
      captureStats: { complete: true, peak: 12, samples: 1, dropped: 0, reason: 1 } }); await flush();
    expect(x.voice.transcribe).not.toHaveBeenCalled();
    x.capture('new'); await flush(); expect(x.voice.send).toHaveBeenCalledTimes(1); x.release();
  });
  it('waits for connection and microphone readiness without disabling the preference', async () => {
    const x = setup({ status: 'disconnected', connectionId: undefined }); await flush();
    expect(x.companion.snapshot().voice).toMatchObject({ autoSend: true, enabled: false });
    x.patch({ status: 'connected', connectionId: 'badge:b', microphoneAvailable: false });
    expect(x.companion.snapshot().voice.enabled).toBe(false);
    x.patch({ microphoneAvailable: true }); expect(x.companion.snapshot().voice.enabled).toBe(true);
    x.capture(); await flush(); expect(x.voice.send).toHaveBeenCalledTimes(1); x.release();
  });
  it('uses local speech for one completed main-session reply, without replay or another model call', async () => {
    const x = setup(); await flush(); x.companion.setVoiceMode(true);
    x.run({ result }); x.run({ result }); await flush();
    expect(x.voice.speak).toHaveBeenCalledExactlyOnceWith('今天的总结已显示在手机上。');
    expect(x.voice.send).not.toHaveBeenCalled();
    x.run({ result: { ...result, session: { ...session, session_id: 'other' }, events: [event(6, 'assistant.message', { text: '其他会话' })] } });
    expect(x.voice.speak).toHaveBeenCalledTimes(1); x.release();
  });
  it('reads phone-confirmation instructions without granting permission and bounds long replies', async () => {
    const x = setup(); await flush(); x.companion.setVoiceMode(true);
    x.run({ result: { ...result, task: { status: 'waiting_confirmation' } as FrostAgentRunResult['task'] } }); await flush();
    expect(x.voice.speak.mock.calls[0][0]).toContain('手机上确认权限');
    x.run({ result: { ...result, events: [event(6, 'assistant.message', { text: '长回复'.repeat(100) })] } }); await flush();
    expect([...x.voice.speak.mock.calls[1][0]].length).toBeLessThanOrEqual(100); x.release();
  });
  it('does not queue a second command or speak an old reply if the user presses again while Frost is running', async () => {
    const x = setup(); await flush(); x.companion.setVoiceMode(true);
    let resolve!: (result: FrostAgentRunResult) => void;
    x.voice.send.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    x.capture(); await flush(); x.capture('2'); await flush();
    expect(x.voice.send).toHaveBeenCalledTimes(1);
    x.run({ result, input: { text: '生成今日总结', origin: { channel: 'badge_voice', inputId: 'badge:a:recording:1' } } });
    resolve(result); await flush();
    expect(x.voice.speak).not.toHaveBeenCalled(); expect(x.companion.snapshot().voice.error).toContain('未自动发送'); x.release();
  });
  it('keeps a real reply on the phone if local speech fails and never automatically retries', async () => {
    const x = setup(); await flush(); x.companion.setVoiceMode(true);
    x.voice.speak.mockRejectedValue(new Error('not installed'));
    x.run({ result }); await flush(); x.patch({ receivedBytes: 4 }); await flush();
    expect(x.voice.speak).toHaveBeenCalledTimes(1);
    expect(x.companion.snapshot().voice.error).toContain('回复仍在手机中'); x.release();
  });
  it('does not let a replaced playback failure overwrite the newer reply state', async () => {
    const x = setup(); await flush(); x.companion.setVoiceMode(true);
    let reject!: (error: Error) => void;
    x.voice.speak.mockImplementationOnce(() => new Promise((_done, failed) => { reject = failed; }));
    x.run({ result });
    x.run({ result: { ...result, events: [event(6, 'assistant.message', { text: '新的实际结果' })] } });
    reject(new Error('replaced')); await flush();
    expect(x.companion.snapshot().voice).toMatchObject({ phase: 'ready', spokenText: '新的实际结果', error: undefined }); x.release();
  });
  it('cancels stale recognition on a replacement capture and does not retry an ASR failure', async () => {
    const x = setup(); await flush(); x.companion.setVoiceMode(true);
    let resolve!: (draft: { text: string; inputId: string }) => void;
    x.voice.transcribe.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    x.capture(); await flush(); x.patch({ recording: true, pcm: undefined, pcmId: undefined });
    resolve({ text: '旧录音', inputId: 'badge:a:recording:1' }); await flush();
    expect(x.voice.send).not.toHaveBeenCalled();
    x.voice.transcribe.mockRejectedValueOnce(new Error('local ASR unavailable'));
    x.capture('2'); await flush(); x.patch({ receivedBytes: 4 }); await flush();
    expect(x.voice.transcribe).toHaveBeenCalledTimes(2); expect(x.voice.send).not.toHaveBeenCalled(); x.release();
  });
});


describe('MiniMax Skill answer playback', () => {
  const answer = { session, task: null, events: [
    event(2, 'user.message', { source: 'user', content: { text: '查杭州天气' } }),
    event(3, 'tool.result', { tool: 'frost.skill_answer', result: { status: 'success', data: {
      reply: '杭州26度', trace: [], answerSkillId: 'frost.outdoor-window', speech: { text: '杭州26度。', ticket: 'one-answer-ticket' },
    } } }), event(4, 'assistant.message', { text: '杭州26度' }),
  ] };
  it('uses the cloud answer once instead of system speech, and cancels on a new recording', async () => {
    const x = setup(); await flush();
    x.run({ result: answer }); x.run({ result: answer }); await flush();
    expect(x.voice.speakAnswer).toHaveBeenCalledTimes(1);
    expect(x.voice.speak).not.toHaveBeenCalled();
    const signal = x.voice.speakAnswer.mock.calls[0][2];
    expect(signal.aborted).toBe(false);
    x.patch({ recording: true }); expect(signal.aborted).toBe(true); x.release();
  });
  it('does not bill or replay an answer while disconnected or in the background', async () => {
    const x = setup(); await flush();
    x.companion.setForeground(false); x.run({ result: answer }); await flush();
    expect(x.voice.speakAnswer).not.toHaveBeenCalled();
    x.companion.setForeground(true); await flush();
    expect(x.voice.speakAnswer).not.toHaveBeenCalled(); x.release();
  });
});
