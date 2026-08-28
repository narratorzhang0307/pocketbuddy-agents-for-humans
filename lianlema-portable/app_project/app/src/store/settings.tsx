/**
 * 全局设置（用户资料 + 音色等）—— 轻量 React Context，无外部依赖。
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export interface VoiceOption {
  id: string;
  name: string;
  desc: string;
  emoji: string;
  locked?: boolean;
}

export const VOICES: VoiceOption[] = [
  { id: "default", name: "系统音色", desc: "设备自带中文语音，免费即用", emoji: "🗣️" },
  { id: "energetic", name: "活力教练", desc: "节奏明快，适合高强度训练", emoji: "🔥" },
  { id: "calm", name: "沉稳教练", desc: "语气平稳，适合控制与拉伸", emoji: "🧘" },
  { id: "cloned", name: "克隆音色", desc: "上传样本，定制专属声音（即将开放）", emoji: "✨", locked: true },
];

export type Gender = "male" | "female" | "unset";

/** 用户基础信息。 */
export interface UserProfile {
  name: string;
  gender: Gender;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
}

export const DEFAULT_PROFILE: UserProfile = {
  name: "练了吗用户",
  gender: "unset",
  age: null,
  heightCm: null,
  weightKg: null,
};

export const GENDER_LABEL: Record<Gender, string> = {
  male: "男",
  female: "女",
  unset: "未设置",
};

/** BMI 计算（身高 cm、体重 kg）。 */
export function calcBmi(heightCm: number | null, weightKg: number | null): number | null {
  if (!heightCm || !weightKg || heightCm <= 0) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

/** BMI 等级文案。 */
export function bmiLevel(bmi: number | null): string {
  if (bmi === null) return "—";
  if (bmi < 18.5) return "偏瘦";
  if (bmi < 24) return "正常";
  if (bmi < 28) return "偏胖";
  return "肥胖";
}

interface SettingsState {
  voiceId: string;
  setVoiceId: (id: string) => void;
  voice: VoiceOption;
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
}

const SettingsContext = createContext<SettingsState | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [voiceId, setVoiceId] = useState("default");
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);

  const value = useMemo<SettingsState>(() => {
    const voice = VOICES.find((v) => v.id === voiceId) ?? VOICES[0]!;
    return { voiceId, setVoiceId, voice, profile, setProfile };
  }, [voiceId, profile]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsState {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
