/**
 * 训练总结页。
 * 显示本次训练的次数、标准率、纠错次数、时长，以及下一步建议。
 * 数据由训练页在结束时传入，无需后端。
 */
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Card, PrimaryButton, GhostButton } from "../ui/components";
import { colors, elevation, font, pixelFont, radius, spacing } from "../ui/theme";
import { EXERCISE_LABEL } from "../types";
import type { WorkoutStackParamList } from "../navigation";

type Props = NativeStackScreenProps<WorkoutStackParamList, "WorkoutReport">;

/** 根据标准率给出评语。 */
function formComment(rate: number): string {
  if (rate >= 0.9) return "动作非常标准，继续保持这个水平！";
  if (rate >= 0.7) return "整体不错，注意保持动作质量。";
  if (rate >= 0.5) return "有进步空间，多关注教练提示。";
  return "建议放慢节奏，先把动作做标准再增加次数。";
}

/** 根据次数和标准率给出下一步建议。 */
function nextFocus(totalReps: number, standardRate: number, correctionCount: number): string {
  if (correctionCount === 0) return "动作全程标准，下次可以适当增加次数或难度。";
  if (standardRate < 0.6) return "下次重点关注动作质量，宁可少做几个，也要做标准。";
  if (totalReps < 10) return "次数还可以再多一些，目标是每组 10~15 个。";
  return "保持当前节奏，逐步增加每组次数。";
}

export default function WorkoutReportScreen({ navigation, route }: Props) {
  const { report } = route.params;
  const { exercise, totalReps, standardReps, correctionCount, durationSec } = report;

  const standardRate = totalReps > 0 ? standardReps / totalReps : 0;
  const formScore = Math.round(standardRate * 100);
  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;
  const durationText = mins > 0 ? `${mins} 分 ${secs} 秒` : `${secs} 秒`;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.container}>
        {/* 标题 */}
        <View style={styles.header}>
          <Text style={styles.title}>训练总结</Text>
          <Text style={styles.subtitle}>{EXERCISE_LABEL[exercise]} · 本次训练完成</Text>
        </View>

        {/* 核心数据四宫格 */}
        <View style={styles.grid}>
          <MetricCard label="完成次数" value={String(totalReps)} unit="个" accent />
          <MetricCard label="标准次数" value={String(standardReps)} unit="个" />
          <MetricCard label="动作评分" value={String(formScore)} unit="分" accent={formScore >= 70} />
          <MetricCard label="训练时长" value={durationText} unit="" />
        </View>

        {/* 动作评语 */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>动作评价</Text>
          <Text style={styles.cardBody}>{formComment(standardRate)}</Text>
          {correctionCount > 0 && (
            <Text style={styles.cardNote}>本次共收到 {correctionCount} 次纠错提示</Text>
          )}
        </Card>

        {/* 下一步建议 */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>下次重点</Text>
          <Text style={styles.cardBody}>{nextFocus(totalReps, standardRate, correctionCount)}</Text>
        </Card>

        {/* 操作按钮 */}
        <View style={styles.actions}>
          <PrimaryButton
            label="再练一组"
            onPress={() =>
              navigation.replace("Training", { exercise })
            }
            style={styles.btnPrimary}
          />
          <GhostButton
            label="返回选择"
            onPress={() => navigation.navigate("Pick")}
            style={styles.btnGhost}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function MetricCard({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.metric, accent && styles.metricAccent]}>
      <Text style={[styles.metricValue, accent && styles.metricValueAccent]}>
        {value}
        {unit ? <Text style={styles.metricUnit}> {unit}</Text> : null}
      </Text>
      <Text style={[styles.metricLabel, accent && styles.metricLabelAccent]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: spacing(5), gap: spacing(4) },

  header: { marginTop: spacing(2) },
  title: { fontFamily: pixelFont, fontSize: font.h1, fontWeight: "900", color: colors.text, letterSpacing: 0.5 },
  subtitle: { fontSize: font.body, color: colors.textMuted, marginTop: spacing(1) },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing(3) },
  metric: {
    width: "47%",
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing(4),
    alignItems: "center",
    gap: spacing(1),
    ...elevation("card"),
  },
  metricAccent: { backgroundColor: colors.accent },
  metricValue: { fontFamily: pixelFont, fontSize: font.h1, fontWeight: "900", color: colors.text },
  metricValueAccent: { color: colors.accentDeep },
  metricUnit: { fontSize: font.small, fontWeight: "600", color: colors.textFaint },
  metricLabel: { fontSize: font.tiny, color: colors.textMuted },
  metricLabelAccent: { color: colors.accentDeep },

  card: { gap: spacing(2) },
  cardTitle: { fontFamily: pixelFont, fontSize: font.h3, fontWeight: "800", color: colors.text },
  cardBody: { fontSize: font.body, color: colors.textMuted, lineHeight: 22 },
  cardNote: { fontSize: font.small, color: colors.textFaint, marginTop: spacing(1) },

  actions: { gap: spacing(3), marginTop: "auto" },
  btnPrimary: {},
  btnGhost: {},
});
