import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { JsonObject } from '../../../frost-agent/taskmaster';
import { drawSkeleton, PoseWindow, toCoco17, type PoseFrame } from './sports/pose';

export interface CanvasPoseSurface {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  onProgress: (message: string) => void;
}

function angle(frame: PoseFrame, a: number, b: number, c: number, width: number, height: number): number {
  const x = [(frame[a][0] - frame[b][0]) * width, (frame[a][1] - frame[b][1]) * height];
  const y = [(frame[c][0] - frame[b][0]) * width, (frame[c][1] - frame[b][1]) * height];
  const length = Math.hypot(...x) * Math.hypot(...y);
  if (length < 1e-6) throw new Error('pose_degenerate_joints');
  return Math.round(Math.acos(Math.max(-1, Math.min(1, (x[0] * y[0] + x[1] * y[1]) / length))) * 180 / Math.PI);
}

export function summarizeCanvasPose(buffer: PoseWindow, width: number, height: number): JsonObject {
  if (buffer.frames.length < 30 || width <= 0 || height <= 0) throw new Error('pose_observation_incomplete');
  const frame = buffer.frames[buffer.frames.length - 1];
  return {
    protocol: 'pocket-canvas-pose/v1', model: 'mediapipe-pose-landmarker-lite',
    observed_at: new Date().toISOString(), frames_observed: buffer.frames.length,
    duration_ms: Math.round(buffer.timestamps.at(-1)! - buffer.timestamps[0]),
    landmarks: frame.map(point => point.map(value => Math.round(value * 10000) / 10000)),
    joints: 'coco17', image_width: width, image_height: height,
    angles_degrees: { left_elbow: angle(frame, 5, 7, 9, width, height), right_elbow: angle(frame, 6, 8, 10, width, height),
      left_knee: angle(frame, 11, 13, 15, width, height), right_knee: angle(frame, 12, 14, 16, width, height) },
    summary: 'Observed a continuous full-body pose. Joint angles are image-plane estimates, not a diagnosis or exercise score.',
    raw_frames_uploaded: false,
  };
}

/** A bounded camera observation using the same bundled model and visibility gate as the sports coaches. */
export async function captureCanvasPose(surface: CanvasPoseSurface, signal: AbortSignal): Promise<JsonObject> {
  signal.throwIfAborted();
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('camera_requires_https');
  const { video, canvas, onProgress } = surface;
  let detector: PoseLandmarker | undefined, stream: MediaStream | undefined, frameId = 0;
  const release = () => {
    cancelAnimationFrame(frameId);
    stream?.getTracks().forEach(track => track.stop());
    video.pause(); video.srcObject = null;
    detector?.close(); detector = undefined;
  };
  signal.addEventListener('abort', release, { once: true });
  try {
    onProgress('正在准备骨骼识别模型…');
    const { createSportsPoseDetector } = await import('./sports/detector');
    signal.throwIfAborted();
    const loaded = await createSportsPoseDetector();
    if (signal.aborted) { loaded.close(); signal.throwIfAborted(); }
    detector = loaded;
    onProgress('请允许摄像头，将全身保持在画面内。');
    const opened = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false });
    if (signal.aborted) { opened.getTracks().forEach(track => track.stop()); signal.throwIfAborted(); }
    stream = opened;
    video.srcObject = stream; video.muted = true; video.playsInline = true;
    await video.play(); signal.throwIfAborted();
    const buffer = new PoseWindow();
    return await new Promise<JsonObject>((resolve, reject) => {
      let lastVideoTime = -1, lastFrameAt = -Infinity;
      const timeout = window.setTimeout(() => finish(new Error('pose_full_body_not_visible')), 20000);
      const abort = () => finish(new Error('pose_cancelled'));
      const ended = () => finish(new Error('camera_disconnected'));
      const finish = (error?: Error, result?: JsonObject) => {
        window.clearTimeout(timeout); signal.removeEventListener('abort', abort);
        stream?.getTracks().forEach(track => track.removeEventListener('ended', ended));
        cancelAnimationFrame(frameId);
        if (error) reject(error); else resolve(result!);
      };
      signal.addEventListener('abort', abort, { once: true });
      stream!.getTracks().forEach(track => track.addEventListener('ended', ended, { once: true }));
      const tick = (now: number) => {
        if (signal.aborted) { abort(); return; }
        try {
          if (now - lastFrameAt > 250) buffer.reset();
          if (video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastFrameAt >= 50) {
            lastVideoTime = video.currentTime; lastFrameAt = now;
            const pose = toCoco17(detector!.detectForVideo(video, now).landmarks[0] || []);
            const ready = buffer.add(pose, now);
            if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
            if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
            if (pose) drawSkeleton(canvas, pose); else canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
            onProgress(buffer.frames.length ? `正在采集连续骨骼点：${buffer.frames.length}/30 帧` : '请后退一些，让头、双手、膝盖和脚踝都进入画面。');
            if (ready) { finish(undefined, summarizeCanvasPose(buffer, video.videoWidth, video.videoHeight)); return; }
          }
          frameId = requestAnimationFrame(tick);
        } catch (error) { finish(error instanceof Error ? error : new Error('pose_detection_failed')); }
      };
      frameId = requestAnimationFrame(tick);
    });
  } finally { signal.removeEventListener('abort', release); release(); }
}
