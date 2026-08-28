import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeVideo, validateVideoFile, videoSampleTimes, waitForVideoAnalysis }
  from '../../../lianlema-portable/app_project/app/src/video/videoAnalysis';
import { readVideoFrame, type VideoRotation } from '../../../lianlema-portable/app_project/app/src/video/videoFrames';
import type { FormContext } from '../../../lianlema-portable/app_project/app/src/analysis/FormAnalysisProvider';

afterEach(() => vi.useRealTimers());
const frame = (overrides = {}) => ({ status: 'conclusive' as const, isStandard: true, confidence: 'high' as const,
  problemAreas: [], repCount: 1, visibleKeypoints: 17, inferenceMs: 123, ...overrides });
function setup(overrides = {}) {
  return { duration: 0.6, exercise: 'squat' as const, consent: true, signal: new AbortController().signal,
    provider: { analyze: vi.fn(async (_context: FormContext) => frame()), stop: vi.fn(async () => null) },
    frameAt: vi.fn(async (time: number) => `jpeg:${time}`), onProgress: vi.fn(), wait: vi.fn(async (_ms: number, _signal: AbortSignal) => {}), ...overrides };
}

describe('pre-recorded video analysis', () => {
  it('validates file type/size and bounds decoded duration before any upload', () => {
    expect(() => validateVideoFile({ name: 'demo.MOV', type: '', size: 1024 })).not.toThrow();
    for (const value of [{ name: 'x.txt', type: 'text/plain', size: 10 }, { name: 'x.mp4', type: 'video/mp4', size: 0 },
      { name: 'x.mp4', type: 'video/mp4', size: 101 * 1024 * 1024 }]) expect(() => validateVideoFile(value)).toThrow();
    for (const duration of [NaN, Infinity, 0, -1, 60.01]) expect(() => videoSampleTimes(duration)).toThrow();
    expect(videoSampleTimes(60)).toHaveLength(240);
    const tiny = videoSampleTimes(0.001); expect(tiny[0]).toBeGreaterThan(0); expect(tiny[0]).toBeLessThan(0.001);
    expect(videoSampleTimes(0.6)).toEqual([0.01, 0.26, 0.51]);
  });

  it('does not decode or call the model without video-specific consent', async () => {
    const input = setup({ consent: false });
    await expect(analyzeVideo(input)).rejects.toThrow('同意');
    expect(input.frameAt).not.toHaveBeenCalled(); expect(input.provider.analyze).not.toHaveBeenCalled();
  });

  it('sends ordered frames through one real-provider contract and closes its session', async () => {
    const input = setup();
    input.provider.analyze.mockResolvedValueOnce(frame({ repCount: 0 }));
    input.provider.analyze.mockResolvedValueOnce(frame({ isStandard: false, correctionText: '保持膝盖稳定' }));
    input.provider.analyze.mockResolvedValueOnce(frame({ repCount: 2, isStandard: false, correctionText: '保持膝盖稳定' }));
    const result = await analyzeVideo(input);
    expect(input.provider.analyze.mock.calls.map(call => call[0])).toEqual([
      { exercise: 'squat', imageBase64: 'jpeg:0.01' }, { exercise: 'squat', imageBase64: 'jpeg:0.26' },
      { exercise: 'squat', imageBase64: 'jpeg:0.51' },
    ]);
    expect(result).toMatchObject({ processed: 3, total: 3, usableFrames: 3, reps: 2,
      corrections: [{ text: '保持膝盖稳定', time: 0.26 }] });
    expect(input.wait).toHaveBeenCalledTimes(2); expect(input.wait.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(500);
    expect(input.provider.stop).toHaveBeenCalledOnce();
    expect(input.onProgress.mock.calls[0]?.[0].corrections).toEqual([]); // snapshots do not mutate later
  });

  it('keeps blank/no-person video inconclusive rather than claiming a zero-rep workout was successful', async () => {
    const input = setup();
    input.provider.analyze.mockResolvedValue(frame({ status: 'inconclusive', isStandard: false, repCount: 0, visibleKeypoints: 0 }));
    expect(await analyzeVideo(input)).toMatchObject({ processed: 3, usableFrames: 0, reps: 0, corrections: [] });
  });

  it('retries only frames explicitly rejected before inference, without decoding or counting them twice', async () => {
    const input = setup({ duration: 0.2 });
    input.provider.analyze.mockRejectedValueOnce(new Error('inference_busy')).mockRejectedValueOnce(new Error('frame_rate_limited'));
    expect(await analyzeVideo(input)).toMatchObject({ processed: 1, reps: 1 });
    expect(input.frameAt).toHaveBeenCalledOnce(); expect(input.onProgress).toHaveBeenCalledOnce();
    expect(input.provider.analyze.mock.calls.map(call => call[0].imageBase64)).toEqual(['jpeg:0.01', 'jpeg:0.01', 'jpeg:0.01']);
    expect(input.wait.mock.calls.map(call => call[0])).toEqual([750, 1500]);
  });

  it('bounds busy retries and never replays a frame after an ambiguous network failure', async () => {
    const busy = setup(); busy.provider.analyze.mockRejectedValue(new Error('inference_busy'));
    await expect(analyzeVideo(busy)).rejects.toThrow('暂时繁忙');
    expect(busy.provider.analyze).toHaveBeenCalledTimes(4); expect(busy.provider.stop).toHaveBeenCalledOnce();
    expect(busy.onProgress).not.toHaveBeenCalled();
    const network = setup(); network.provider.analyze.mockRejectedValue(new Error('Failed to fetch'));
    await expect(analyzeVideo(network)).rejects.toThrow('Failed to fetch');
    expect(network.provider.analyze).toHaveBeenCalledOnce(); expect(network.wait).not.toHaveBeenCalled();
  });

  it('can cancel while waiting for a busy service without resending the frame', async () => {
    const controller = new AbortController(), input = setup({ signal: controller.signal });
    input.provider.analyze.mockRejectedValueOnce(new Error('inference_busy'));
    input.wait.mockImplementationOnce(async () => { controller.abort(); });
    await expect(analyzeVideo(input)).rejects.toMatchObject({ name: 'AbortError' });
    expect(input.provider.analyze).toHaveBeenCalledOnce(); expect(input.onProgress).not.toHaveBeenCalled();
  });

  it('fails and closes the model session on decode, network or missing-evidence errors', async () => {
    for (const failure of ['decode', 'model', 'evidence']) {
      const input = setup();
      if (failure === 'decode') input.frameAt.mockRejectedValueOnce(new Error('decode failed'));
      if (failure === 'model') input.provider.analyze.mockRejectedValueOnce(new Error('network failed'));
      if (failure === 'evidence') input.provider.analyze.mockResolvedValueOnce(frame({ inferenceMs: undefined }));
      await expect(analyzeVideo(input)).rejects.toThrow();
      expect(input.provider.stop).toHaveBeenCalledOnce(); expect(input.onProgress).not.toHaveBeenCalled();
    }
  });

  it('cancels pending analysis, ignores its late result, and never sends another frame', async () => {
    const controller = new AbortController(), input = setup({ signal: controller.signal });
    let release!: (value: ReturnType<typeof frame>) => void;
    input.provider.analyze.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const running = analyzeVideo(input); const rejected = expect(running).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve(); controller.abort(); release(frame()); await rejected;
    expect(input.provider.stop).toHaveBeenCalled(); expect(input.provider.analyze).toHaveBeenCalledOnce();
    expect(input.onProgress).not.toHaveBeenCalled();
  });

  it('does not send a decoded frame after cancellation and waits abortably between samples', async () => {
    const controller = new AbortController(), input = setup({ signal: controller.signal });
    input.frameAt.mockImplementationOnce(async () => { controller.abort(); return 'too late'; });
    await expect(analyzeVideo(input)).rejects.toMatchObject({ name: 'AbortError' });
    expect(input.provider.analyze).not.toHaveBeenCalled();
    vi.useFakeTimers(); const waiting = new AbortController();
    const delay = waitForVideoAnalysis(550, waiting.signal); const rejected = expect(delay).rejects.toMatchObject({ name: 'AbortError' });
    waiting.abort(); await rejected; expect(vi.getTimerCount()).toBe(0);
  });
});

describe('local video decoding', () => {
  it.each([
    [90, 360, 640], [180, 640, 360], [270, 360, 640],
  ])('rotates the actual uploaded JPEG by %i degrees without cropping the person', async (rotation, width, height) => {
    const video = Object.assign(new EventTarget(), { currentTime: .5, readyState: 2, seeking: false,
      videoWidth: 1920, videoHeight: 1080, pause: vi.fn() });
    const context = { save: vi.fn(), translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn(), restore: vi.fn() };
    const canvas = { width: 0, height: 0, getContext: () => context, toDataURL: vi.fn(() => 'rotated-jpeg') };
    expect(await readVideoFrame(video as unknown as HTMLVideoElement, canvas as unknown as HTMLCanvasElement, .5,
      new AbortController().signal, rotation as VideoRotation)).toBe('rotated-jpeg');
    expect(canvas).toMatchObject({ width, height });
    expect(context.translate).toHaveBeenCalledWith(width / 2, height / 2);
    expect(context.rotate).toHaveBeenCalledWith(rotation * Math.PI / 180);
    expect(context.drawImage).toHaveBeenCalledWith(video, -320, -180, 640, 360);
    expect(context.restore).toHaveBeenCalledOnce();
  });

  it('seeks before sampling, compresses to 640px, and uses no camera API', async () => {
    const video = Object.assign(new EventTarget(), { currentTime: 0, readyState: 2, seeking: true,
      videoWidth: 1920, videoHeight: 1080, pause: vi.fn() });
    const drawImage = vi.fn(), canvas = { width: 0, height: 0, getContext: () => ({ drawImage }), toDataURL: vi.fn(() => 'data:image/jpeg;base64,test') };
    const reading = readVideoFrame(video as unknown as HTMLVideoElement, canvas as unknown as HTMLCanvasElement, 0.5, new AbortController().signal);
    expect(drawImage).not.toHaveBeenCalled(); expect(video.currentTime).toBe(0.5);
    video.seeking = false; video.dispatchEvent(new Event('seeked'));
    expect(await reading).toBe('data:image/jpeg;base64,test'); expect(canvas).toMatchObject({ width: 640, height: 360 });
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.65);
  });

  it('cancels or times out a stalled decoder without leaking timers or drawing a stale frame', async () => {
    vi.useFakeTimers();
    for (const mode of ['abort', 'timeout']) {
      const controller = new AbortController();
      const video = Object.assign(new EventTarget(), { currentTime: 0, readyState: 0, seeking: true, pause: vi.fn() });
      const reading = readVideoFrame(video as unknown as HTMLVideoElement, {} as HTMLCanvasElement, 1, controller.signal);
      const failed = expect(reading).rejects.toThrow();
      if (mode === 'abort') controller.abort(); else await vi.advanceTimersByTimeAsync(10000);
      await failed; expect(vi.getTimerCount()).toBe(0);
    }
  });
});
