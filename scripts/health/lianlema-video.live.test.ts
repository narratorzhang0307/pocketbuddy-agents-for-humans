import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { ModelCoachProvider } from '../../lianlema-portable/app_project/app/src/analysis/ModelCoachProvider';
import { analyzeVideo, validateVideoFile, videoSampleTimes } from '../../lianlema-portable/app_project/app/src/video/videoAnalysis';
import type { FormAnalysisResult } from '../../lianlema-portable/app_project/app/src/analysis/FormAnalysisProvider';

const execute = promisify(execFile);
const enabled = process.env.LIANLEMA_VIDEO_LIVE === '1';
// Optional diagnostic route to the same deployed service over an explicitly opened SSH tunnel.
// This does not count as public HTTPS or phone/browser end-to-end verification.
const endpoint = process.env.LIANLEMA_VIDEO_TUNNEL === '1'
  ? 'http://127.0.0.1:14020' : 'https://pocketbuddy.throughtheglass.art/lianlema';
const cases = [
  { exercise: 'squat', file: 'mmfit-w19-squats-first-set.mp4' },
  { exercise: 'push_up', file: 'mmfit-w19-pushups-first-set.mp4' },
] as const;

interface Sample {
  file: string; exercise: string; duration: number; mp4_sha256: string; annotated_reps: number;
  annotation_frames: [number, number]; source_start_seconds: number;
}

// Opt-in live integration test. Only the two public, annotated MM-Fit clips are accepted.
// Reuses the shipped controller/provider, but FFmpeg replaces the browser's video decoder.
// No camera, microphone, private photos, paid LLM/TTS, or model weight changes.
describe.skipIf(!enabled)('real MM-Fit video through the deployed coach', () => {
  it.each(cases)('processes every ordered frame of $exercise and records actual counts', async ({ exercise, file }) => {
    const directory = process.env.LIANLEMA_VIDEO_TEST_DIR;
    if (!directory || !path.isAbsolute(directory)) throw new Error('Set LIANLEMA_VIDEO_TEST_DIR to the downloaded sample directory');
    const metadata = JSON.parse(await readFile(path.join(directory, 'samples.json'), 'utf8'));
    expect(metadata.source).toBe('https://zenodo.org/records/7672767');
    expect(metadata.license).toBe('CC-BY-4.0');
    const sample = (metadata.samples as Sample[]).find(item => item.file === file && item.exercise === exercise);
    if (!sample) throw new Error(`Missing annotated sample: ${file}`);
    const video = path.join(directory, file);
    const videoStat = await stat(video);
    validateVideoFile({ name: file, size: videoStat.size, type: 'video/mp4' });
    expect(createHash('sha256').update(await readFile(video)).digest('hex')).toBe(sample.mp4_sha256);
    const times = videoSampleTimes(sample.duration);
    const ffmpeg = process.env.LIANLEMA_FFMPEG || (await execute('python3', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'])).stdout.trim();
    const probe = JSON.parse((await execute('python3', ['-c',
      'import imageio_ffmpeg,json,sys; r=imageio_ffmpeg.read_frames(sys.argv[1]); m=next(r); r.close(); n,_=imageio_ffmpeg.count_frames_and_secs(sys.argv[1]); print(json.dumps({"fps":m["fps"],"frames":n}))', video])).stdout);
    const lastFrameTime = (probe.frames - 1) / probe.fps;
    if (!Number.isFinite(lastFrameTime) || lastFrameTime <= 0) throw new Error('Invalid sample frame timestamps');
    const startedAt = new Date().toISOString();
    const started = Date.now();
    const provider = new ModelCoachProvider(endpoint, 'manual');
    const signal = AbortSignal.timeout(360_000);
    const frames: Array<{ time: number; result: FormAnalysisResult }> = [];
    let result;
    let failure: string | undefined;
    try {
      result = await analyzeVideo({
        duration: sample.duration, exercise, consent: true, signal, provider,
        async frameAt(time, abortSignal) {
          // A browser keeps displaying the final frame until media duration; FFmpeg seeks to
          // the next frame instead, so clamp the terminal sample to the final actual PTS.
          const { stdout } = await execute(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', String(Math.min(time, lastFrameTime)),
            '-i', video, '-frames:v', '1', '-vf', 'scale=640:-2', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '5', 'pipe:1'],
          { encoding: 'buffer', maxBuffer: 1024 * 1024, timeout: 10_000, signal: abortSignal });
          if (stdout.length === 0) throw new Error(`No decoded frame at ${time}`);
          return `data:image/jpeg;base64,${stdout.toString('base64')}`;
        },
        onProgress(progress) {
          if (progress.last) frames.push({ time: progress.time, result: progress.last });
          if (progress.processed === 1 || progress.processed % 20 === 0 || progress.processed === progress.total) {
            console.info(JSON.stringify({ exercise, frame: progress.processed, total: progress.total,
              video_seconds: progress.time, real_reps: progress.reps, usable_frames: progress.usableFrames }));
          }
        },
      });
      expect(result.processed).toBe(times.length);
      expect(result.usableFrames).toBeGreaterThan(0);
      expect(result.reps).toBeGreaterThanOrEqual(0);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      await provider.stop();
      const inference = frames.map(frame => frame.result.inferenceMs!).filter(Number.isFinite);
      const report = {
        startedAt, elapsed_seconds: (Date.now() - started) / 1000, endpoint,
        transport: process.env.LIANLEMA_VIDEO_TUNNEL === '1' ? 'SSH tunnel to the same deployed coach at 127.0.0.1:4020' : 'public HTTPS',
        source: metadata.source, license: metadata.license, sample,
        mode: 'manual; user-selected action, not automatic action classification',
        decoder: 'FFmpeg JPEG long edge 640; browser decoder tested separately with a synthetic empty video',
        completion: failure ? 'failed_or_incomplete' : 'completed', error: failure,
        processed_frames: frames.length, total_frames: times.length,
        usable_frames: result?.usableFrames, model_reps: result?.reps,
        annotated_reps: sample.annotated_reps,
        count_difference: result ? result.reps - sample.annotated_reps : null,
        mean_inference_ms: inference.length ? inference.reduce((a, b) => a + b, 0) / inference.length : null,
        caveat: 'Two preselected sets test the integration, not general accuracy or exercise quality. No tuning or sample selection based on model results.',
        corrections: result?.corrections, frames,
      };
      const output = path.join(directory, `${exercise}.result-${startedAt.replace(/[:.]/g, '-')}.json`);
      await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
      console.info(JSON.stringify({ exercise, report: output, completion: report.completion, model_reps: report.model_reps,
        annotated_reps: report.annotated_reps, count_difference: report.count_difference, elapsed_seconds: report.elapsed_seconds }));
    }
  }, 400_000);
});
