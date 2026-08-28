import { videoAbortError, videoSampleTimes } from '../../../lianlema-portable/app_project/app/src/video/videoAnalysis'

export type PosePoint = { x: number; y: number; visibility?: number }
export interface PoseVideoProgress {
  processed: number
  total: number
  time: number
  detectedFrames: number
  visibleFrames: number
  inferenceMs: number
  observations: Array<{ time: number; text: string }>
}
export const emptyPoseVideoProgress = (): PoseVideoProgress => ({
  processed: 0, total: 0, time: 0, detectedFrames: 0, visibleFrames: 0, inferenceMs: 0, observations: [],
})
const required = [11, 12, 23, 24, 25, 26, 27, 28]

/** Visibility and limited alignment observations, not a pose classifier or medical assessment. */
export async function analyzePoseVideo(options: {
  duration: number
  exerciseId: string
  signal: AbortSignal
  inferAt(time: number, signal: AbortSignal): Promise<{ points: PosePoint[]; inferenceMs: number }>
  onProgress(progress: PoseVideoProgress): void
}): Promise<PoseVideoProgress> {
  const check = () => { if (options.signal.aborted) throw videoAbortError() }
  check()
  const times = videoSampleTimes(options.duration)
  const progress = { ...emptyPoseVideoProgress(), total: times.length }
  for (const time of times) {
    check()
    const { points, inferenceMs } = await options.inferAt(time, options.signal)
    check()
    if (!Array.isArray(points) || !Number.isFinite(inferenceMs) || inferenceMs < 0) throw new Error('关键点模型没有返回有效的推理结果。')
    progress.processed++
    progress.time = time
    progress.inferenceMs += inferenceMs
    const visible = (i: number) => {
      const p = points[i]
      return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 && (p.visibility ?? 0) >= .55
    }
    if (required.some(visible)) progress.detectedFrames++
    if (required.every(visible)) {
      progress.visibleFrames++
      const hipWidth = Math.max(Math.hypot(points[23].x - points[24].x, points[23].y - points[24].y), .03)
      let text = ''
      if (options.exerciseId === 'mountain' && Math.abs(points[11].y - points[12].y) / hipWidth > .32) text = '画面中两侧肩部高度不同；请核对机位是否倾斜，再检查肩部对齐。'
      if (['tree', 'legraise'].includes(options.exerciseId) && Math.abs(points[23].y - points[24].y) / hipWidth > .3) text = '画面中两侧髋部高度不同；请结合机位检查骨盆对齐，必要时减小动作幅度。'
      if (text && !progress.observations.some(item => item.text === text)) progress.observations.push({ time, text })
    }
    options.onProgress({ ...progress, observations: [...progress.observations] })
  }
  return progress
}
