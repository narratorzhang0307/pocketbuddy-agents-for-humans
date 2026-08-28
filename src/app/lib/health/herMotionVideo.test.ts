import { describe, expect, it, vi } from 'vitest';
import { analyzePoseVideo, type PosePoint } from '../../../../vendor/her-motion/src/videoAnalysis';

const person = (): PosePoint[] => Array.from({ length: 33 }, (_, i) => ({ x: i % 2 ? .4 : .6, y: .5, visibility: .9 }));
const setup = () => ({ duration: .6, exerciseId: 'mountain', signal: new AbortController().signal,
  inferAt: vi.fn(async (_time: number, _signal: AbortSignal) => ({ points: person(), inferenceMs: 12 })), onProgress: vi.fn() });

describe('Her Motion prerecorded video with the local pose model', () => {
  it('processes ordered samples and reports measured evidence without certifying the exercise', async () => {
    const input = setup();
    const result = await analyzePoseVideo(input);
    expect(input.inferAt.mock.calls.map(args => args[0])).toEqual([.01, .26, .51]);
    expect(result).toMatchObject({ processed: 3, total: 3, detectedFrames: 3, visibleFrames: 3, inferenceMs: 36, observations: [] });
  });
  it('keeps empty, cropped and non-finite poses inconclusive', async () => {
    const input = setup();
    const cropped = person(); cropped[27].x = 1.1;
    const invalid = person(); invalid[23].y = NaN;
    input.inferAt.mockResolvedValueOnce({ points: [], inferenceMs: 10 }).mockResolvedValueOnce({ points: cropped, inferenceMs: 10 }).mockResolvedValueOnce({ points: invalid, inferenceMs: 10 });
    expect(await analyzePoseVideo(input)).toMatchObject({ processed: 3, visibleFrames: 0, observations: [] });
  });
  it('records a supported alignment observation once with its real video timestamp', async () => {
    const input = setup(); const points = person(); points[11].y = .7;
    input.inferAt.mockResolvedValue({ points, inferenceMs: 12 });
    const result = await analyzePoseVideo(input);
    expect(result.observations).toEqual([{ time: .01, text: expect.stringContaining('肩部高度不同') }]);
  });
  it('does not issue mountain-specific advice for a different selected exercise', async () => {
    const input = setup(); input.exerciseId = 'plank'; const points = person(); points[11].y = .7;
    input.inferAt.mockResolvedValue({ points, inferenceMs: 12 });
    expect((await analyzePoseVideo(input)).observations).toEqual([]);
  });
  it('stops after cancellation and ignores a result that arrives after abort', async () => {
    const input = setup(); const controller = new AbortController(); input.signal = controller.signal;
    input.inferAt.mockImplementationOnce(async () => { controller.abort(); return { points: person(), inferenceMs: 12 }; });
    await expect(analyzePoseVideo(input)).rejects.toMatchObject({ name: 'AbortError' });
    expect(input.inferAt).toHaveBeenCalledOnce(); expect(input.onProgress).not.toHaveBeenCalled();
  });
  it('propagates decoder or model failure rather than completing a partial result', async () => {
    const input = setup(); input.inferAt.mockRejectedValueOnce(new Error('decode failed'));
    await expect(analyzePoseVideo(input)).rejects.toThrow('decode failed');
    expect(input.onProgress).not.toHaveBeenCalled();
  });
});
