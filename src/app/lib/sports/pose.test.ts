import { describe, expect, it } from 'vitest';
import { SPORTS, actionForRequest, PoseWindow, toCoco17, fullBodyVisible, type PoseFrame } from './pose';

const frame = (): PoseFrame => Array.from({ length: 17 }, () => [.5, .5, .95]);

describe('sports pose observation windows', () => {
  it('prefills an explicitly named action from a Frost request without matching fragments', () => {
    expect(actionForRequest(SPORTS[1], 'Practice basketball shooting')).toBe(3);
    expect(actionForRequest(SPORTS[1], '练篮球投篮')).toBe(3);
    expect(actionForRequest(SPORTS[0], 'Observe my badminton posture')).toBe(1);
    expect(actionForRequest(SPORTS[0], 'Open badminton serve')).toBe(5);
  });

  it('maps MediaPipe shoulders, hips and ankles to COCO without losing confidence', () => {
    const landmarks = Array.from({ length: 33 }, (_, i) => ({ x: i / 33, y: .5, visibility: .9 }));
    const coco = toCoco17(landmarks)!;
    expect(coco).toHaveLength(17);
    expect(coco[5]).toEqual([11 / 33, .5, .9]);
    expect(coco[11]).toEqual([23 / 33, .5, .9]);
    expect(coco[16]).toEqual([28 / 33, .5, .9]);
    expect(toCoco17([])).toBeNull();
    expect(fullBodyVisible(toCoco17(landmarks.map(({ x, y }) => ({ x, y })))!)).toBe(false);
  });

  it('requires visible head and whole body, rejects non-finite or off-frame points', () => {
    expect(fullBodyVisible(frame())).toBe(true);
    for (const joint of [0, 5, 9, 11, 13, 16]) {
      const missing = frame(); missing[joint][2] = .3;
      expect(fullBodyVisible(missing)).toBe(false);
    }
    const offscreen = frame(); offscreen[16][0] = 1.2;
    expect(fullBodyVisible(offscreen)).toBe(false);
    const invalid = frame(); invalid[3][0] = NaN;
    expect(fullBodyVisible(invalid)).toBe(false);
  });

  it('needs 30 consecutive frames and never bridges tracking loss or a pause', () => {
    const window = new PoseWindow();
    for (let i = 0; i < 29; i++) expect(window.add(frame(), i * 50)).toBe(false);
    expect(window.add(frame(), 1450)).toBe(true);
    expect(window.add(null, 1500)).toBe(false);
    expect(window.frames).toHaveLength(0);
    expect(window.add(frame(), 1550)).toBe(false);
    expect(window.add(frame(), 1900)).toBe(false);
    expect(window.timestamps).toEqual([1900]);
    expect(window.add(frame(), 1900)).toBe(false);
    expect(window.timestamps).toEqual([1900]);
  });

  it('bounds requests to 60 frames and snapshots each window before it changes', () => {
    const window = new PoseWindow();
    for (let i = 0; i < 80; i++) window.add(frame(), i * 50);
    const request = window.payload('basketball', 3, 960, 720);
    expect(request.frames).toHaveLength(60);
    expect(request.timestamps[0]).toBe(1000);
    expect(request).toMatchObject({ sport: 'basketball', action: 3, width: 960, height: 720 });
    window.reset();
    expect(request.frames).toHaveLength(60);
    expect(window.frames).toHaveLength(0);
  });
});
