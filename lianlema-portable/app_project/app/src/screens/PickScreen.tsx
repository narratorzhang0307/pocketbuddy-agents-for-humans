/**
 * 运动首页（Keep 风格）。
 * 浅色干净背景 + 动作横向选择 + 大圆形「GO」开始按钮。
 * 选中动作后点 GO 进入实时姿势矫正。
 */
import { useEffect, useRef, useState } from "react";
import { Animated, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type DimensionValue } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { springBouncy, springGentle } from "../ui/animation";
import { heavyHaptic, lightHaptic } from "../ui/haptics";
import { colors, font, pixelFont, radius, spacing } from "../ui/theme";
import { EXERCISES, type SupportedExercise } from "../types";
import type { WorkoutStackParamList } from "../navigation";
import { modelBaseUrl } from "../analysis";
import { consumeFrostTraining, rememberedTraining } from "../camera/trainingConsent";

const DACHSHUND = require("../../assets/frost-dachshund.png");

type Props = NativeStackScreenProps<WorkoutStackParamList, "Pick">;

const FROST_EXERCISE_HINTS: Array<[SupportedExercise, string[]]> = [
  ["squat", ["深蹲", "squat"]],
  ["lunge", ["弓步蹲", "弓步", "lunge"]],
  ["push_up", ["俯卧撑", "pushup", "push-up"]],
  ["dumbbell_shoulder_press", ["哑铃肩推", "肩推", "shoulderpress"]],
  ["dumbbell_rows", ["哑铃划船", "划船", "dumbbellrow"]],
  ["bicep_curls", ["二头弯举", "弯举", "bicepcurl"]],
  ["situps", ["仰卧起坐", "situp", "sit-up"]],
  ["tricep_extensions", ["肱三头屈伸", "三头屈伸", "tricepextension"]],
  ["lateral_shoulder_raises", ["侧平举", "lateralraise"]],
  ["jumping_jacks", ["开合跳", "jumpingjack"]],
];

function frostExercise(): SupportedExercise {
  if (Platform.OS !== "web" || typeof window === "undefined") return EXERCISES[0]!.value;
  const task = (new URLSearchParams(window.location.search).get("frostTask") || "").toLowerCase().replace(/\s+/g, "");
  return FROST_EXERCISE_HINTS.find(([, hints]) => hints.some((hint) => task.includes(hint)))?.[0]
    ?? rememberedTraining(modelBaseUrl()) ?? EXERCISES[0]!.value;
}

export default function PickScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState<SupportedExercise>(frostExercise);
  const [serviceReady, setServiceReady] = useState(false);
  const [serviceMessage, setServiceMessage] = useState("正在检查模型服务…");
  const [retry, setRetry] = useState(0);
  const hosted = modelBaseUrl().startsWith("https://pocketbuddy.throughtheglass.art/");
  useEffect(() => {
    if (!hosted) { setServiceReady(true); setServiceMessage("电脑模型服务 · 开始后验证连接"); return; }
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 12000);
    setServiceReady(false);
    setServiceMessage("正在检查模型服务…");
    fetch(`${modelBaseUrl()}/api/health`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("unavailable");
        const data = await response.json();
        if (data.protocol !== "pocket-lianlema/v1" || data.models?.ready !== true) throw new Error("not ready");
        if (controller.signal.aborted) return;
        setServiceReady(true);
        setServiceMessage("模型已就绪 · RTMO / ST-GCN");
      }).catch(() => { if (active) setServiceMessage("模型暂不可用 · 点击重试"); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [retry, hosted]);
  const autoAttempted = useRef(false);
  useEffect(() => {
    if (!serviceReady || autoAttempted.current || Platform.OS !== 'web' || typeof window === 'undefined') return;
    autoAttempted.current = true;
    try {
      if (consumeFrostTraining(window.location.search, window.parent !== window, document.visibilityState !== 'hidden', window.sessionStorage)) {
        navigation.navigate('Training', { exercise: selected });
      }
    } catch { /* Storage unavailable: keep the normal GO button. */ }
  }, [serviceReady, navigation, selected]);
  const current = EXERCISES.find((e) => e.value === selected) ?? EXERCISES[0]!;
  const chipWidth: DimensionValue = width >= 520 ? "18.4%" : width >= 380 ? "31%" : "48%";

  const go = () => {
    if (!serviceReady) { setRetry(value => value + 1); return; }
    heavyHaptic();
    navigation.navigate("Training", { exercise: selected });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Pocket Earth 内嵌 Skill：使用 Frost 腊肠犬身份。 */}
        <View style={styles.header}>
          <View style={styles.avatarPanel}>
            <Image source={DACHSHUND} style={styles.logo} resizeMode="contain" />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.brand}>练了吗</Text>
            <Text style={styles.subtitle}>FROST FORM COACH</Text>
            <Text style={styles.headerDescription}>{hosted ? "服务器" : "本机"}姿态识别 · 实时计数与动作纠正</Text>
          </View>
        </View>

        <Pressable onPress={() => setRetry(value => value + 1)}>
          <Text style={styles.disclaimer}>{serviceMessage}</Text>
        </Pressable>

        {/* 动作选择 */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>选择训练动作</Text>
          <Text style={styles.sectionCount}>{EXERCISES.length} ACTIONS</Text>
        </View>
        <View style={styles.chips}>
          {EXERCISES.map((e, index) => {
            const active = e.value === selected;
            return (
              <Pressable
                key={e.value}
                onPress={() => { lightHaptic(); setSelected(e.value); }}
                style={[styles.chip, { width: chipWidth }, active && styles.chipActive]}
              >
                <Text style={[styles.chipIndex, active && styles.chipIndexActive]}>{String(index + 1).padStart(2, "0")}</Text>
                <View style={[styles.chipIcon, active && styles.chipIconActive]}>
                  <Text style={styles.chipEmoji}>{e.emoji}</Text>
                </View>
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{e.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* 当前动作信息卡 */}
        <View style={styles.infoCard}>
          <View style={styles.infoAccent} />
          <View style={styles.infoIcon}><Text style={styles.infoEmoji}>{current.emoji}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoEyebrow}>CURRENT FORM</Text>
            <Text style={styles.infoLabel}>{current.label}</Text>
            <Text style={styles.infoMuscle}>{current.muscle}</Text>
            <Text style={styles.infoTip}>{current.tip}</Text>
          </View>
        </View>

        {/* 大圆形 GO 按钮 */}
        <View style={styles.goWrap}>
          <GoButton onPress={go} />
          <Text style={styles.goHint}>摄像头实时分析 · {current.label}</Text>
          {Platform.OS === "web" && <Pressable accessibilityRole="button" accessibilityLabel="上传视频分析" onPress={() => navigation.navigate("VideoAnalysis", { exercise: selected })}
            style={[styles.goBtn, { backgroundColor: colors.surface }]}>
            <Text style={[styles.goText, { color: colors.text, fontSize: 18 }]}>上传视频分析</Text>
          </Pressable>}
          {Platform.OS === "web" && <Text style={styles.goHint}>使用已录视频 · 不开启摄像头</Text>}
        </View>

        <Text style={styles.disclaimer}>反馈仅供参考，不构成医疗建议。</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function GoButton({ onPress }: { onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, ...springGentle }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, ...springBouncy }).start()}
        style={styles.goBtn}
      >
        <Text style={styles.goText}>GO</Text>
      </Pressable>
    </Animated.View>
  );
}

const GO_WIDTH = 260;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing(4), paddingBottom: spacing(6) },

  header: { flexDirection: "row", alignItems: "center", gap: spacing(3), marginTop: spacing(1), marginBottom: spacing(4), padding: spacing(3), backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border },
  avatarPanel: { width: 112, height: 76, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  logo: { width: 104, height: 68 },
  headerCopy: { flex: 1, minWidth: 0 },
  brand: { fontFamily: pixelFont, fontSize: 21, fontWeight: "900", color: colors.text, letterSpacing: 2 },
  subtitle: { fontFamily: pixelFont, fontSize: font.tiny, fontWeight: "800", color: colors.accentDeep, marginTop: spacing(1), letterSpacing: 0.7 },
  headerDescription: { fontSize: font.tiny, color: colors.textMuted, marginTop: spacing(1.5), lineHeight: 16 },
  customBtn: {
    alignSelf: "center",
    marginTop: spacing(2),
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(5),
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  customBtnText: { fontSize: font.small, fontWeight: "700", color: colors.accentDeep },
  statusDot: { flexDirection: "row", alignItems: "center", gap: spacing(1.5), paddingVertical: spacing(1.5), paddingHorizontal: spacing(3), borderRadius: radius.pill, marginTop: spacing(2) },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: font.tiny, fontWeight: "700" },

  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing(3), marginBottom: spacing(3) },
  sectionTitle: { fontFamily: pixelFont, fontSize: font.small, fontWeight: "800", color: colors.text, letterSpacing: 1 },
  sectionCount: { fontFamily: pixelFont, fontSize: 9, color: colors.textFaint, letterSpacing: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2) },
  chip: { position: "relative", minHeight: 102, paddingVertical: spacing(2.5), borderRadius: radius.lg, backgroundColor: "#FAFAF8", alignItems: "center", justifyContent: "center", gap: spacing(2), borderWidth: 1.5, borderColor: colors.border },
  chipActive: { backgroundColor: colors.accentSoft, borderWidth: 2, borderColor: colors.border },
  chipIndex: { position: "absolute", top: 6, left: 7, fontFamily: pixelFont, fontSize: 7, color: colors.textFaint, letterSpacing: 0.5 },
  chipIndexActive: { color: colors.accentDeep },
  chipIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  chipIconActive: { backgroundColor: colors.accent },
  chipEmoji: { fontSize: 28 },
  chipLabel: { fontSize: font.small, fontWeight: "700", color: colors.textMuted },
  chipLabelActive: { color: colors.text },

  infoCard: { position: "relative", flexDirection: "row", gap: spacing(3), alignItems: "center", marginTop: spacing(4), padding: spacing(3), paddingLeft: spacing(4), backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, overflow: "hidden" },
  infoAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 5, backgroundColor: colors.accent },
  infoIcon: { width: 58, height: 58, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  infoEmoji: { fontSize: 34 },
  infoEyebrow: { fontFamily: pixelFont, fontSize: 8, color: colors.textFaint, letterSpacing: 1.2, marginBottom: spacing(0.5) },
  infoLabel: { fontFamily: pixelFont, fontSize: font.h2, fontWeight: "800", color: colors.text },
  infoMuscle: { fontSize: font.small, color: colors.accentDeep, fontWeight: "600", marginTop: spacing(0.5) },
  infoTip: { fontSize: font.small, color: colors.textMuted, marginTop: spacing(2), lineHeight: 19 },

  goWrap: { alignItems: "center", marginTop: spacing(6), gap: spacing(3) },
  goBtn: {
    width: GO_WIDTH,
    height: 66,
    borderRadius: 0,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  goText: { color: colors.onAccent, fontFamily: pixelFont, fontSize: 26, fontWeight: "900", letterSpacing: 2 },
  goHint: { fontFamily: pixelFont, fontSize: font.small, color: colors.textMuted, fontWeight: "700" },

  disclaimer: { marginTop: spacing(6), color: colors.textFaint, fontSize: font.tiny, textAlign: "center" },
});
