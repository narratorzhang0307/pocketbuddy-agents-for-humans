import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COACH_AUDIO_CLIPS, COACH_AUDIO_PROTOCOL, LianlemaBadgeAudio, loadCoachPcm, type CoachAudioPort } from './lianlemaBadgeAudio';
import { BadgeCoachAudio, BADGE_AUDIO_PROTOCOL } from '../../../lianlema-portable/app_project/app/src/voice/badgeCoachAudio';

const session = '11111111-1111-4111-8111-111111111111';
const request = (id: number, key = 'rep_1') => ({ protocol: COACH_AUDIO_PROTOCOL, session, type: 'play', id, key });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function fixture() {
  let connection: string | undefined = 'badge-1', available = true;
  const port: CoachAudioPort = { connection: () => connection, available: () => available,
    load: vi.fn(async () => new Uint8Array(320)), play: vi.fn(async () => {}), stop: vi.fn(async () => {}),
    reply: vi.fn(), status: vi.fn() };
  return { port, host: new LianlemaBadgeAudio(session, port),
    disconnect: () => { connection = undefined; }, reconnect: () => { connection = 'badge-2'; },
    record: () => { available = false; } };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('existing coach recordings -> badge only', () => {
  it('packages every original recording as bounded, verified PCM with no generated voice', () => {
    const source = readFileSync(new URL('../../../lianlema-portable/app_project/app/src/voice/coachAudio.ts', import.meta.url), 'utf8');
    const keys = [...source.matchAll(/(\w+):\s*require\("\.\.\/\.\.\/assets\/audio\/\1\.mp3"\)/g)].map(m => m[1]);
    expect(Object.keys(COACH_AUDIO_CLIPS).sort()).toEqual(keys.sort());
    expect(keys.length).toBe(64);
    for (const clip of Object.values(COACH_AUDIO_CLIPS)) {
      const bytes = readFileSync(new URL(`../../../public${clip.path}`, import.meta.url));
      expect(bytes.length).toBe(clip.bytes);
      expect(bytes.length % 2).toBe(0);
      expect(bytes.length).toBeLessThanOrEqual(960000);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(clip.sha256);
      expect(clip.durationMs).toBe(bytes.length / 32);
    }
  });
  it('plays only one verified request; duplicates, foreign sessions and arbitrary URLs cannot play', async () => {
    const { host, port } = fixture();
    for (const bad of [null, { ...request(1), session: 'other' }, request(1, 'https://evil/audio'),
      request(1, '__proto__'), { ...request(1), type: 'task' }, { ...request(1), id: NaN }]) expect(await host.receive(bad)).toBe(false);
    expect(port.play).not.toHaveBeenCalled();
    expect(await host.receive(request(1))).toBe(true);
    expect(await host.receive(request(1))).toBe(false);
    expect(port.play).toHaveBeenCalledTimes(1);
    expect(port.play).toHaveBeenCalledWith(new Uint8Array(320), { gain: 'max' });
    expect(port.reply).toHaveBeenCalledWith(expect.objectContaining({ id: 1, status: 'transferred' }));
    host.dispose();
  });
  it.each(['disconnect', 'record'] as const)('does not load or play when %s; never falls back to the phone', async change => {
    const f = fixture(); f[change]();
    await f.host.receive(request(1));
    expect(f.port.load).not.toHaveBeenCalled(); expect(f.port.play).not.toHaveBeenCalled();
    expect(f.port.reply).toHaveBeenCalledWith(expect.objectContaining({ status: 'unavailable' }));
    f.host.dispose();
  });
  it.each(['disconnect', 'record', 'reconnect'] as const)('drops an in-flight file after %s', async change => {
    const f = fixture();
    let letResolved!: (pcm: Uint8Array) => void;
    vi.mocked(f.port.load).mockImplementation(() => new Promise(resolve => { letResolved = resolve; }));
    const playing = f.host.receive(request(1)); await flush();
    f[change](); f.host.stateChanged();
    letResolved(new Uint8Array(320)); await playing;
    expect(f.port.play).not.toHaveBeenCalled();
    expect(f.port.reply).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'transferred' }));
    f.host.dispose();
  });
  it('stopping a slow load and starting a new clip cannot replay the old one', async () => {
    const f = fixture(); let resolveOld!: (pcm: Uint8Array) => void;
    vi.mocked(f.port.load).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    const old = f.host.receive(request(1)); await flush();
    await f.host.receive({ ...request(2), type: 'stop' });
    await f.host.receive(request(3, 'rep_2'));
    resolveOld(new Uint8Array(640)); await old;
    expect(f.port.play).toHaveBeenCalledTimes(1);
    expect(f.port.play).toHaveBeenCalledWith(new Uint8Array(320), { gain: 'max' });
    f.host.dispose(); expect(await f.host.receive(request(4))).toBe(false);
  });
  it('file failures are silent and report cancellation', async () => {
    const { host, port } = fixture(); vi.mocked(port.load).mockRejectedValue(new Error('bad hash'));
    await host.receive(request(1));
    expect(port.play).not.toHaveBeenCalled();
    expect(port.reply).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' })); host.dispose();
  });
  it('reads a packaged path and verifies its bytes; rejects substituted or unknown assets', async () => {
    const clip = COACH_AUDIO_CLIPS.rep_1;
    const bytes = readFileSync(new URL(`../../../public${clip.path}`, import.meta.url));
    const fetcher = vi.fn(async () => new Response(bytes)); vi.stubGlobal('fetch', fetcher);
    expect(await loadCoachPcm('rep_1', new AbortController().signal)).toEqual(new Uint8Array(bytes));
    expect(fetcher).toHaveBeenCalledWith(clip.path, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    await expect(loadCoachPcm('../foo', new AbortController().signal)).rejects.toThrow();
    fetcher.mockResolvedValue(new Response(new Uint8Array(COACH_AUDIO_CLIPS.rep_2.bytes)));
    await expect(loadCoachPcm('rep_2', new AbortController().signal)).rejects.toThrow('integrity');
  });
  it('child accepts only its matching reply and cancels on timeout or pause without phone output', async () => {
    vi.useFakeTimers(); let receive!: (data: any) => void;
    const post = vi.fn(), unlisten = vi.fn();
    const child = new BadgeCoachAudio({ session, post, listen: callback => { receive = callback; return unlisten; } });
    expect(BADGE_AUDIO_PROTOCOL).toBe(COACH_AUDIO_PROTOCOL);
    const pending = child.play('rep_1');
    receive({ protocol: BADGE_AUDIO_PROTOCOL, session: 'wrong', type: 'result', id: 1, status: 'transferred' });
    receive({ protocol: BADGE_AUDIO_PROTOCOL, session, type: 'result', id: 1, status: 'transferred' });
    await expect(pending).resolves.toBeUndefined();
    const cancelled = child.play('rep_2'); const check = expect(cancelled).rejects.toThrow();
    child.stop(); await check;
    const timedOut = child.play('rep_3'); const timeout = expect(timedOut).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(45000); await timeout;
    expect(post).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'stop' }));
    child.dispose(); expect(unlisten).toHaveBeenCalledOnce();
  });
});
