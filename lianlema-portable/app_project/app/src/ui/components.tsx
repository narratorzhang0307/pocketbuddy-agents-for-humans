/**
 * 通用 UI 基元 —— 基于 RN 内置 Animated（无原生依赖，Expo Go 必跑）。
 *
 * Card / PrimaryButton / GhostButton / Pill / GlassCard。
 * 按压时轻微缩放 + 触觉反馈。
 */
import { useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";

import { colors, elevation, font, pixelFont, radius, spacing } from "./theme";
import { springGentle, springBouncy } from "./animation";
import { lightHaptic, heavyHaptic } from "./haptics";

/** 通用按压缩放 hook。 */
function usePressScale() {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = (to = 0.97) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, ...springGentle }).start();
  const pressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, ...springBouncy }).start();
  return { scale, pressIn, pressOut };
}

/* ───────── Pill ───────── */

export function Pill({
  text,
  color = colors.textMuted,
  tint = "transparent",
  solid = false,
}: {
  text: string;
  color?: string;
  tint?: string;
  solid?: boolean;
}) {
  return (
    <View
      style={[
        styles.pill,
        solid
          ? { backgroundColor: color }
          : { backgroundColor: tint, borderColor: color, borderWidth: 1 },
      ]}
    >
      <Text style={[styles.pillText, { color: solid ? colors.onAccent : color }]}>{text}</Text>
    </View>
  );
}

/* ───────── Card ───────── */

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const { scale, pressIn, pressOut } = usePressScale();

  const content = (
    <Animated.View style={[styles.card, { transform: [{ scale }] }, style]}>
      {children}
    </Animated.View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        onPressIn={() => { pressIn(); lightHaptic(); }}
        onPressOut={pressOut}
      >
        {content}
      </Pressable>
    );
  }
  return content;
}

/* ───────── GlassCard（毛玻璃卡片，用于叠加层） ───────── */

export function GlassCard({
  children,
  style,
  intensity = 30,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
}) {
  return (
    <BlurView intensity={intensity} tint="dark" style={[styles.glassCard, style]}>
      {children}
    </BlurView>
  );
}

/* ───────── PrimaryButton ───────── */

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  tone = colors.accent,
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  tone?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { scale, pressIn, pressOut } = usePressScale();

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={() => { heavyHaptic(); onPress(); }}
        onPressIn={() => pressIn(0.96)}
        onPressOut={pressOut}
        disabled={disabled || loading}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: tone },
          (disabled || loading) && styles.btnDisabled,
          pressed && styles.btnPressed,
        ]}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>{label}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

/* ───────── GhostButton ───────── */

export function GhostButton({
  label,
  onPress,
  tone = colors.text,
  style,
}: {
  label: string;
  onPress: () => void;
  tone?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { scale, pressIn, pressOut } = usePressScale();

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={() => { lightHaptic(); onPress(); }}
        onPressIn={() => pressIn()}
        onPressOut={pressOut}
        style={({ pressed }) => [
          styles.ghost,
          { borderColor: tone },
          pressed && styles.btnPressed,
        ]}
      >
        <Text style={[styles.ghostText, { color: tone }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

/* ───────── styles ───────── */

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    paddingVertical: spacing(1.5),
    paddingHorizontal: spacing(3),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillText: { fontFamily: pixelFont, fontSize: font.tiny, fontWeight: "700", letterSpacing: 0.5 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing(4),
    ...elevation("card"),
  },

  glassCard: {
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: colors.darkBorder,
  },

  btn: {
    minHeight: 56,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing(5),
    borderWidth: 2,
    borderColor: colors.border,
    ...elevation("float"),
  },
  btnDisabled: { opacity: 0.4 },
  btnPressed: { opacity: 0.85 },
  btnText: {
    color: colors.onAccent,
    fontFamily: pixelFont,
    fontSize: font.h3,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  ghost: {
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing(5),
  },
  ghostText: { fontFamily: pixelFont, fontSize: font.h3, fontWeight: "700" },
});
