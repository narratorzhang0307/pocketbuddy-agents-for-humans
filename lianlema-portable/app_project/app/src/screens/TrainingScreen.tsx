/**
 * 实时姿势矫正页（高级沉浸式）。
 *
 * 设计：全屏摄像头 + 上下渐变遮罩 + 玻璃质感叠加层。
 *  - 顶部：返回 / 动作名胶囊 / 翻转，半透明玻璃按钮
 *  - 中部：超大次数 + 动态状态环（颜色随 good/warn/alert 平滑过渡，呼吸脉冲）
 *  - 底部：玻璃提示卡（主/副提示，左侧状态色条）+ 暂停/结束
 * 明确同意服务器分析后才开启摄像头；离开/暂停立即停止抓帧。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions, type CameraType } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import {
  getFormProvider,
  stopFormSession,
  modelBaseUrl,
  type FormAnalysisResult,
} from "../analysis";
import { analysisFrame } from "../camera/analysisFrame";
import { forgetTraining, rememberedTraining, rememberTraining, reportTrainingStage, reportTrainingCompletion } from "../camera/trainingConsent";
import { playIntro, playSquatFeedback, playGenericFeedback, stopCoachAudio } from "../voice/coachAudio";
import { heavyHaptic, lightHaptic } from "../ui/haptics";
import { colors, elevation, font, pixelFont, radius, spacing, toneOf, type StatusTone } from "../ui/theme";
import { EXERCISE_LABEL } from "../types";
import type { WorkoutStackParamList } from "../navigation";

type Props = NativeStackScreenProps<WorkoutStackParamList, "Training">;

const FRAME_INTERVAL_MS = 650;
const RING = 260;

const PHASE_LABEL: Record<string, string> = {
  up: "上升", down: "下降", ready: "准备", hold: "保持", lowering: "下放", rising: "上举",
};

export default function TrainingScreen({ navigation, route }: Props) {
  const { exercise } = route.params;
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [facing, setFacing] = useState<CameraType>("front");
  const [running, setRunning] = useState(false);
  const [consented, setConsented] = useState(() => Boolean(rememberedTraining(modelBaseUrl())));
  const [last, setLast] = useState<FormAnalysisResult | null>(null);
  const [reps, setReps] = useState(0);
  const [statusMsg, setStatusMsg] = useState("正在准备摄像头…");

  const busyRef = useRef(false);
  const captureReadyRef = useRef(false);
  const lastRepRef = useRef(0);
  const previousErrorRef = useRef("");
  const runningRef = useRef(false);
  const runGenerationRef = useRef(0);
  const firstFrameRef = useRef(false);
  const permissionRetryRef = useRef(false);
  const initialStartRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failCountRef = useRef(0);
  // 训练统计
  const startTimeRef = useRef<number>(0);
  const observedMsRef = useRef(0), observedFramesRef = useRef(0), lastObservedAtRef = useRef(0);
  const completionSentRef = useRef(false);
  const standardRepsRef = useRef(0);
  const correctionCountRef = useRef(0);

  // 状态环呼吸脉冲
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const ringStyle = { transform: [{ scale: pulse }] };

  const sendFrame = useCallback(async () => {
    if (busyRef.current || !runningRef.current || !captureReadyRef.current) return;
    if (!cameraRef.current || !permission?.granted) return;
    const generation = runGenerationRef.current;
    const current = () => runningRef.current && generation === runGenerationRef.current;
    busyRef.current = true;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.3, skipProcessing: true, base64: true, shutterSound: false, imageType: "jpg" });
      if (!photo?.base64 || !current()) return;
      const imageBase64 = await analysisFrame(photo.base64);
      if (!current()) return;
      const result = await getFormProvider().analyze({ exercise, imageBase64 });
      if (!current()) return;
      if (!firstFrameRef.current) { firstFrameRef.current = true; reportTrainingStage('frame-analyzed'); }
      if (result.status === 'conclusive') {
        const now = Date.now(), gap = now - lastObservedAtRef.current;
        if (lastObservedAtRef.current && gap <= 5000) observedMsRef.current += gap;
        lastObservedAtRef.current = now; observedFramesRef.current++;
      } else lastObservedAtRef.current = 0;
      setLast(result);
      if (typeof result.repCount === "number") {
        const completed = Math.max(0, result.repCount - lastRepRef.current);
        if (result.isStandard) standardRepsRef.current += completed;
        lastRepRef.current = result.repCount;
        setReps(result.repCount);
      }
      // 统计标准次数和纠错次数
      if (result.status === "conclusive") {
        const error = result.isStandard ? "" : (result.primaryCue || "correction");
        if (error && error !== previousErrorRef.current) correctionCountRef.current += 1;
        previousErrorRef.current = error;
      }
      // 播放教练语音（纠错优先 > 计数 > 鼓励）
      if (exercise === "squat") {
        playSquatFeedback(result.repCount ?? 0, result.isStandard, result.speakText);
      } else {
        playGenericFeedback(result.repCount ?? 0, result.isStandard, result.speakText);
      }
      // 成功一帧：清零失败计数，恢复正常状态文字。
      failCountRef.current = 0;
      setStatusMsg(`服务器分析 · ${result.visibleKeypoints ?? "—"}/17 关键点 · ${result.inferenceMs ?? "—"} ms`);
    } catch (error) {
      if (!current()) return;
      // 仅在连续多帧失败时才提示，避免偶发单帧抖动误报。
      failCountRef.current += 1;
      if (failCountRef.current >= 3) {
        setLast(null);
        setStatusMsg(`分析中断：${error instanceof Error ? error.message : "请检查网络连接"}`);
      }
    } finally {
      busyRef.current = false;
    }
  }, [exercise, permission?.granted]);

  const startLoop = useCallback(async () => {
    if (runningRef.current || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
    const generation = ++runGenerationRef.current;
    firstFrameRef.current = false;
    runningRef.current = true;
    setRunning(true);
    setStatusMsg("等待摄像头和首帧分析…");
    // 记录开始时间，重置统计
    if (startTimeRef.current === 0) {
      startTimeRef.current = Date.now();
      standardRepsRef.current = 0;
      correctionCountRef.current = 0;
    }
    // 先播完开场引导，再开始抓帧计数（深蹲有专属引导，其他动作立即开始）
    await playIntro(exercise);
    // intro 播完后才启动抓帧
    if (!runningRef.current || generation !== runGenerationRef.current) return;
    sendFrame();
    timerRef.current = setInterval(sendFrame, FRAME_INTERVAL_MS);
  }, [sendFrame, exercise]);

  const stopLoop = useCallback(() => {
    lastObservedAtRef.current = 0;
    if (runningRef.current) reportTrainingStage('training-stopped');
    ++runGenerationRef.current;
    runningRef.current = false;
    captureReadyRef.current = false;
    setRunning(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => {
    if (!consented || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
    if (permission?.granted && !initialStartRef.current) {
      initialStartRef.current = true;
      void startLoop();
    } else if (permission?.status === 'denied') {
      stopLoop(); void stopCoachAudio(); void stopFormSession();
      forgetTraining(modelBaseUrl()); setConsented(false);
    } else if (permission && !permission.granted && !permissionRetryRef.current) {
      // A remembered user consent still goes through the real browser/OS permission API.
      permissionRetryRef.current = true;
      void requestPermission().then(result => {
        if (!result.granted) { forgetTraining(modelBaseUrl()); setConsented(false); }
      }).catch(() => { setConsented(false); setStatusMsg('请检查系统相机权限'); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consented, permission?.granted]);
  useEffect(() => () => { stopLoop(); void stopCoachAudio(); void stopFormSession(); }, [stopLoop]);
  useEffect(() => {
    const suspend = () => { stopLoop(); void stopCoachAudio(); void stopFormSession(); setStatusMsg('已暂停 · 点击继续'); };
    const visibility = () => { if (document.visibilityState === 'hidden') suspend(); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibility);
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') suspend(); });
    return () => { listener.remove(); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibility); };
  }, [stopLoop]);

  const onBack = () => { heavyHaptic(); stopLoop(); void stopCoachAudio(); void stopFormSession(); navigation.goBack(); };
  const onVideo = () => {
    stopLoop(); void stopCoachAudio(); void stopFormSession();
    navigation.replace("VideoAnalysis", { exercise });
  };
  const onEnd = () => {
    heavyHaptic();
    stopLoop();
    void stopCoachAudio();
    void stopFormSession();
    const durationSec = Math.round(observedMsRef.current / 1000);
    if (!completionSentRef.current && durationSec > 0 && observedFramesRef.current >= 2) {
      completionSentRef.current = true;
      reportTrainingCompletion({ input_mode: 'live', duration_sec: durationSec, exercise_name: exercise,
        total_reps: reps, observed_frames: observedFramesRef.current });
    }
    navigation.replace("WorkoutReport", {
      report: {
        exercise,
        totalReps: reps,
        standardReps: standardRepsRef.current,
        correctionCount: correctionCountRef.current,
        durationSec,
      },
    });
  };
  const togglePause = () => {
    lightHaptic();
    if (runningRef.current) { stopLoop(); void stopCoachAudio(); setStatusMsg("已暂停 · 点击继续"); }
    else void startLoop();
  };

  const cameraReady = consented && permission?.granted === true;
  const tone: StatusTone = (last?.statusColor as StatusTone) ?? "idle";
  const palette = toneOf(tone);
  const primaryCue = last?.primaryCue ?? last?.correctionText ?? "站到画面中央，开始动作";
  const secondaryCue = last?.secondaryCue ?? "AI 实时分析你的每一下";
  const phaseText = last?.phase ? PHASE_LABEL[last.phase] ?? last.phase : "—";

  return (
    <View style={styles.root}>
      {cameraReady && running ? (
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing}
          onCameraReady={() => { if (!runningRef.current) return; captureReadyRef.current = true; rememberTraining(modelBaseUrl(), exercise); reportTrainingStage('camera-ready'); }}
          onMountError={() => { stopLoop(); void stopCoachAudio(); void stopFormSession(); forgetTraining(modelBaseUrl());
            initialStartRef.current = false; setConsented(false); reportTrainingStage('camera-blocked'); setStatusMsg("摄像头不可用，请检查系统相机权限"); }} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noCam]} />
      )}

      {/* 上下渐变遮罩，提升叠加层可读性与高级感 */}
      <LinearGradient
        colors={["rgba(8,11,16,0.78)", "rgba(8,11,16,0)", "rgba(8,11,16,0)", "rgba(8,11,16,0.9)"]}
        locations={[0, 0.28, 0.6, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.overlay} edges={["top", "bottom"]} pointerEvents="box-none">
        {/* 顶部 */}
        <View style={styles.topBar}>
          <GlassBtn label="‹" round onPress={onBack} />
          <BlurView intensity={28} tint="dark" style={styles.exerciseChip}>
            <View style={[styles.toneDot, { backgroundColor: palette.color }]} />
            <Text style={styles.exerciseChipText}>{EXERCISE_LABEL[exercise]}</Text>
          </BlurView>
          <GlassBtn label="⇄" round onPress={() => { lightHaptic(); setFacing((f) => (f === "front" ? "back" : "front")); }} />
        </View>

        {/* 中部：状态环 + 次数 */}
        <View style={styles.center}>
          <Animated.View style={[styles.ring, { borderColor: palette.color }, ringStyle]}>
            <View style={styles.ringInner}>
              <Text style={styles.repValue}>{reps}</Text>
              <Text style={styles.repUnit}>次</Text>
            </View>
          </Animated.View>
          <BlurView intensity={24} tint="dark" style={styles.statusPill}>
            <View style={[styles.toneDot, { backgroundColor: palette.color }]} />
            <Text style={[styles.statusPillText, { color: palette.color }]}>{palette.label}</Text>
            <Text style={styles.phaseText}>· {phaseText}</Text>
          </BlurView>
        </View>

        {/* 底部：提示卡 + 控制 */}
        <View style={styles.bottom}>
          <BlurView intensity={32} tint="dark" style={[styles.cueCard, { borderLeftColor: palette.color }]}>
            <Text style={styles.cuePrimary} numberOfLines={2}>{primaryCue}</Text>
            <Text style={styles.cueSecondary} numberOfLines={2}>{secondaryCue}</Text>
          </BlurView>

          <View style={styles.controls}>
            <Pressable
              onPress={togglePause}
              disabled={!cameraReady}
              style={[styles.ctrlBtn, { backgroundColor: running ? "rgba(255,255,255,0.16)" : colors.accent }]}
            >
              <Text style={styles.ctrlText}>{running ? "暂停" : "继续"}</Text>
            </Pressable>
            <Pressable onPress={onEnd} style={[styles.ctrlBtn, styles.ctrlEnd]}>
              <Text style={styles.ctrlText}>结束</Text>
            </Pressable>
          </View>

          <Text style={styles.statusMsg}>{statusMsg}</Text>
          {Platform.OS === "web" && <Pressable accessibilityRole="button" onPress={onVideo} style={styles.ctrlBtn}>
            <Text style={styles.ctrlText}>改用预录视频分析</Text>
          </Pressable>}
          {cameraReady && <Pressable onPress={() => {
            stopLoop(); void stopCoachAudio(); void stopFormSession(); forgetTraining(modelBaseUrl());
            initialStartRef.current = false; setConsented(false);
          }}><Text style={styles.statusMsg}>已记住相机与分析授权 · 清除授权</Text></Pressable>}
        </View>
      </SafeAreaView>

      {/* 摄像头未就绪：置顶授权浮层，按钮始终可点（旧实现藏在遮罩层下点不到）。 */}
      {!cameraReady && (
        <SafeAreaView style={styles.permOverlay} edges={["top", "bottom"]}>
          <Text style={styles.noCamEmoji}>📷</Text>
          <Text style={styles.noCamText}>
            {permission?.canAskAgain === false
              ? "摄像头权限未允许\n请在 iPhone 设置中允许 Pocket Buddy 使用相机；浏览器请检查网站相机权限。"
              : "开启摄像头，开始实时姿势矫正"}
          </Text>
          <Text style={styles.noCamText}>点击同意后，压缩的动作画面会发送至 {new URL(modelBaseUrl()).hostname} 分析。服务不保存画面；暂停或返回会关闭摄像头并停止发送。反馈不构成医疗建议。</Text>
          <Text style={styles.noCamText}>本机将记住对该服务的同意；下次通过 Frost 调用可直接开启。你可以随时清除授权，相机访问仍以系统权限为准。</Text>
          <Text style={styles.statusMsg}>{statusMsg}</Text>
          <Pressable style={styles.permBtn} onPress={async () => {
            try {
              const allowed = permission?.granted || (await requestPermission()).granted;
              if (allowed) { rememberTraining(modelBaseUrl(), exercise); initialStartRef.current = false; setConsented(true); }
              else { forgetTraining(modelBaseUrl()); setConsented(false); setStatusMsg('未允许摄像头，未开始采集'); }
            }
            catch { setConsented(false); setStatusMsg("无法获取相机权限，请检查系统设置"); }
          }}>
            <Text style={styles.permBtnText}>同意并开启摄像头</Text>
          </Pressable>
          <Pressable style={styles.permBack} onPress={onBack}>
            <Text style={styles.permBackText}>返回</Text>
          </Pressable>
          {Platform.OS === "web" && <Pressable accessibilityRole="button" style={styles.permBack} onPress={onVideo}>
            <Text style={styles.permBackText}>不使用摄像头 · 改用预录视频</Text>
          </Pressable>}
        </SafeAreaView>
      )}
    </View>
  );
}

function GlassBtn({ label, onPress, round }: { label: string; onPress: () => void; round?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      <BlurView intensity={28} tint="dark" style={[styles.glassBtn, round && styles.glassBtnRound]}>
        <Text style={styles.glassBtnText}>{label}</Text>
      </BlurView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  noCam: { alignItems: "center", justifyContent: "center", padding: spacing(6), backgroundColor: colors.darkBg },
  permOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.darkBg, alignItems: "center", justifyContent: "center", padding: spacing(6), gap: spacing(2), zIndex: 20 },
  permBack: { marginTop: spacing(4), paddingVertical: spacing(2.5), paddingHorizontal: spacing(6) },
  permBackText: { color: "rgba(255,255,255,0.6)", fontSize: font.body, fontWeight: "600" },
  noCamEmoji: { fontSize: 48, marginBottom: spacing(4) },
  noCamText: { color: "rgba(255,255,255,0.8)", textAlign: "center", lineHeight: 24, fontSize: font.body },
  permBtn: { marginTop: spacing(5), backgroundColor: colors.accent, paddingVertical: spacing(3.5), paddingHorizontal: spacing(8), borderRadius: radius.md, borderWidth: 2, borderColor: "#fff", ...elevation("float") },
  permBtnText: { color: colors.onAccent, fontFamily: pixelFont, fontWeight: "800", fontSize: font.h3 },

  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between", padding: spacing(4) },

  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  glassBtn: { paddingVertical: spacing(2.5), paddingHorizontal: spacing(4), borderRadius: radius.pill, overflow: "hidden", borderWidth: 2, borderColor: colors.darkBorder },
  glassBtnRound: { width: 44, height: 44, paddingVertical: 0, paddingHorizontal: 0, borderRadius: 0, alignItems: "center", justifyContent: "center" },
  glassBtnText: { color: "#fff", fontFamily: pixelFont, fontWeight: "800", fontSize: font.h2 },
  exerciseChip: { flexDirection: "row", alignItems: "center", gap: spacing(2), paddingVertical: spacing(2.5), paddingHorizontal: spacing(4), borderRadius: radius.pill, overflow: "hidden", borderWidth: 2, borderColor: colors.darkBorder },
  exerciseChipText: { color: "#fff", fontFamily: pixelFont, fontWeight: "800", fontSize: font.body },

  center: { alignItems: "center", gap: spacing(4) },
  ring: { width: RING, height: RING, borderRadius: RING / 2, borderWidth: 6, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(8,11,16,0.25)" },
  ringInner: { alignItems: "center", justifyContent: "center", flexDirection: "row" },
  repValue: { color: "#fff", fontFamily: pixelFont, fontSize: 96, fontWeight: "900", letterSpacing: -3, lineHeight: 100 },
  repUnit: { color: "rgba(255,255,255,0.7)", fontSize: font.h2, fontWeight: "700", marginLeft: spacing(2), marginBottom: spacing(4) },
  statusPill: { flexDirection: "row", alignItems: "center", gap: spacing(2), paddingVertical: spacing(2), paddingHorizontal: spacing(4), borderRadius: radius.pill, overflow: "hidden", borderWidth: 2, borderColor: colors.darkBorder },
  toneDot: { width: 8, height: 8, borderRadius: 4 },
  statusPillText: { fontFamily: pixelFont, fontSize: font.body, fontWeight: "800" },
  phaseText: { color: "rgba(255,255,255,0.7)", fontSize: font.small, fontWeight: "600" },

  bottom: { gap: spacing(3.5) },
  cueCard: { borderRadius: radius.lg, padding: spacing(4.5), borderWidth: 2, borderColor: colors.darkBorder, borderLeftWidth: 6, overflow: "hidden" },
  cuePrimary: { color: "#fff", fontFamily: pixelFont, fontSize: font.h2, fontWeight: "800", lineHeight: 28 },
  cueSecondary: { color: "rgba(255,255,255,0.72)", fontSize: font.small, marginTop: spacing(2), lineHeight: 19 },

  controls: { flexDirection: "row", gap: spacing(3) },
  ctrlBtn: { flex: 1, minHeight: 54, borderRadius: radius.md, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.darkBorder },
  ctrlEnd: { backgroundColor: "rgba(255,98,94,0.96)", borderColor: colors.darkBorder },
  ctrlText: { color: "#fff", fontFamily: pixelFont, fontSize: font.h3, fontWeight: "800" },
  statusMsg: { color: "rgba(255,255,255,0.65)", fontSize: font.tiny, textAlign: "center" },
});
