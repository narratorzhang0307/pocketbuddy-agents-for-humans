/**
 * 音色选择页（我的 → 设置 → 音色）。Keep 风格浅色。
 * 选择训练时教练播报使用的音色，状态写入全局设置。
 */
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "../ui/components";
import { useSettings, VOICES } from "../store/settings";
import { lightHaptic } from "../ui/haptics";
import { colors, font, pixelFont, radius, spacing } from "../ui/theme";

export default function VoiceScreen() {
  const { voiceId, setVoiceId } = useSettings();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>音色</Text>
        <Text style={styles.tagline}>选择训练时教练的播报声音</Text>

        <View style={styles.list}>
          {VOICES.map((v) => {
            const active = v.id === voiceId;
            return (
              <Card
                key={v.id}
                style={[styles.row, active && styles.rowActive]}
                onPress={() => {
                  if (v.locked) return;
                  lightHaptic();
                  setVoiceId(v.id);
                }}
              >
                <View style={styles.iconBox}>
                  <Text style={styles.icon}>{v.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>{v.name}</Text>
                    {v.locked && <Text style={styles.lock}>即将开放</Text>}
                  </View>
                  <Text style={styles.desc}>{v.desc}</Text>
                </View>
                <View style={[styles.radio, active && styles.radioOn]}>
                  {active && <View style={styles.radioDot} />}
                </View>
              </Card>
            );
          })}
        </View>

        <Text style={styles.disclaimer}>音色仅影响语音播报，不影响动作识别结果。</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing(5), paddingBottom: spacing(8) },
  title: { fontFamily: pixelFont, fontSize: font.h1, fontWeight: "900", color: colors.text, marginTop: spacing(2) },
  tagline: { fontSize: font.body, color: colors.textMuted, marginTop: spacing(1), marginBottom: spacing(6) },

  list: { gap: spacing(3) },
  row: { flexDirection: "row", alignItems: "center", gap: spacing(4) },
  rowActive: { borderColor: colors.accent, borderWidth: 2 },
  iconBox: { width: 50, height: 50, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  icon: { fontSize: 24 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  name: { fontFamily: pixelFont, fontSize: font.h3, fontWeight: "700", color: colors.text },
  lock: { fontSize: font.tiny, color: colors.accentDeep, backgroundColor: colors.accentSoft, paddingHorizontal: spacing(2), paddingVertical: 2, borderRadius: radius.sm, overflow: "hidden", fontWeight: "700" },
  desc: { fontSize: font.small, color: colors.textFaint, marginTop: spacing(0.5) },

  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: colors.accent },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent },

  disclaimer: { marginTop: spacing(8), color: colors.textFaint, fontSize: font.tiny, textAlign: "center" },
});
