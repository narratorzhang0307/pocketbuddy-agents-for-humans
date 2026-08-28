/**
 * 通用设置页（我的 → 设置）。Keep 风格浅色，占位常见开关项。
 */
import { useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "../ui/components";
import { colors, font, pixelFont, spacing } from "../ui/theme";

export default function SettingsScreen() {
  const [voiceCue, setVoiceCue] = useState(true);
  const [haptics, setHaptics] = useState(true);
  const [keepAwake, setKeepAwake] = useState(true);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>通用设置</Text>

        <Card style={styles.group}>
          <ToggleRow label="语音播报" value={voiceCue} onChange={setVoiceCue} />
          <View style={styles.divider} />
          <ToggleRow label="触觉反馈" value={haptics} onChange={setHaptics} />
          <View style={styles.divider} />
          <ToggleRow label="训练时屏幕常亮" value={keepAwake} onChange={setKeepAwake} />
        </Card>

        <Text style={styles.note}>设置仅本地生效，重启后恢复默认（持久化后续接入）。</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.accent, false: colors.border }}
        thumbColor="#fff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing(5), paddingBottom: spacing(8) },
  title: { fontFamily: pixelFont, fontSize: font.h1, fontWeight: "900", color: colors.text, marginTop: spacing(2), marginBottom: spacing(6) },
  group: { padding: 0, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing(3.5), paddingHorizontal: spacing(4) },
  rowLabel: { fontFamily: pixelFont, fontSize: font.h3, fontWeight: "700", color: colors.text },
  divider: { height: 2, backgroundColor: colors.borderSubtle },
  note: { marginTop: spacing(6), color: colors.textFaint, fontSize: font.tiny, textAlign: "center" },
});
