import type { FormAnalysisResult, FormContext } from "../analysis/FormAnalysisProvider";
import type { SupportedExercise } from "../types";

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 60;
export const VIDEO_SAMPLE_SECONDS = 0.25;
// The existing service permits one frame every 500ms. Analyze in order, never in parallel.
const REQUEST_GAP_MS = 550;

export function validateVideoFile(file: { name: string; size: number; type: string }): void {
  if (!file.size) throw new Error("视频文件为空，请重新选择。");
  if (file.size > MAX_VIDEO_BYTES) throw new Error("请选择不超过 100 MB 的视频。");
  if (!(file.type.startsWith("video/") || (!file.type && /\.(mp4|mov|m4v|webm)$/i.test(file.name)))) {
    throw new Error("请选择 MP4、MOV 或其他可播放的视频文件。");
  }
}

export function videoSampleTimes(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("无法读取视频时长，请换一个可播放的视频。");
  if (duration > MAX_VIDEO_SECONDS) throw new Error("请选择 60 秒以内的视频，较长视频请先裁剪。");
  return Array.from({ length: Math.ceil(duration / VIDEO_SAMPLE_SECONDS) }, (_, i) =>
    Math.min(i * VIDEO_SAMPLE_SECONDS + 0.01, duration * 0.999));
}

export interface VideoAnalysisProgress {
  processed: number;
  total: number;
  time: number;
  usableFrames: number;
  reps: number;
  corrections: Array<{ text: string; time: number }>;
  last: FormAnalysisResult | null;
}

export function emptyVideoProgress(): VideoAnalysisProgress {
  return { processed: 0, total: 0, time: 0, usableFrames: 0, reps: 0, corrections: [], last: null };
}

export function videoAbortError(): Error {
  return new DOMException("视频分析已停止。", "AbortError");
}

function check(signal: AbortSignal): void {
  if (signal.aborted) throw videoAbortError();
}

export function waitForVideoAnalysis(ms: number, signal: AbortSignal): Promise<void> {
  check(signal);
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(videoAbortError()); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** The whole video stays local. Only ordered JPEG samples enter the existing model session. */
export async function analyzeVideo(options: {
  duration: number;
  exercise: SupportedExercise;
  consent: boolean;
  signal: AbortSignal;
  frameAt(time: number, signal: AbortSignal): Promise<string>;
  provider: { analyze(context: FormContext): Promise<FormAnalysisResult>; stop(): Promise<unknown> };
  onProgress(progress: VideoAnalysisProgress): void;
  wait?: typeof waitForVideoAnalysis;
}): Promise<VideoAnalysisProgress> {
  if (!options.consent) throw new Error("请先同意将抽取的画面发送到 Pocket Buddy 模型服务。");
  check(options.signal);
  const times = videoSampleTimes(options.duration);
  const progress = { ...emptyVideoProgress(), total: times.length };
  const abort = () => { void options.provider.stop().catch(() => {}); };
  options.signal.addEventListener("abort", abort, { once: true });
  try {
    for (const time of times) {
      check(options.signal);
      const imageBase64 = await options.frameAt(time, options.signal);
      check(options.signal);
      let result: FormAnalysisResult;
      for (let retry = 0; ; retry += 1) {
        check(options.signal);
        try {
          result = await options.provider.analyze({ exercise: options.exercise, imageBase64 });
          break;
        } catch (error) {
          // These two server responses occur before inference, so this frame is safe to retry.
          // Never retry ambiguous network/time-out failures: the model may already have counted it.
          if (!(error instanceof Error) || !['inference_busy', 'frame_rate_limited'].includes(error.message)) throw error;
          if (retry >= 3) throw new Error("模型服务暂时繁忙，请稍后重新分析。");
          await (options.wait || waitForVideoAnalysis)(750 * (retry + 1), options.signal);
        }
      }
      check(options.signal);
      if (!Number.isSafeInteger(result.repCount) || result.repCount! < 0
        || !Number.isFinite(result.visibleKeypoints) || !Number.isFinite(result.inferenceMs)) {
        throw new Error("模型没有返回完整的分析证据，本次未标记为完成。");
      }
      progress.processed += 1;
      progress.time = time;
      progress.last = result;
      progress.reps = Math.max(progress.reps, result.repCount!);
      if (result.status === "conclusive" && result.visibleKeypoints! > 0) {
        progress.usableFrames += 1;
        if (!result.isStandard && result.correctionText && !progress.corrections.some(cue => cue.text === result.correctionText)) {
          if (progress.corrections.length < 6) progress.corrections.push({ text: result.correctionText, time });
        }
      }
      options.onProgress({ ...progress, corrections: [...progress.corrections] });
      if (progress.processed < times.length) await (options.wait || waitForVideoAnalysis)(REQUEST_GAP_MS, options.signal);
    }
    return progress;
  } finally {
    options.signal.removeEventListener("abort", abort);
    await options.provider.stop();
  }
}
