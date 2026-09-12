import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasSportsCameraAccess, rememberSportsCameraAccess, readSportsCameraAutoStart, saveSportsCameraAutoStart } from './cameraPreference';

afterEach(() => vi.unstubAllGlobals());
describe('shared sports camera preference', () => {
  it('does not authorize first-visit auto-start, then remembers success and opt-out', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    expect(readSportsCameraAutoStart()).toBeNull();
    expect(hasSportsCameraAccess()).toBe(false);
    saveSportsCameraAutoStart(true); expect(readSportsCameraAutoStart()).toBe(true);
    expect(hasSportsCameraAccess()).toBe(false);
    rememberSportsCameraAccess(); expect(hasSportsCameraAccess()).toBe(true);
    saveSportsCameraAutoStart(false); expect(readSportsCameraAutoStart()).toBe(false);
  });
  it('keeps auto-start off when preference storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(readSportsCameraAutoStart()).toBeNull();
    expect(() => saveSportsCameraAutoStart(true)).not.toThrow();
  });
});
