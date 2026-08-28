import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Run the real portable engine with fake Expo audio and IPC, never a real device/API.
function engine(badge = true) {
  const play = vi.fn(async (_key: string) => {}), stop = vi.fn();
  const phone = { setAudioModeAsync: vi.fn(async () => {}), Sound: { createAsync: vi.fn() } };
  const source = readFileSync(new URL('../../../lianlema-portable/app_project/app/src/voice/coachAudio.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports: Record<string, (...args: any[]) => any> = {};
  runInNewContext(output, { exports, setTimeout, clearTimeout, setInterval, clearInterval, Date,
    require: (name: string) => {
      if (name === 'expo-av') return { Audio: phone };
      if (name === './badgeCoachAudio') return { badgeAudioRequested: badge, badgeCoachAudio: { play, stop } };
      if (name.endsWith('.mp3')) return 1;
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  return { api: exports, play, stop, phone };
}
afterEach(() => { vi.useRealTimers(); });
describe('coach voice scheduling', () => {
  it('routes intro, counts and correction recordings to the badge and never creates phone sound', async () => {
    vi.useFakeTimers(); const e = engine();
    const intro = e.api.playIntro('squat'); await vi.advanceTimersByTimeAsync(250); await intro;
    await vi.advanceTimersByTimeAsync(1000);
    e.api.playGenericFeedback(1, true); await vi.advanceTimersByTimeAsync(1000);
    e.api.playGenericFeedback(1, false, '请站到画面中央，让全身尽量完整入镜。');
    await vi.advanceTimersByTimeAsync(100);
    expect(e.play.mock.calls.map(c => c[0])).toEqual(['intro_squat', 'rep_1', 'no_person']);
    expect(e.phone.Sound.createAsync).not.toHaveBeenCalled();
    expect(e.phone.setAudioModeAsync).not.toHaveBeenCalled(); await e.api.stopCoachAudio();
  });
  it('repeated frame corrections do not cut off the same sentence', async () => {
    vi.useFakeTimers(); const e = engine();
    e.play.mockImplementation(() => new Promise(() => {}));
    e.api.playGenericFeedback(0, false, '请站到画面中央，让全身尽量完整入镜。');
    for (let i = 0; i < 8; i++) { await vi.advanceTimersByTimeAsync(650); e.api.playGenericFeedback(0, false, '请站到画面中央，让全身尽量完整入镜。'); }
    expect(e.play).toHaveBeenCalledTimes(1); await e.api.stopCoachAudio();
  });
  it('keeps the latest queued count and cancels the pending timer when paused', async () => {
    vi.useFakeTimers(); const e = engine();
    e.api.playGenericFeedback(1, true); await vi.advanceTimersByTimeAsync(10);
    e.api.playGenericFeedback(2, true); e.api.playGenericFeedback(3, true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(e.play.mock.calls.map(c => c[0])).toEqual(['rep_1', 'rep_3']);
    e.api.playGenericFeedback(4, true); await e.api.stopCoachAudio();
    await vi.advanceTimersByTimeAsync(10000);
    expect(e.play.mock.calls.map(c => c[0])).toEqual(['rep_1', 'rep_3']);
  });
  it('badge errors never fall back to the phone', async () => {
    vi.useFakeTimers(); const e = engine(); e.play.mockRejectedValue(new Error('disconnected'));
    e.api.playGenericFeedback(1, true); await vi.advanceTimersByTimeAsync(1000);
    expect(e.phone.Sound.createAsync).not.toHaveBeenCalled(); await e.api.stopCoachAudio();
  });
  it('the standalone coach retains its original phone audio path', async () => {
    vi.useFakeTimers(); const e = engine(false);
    const sound = { setOnPlaybackStatusUpdate: vi.fn(), playAsync: vi.fn(async () => {}), stopAsync: vi.fn(async () => {}), unloadAsync: vi.fn(async () => {}) };
    e.phone.Sound.createAsync.mockResolvedValue({ sound });
    e.api.playGenericFeedback(1, true); await vi.advanceTimersByTimeAsync(10);
    expect(sound.playAsync).toHaveBeenCalledOnce(); expect(e.play).not.toHaveBeenCalled(); await e.api.stopCoachAudio();
  });
});
