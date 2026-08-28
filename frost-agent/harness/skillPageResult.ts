/** Host page observations, not model claims, Taskmaster signals, or health facts. */
export interface FrostSkillPageResult {
  status: 'completed' | 'blocked' | 'failed';
  summary: string;
  workout?: { input_mode: 'live'; duration_sec: number; exercise_name: string; total_reps: number; observed_frames: number };
}
export type FrostSkillPageReporter = (result: FrostSkillPageResult) => Promise<void>;
