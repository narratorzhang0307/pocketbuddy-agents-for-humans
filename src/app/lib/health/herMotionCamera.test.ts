import { afterEach, describe, expect, it, vi } from 'vitest';
import { cameraPreference, rememberCamera, shouldResumeCamera } from '../../../../vendor/her-motion/src/cameraPreference';
afterEach(() => vi.unstubAllGlobals());
describe('Her Motion remembered camera choice', () => {
  it('never auto-opens on first visit, resumes after real success, and respects opt-out/revocation', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => data.get(key), setItem: (key: string, value: string) => data.set(key, value) } });
    expect(cameraPreference()).toEqual({ enabled: true, granted: false });
    expect(shouldResumeCamera()).toBe(false);
    rememberCamera(true, true); expect(shouldResumeCamera()).toBe(true);
    rememberCamera(false); expect(shouldResumeCamera()).toBe(false);
    rememberCamera(true); expect(shouldResumeCamera()).toBe(true);
    rememberCamera(true, false); expect(shouldResumeCamera()).toBe(false);
  });
  it('does not treat blocked storage or malformed data as permission', () => {
    vi.stubGlobal('window', { get localStorage() { throw new Error('blocked'); } });
    rememberCamera(true, true); expect(shouldResumeCamera()).toBe(false);
    vi.stubGlobal('window', { localStorage: { getItem: () => 'not-json' } });
    expect(shouldResumeCamera()).toBe(false);
  });
});
