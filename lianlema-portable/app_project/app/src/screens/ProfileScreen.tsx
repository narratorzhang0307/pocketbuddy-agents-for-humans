/**
 * 个人中心（我的）。Keep 风格浅色。
 * 顶部用户卡（头像 + 昵称 + 基础信息），下面是身体数据与设置入口。
 */
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Card } from "../ui/components";
import {
  GENDER_LABEL,
  bmiLevel,
  calcBmi,
  useSettings,
} from "../store/settings";
import { colors, elevation, font, pixelFont, radius, spacing } from "../ui/theme";
import type { ProfileStackParamList } from "../navigation";

type Props = NativeStackScreenProps<ProfileStackParamList, "Profile">;

export default function ProfileScreen({ navigation }: Props) {
  const { voice, profile } = useSettings();
  const bmi = calcBmi(profile.heightCm, profile.weightKg);

  const subtitle = [
    GENDER_LABEL[profile.gender] !== "未设置" ? GENDER_LABEL[profile.gender] : null,
    profile.age ? `${profile.age} 岁` : null,
  ]
    .filter(Boolean)
    .join(" · ") || "完善资料，获得更精准的训练建议";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>我的</Text>

        {/* 用户卡（点击编辑资料） */}
        <Card style={styles.userCard} onPress={() => navigation.navigate("EditProfile")}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(profile.name || "练").slice(0, 1)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{profile.name || "练了吗用户"}</Text>
            <Text style={styles.handle}>{subtitle}</Text>
          </View>
          <Text style={styles.editHint}>编辑 ›</Text>
        </Card>

        {/* 身体数据 */}
        <Text style={styles.sectionTitle}>身体数据</Text>
        <View style={styles.stats}>
          <Stat label="身高" value={profile.heightCm ? String(profile.heightCm) : "—"} unit="cm" />
          <View style={styles.statDivider} />
          <Stat label="体重" value={profile.weightKg ? String(profile.weightKg) : "—"} unit="kg" />
          <View style={styles.statDivider} />
          <Stat
            label={`BMI · ${bmiLevel(bmi)}`}
            value={bmi !== null ? String(bmi) : "—"}
            unit=""
          />
        </View>

        {/* 设置区 */}
        <Text style={styles.sectionTitle}>设置</Text>
        <Card style={styles.menu}>
          <Row label="个人资料" value="" onPress={() => navigation.navigate("EditProfile")} />
          <View style={styles.rowDivider} />
          <Row label="音色" value={voice.name} onPress={() => navigation.navigate("Voice")} />
          <View style={styles.rowDivider} />
          <Row label="通用设置" value="" onPress={() => navigation.navigate("Settings")} />
        </Card>

        <Text style={styles.version}>练了吗 v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>
        {value}
        {!!unit && <Text style={styles.statUnit}> {unit}</Text>}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Row({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Card style={styles.rowCard} onPress={onPress}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={{ flex: 1 }} />
      {!!value && <Text style={styles.rowValue}>{value}</Text>}
      <Text style={styles.rowChevron}>›</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing(5), paddingBottom: spacing(8) },
  title: { fontFamily: pixelFont, fontSize: font.h1, fontWeight: "900", color: colors.text, letterSpacing: 1, marginTop: spacing(2), marginBottom: spacing(5) },

  userCard: { flexDirection: "row", alignItems: "center", gap: spacing(4) },
  avatar: { width: 60, height: 60, borderRadius: 0, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.onAccent, fontSize: 26, fontWeight: "900" },
  name: { fontFamily: pixelFont, fontSize: font.h2, fontWeight: "800", color: colors.text },
  handle: { fontSize: font.small, color: colors.textMuted, marginTop: spacing(1) },
  editHint: { fontSize: font.small, color: colors.accentDeep, fontWeight: "700" },

  sectionTitle: { fontFamily: pixelFont, fontSize: font.small, fontWeight: "800", color: colors.text, letterSpacing: 1, marginTop: spacing(7), marginBottom: spacing(3) },

  stats: { flexDirection: "row", alignItems: "center", paddingVertical: spacing(4), backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, ...elevation("card") },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontFamily: pixelFont, fontSize: font.h1, fontWeight: "900", color: colors.text },
  statUnit: { fontSize: font.small, fontWeight: "600", color: colors.textFaint },
  statLabel: { fontSize: font.tiny, color: colors.textMuted, marginTop: spacing(1) },
  statDivider: { width: 2, height: 40, backgroundColor: colors.border },

  menu: { padding: 0, gap: 0, overflow: "hidden" },
  rowCard: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(4), paddingHorizontal: spacing(4), borderWidth: 0, borderRadius: 0, backgroundColor: "transparent" },
  rowLabel: { fontSize: font.h3, fontWeight: "600", color: colors.text },
  rowValue: { fontSize: font.body, color: colors.textMuted, marginRight: spacing(2) },
  rowChevron: { fontSize: 22, color: colors.textFaint, fontWeight: "300" },
  rowDivider: { height: 2, backgroundColor: colors.borderSubtle },

  version: { textAlign: "center", color: colors.textFaint, fontSize: font.tiny, marginTop: spacing(8) },
});
