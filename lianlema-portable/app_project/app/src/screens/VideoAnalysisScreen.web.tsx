import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ModelCoachProvider, modelBaseUrl } from "../analysis";
import { EXERCISE_LABEL } from "../types";
import type { WorkoutStackParamList } from "../navigation";
import { analyzeVideo, emptyVideoProgress, validateVideoFile, videoSampleTimes } from "../video/videoAnalysis";
import { drawVideoFrame, readVideoFrame, type VideoRotation } from "../video/videoFrames";
import { playGenericFeedback, resetCoachState, stopCoachAudio } from "../voice/coachAudio";

type Props = NativeStackScreenProps<WorkoutStackParamList, "VideoAnalysis">;
type Status = "ready" | "running" | "completed" | "stopped" | "error";
const button: CSSProperties = { minHeight: 44, padding: "10px 14px", border: "2px solid #171717", background: "#fff", color: "#171717", fontSize: 14, fontWeight: 700, cursor: "pointer" };
const card: CSSProperties = { border: "2px solid #171717", padding: 14, background: "#fff" };

export default function VideoAnalysisScreen({ navigation, route }: Props) {
  const { exercise } = route.params;
  const videoRef = useRef<HTMLVideoElement>(null);
  const directionPreviewRef = useRef<HTMLCanvasElement>(null);
  const runRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  const [duration, setDuration] = useState(0);
  const [rotation, setRotation] = useState<VideoRotation>(0);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>("ready");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(emptyVideoProgress);
  const running = status === "running";

  const stop = (message = "已停止。保留的只是已分析部分，不是完整视频结果。") => {
    if (runRef.current) { runRef.current.abort(); runRef.current = null; setStatus("stopped"); setError(message); }
    videoRef.current?.pause();
    void stopCoachAudio();
  };
  useEffect(() => {
    const visibility = () => { if (document.visibilityState === "hidden") stop("页面已进入后台，分析已停止；返回后可重新开始。"); };
    document.addEventListener("visibilitychange", visibility);
    const blur = navigation.addListener("blur", () => stop());
    return () => {
      runRef.current?.abort(); runRef.current = null;
      document.removeEventListener("visibilitychange", visibility); blur(); void stopCoachAudio();
    };
  }, [navigation]);
  useEffect(() => () => { if (file) URL.revokeObjectURL(file.url); }, [file]);
  const updateDirectionPreview = () => {
    const video = videoRef.current, canvas = directionPreviewRef.current;
    if (!video || !canvas || video.readyState < 2) return;
    try { drawVideoFrame(video, canvas, rotation); }
    catch { setError("方向预览暂不可用，请重新选择视频。"); }
  };
  useEffect(updateDirectionPreview, [file, rotation, duration]);
  const rotate = (degrees: number) => {
    if (running) return;
    setRotation(value => ((value + degrees + 360) % 360) as VideoRotation);
    setProgress(emptyVideoProgress()); setStatus("ready"); setError("");
  };

  const select = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    stop(); setFile(null); setDuration(0); setRotation(0); setConsent(false); setProgress(emptyVideoProgress()); setError(""); setStatus("ready");
    try { validateVideoFile(selected); setFile({ url: URL.createObjectURL(selected), name: selected.name }); }
    catch (cause) { setStatus("error"); setError(cause instanceof Error ? cause.message : "视频读取失败。"); }
  };

  const start = async () => {
    const video = videoRef.current;
    if (!file || !video || !duration || !consent || runRef.current || document.visibilityState === "hidden") return;
    const controller = new AbortController(); runRef.current = controller;
    const current = () => runRef.current === controller && !controller.signal.aborted;
    setStatus("running"); setError(""); setProgress({ ...emptyVideoProgress(), total: videoSampleTimes(duration).length });
    const provider = new ModelCoachProvider(modelBaseUrl(), "manual");
    try {
      await stopCoachAudio(); resetCoachState();
      if (!current()) return;
      video.pause(); video.muted = true;
      const canvas = document.createElement("canvas");
      await analyzeVideo({ duration, exercise, consent, signal: controller.signal, provider,
        frameAt: (time, signal) => readVideoFrame(video, canvas, time, signal, rotation),
        onProgress: next => {
          if (!current()) return;
          setProgress(next);
          if (next.last?.status === "conclusive" && next.last.visibleKeypoints! > 0) {
            playGenericFeedback(next.reps, next.last.isStandard, next.last.speakText);
          }
        },
      });
      if (current()) setStatus("completed");
    } catch (cause) {
      if (current()) {
        const message = cause instanceof Error && cause.message !== "Failed to fetch" ? cause.message : "无法连接模型服务，请检查网络后重试。";
        setStatus("error"); setError(`分析未完成：${message}`); void stopCoachAudio();
      }
    } finally { if (runRef.current === controller) runRef.current = null; }
  };
  const percent = progress.total ? Math.round(progress.processed / progress.total * 100) : 0;
  const complete = status === "completed";
  const valid = progress.usableFrames > 0;
  const cue = progress.last?.status === "inconclusive" ? "这帧未检测到可用人体姿态。" : progress.last?.primaryCue;

  return <section aria-label="预录视频分析" style={{ flex: 1, minHeight: 0, overflowY: "auto", boxSizing: "border-box", padding: 16, background: "#f2f3ed", color: "#171717", fontFamily: "system-ui, sans-serif" }}>
    <button type="button" style={button} onClick={() => { stop(); navigation.goBack(); }}>返回选择动作</button>
    <h1 style={{ fontSize: 23, margin: "18px 0 6px" }}>预录视频分析</h1>
    <p style={{ margin: "0 0 16px", fontSize: 13, lineHeight: 1.7 }}>分析动作：{EXERCISE_LABEL[exercise]}（你已选择）<br />不需要现场做动作，也不会开启摄像头。</p>
    <div style={card}>
      <label style={{ display: "block", fontWeight: 750, marginBottom: 10 }} htmlFor="coach-video-file">选择已有视频</label>
      <input id="coach-video-file" type="file" accept="video/*,.mp4,.mov,.m4v,.webm" disabled={running} onChange={select} style={{ display: "block", maxWidth: "100%", fontSize: 14 }} />
      <p style={{ fontSize: 12, lineHeight: 1.65, color: "#50554c", marginBottom: 0 }}>最长 60 秒、最大 100 MB。请选择单人、全身清晰、只包含所选动作的视频；建议使用 MP4。</p>
    </div>
    {file && <div style={{ ...card, marginTop: 12 }}>
      <p style={{ marginTop: 0, fontSize: 13, overflowWrap: "anywhere" }}>{file.name}{duration > 0 ? ` · ${duration.toFixed(1)} 秒` : " · 读取中…"}</p>
      <video ref={videoRef} src={file.url} controls={!running} playsInline muted preload="auto" aria-label="所选视频预览"
        style={{ display: "block", width: "100%", maxHeight: 250, background: "#101410", objectFit: "contain" }}
        onLoadedData={updateDirectionPreview} onSeeked={updateDirectionPreview} onTimeUpdate={updateDirectionPreview}
        onLoadedMetadata={event => {
          try { const seconds = event.currentTarget.duration; videoSampleTimes(seconds); setDuration(seconds); }
          catch (cause) { setDuration(0); setStatus("error"); setError(cause instanceof Error ? cause.message : "视频时长无效。"); }
        }}
        onError={() => { stop(); setDuration(0); setStatus("error"); setError("这台设备无法解码此视频，请换成可播放的 MP4 文件。"); }} />
      <p style={{ fontSize: 12, lineHeight: 1.65 }}>如果人物横倒，请先调整方向，让头在上、脚在下；方向校正会用于实际模型分析。</p>
      <div role="group" aria-label="视频方向" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" disabled={running} onClick={() => rotate(-90)} style={button}>向左旋转 90°</button>
        <button type="button" disabled={running} onClick={() => rotate(90)} style={button}>向右旋转 90°</button>
        <span style={{ alignSelf: "center", fontSize: 12 }}>校正角度：{rotation}°</span>
      </div>
      {rotation !== 0 && <>
        <p style={{ fontSize: 12 }}>发送给模型的画面（已校正）：</p>
        <canvas ref={directionPreviewRef} aria-label="发送给模型的方向校正画面" role="img"
          style={{ display: "block", width: "100%", maxHeight: 250, objectFit: "contain", background: "#101410" }} />
      </>}
      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, lineHeight: 1.7, marginTop: 14 }}>
        <input type="checkbox" checked={consent} disabled={running} onChange={event => setConsent(event.target.checked)} style={{ marginTop: 5, flexShrink: 0 }} />
        <span>我同意将抽取的画面发送到 Pocket Buddy 模型服务。视频原文件和原声音轨不上传，服务器不保存画面。</span>
      </label>
      <button type="button" disabled={!consent || !duration || running} onClick={() => void start()}
        style={{ ...button, width: "100%", marginTop: 12, background: "#a6f073", opacity: !consent || !duration || running ? 0.5 : 1 }}>
        {running ? "正在分析…" : progress.processed ? "从头重新分析" : "开始视频分析"}
      </button>
      <p style={{ fontSize: 12, color: "#50554c", lineHeight: 1.65, marginBottom: 0 }}>每秒取 4 帧，依次交给真实模型；单次网络请求最多等待 45 秒。请保持页面前台，分析可能比视频时长更久。教练提示沿用当前声音通道。</p>
    </div>}
    {error && <p role="alert" style={{ padding: 12, background: "#fff0da", color: "#823e14", lineHeight: 1.7, fontSize: 13 }}>{error}</p>}
    {(running || progress.processed > 0) && <div style={{ ...card, marginTop: 12 }}>
      <h2 style={{ fontSize: 17, marginTop: 0 }}>{complete ? "视频分析已完成" : running ? "正在分析视频" : "部分分析结果 · 未完成"}</h2>
      <progress aria-label="视频分析进度" max={progress.total || 1} value={progress.processed} style={{ width: "100%", accentColor: "#20833e" }} />
      <p role="status" style={{ fontSize: 12 }}>{percent}% · 已分析 {progress.processed}/{progress.total} 帧 · 视频位置 {progress.time.toFixed(1)} 秒</p>
      {running && progress.processed === 0 && <p style={{ fontSize: 12 }}>正在读取首帧并连接模型服务，收到真实结果后才计入进度。</p>}
      <div style={{ display: "flex", gap: 12, margin: "18px 0" }}>
        <div style={{ flex: 1 }}><strong style={{ fontSize: 32 }}>{valid ? progress.reps : "—"}</strong><div style={{ fontSize: 12 }}>模型累计计数</div></div>
        <div style={{ flex: 1 }}><strong style={{ fontSize: 32 }}>{progress.usableFrames}</strong><div style={{ fontSize: 12 }}>可用姿态画面 / {progress.processed}</div></div>
      </div>
      {!valid && <p style={{ fontSize: 13, lineHeight: 1.7 }}>{complete ? "没有检测到可用人体姿态，无法判断动作次数或质量。请换一段全身清晰的视频。" : "尚未检测到可用人体姿态，不会把空画面记成有效动作。"}</p>}
      {cue && <p style={{ fontSize: 14, lineHeight: 1.7, background: "#eff8e8", padding: 10 }}>{cue}</p>}
      {progress.last && <p style={{ fontSize: 12, color: "#50554c" }}>本帧可见关键点：{progress.last.visibleKeypoints}/17 · 推理耗时：{progress.last.inferenceMs} ms</p>}
      {progress.corrections.length > 0 && <><h3 style={{ fontSize: 14 }}>视频中的纠正提示</h3><ul style={{ paddingLeft: 20, fontSize: 13, lineHeight: 1.8 }}>
        {progress.corrections.map(item => <li key={item.text}>{item.time.toFixed(1)} 秒：{item.text}</li>)}
      </ul></>}
      {complete && valid && <p style={{ fontSize: 12, lineHeight: 1.7 }}>结果来自视频抽帧分析；遮挡、快速动作或机位不合适可能导致漏计。未给出提示不代表动作全部标准。</p>}
      {running && <button type="button" onClick={() => stop()} style={{ ...button, width: "100%" }}>停止分析</button>}
    </div>}
    <p style={{ fontSize: 11, color: "#60655c", lineHeight: 1.7 }}>预录视频 · 当前模型分析，不是摄像头直播，也不是预先写好的结果。反馈仅供参考。</p>
  </section>;
}
