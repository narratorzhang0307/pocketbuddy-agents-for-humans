import { videoAbortError } from "./videoAnalysis";

export type VideoRotation = 0 | 90 | 180 | 270;

/** iOS may preload metadata without decoding pixels. Call directly from the user's Start click. */
export function prepareVideoForAnalysis(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(videoAbortError());
  video.muted = true;
  video.playsInline = true;
  const decoded = () => !video.seeking && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
  if (decoded()) { video.pause(); return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const event of ["loadeddata", "playing", "seeked"]) video.removeEventListener(event, ready);
      video.removeEventListener("error", failed);
      signal.removeEventListener("abort", aborted);
      video.pause();
      if (error) reject(error); else resolve();
    };
    const ready = () => { if (decoded()) finish(); };
    const failed = () => finish(new Error("无法读取视频画面。请先在预览中播放；如果仍是黑屏，请换成这台设备可播放的 MP4 视频。"));
    const aborted = () => finish(videoAbortError());
    const timer = setTimeout(failed, 10000);
    for (const event of ["loadeddata", "playing", "seeked"]) video.addEventListener(event, ready);
    video.addEventListener("error", failed, { once: true });
    signal.addEventListener("abort", aborted, { once: true });
    try { void video.play().then(ready, failed); } catch { failed(); }
  });
}

/** Use the same pixels for the direction preview and model input, without cropping. */
export function drawVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement, rotation: VideoRotation = 0): void {
  if (!video.videoWidth || !video.videoHeight) throw new Error("视频没有可读取的画面。");
  const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  const sideways = rotation === 90 || rotation === 270;
  canvas.width = sideways ? height : width;
  canvas.height = sideways ? width : height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前设备不支持视频画面处理。");
  if (rotation === 0) { context.drawImage(video, 0, 0, width, height); return; }
  context.save();
  try {
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(rotation * Math.PI / 180);
    context.drawImage(video, -width / 2, -height / 2, width, height);
  } finally { context.restore(); }
}

/** Seek the local video, wait for decoded pixels, then release the full frame after JPEG conversion. */
export async function readVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement, time: number, signal: AbortSignal, rotation: VideoRotation = 0): Promise<string> {
  if (signal.aborted) throw videoAbortError();
  video.pause();
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      for (const event of ["seeked", "loadeddata"]) video.removeEventListener(event, ready);
      video.removeEventListener("error", failed);
      signal.removeEventListener("abort", aborted);
    };
    const ready = () => {
      if (video.seeking || video.readyState < 2 || Math.abs(video.currentTime - time) > 0.05) return;
      cleanup(); resolve();
    };
    const failed = () => { cleanup(); reject(new Error("视频解码失败，请使用这台设备可播放的 MP4 视频。")); };
    const aborted = () => { cleanup(); reject(videoAbortError()); };
    const timer = setTimeout(failed, 10000);
    for (const event of ["seeked", "loadeddata"]) video.addEventListener(event, ready);
    video.addEventListener("error", failed, { once: true });
    signal.addEventListener("abort", aborted, { once: true });
    try { video.currentTime = time; ready(); } catch { failed(); }
  });
  if (signal.aborted) throw videoAbortError();
  drawVideoFrame(video, canvas, rotation);
  return canvas.toDataURL("image/jpeg", 0.65);
}
