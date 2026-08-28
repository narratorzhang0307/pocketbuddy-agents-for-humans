import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrostTaskHandoff } from '../../../../frost-agent/harness/taskHandoff';
import { cameraPreference, consumeCameraAutoStart, rememberCamera } from '../../../../vendor/her-motion/src/cameraPreference';
import { createFrostBridge } from '../../../../vendor/her-motion/src/frostBridge';
import { buildHerMotionSkillUrl, createHerMotionSession } from './herMotionSession';

const now = Date.parse('2026-08-27T15:30:00Z');
const handoff: FrostTaskHandoff = {
  protocol: 'pocket-frost-task/v1', planId: 'plan:her-motion', stepId: 'step:1',
  skillId: 'pocket.her-motion', skillName: 'Her Motion', target: 'her-motion',
  expertId: 'frost', expertName: 'Frost', expertRole: '动作陪伴',
  runId: 'plan:her-motion:step:1', objective: '打开女性运动', userText: '调用女性运动 Agent',
  agentSessionId: 'frost:current', status: 'dispatched', createdAt: new Date(now).toISOString(),
};

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
}
function openFrame(nextHandoff: FrostTaskHandoff | null = handoff, parent = 'capacitor://localhost/') {
  window.location = new URL(parent) as unknown as Location;
  const session = createHerMotionSession();
  const url = new URL(buildHerMotionSkillUrl('/her-motion/index.html', session, nextHandoff));
  window.location = url as unknown as Location;
  return url;
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  const local = storage();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('window', { location: new URL('capacitor://localhost/'), localStorage: local,
    sessionStorage: storage(), dispatchEvent: vi.fn(), parent: { postMessage: vi.fn() } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Frost → Her Motion direct camera handoff', () => {
  it.each(['capacitor://localhost/', 'https://pocketbuddy.throughtheglass.art/', 'https://pocket-buddy.throughtheglass.art/', 'http://localhost:5173/'])('requests the camera on a first explicit launch at %s without pretending permission was granted', parent => {
    const url = openFrame(handoff, parent);
    expect(url.searchParams.get('frost_auto_camera')).toBe('1');
    expect(url.searchParams.get('frost_run_id')).toBe(handoff.runId);
    expect(cameraPreference()).toEqual({ enabled: true, granted: false });
    expect(consumeCameraAutoStart(createFrostBridge())).toBe(true);
    expect(cameraPreference().granted).toBe(false);
    expect(url.search).not.toContain(encodeURIComponent(handoff.userText));
  });

  it.each([
    null, { ...handoff, agentSessionId: undefined }, { ...handoff, runId: '' },
    { ...handoff, userText: ' ' }, { ...handoff, target: 'lianlema-coach' },
    { ...handoff, skillId: 'pocket.lianlema' }, { ...handoff, createdAt: 'invalid' },
    { ...handoff, createdAt: new Date(now - 120001).toISOString() },
    { ...handoff, createdAt: new Date(now + 1000).toISOString() },
  ])('does not mark an absent, stale or unrelated handoff as a direct camera request: %j', value => {
    expect(openFrame(value).searchParams.has('frost_auto_camera')).toBe(false);
    expect(consumeCameraAutoStart(createFrostBridge())).toBe(false);
  });

  it('does not inherit camera-start flags from a saved launch URL', () => {
    const url = new URL(buildHerMotionSkillUrl('/her-motion/index.html?frost_auto_camera=1&frost_run_id=old&frost_requested_at=old', createHerMotionSession()));
    for (const key of ['frost_auto_camera', 'frost_run_id', 'frost_requested_at']) expect(url.searchParams.has(key)).toBe(false);
  });

  it('consumes a run once even if the frame reloads or a new session is created for the same run', () => {
    openFrame();
    expect(consumeCameraAutoStart(createFrostBridge())).toBe(true);
    rememberCamera(true, true);
    expect(consumeCameraAutoStart(createFrostBridge())).toBe(false);
    openFrame();
    expect(consumeCameraAutoStart(createFrostBridge())).toBe(false);
    openFrame({ ...handoff, runId: 'new:explicit:run' });
    expect(consumeCameraAutoStart(createFrostBridge())).toBe(true);
  });

  it('honors camera auto-start opt-out and does not retry a denied run', () => {
    openFrame(); rememberCamera(false, true);
    expect(consumeCameraAutoStart(createFrostBridge())).toBe(false);
    rememberCamera(true, false);
    expect(consumeCameraAutoStart(createFrostBridge())).toBe(true);
    rememberCamera(true, false); // getUserMedia rejected; no invented permission grant.
    expect(consumeCameraAutoStart(createFrostBridge())).toBe(false);
  });

  it('keeps the existing remembered-camera behavior on ordinary embedded visits', () => {
    openFrame(null);
    expect(consumeCameraAutoStart(createFrostBridge())).toBe(false);
    rememberCamera(true, true);
    expect(consumeCameraAutoStart(createFrostBridge())).toBe(true);
    expect(consumeCameraAutoStart(null)).toBe(false);
  });

  it.each([
    ['frost_auto_camera', '0'], ['frost_session_id', 'other-session'], ['frost_embed', '0'],
    ['frost_skill_id', 'pocket.lianlema'], ['frost_origin', 'https://unrelated.example'],
    ['frost_run_id', ''], ['frost_requested_at', 'invalid'],
    ['frost_requested_at', new Date(now - 120001).toISOString()],
    ['frost_requested_at', new Date(now + 1000).toISOString()],
  ])('does not start from a mismatched or expired frame flag %s=%s, even with remembered permission', (key, value) => {
    const url = openFrame(), bridge = createFrostBridge();
    rememberCamera(true, true);
    url.searchParams.set(key, value);
    expect(consumeCameraAutoStart(bridge)).toBe(false);
  });

  it('fails closed for a direct launch when replay protection cannot be stored', () => {
    openFrame(); rememberCamera(true, true);
    Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('blocked'); } });
    expect(consumeCameraAutoStart(createFrostBridge())).toBe(false);
  });
});
