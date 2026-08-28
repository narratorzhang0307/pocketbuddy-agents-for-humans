import { videoAbortError } from "./videoAnalysis";

/** Seek the local video, wait for decoded pixels, then release the full frame after JPEG conversion. */
export async function readVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement, time: number, signal: AbortSignal): Promise<string> {
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
  if (!video.videoWidth || !video.videoHeight) throw new Error("视频没有可读取的画面。");
  const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前设备不支持视频画面处理。");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.65);
}
