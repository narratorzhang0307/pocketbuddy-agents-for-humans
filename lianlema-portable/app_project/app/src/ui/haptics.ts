/**
 * iOS 触觉反馈封装。
 *
 * 轻触觉 (light)  — 选择、切换等常规操作
 * 重触觉 (heavy)  — 开始/结束训练等关键操作
 */
import * as Haptics from "expo-haptics";

export function lightHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function heavyHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}
