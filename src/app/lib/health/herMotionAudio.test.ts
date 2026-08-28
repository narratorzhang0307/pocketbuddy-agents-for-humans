import { describe, expect, it, vi } from 'vitest';
import { HerMotionBadgeAudio } from './herMotionAudio';
import { HER_MOTION_AUDIO_PROTOCOL } from '../../../../vendor/her-motion/src/frostBridge';

function setup() {
  const state = { connection: 'badge:1', available: true, now: 0 };
  const speak = vi.fn<(text: string, signal: AbortSignal) => Promise<void>>().mockResolvedValue(undefined);
  const status = vi.fn();
  const audio = new HerMotionBadgeAudio('session', { connection: () => state.connection, available: () => state.available, speak, status, now: () => state.now });
  const cue = (id = 1, text = '请保持全身入镜。') => ({ protocol: HER_MOTION_AUDIO_PROTOCOL, sessionId: 'session', type: 'speak', id, text });
  return { state, speak, status, audio, cue };
}

describe('Her Motion hardware-only speech', () => {
  it('sends current cues only through the hardware port, with no phone playback fallback', async () => {
    const { audio, cue, speak, status } = setup();
    expect(await audio.receive(cue())).toBe(true);
    expect(speak).toHaveBeenCalledExactlyOnceWith(cue().text, expect.any(AbortSignal));
    expect(status).toHaveBeenLastCalledWith('语音已传给硬件 · 手机静音');
  });
  it('rejects another session, oversized text, unsupported operations and replayed ids', async () => {
    const { audio, cue, speak } = setup();
    for (const bad of [{ ...cue(), sessionId: 'other' }, cue(1, '字'.repeat(101)), cue(1, ' '), { ...cue(), type: 'fetch' }, { ...cue(), id: 1.2 }]) {
      expect(await audio.receive(bad)).toBe(false);
    }
    await audio.receive(cue()); expect(await audio.receive(cue())).toBe(false);
    expect(speak).toHaveBeenCalledTimes(1);
  });
  it('drops disconnected, recording, background or conversation-busy cues without later replay', async () => {
    const { audio, cue, speak, state } = setup();
    state.connection = ''; await audio.receive(cue(1));
    state.connection = 'badge:2'; state.available = false; await audio.receive(cue(2));
    state.available = true; audio.stateChanged();
    expect(speak).not.toHaveBeenCalled();
    await audio.receive(cue(3)); expect(speak).toHaveBeenCalledTimes(1);
  });
  it('throttles changing observations and deduplicates repeated cues', async () => {
    const { audio, cue, state, speak } = setup();
    await audio.receive(cue(1)); state.now = 1000; await audio.receive(cue(2, '不同提示'));
    state.now = 6000; await audio.receive(cue(3)); expect(speak).toHaveBeenCalledTimes(1);
    state.now = 21000; await audio.receive(cue(4)); expect(speak).toHaveBeenCalledTimes(2);
  });
  it.each(['stop', 'disconnect', 'busy', 'dispose'])('aborts in-flight speech on %s and ignores late success', async action => {
    const { audio, cue, state, speak, status } = setup();
    let finish!: () => void;
    speak.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = audio.receive(cue());
    const signal = speak.mock.calls[0][1];
    if (action === 'stop') await audio.receive({ ...cue(2), type: 'stop' });
    if (action === 'disconnect') { state.connection = 'badge:2'; audio.stateChanged(); }
    if (action === 'busy') { state.available = false; audio.stateChanged(); }
    if (action === 'dispose') audio.dispose();
    expect(signal.aborted).toBe(true); finish(); await pending;
    expect(status).not.toHaveBeenCalledWith('语音已传给硬件 · 手机静音');
  });
  it('reports failed transfer honestly and remains usable for a fresh cue', async () => {
    const { audio, cue, state, speak, status } = setup();
    speak.mockRejectedValueOnce(new Error('missing system voice'));
    await audio.receive(cue()); expect(status.mock.lastCall?.[0]).toContain('手机静音');
    state.now = 21000; await audio.receive(cue(2)); expect(speak).toHaveBeenCalledTimes(2);
  });
});
