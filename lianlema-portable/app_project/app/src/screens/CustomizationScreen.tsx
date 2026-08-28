/**
 * 个性化训练页。
 * 填写目标/场地/频率/伤痛风险，本地生成推荐动作列表，点动作直接进训练。
 * 纯本地逻辑，无需后端。
 */
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Card, PrimaryButton } from "../ui/components";
import { lightHaptic, heavyHaptic } from "../ui/haptics";
import { colors, font, pixelFont, radius, spacing } from "../ui/theme";
import { EXERCISES, type SupportedExercise } from "../types";
import type { WorkoutStackParamList } from "../navigation";

type Props = NativeStackScreenProps<WorkoutStackParamList, "Customization">;

// ── 选项定义 ──────────────────────────────────────────────────────────────
const GOALS = [
  { id: "fat_loss",        label: "减脂",     emoji: "🔥" },
  { id: "muscle_gain",     label: "增肌",     emoji: "💪" },
  { id: "endurance",       label: "耐力",     emoji: "🏃" },
  { id: "general_fitness", label: "综合健身", emoji: "⚡" },
] as const;

const VENUES = [
  { id: "home",    label: "居家", emoji: "🏠" },
  { id: "gym",     label: "健身房", emoji: "🏋️" },
  { id: "outdoor", label: "户外", emoji: "🌳" },
] as const;

const RISKS = [
  { id: "shoulder",   label: "肩部" },
  { id: "lower_back", label: "腰部" },
  { id: "knee",       label: "膝盖" },
  { id: "wrist",      label: "手腕" },
  { id: "neck",       label: "颈部" },
] as const;

type GoalId  = (typeof GOALS)[number]["id"];
type VenueId = (typeof VENUES)[number]["id"];
type RiskId  = (typeof RISKS)[number]["id"];

// ── 推荐逻辑 ──────────────────────────────────────────────────────────────
function recommend(
  goal: GoalId,
  venue: VenueId,
  risks: RiskId[]
): SupportedExercise[] {
  const all: SupportedExercise[] = [
    "squat","lunge","push_up","dumbbell_shoulder_press",
    "dumbbell_rows","bicep_curls","situps",
    "tricep_extensions","lateral_shoulder_raises","jumping_jacks",
  ];

  // 按伤痛风险排除高风险动作
  let pool = all.filter((ex) => {
    if (risks.includes("knee") && (ex === "squat" || ex === "lunge")) return false;
    if (risks.includes("shoulder") && (ex === "push_up" || ex === "dumbbell_shoulder_press" || ex === "lateral_shoulder_raises")) return false;
    if (risks.includes("lower_back") && (ex === "dumbbell_rows" || ex === "situps")) return false;
    if (risks.includes("wrist") && (ex === "push_up" || ex === "dumbbell_rows" || ex === "bicep_curls" || ex === "tricep_extensions")) return false;
    // 居家/户外排除需要哑铃的动作
    if (venue === "home" || venue === "outdoor") {
      if (ex === "dumbbell_shoulder_press" || ex === "dumbbell_rows" || ex === "bicep_curls" || ex === "tricep_extensions") return false;
    }
    return true;
  });

  // 按目标排序（把最相关的排前面）
  const priority: Record<GoalId, SupportedExercise[]> = {
    fat_loss:        ["jumping_jacks","squat","lunge","push_up","situps"],
    muscle_gain:     ["squat","dumbbell_shoulder_press","dumbbell_rows","bicep_curls","tricep_extensions","push_up"],
    endurance:       ["jumping_jacks","squat","lunge","situps","push_up"],
    general_fitness: ["squat","push_up","lunge","situps","jumping_jacks","dumbbell_shoulder_press"],
  };

  const prio = priority[goal].filter((ex) => pool.includes(ex));
  const rest = pool.filter((ex) => !prio.includes(ex));
  return [...prio, ...rest].slice(0, 6); // 最多推荐 6 个
}

// ── 组件 ──────────────────────────────────────────────────────────────────
export default function CustomizationScreen({ navigation }: Props) {
  const [goal,  setGoal]  = useState<GoalId>("general_fitness");
  const [venue, setVenue] = useState<VenueId>("home");
  const [risks, setRisks] = useState<RiskId[]>([]);
  const [recommended, setRecommended] = useState<SupportedExercise[] | null>(null);

  const toggleRisk = (id: RiskId) => {
    lightHaptic();
    setRisks((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const generate = () => {
    heavyHaptic();
    setRecommended(recommend(goal, venue, risks));
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>个性化训练</Text>
        <Text style={styles.subtitle}>告诉我你的情况，我来推荐适合你的动作</Text>

        {/* 训练目标 */}
        <Section title="训练目标">
          <View style={styles.chips}>
            {GOALS.map((g) => (
              <Chip key={g.id} label={`${g.emoji} ${g.label}`} active={goal === g.id}
                onPress={() => { lightHaptic(); setGoal(g.id); setRecommended(null); }} />
            ))}
          </View>
        </Section>

        {/* 训练场地 */}
        <Section title="训练场地">
          <View style={styles.chips}>
            {VENUES.map((v) => (
              <Chip key={v.id} label={`${v.emoji} ${v.label}`} active={venue === v.id}
                onPress={() => { lightHaptic(); setVenue(v.id); setRecommended(null); }} />
            ))}
          </View>
        </Section>

        {/* 伤痛风险 */}
        <Section title="伤痛风险（可多选，有不适的部位请勾选）">
          <View style={styles.chips}>
            {RISKS.map((r) => (
              <Chip key={r.id} label={r.label} active={risks.includes(r.id)}
                activeColor={colors.alert} onPress={() => toggleRisk(r.id)} />
            ))}
          </View>
          {risks.length > 0 && (
            <Text style={styles.riskNote}>已排除对 {risks.map((r) => RISKS.find((x) => x.id === r)?.label).join("、")} 有压力的动作</Text>
          )}
        </Section>

        {/* 生成按钮 */}
        <PrimaryButton label="生成推荐动作" onPress={generate} style={styles.genBtn} />

        {/* 推荐结果 */}
        {recommended !== null && (
          <Section title={`推荐动作（${recommended.length} 个）`}>
            {recommended.length === 0 ? (
              <Text style={styles.emptyText}>当前伤痛风险较多，建议先咨询专业人士。</Text>
            ) : (
              <View style={styles.recList}>
                {recommended.map((ex) => {
                  const meta = EXERCISES.find((e) => e.value === ex)!;
                  return (
                    <Card key={ex} style={styles.recCard} onPress={() => navigation.navigate("Training", { exercise: ex })}>
                      <Text style={styles.recEmoji}>{meta.emoji}</Text>
                      <View style={styles.recInfo}>
                        <Text style={styles.recLabel}>{meta.label}</Text>
                        <Text style={styles.recMuscle}>{meta.muscle}</Text>
                      </View>
                      <Text style={styles.recArrow}>›</Text>
                    </Card>
                  );
                })}
              </View>
            )}
          </Section>
        )}

        <Text style={styles.disclaimer}>推荐仅供参考，不构成医疗建议。</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Chip({ label, active, activeColor, onPress }: {
  label: string; active: boolean; activeColor?: string; onPress: () => void;
}) {
  const ac = activeColor ?? colors.accent;
  return (
    <Pressable onPress={onPress}
      style={[styles.chip, active && { backgroundColor: ac + "20", borderColor: ac }]}>
      <Text style={[styles.chipText, active && { color: ac, fontWeight: "700" }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing(5), paddingBottom: spacing(10), gap: spacing(2) },

  title: { fontFamily: pixelFont, fontSize: font.h1, fontWeight: "900", color: colors.text, marginTop: spacing(2), letterSpacing: 0.5 },
  subtitle: { fontSize: font.body, color: colors.textMuted, marginBottom: spacing(4) },

  section: { gap: spacing(3) },
  sectionTitle: { fontFamily: pixelFont, fontSize: font.small, fontWeight: "800", color: colors.text, letterSpacing: 0.7 },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2) },
  chip: {
    paddingVertical: spacing(2.5), paddingHorizontal: spacing(4),
    borderRadius: radius.pill, borderWidth: 2, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: { fontSize: font.body, color: colors.textMuted },

  riskNote: { fontSize: font.small, color: colors.alert, marginTop: spacing(1) },

  genBtn: { marginTop: spacing(2) },

  recList: { gap: spacing(3) },
  recCard: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(3.5) },
  recEmoji: { fontSize: 28 },
  recInfo: { flex: 1 },
  recLabel: { fontFamily: pixelFont, fontSize: font.h3, fontWeight: "700", color: colors.text },
  recMuscle: { fontSize: font.small, color: colors.textFaint, marginTop: 2 },
  recArrow: { fontSize: 22, color: colors.textFaint },

  emptyText: { fontSize: font.body, color: colors.textMuted, lineHeight: 22 },
  disclaimer: { marginTop: spacing(6), color: colors.textFaint, fontSize: font.tiny, textAlign: "center" },
});
