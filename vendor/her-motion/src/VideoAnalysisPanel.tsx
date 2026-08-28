import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { validateVideoFile, videoSampleTimes, waitForVideoAnalysis } from '../../../lianlema-portable/app_project/app/src/video/videoAnalysis'
import { readVideoFrame } from '../../../lianlema-portable/app_project/app/src/video/videoFrames'
import { analyzePoseVideo, emptyPoseVideoProgress } from './videoAnalysis'

const base = import.meta.env.BASE_URL.replace(/\/$/, '')
type Status = 'ready' | 'running' | 'completed' | 'stopped' | 'error'

export default function VideoAnalysisPanel({ exerciseId, exerciseName }: { exerciseId: string; exerciseName: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const runRef = useRef<AbortController | null>(null)
  const [file, setFile] = useState<{ name: string; url: string } | null>(null)
  const [duration, setDuration] = useState(0)
  const [status, setStatus] = useState<Status>('ready')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(emptyPoseVideoProgress)
  const running = status === 'running'
  function stop() {
    if (!runRef.current) return
    runRef.current.abort(); runRef.current = null
    setStatus('stopped'); setError('分析已停止；下方仅为已处理部分，未生成完整结果。')
  }
  useEffect(() => {
    const hidden = () => { if (document.visibilityState === 'hidden') stop() }
    document.addEventListener('visibilitychange', hidden)
    return () => { runRef.current?.abort(); runRef.current = null; document.removeEventListener('visibilitychange', hidden) }
  }, [])
  useEffect(() => () => { if (file) URL.revokeObjectURL(file.url) }, [file])
  function select(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0]
    if (!next) return
    stop(); setFile(null); setDuration(0); setError(''); setStatus('ready'); setProgress(emptyPoseVideoProgress())
    try { validateVideoFile(next); setFile({ name: next.name, url: URL.createObjectURL(next) }) }
    catch (cause) { setStatus('error'); setError(cause instanceof Error ? cause.message : '视频读取失败。') }
  }
  async function start() {
    const video = videoRef.current
    if (!video || !file || !duration || runRef.current || document.visibilityState === 'hidden') return
    const controller = new AbortController(); runRef.current = controller
    const current = () => runRef.current === controller && !controller.signal.aborted
    let model: PoseLandmarker | undefined
    setStatus('running'); setError(''); setProgress({ ...emptyPoseVideoProgress(), total: videoSampleTimes(duration).length })
    try {
      video.pause()
      const vision = await FilesetResolver.forVisionTasks(`${base}/wasm`)
      if (!current()) return
      const options = { baseOptions: { modelAssetPath: `${base}/models/pose_landmarker_lite.task`, delegate: 'GPU' as const }, runningMode: 'VIDEO' as const, numPoses: 1, minPoseDetectionConfidence: .55, minTrackingConfidence: .55 }
      try { model = await PoseLandmarker.createFromOptions(vision, options) }
      catch (cause) {
        if (!current()) return
        model = await PoseLandmarker.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' } })
      }
      if (!current()) return
      const canvas = document.createElement('canvas')
      const result = await analyzePoseVideo({
        duration, exerciseId, signal: controller.signal,
        async inferAt(time, signal) {
          await readVideoFrame(video!, canvas, time, signal)
          const started = performance.now()
          const output = model!.detectForVideo(canvas, time * 1000)
          const inferenceMs = performance.now() - started
          // Yield between frames so progress, cancellation and navigation remain responsive.
          await waitForVideoAnalysis(0, signal)
          return { points: output.landmarks[0] ?? [], inferenceMs }
        },
        onProgress: next => { if (current()) setProgress(next) },
      })
      if (current()) {
        setStatus('completed')
        console.info('[HerMotionVideo] completed', JSON.stringify({ exerciseId, duration, ...result, source: 'local-video', model: 'mediapipe-pose-lite', classifierLoaded: false, recordedAsWorkout: false }))
      }
    } catch (cause) {
      if (current()) { setStatus('error'); setError(`分析未完成：${cause instanceof Error ? cause.message : '请重新选择可播放的视频。'}`) }
    } finally { model?.close(); if (runRef.current === controller) runRef.current = null }
  }
  const complete = status === 'completed'
  const percentage = progress.total ? Math.round(progress.processed / progress.total * 100) : 0
  return <section className="liquidGlass videoUploadPanel" aria-label="女性运动视频分析">
    <h2>上传视频分析</h2>
    <p>已选择：{exerciseName}。体式由你指定，当前没有自动体式分类或专项质量评分。</p>
    <label htmlFor="her-motion-video">选择已有视频（60 秒以内，最多 100 MB）</label>
    <input id="her-motion-video" type="file" accept="video/*,.mp4,.mov,.m4v,.webm" disabled={running} onChange={select} />
    <p>视频和抽帧仅在本机处理，不上传服务器，不开启摄像头，不计入本人的运动记录。</p>
    {file && <>
      <p>{file.name}{duration ? ` · ${duration.toFixed(1)} 秒` : ''}</p>
      <video ref={videoRef} src={file.url} controls={!running} muted playsInline preload="auto" aria-label="女性运动所选视频预览"
        onLoadedMetadata={event => {
          try { const seconds = event.currentTarget.duration; videoSampleTimes(seconds); setDuration(seconds) }
          catch (cause) { setDuration(0); setStatus('error'); setError(cause instanceof Error ? cause.message : '视频时长无效。') }
        }}
        onError={() => { stop(); setDuration(0); setStatus('error'); setError('当前浏览器无法解码这个视频，请换用 H.264 编码的 MP4。') }} />
    </>}
    <button type="button" className="btn-cut startBtn" disabled={!duration || running} onClick={() => void start()}>{running ? '正在分析…' : '开始视频分析'}</button>
    {error && <p role="alert">{error}</p>}
    {(running || progress.processed > 0) && <section aria-label="女性运动视频分析结果">
      <h3>{complete ? '视频分析已完成' : running ? '正在分析视频' : '部分结果 · 未完成'}</h3>
      <progress aria-label="女性运动视频分析进度" value={progress.processed} max={progress.total || 1} />
      <p role="status">{percentage}% · 已分析 {progress.processed}/{progress.total} 帧 · 视频位置 {progress.time.toFixed(1)} 秒</p>
      <p>检测到人体：{progress.detectedFrames} 帧 · 肩、髋、膝、踝完整可见：{progress.visibleFrames} 帧</p>
      {complete && <>
        <p>{progress.visibleFrames === 0 ? '未获得足够的完整人体画面，无法评估动作；请换用全身清晰入镜的视频。' : '已生成真实关键点观察。可见不等于体式正确，以下不构成专项动作认证。'}</p>
        {progress.observations.map(item => <p key={item.text}>{item.time.toFixed(1)} 秒：{item.text}</p>)}
        {progress.visibleFrames > 0 && progress.observations.length === 0 && <p>当前有限的对齐规则未触发提示；不代表动作全部标准。</p>}
        <p>平均推理：{(progress.inferenceMs / progress.processed).toFixed(0)} ms／帧 · MediaPipe Pose Lite · 每秒抽取 4 帧</p>
      </>}
      {running && <button type="button" className="btn-cut-border" onClick={stop}>停止分析</button>}
    </section>}
    <p>请保持页面前台。切换动作、离开页面或进入后台会停止分析。模型不能判断疼痛、呼吸、盆底或产后恢复状况。</p>
  </section>
}
