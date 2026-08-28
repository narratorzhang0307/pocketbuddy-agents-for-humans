import { describe, expect, it } from 'vitest';
import { BadgeManifest, BadgeRecording, badgeCommand, parseBadgeBattery, parseBadgeFrame, pcmWave } from './frostBadgeProtocol';

describe('Frost OJBadge protocol', () => {
  it('round trips commands and rejects truncated or falsely encrypted frames', () => {
    const frame = badgeCommand(0x33, 17, Uint8Array.of(1, 2));
    expect(parseBadgeFrame(frame)).toEqual({ kind: 1, command: 0x33, sequence: 17, payload: Uint8Array.of(1, 2) });
    expect(() => parseBadgeFrame(frame.slice(0, -1))).toThrow();
    frame[1] = 0x81;
    expect(() => parseBadgeFrame(frame)).toThrow();
  });
  it('reassembles UTF-8 manifest fragments and rejects gaps', () => {
    const m = new BadgeManifest();
    const text = new TextEncoder().encode(JSON.stringify({ caps: 167, io: [{ id: 'speaker0', desc: '扬声器' }] }));
    expect(m.push(Uint8Array.from([0, 0, ...text.slice(0, 29)]))).toBeUndefined();
    expect(m.push(Uint8Array.from([1, 1, ...text.slice(29)]))?.io[0].id).toBe('speaker0');
    expect(() => m.push(Uint8Array.of(3, 1, 125))).toThrow(/丢包/);
  });
  it('keeps battery unknown separate from empty and decodes signed current', () => {
    const p = Uint8Array.of(1, 2, 1, 42, 0xd8, 0x0e, 0x51, 0xff, 9, 0);
    expect(parseBadgeBattery(p)).toMatchObject({ valid: true, percent: 42, milliamps: -175, charging: false });
    p[2] = 0; p[3] = 255;
    expect(parseBadgeBattery(p)).toMatchObject({ valid: false, percent: null });
  });
  it('requires complete ordered audio and produces a real mono 16k WAV', () => {
    const r = new BadgeRecording();
    const p = Uint8Array.of(9, 0, 0, 0, 0, 0, 0, 0, 0, 12, 0, 24, 0);
    r.push(p);
    expect(() => r.finish(3)).toThrow(/不完整/);
    const wave = pcmWave(r.finish(2));
    expect(new DataView(wave.buffer).getUint32(24, true)).toBe(16000);
    expect(wave.slice(44)).toEqual(p.slice(9));
    p[4] = 2; r.push(p);
    expect(() => r.finish(4)).toThrow(/丢包/);
  });
});
