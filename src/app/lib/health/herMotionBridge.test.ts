import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFrostBridge, HER_MOTION_AUDIO_PROTOCOL } from '../../../../vendor/her-motion/src/frostBridge';
import { buildHerMotionSkillUrl, createHerMotionSession, installHerMotionBridge, HER_MOTION_BRIDGE_PROTOCOL } from './herMotionSession';

afterEach(() => vi.unstubAllGlobals());
describe('Her Motion native frame handshake', () => {
  it('preserves the capacitor parent identity instead of passing the opaque string null', () => {
    vi.stubGlobal('window', { location: { href: 'capacitor://localhost/', origin: 'null' }, dispatchEvent: vi.fn() });
    const url = new URL(buildHerMotionSkillUrl('/her-motion/index.html', createHerMotionSession()));
    expect(url.searchParams.get('frost_origin')).toBe('capacitor://localhost');
    expect(url.pathname).toBe('/her-motion/index.html');
  });
  it('enters embedded mode on iPhone and reports the real opened event to its parent', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('window', { location: { search: '?frost_session_id=her-motion-test&frost_origin=capacitor%3A%2F%2Flocalhost&frost_embed=1' }, parent: { postMessage } });
    const bridge = createFrostBridge();
    expect(bridge?.embedded).toBe(true);
    bridge?.send('opened');
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ protocol: HER_MOTION_BRIDGE_PROTOCOL, sessionId: 'her-motion-test', type: 'opened' }), '*');
    bridge?.speak('请完整入镜'); bridge?.stopSpeech();
    expect(postMessage).toHaveBeenNthCalledWith(2, { protocol: HER_MOTION_AUDIO_PROTOCOL, sessionId: 'her-motion-test', id: 1, type: 'speak', text: '请完整入镜' }, '*');
    expect(postMessage).toHaveBeenNthCalledWith(3, { protocol: HER_MOTION_AUDIO_PROTOCOL, sessionId: 'her-motion-test', id: 2, type: 'stop' }, '*');
  });
  it('accepts an opaque native origin only from the exact frame and current session', () => {
    const saved = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
    const frame = {} as Window;
    let listener!: (event: MessageEvent) => void;
    vi.stubGlobal('window', { location: { href: 'capacitor://localhost/' }, dispatchEvent: vi.fn(), addEventListener: (_type: string, fn: typeof listener) => { listener = fn; }, removeEventListener: vi.fn() });
    const current = createHerMotionSession(), foreign = createHerMotionSession();
    installHerMotionBridge('/her-motion/index.html', () => frame, current.sessionId);
    const send = (source: unknown, sessionId: string) => listener({ origin: 'null', source, data: { protocol: HER_MOTION_BRIDGE_PROTOCOL, sessionId, type: 'opened', at: new Date().toISOString() } } as MessageEvent);
    send({}, current.sessionId); send(null, current.sessionId); send(frame, foreign.sessionId);
    expect(JSON.parse(saved.get('pe.health.her-motion-sessions.v1')!).every((s: { events: unknown[] }) => s.events.length === 1)).toBe(true);
    send(frame, current.sessionId);
    expect(JSON.parse(saved.get('pe.health.her-motion-sessions.v1')!).find((s: { sessionId: string }) => s.sessionId === current.sessionId).events.at(-1).type).toBe('opened');
  });
});
