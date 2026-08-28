import type { SupportedExercise } from "./types";

/** 训练总结数据（从训练页传给总结页）。 */
export interface WorkoutReport {
  exercise: SupportedExercise;
  totalReps: number;
  standardReps: number;
  correctionCount: number;
  durationSec: number;
}

/** 运动 tab 内部栈：Pick → Customization → Training → WorkoutReport。 */
export type WorkoutStackParamList = {
  Pick: undefined;
  Customization: undefined;
  Training: { exercise: SupportedExercise };
  VideoAnalysis: { exercise: SupportedExercise };
  WorkoutReport: { report: WorkoutReport };
};

/** 我的 tab 内部栈：Profile → EditProfile → Settings → Voice。 */
export type ProfileStackParamList = {
  Profile: undefined;
  EditProfile: undefined;
  Settings: undefined;
  Voice: undefined;
};

/** 底部 tab：运动 / 个性化 / 我的。 */
export type RootTabParamList = {
  Workout: undefined;
  Customization: undefined;
  Profile: undefined;
};
