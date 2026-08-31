import { describe, expect, it } from 'vitest';
import { ArrivalGate, arrivalBlockReason, publicPresence } from './frostPresence';
import type { BadgeStatus } from './frostBadge';
import { readFileSync } from 'node:fs';

const ready = (): BadgeStatus => ({ status: 'connected', connectionId: 'connection-one', devices: [],
  endpoints: ['avatar_skill_v1'], recording: false, receivedBytes: 0,
  avatar: { index: 0, status: 'ready' }, lastTouch: { count: 12, x: 30, y: 40 } });

describe('explicit one-shot companion arrival', () => {
  it('does not turn an old touch into a new arrival', () => {
    const gate = new ArrivalGate(), badge = ready();
    gate.arm(badge, 0, 100);
    expect(gate.accept('touch', badge, 0, 101)).toBe(false);
    badge.lastTouch!.count++;
    expect(gate.accept('touch', badge, 0, 102)).toBe(true);
    expect(gate.accept('touch', badge, 0, 103)).toBe(false);
  });
  it('accepts the first new touch when no previous touch exists', () => {
    const gate = new ArrivalGate(), badge = ready(); badge.lastTouch = undefined;
    gate.arm(badge, 0, 100);
    expect(gate.accept('touch', badge, 0, 101)).toBe(false);
    badge.lastTouch = { count: 1, x: 0, y: 0 };
    expect(gate.accept('touch', badge, 0, 102)).toBe(true);
  });
  it('requires explicit arming for a shake and accepts it only once', () => {
    const gate = new ArrivalGate(), badge = ready();
    expect(gate.accept('shake', badge, 0, 99)).toBe(false);
    gate.arm(badge, 0, 100);
    expect(gate.accept('shake', badge, 0, 101)).toBe(true);
    expect(gate.accept('shake', badge, 0, 102)).toBe(false);
  });
  it('expires at 20 seconds and supports explicit cancellation', () => {
    const gate = new ArrivalGate(), badge = ready();
    gate.arm(badge, 0, 100);
    expect(gate.accept('shake', badge, 0, 20_100)).toBe(false);
    gate.arm(badge, 0, 30_000); gate.cancel();
    expect(gate.accept('shake', badge, 0, 30_001)).toBe(false);
  });
  it.each(['disconnected', 'reconnected', 'recording', 'bird', 'avatar-loading', 'avatar-changed'])(
    'cancels on %s without replaying after recovery', reason => {
      const gate = new ArrivalGate(), badge = ready(); gate.arm(badge, 0, 100);
      if (reason === 'disconnected') badge.status = 'disconnected';
      if (reason === 'reconnected') badge.connectionId = 'connection-two';
      if (reason === 'recording') badge.recording = true;
      if (reason === 'bird') badge.bird = { enabled: true, active: true, busy: false, state: 'ready', message: '' };
      if (reason === 'avatar-loading') badge.avatar!.status = 'loading';
      if (reason === 'avatar-changed') badge.avatar!.index = 1;
      expect(gate.accept('shake', badge, 0, 101)).toBe(false);
      expect(gate.accept('shake', ready(), 0, 102)).toBe(false);
    });
  it('blocks arming until the matching avatar is actually ready', () => {
    const badge = ready(); badge.avatar = undefined;
    expect(() => new ArrivalGate().arm(badge, 0)).toThrow('等待');
    badge.avatar = { index: 0, status: 'ready' }; badge.endpoints = [];
    expect(arrivalBlockReason(badge, 0)).toContain('固件');
  });
});

describe('public-only widget data', () => {
  it('does not copy raw device, voice, recording or account data', () => {
    const badge = { ...ready(), pcm: new Uint8Array([42]), deviceId: 'private-device',
      nativeTranscript: { inputId: 'private-input', text: 'private medical transcript' } };
    expect(publicPresence('frost', 'heart', badge)).toEqual({ avatarIndex: 0, name: 'Frost Caramel Dachshund',
      pose: 'heart', connected: true, battery: null });
  });
  it.each([null, -1, 101, NaN, 3.5])('keeps invalid battery %s unknown', percent => {
    const badge = ready(); badge.battery = { valid: true, percent, millivolts: 3900, milliamps: 0, charging: false, full: false };
    expect(publicPresence('frost', 'idle', badge).battery).toBeNull();
  });
  it('uses a real battery and clears it on disconnect', () => {
    const badge = ready(); badge.battery = { valid: true, percent: 72, millivolts: 3900, milliamps: 0, charging: false, full: false };
    expect(publicPresence('frost', 'idle', badge).battery).toBe(72);
    badge.status = 'disconnected';
    expect(publicPresence('frost', 'idle', badge).battery).toBeNull();
  });
  it('keeps the native app and extension on the same shared container', () => {
    const group = 'group.art.throughtheglass.pocketbuddy';
    for (const file of ['ios/App/App/HealthKit.entitlements', 'native/frost-presence/Presence.entitlements', 'native/frost-presence/PocketPresenceState.swift']) {
      expect(readFileSync(file, 'utf8')).toContain(group);
    }
    const project = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
    expect(project).toContain('Embed App Extensions');
    expect(project).toContain('art.throughtheglass.pocketbuddy.companion');
  });
});
