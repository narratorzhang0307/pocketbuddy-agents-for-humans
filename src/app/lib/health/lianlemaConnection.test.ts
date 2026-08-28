import { describe, expect, it } from 'vitest';
import { isLianlemaReadyMessage, resolveLianlemaConnection, shouldAutoStartLianlema } from './lianlemaConnection';

describe('练了吗 service address boundaries', () => {
  it('allows a fresh explicit Frost handoff to skip GO, but never history, stale or unrelated tasks', () => {
    const now = Date.now();
    const handoff = { target: 'lianlema-coach', skillId: 'pocket.lianlema', createdAt: new Date(now).toISOString(),
      runId: 'run:fitness', userText: '调用健身agent', agentSessionId: 'frost:current' };
    expect(shouldAutoStartLianlema(handoff, now)).toBe(true);
    expect(shouldAutoStartLianlema(null, now)).toBe(false);
    for (const patch of [{ userText: '' }, { agentSessionId: undefined }, { runId: '' }, { target: 'other' },
      { skillId: 'other' }, { createdAt: 'invalid' }, { createdAt: new Date(now - 120001).toISOString() },
      { createdAt: new Date(now + 1000).toISOString() }]) {
      expect(shouldAutoStartLianlema({ ...handoff, ...patch }, now)).toBe(false);
    }
  });
  it('keeps the desktop loopback runtime and matches the host alias', () => {
    expect(resolveLianlemaConnection('http://localhost:8082/', 'http://127.0.0.1:5173/', false))
      .toMatchObject({ url: 'http://127.0.0.1:8082/', issue: null });
  });

  it.each(['localhost', '127.0.0.1', '[::1]', '0.0.0.0', 'coach.localhost'])('never loads %s as the Mac service from native iOS', (host) => {
    expect(resolveLianlemaConnection(`http://${host}:8082/`, 'capacitor://localhost/index.html', true))
      .toMatchObject({ url: null, issue: 'desktop-only' });
  });

  it('also blocks desktop loopback from a phone visiting a LAN or deployed website', () => {
    for (const page of ['http://192.168.1.10:5173/', 'https://pocketbuddy.example/']) {
      expect(resolveLianlemaConnection('http://localhost:8082/', page, false).issue).toBe('desktop-only');
    }
  });

  it('requires HTTPS for a remotely served coach on the phone', () => {
    expect(resolveLianlemaConnection('http://192.168.1.10:8082/', 'capacitor://localhost/', true))
      .toMatchObject({ url: null, issue: 'https-required' });
  });

  it('accepts an explicitly configured HTTPS coach without changing its host or path', () => {
    expect(resolveLianlemaConnection('https://coach.example/lianlema/', 'capacitor://localhost/', true))
      .toMatchObject({ url: 'https://coach.example/lianlema/', issue: null });
  });

  it.each(['javascript:alert(1)', 'file:///coach.html', 'https://user:password@coach.example/', 'not a URL'])('rejects unsafe or ambiguous launch URLs: %s', (url) => {
    expect(resolveLianlemaConnection(url, 'capacitor://localhost/', true))
      .toMatchObject({ url: null, issue: 'invalid-url' });
  });

  it('requires the actual coach application handshake, not an iframe load/error page', () => {
    expect(isLianlemaReadyMessage({ protocol: 'pocket-lianlema/v1', type: 'view-ready' })).toBe(true);
    for (const value of [null, 'ready', {}, { type: 'view-ready' }, { protocol: 'other', type: 'view-ready' }]) {
      expect(isLianlemaReadyMessage(value)).toBe(false);
    }
  });
});
