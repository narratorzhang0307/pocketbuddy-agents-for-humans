/**
 * 设计系统 token —— Pocket Earth / Frost 黑边像素风格。
 *
 * 主界面：灰白底、黑色粗描边、荧光绿操作色与硬投影卡片。
 * 摄像头训练页例外：使用深色沉浸式（见 darkSurface 等），营造高级感。
 */
import { Platform, type ViewStyle } from "react-native";

export const colors = {
  // 浅色基底
  bg: "#EAEAEA",
  bgElevated: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceAlt: "#F1EAD6",
  border: "#000000",
  borderSubtle: "#000000",

  // 文字（深色字）
  text: "#000000",
  textMuted: "rgba(0,0,0,0.62)",
  textFaint: "rgba(0,0,0,0.42)",

  // 品牌主色：Frost 荧光绿
  accent: "#00FF88",
  accentDeep: "#087C49",
  accentSoft: "#DFFBEF",
  onAccent: "#000000",

  // 语义状态（摄像头训练页用）
  good: "#00FF88",
  warn: "#FFD65A",
  alert: "#FF625E",
  idle: "#B8B8B8",

  // 深色沉浸（仅训练页）
  darkBg: "#0B0E13",
  darkSurface: "rgba(0,0,0,0.78)",
  darkBorder: "rgba(255,255,255,0.82)",
  scrim: "rgba(8,11,16,0.45)",
  scrimStrong: "rgba(8,11,16,0.8)",
  glass: "rgba(20,24,32,0.6)",
} as const;

/** 8pt 网格间距。 */
export const spacing = (n: number) => n * 4;

export const radius = {
  sm: 0,
  md: 0,
  lg: 0,
  xl: 0,
  pill: 0,
} as const;

export const pixelFont = Platform.select({
  web: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

export const font = {
  display: 40,
  h1: 28,
  h2: 21,
  h3: 17,
  body: 15,
  small: 13,
  tiny: 11,
} as const;

/** 跨平台硬投影。 */
export function elevation(level: "card" | "float" | "hero"): ViewStyle {
  const map = {
    card: { e: 2, x: 3, y: 3 },
    float: { e: 4, x: 4, y: 4 },
    hero: { e: 6, x: 6, y: 6 },
  } as const;
  const { e, x, y } = map[level];
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: "#000000",
      shadowOpacity: 1,
      shadowRadius: 0,
      shadowOffset: { width: x, height: y },
    },
    android: { elevation: e },
    default: ({ boxShadow: `${x}px ${y}px 0 #000000` } as ViewStyle & { boxShadow: string }),
  })!;
}

/** 状态色 → 调色板（摄像头训练页用）。 */
export type StatusTone = "idle" | "good" | "warn" | "alert";
export function toneOf(tone: StatusTone) {
  switch (tone) {
    case "good":
      return { color: colors.good, label: "标准", tint: "rgba(0,255,136,0.2)" };
    case "warn":
      return { color: colors.warn, label: "注意", tint: "rgba(255,214,90,0.2)" };
    case "alert":
      return { color: colors.alert, label: "需纠正", tint: "rgba(255,98,94,0.2)" };
    default:
      return { color: colors.idle, label: "等待中", tint: "rgba(154,161,172,0.18)" };
  }
}
