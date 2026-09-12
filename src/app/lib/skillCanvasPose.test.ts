import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureCanvasPose, summarizeCanvasPose } from './skillCanvasPose';
import { PoseWindow, type PoseFrame } from './sports/pose';

const detector = vi.hoisted(() => ({ close: vi.fn(), detectForVideo: vi.fn(() => ({ landmarks: [] })) }));
vi.mock('./sports/detector', () => ({ createSportsPoseDetector: vi.fn(async () => detector) }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.useRealTimers(); });

function setup(getUserMedia = vi.fn()) {
  const track = { stop: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const video = { pause: vi.fn(), play: vi.fn().mockResolvedValue(undefined), srcObject: null, readyState: 2, currentTime: 1,
    videoWidth: 640, videoHeight: 480 } as unknown as HTMLVideoElement;
  const canvas = { width: 640, height: 480, getContext: () => ({ clearRect: vi.fn() }) } as unknown as HTMLCanvasElement;
  vi.stubGlobal('window', { isSecureContext: true, setTimeout, clearTimeout });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 10));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  return { stream, track, surface: { video, canvas, onProgress: vi.fn() }, getUserMedia };
}

describe('Canvas camera lifecycle', () => {
  it('closes the model when camera permission is denied', async () => {
    const ctx = setup(vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')));
    await expect(captureCanvasPose(ctx.surface, new AbortController().signal)).rejects.toThrow('denied');
    expect(detector.close).toHaveBeenCalledOnce();
  });

  it('releases a camera granted after the user already cancelled', async () => {
    let resolve!: (stream: MediaStream) => void;
    const get = vi.fn(() => new Promise<MediaStream>(r => { resolve = r; }));
    const ctx = setup(get), controller = new AbortController();
    const result = captureCanvasPose(ctx.surface, controller.signal);
    const rejected = expect(result).rejects.toThrow();
    await vi.waitFor(() => expect(get).toHaveBeenCalled());
    controller.abort(); resolve(ctx.stream);
    await rejected;
    expect(ctx.track.stop).toHaveBeenCalledOnce();
    expect(ctx.surface.video.srcObject).toBeNull();
    expect(detector.close).toHaveBeenCalledOnce();
  });

  it('stops tracks and animation when a running observation is cancelled', async () => {
    const ctx = setup(), controller = new AbortController();
    ctx.getUserMedia.mockResolvedValue(ctx.stream);
    const result = captureCanvasPose(ctx.surface, controller.signal);
    const rejected = expect(result).rejects.toThrow('pose_cancelled');
    await vi.waitFor(() => expect(requestAnimationFrame).toHaveBeenCalled());
    controller.abort(); await rejected;
    expect(ctx.track.stop).toHaveBeenCalled();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(10);
    expect(ctx.surface.video.srcObject).toBeNull();
    expect(detector.close).toHaveBeenCalledOnce();
  });

  it('never reports a missing human as a completed observation', async () => {
    vi.useFakeTimers();
    const ctx = setup(); ctx.getUserMedia.mockResolvedValue(ctx.stream);
    const result = captureCanvasPose(ctx.surface, new AbortController().signal);
    const rejected = expect(result).rejects.toThrow('pose_full_body_not_visible');
    await vi.waitFor(() => expect(requestAnimationFrame).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(20000); await rejected;
    expect(ctx.track.stop).toHaveBeenCalled();
  });

  it('requires a continuous full-body window before producing angles', () => {
    const buffer = new PoseWindow();
    expect(() => summarizeCanvasPose(buffer, 640, 480)).toThrow('pose_observation_incomplete');
    const frame: PoseFrame = Array.from({ length: 17 }, (_, index) => [0.1 + index * .04, 0.1 + index * .04, .95]);
    for (let i = 0; i < 30; i++) buffer.add(frame, i * 50);
    const output = summarizeCanvasPose(buffer, 640, 480);
    expect(output.frames_observed).toBe(30);
    expect(output.angles_degrees).toEqual({ left_elbow: 180, right_elbow: 180, left_knee: 180, right_knee: 180 });
    expect(output.raw_frames_uploaded).toBe(false);
    expect(output).not.toHaveProperty('score');
  });
});
