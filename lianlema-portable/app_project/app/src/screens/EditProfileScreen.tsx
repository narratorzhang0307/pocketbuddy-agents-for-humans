/**
 * 编辑个人资料页（我的 → 个人资料）。Keep 风格浅色。
 * 可编辑：昵称、性别、年龄、身高、体重。保存写入全局设置。
 */
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { PrimaryButton } from "../ui/components";
import {
  GENDER_LABEL,
  useSettings,
  type Gender,
  type UserProfile,
} from "../store/settings";
import { lightHaptic } from "../ui/haptics";
import { colors, font, pixelFont, radius, spacing } from "../ui/theme";
import type { ProfileStackParamList } from "../navigation";

type Props = NativeStackScreenProps<ProfileStackParamList, "EditProfile">;

const toNum = (s: string): number | null => {
  const n = parseInt(s.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

export default function EditProfileScreen({ navigation }: Props) {
  const { profile, setProfile } = useSettings();

  const [name, setName] = useState(profile.name);
  const [gender, setGender] = useState<Gender>(profile.gender);
  const [age, setAge] = useState(profile.age ? String(profile.age) : "");
  const [height, setHeight] = useState(profile.heightCm ? String(profile.heightCm) : "");
  const [weight, setWeight] = useState(profile.weightKg ? String(profile.weightKg) : "");

  const save = () => {
    const next: UserProfile = {
      name: name.trim() || "练了吗用户",
      gender,
      age: toNum(age),
      heightCm: toNum(height),
      weightKg: toNum(weight),
    };
    setProfile(next);
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* 昵称 */}
        <Field label="昵称">
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="请输入昵称"
            placeholderTextColor={colors.textFaint}
            maxLength={16}
          />
        </Field>

        {/* 性别 */}
        <Field label="性别">
          <View style={styles.segment}>
            {(["male", "female", "unset"] as Gender[]).map((g) => {
              const active = gender === g;
              return (
                <Pressable
                  key={g}
                  onPress={() => { lightHaptic(); setGender(g); }}
                  style={[styles.segItem, active && styles.segItemActive]}
                >
                  <Text style={[styles.segText, active && styles.segTextActive]}>
                    {GENDER_LABEL[g]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        {/* 年龄 / 身高 / 体重 */}
        <Field label="年龄">
          <UnitInput value={age} onChangeText={setAge} unit="岁" placeholder="如 25" />
        </Field>
        <Field label="身高">
          <UnitInput value={height} onChangeText={setHeight} unit="cm" placeholder="如 175" />
        </Field>
        <Field label="体重">
          <UnitInput value={weight} onChangeText={setWeight} unit="kg" placeholder="如 65" />
        </Field>

        <PrimaryButton label="保存" onPress={save} style={{ marginTop: spacing(6) }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function UnitInput({
  value,
  onChangeText,
  unit,
  placeholder,
}: {
  value: string;
  onChangeText: (s: string) => void;
  unit: string;
  placeholder: string;
}) {
  return (
    <View style={styles.unitWrap}>
      <TextInput
        style={styles.unitInput}
        value={value}
        onChangeText={(t) => onChangeText(t.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        maxLength={3}
      />
      <Text style={styles.unitText}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing(5), paddingBottom: spacing(10) },

  field: { marginBottom: spacing(5) },
  fieldLabel: { fontFamily: pixelFont, fontSize: font.small, fontWeight: "800", color: colors.text, marginBottom: spacing(2) },

  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: spacing(3.5),
    paddingHorizontal: spacing(4),
    fontSize: font.h3,
    color: colors.text,
    borderWidth: 2,
    borderColor: colors.border,
  },

  segment: { flexDirection: "row", backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing(1), gap: spacing(1), borderWidth: 2, borderColor: colors.border },
  segItem: { flex: 1, paddingVertical: spacing(3), borderRadius: radius.sm, alignItems: "center", borderWidth: 1, borderColor: "transparent" },
  segItemActive: { backgroundColor: colors.accent },
  segText: { fontSize: font.body, fontWeight: "700", color: colors.textMuted },
  segTextActive: { color: colors.onAccent, fontFamily: pixelFont },

  unitWrap: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: spacing(4), borderWidth: 2, borderColor: colors.border },
  unitInput: { flex: 1, paddingVertical: spacing(3.5), fontSize: font.h3, color: colors.text },
  unitText: { fontSize: font.body, color: colors.textFaint, fontWeight: "600" },
});
