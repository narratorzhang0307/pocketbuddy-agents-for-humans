/**
 * 对接模型团队实时教练服务（web_app.py，默认 4000 端口）。
 *
 * 接口契约（见 web_app.py /api/session/*）：
 *   POST /api/session/start  { exercise, mode }
 *        -> { session_id, exercise, exercise_label, tip, mode }
 *   POST /api/session/frame  { session_id, image_data, mode }
 *        -> { phase, rep_count, status_color, primary_cue, secondary_cue,
 *             speak_text, errors[], active_exercise_label, recognition_state }
 *   POST /api/session/stop   { session_id } -> { summary }
 *
 * 约定：
 * - image_data 必须是 dataURL（"data:image/jpeg;base64,..."），服务端按 "," 取 base64；
 *   本类对纯 base64 自动补前缀。
 * - mode="manual"：按所选动作评估；mode="auto"：模型自动识别动作。
 */
import type {
  ConfidenceLevel,
  FormAnalysisProvider,
  FormAnalysisResult,
  FormContext,
  FormStatus,
  ProblemArea,
  StatusColor,
} from "./FormAnalysisProvider";
import type { SupportedExercise } from "../types";

// App 内动作枚举 -> 模型服务动作名（src/live_coach.py 的 EXERCISES / 别名）。
const EXERCISE_TO_MODEL: Record<SupportedExercise, string> = {
  squat: "squats",
  lunge: "lunges",
  push_up: "pushups",
  dumbbell_shoulder_press: "dumbbell_shoulder_press",
  dumbbell_rows: "dumbbell_rows",
  bicep_curls: "bicep_curls",
  situps: "situps",
  tricep_extensions: "tricep_extensions",
  lateral_shoulder_raises: "lateral_shoulder_raises",
  jumping_jacks: "jumping_jacks",
};

interface FrameResponse {
  phase?: string;
  rep_count?: number;
  status_color?: StatusColor;
  primary_cue?: string;
  secondary_cue?: string;
  speak_text?: string;
  errors?: { code: string; cue: string; severity: number }[];
  active_exercise_label?: string;
  recognition_state?: string;
  visible_keypoints?: number;
  inference_ms?: number;
}

function toDataUrl(image: string): string {
  return image.includes(",") ? image : `data:image/jpeg;base64,${image}`;
}

export class ModelCoachProvider implements FormAnalysisProvider {
  private sessionId: string | null = null;
  private sessionExercise: SupportedExercise | null = null;
  private starting: Promise<string> | null = null;
  private token: string | null = null;
  private generation = 0;
  private requests = new Set<AbortController>();

  constructor(
    private readonly baseUrl: string,
    private readonly mode: "manual" | "auto" = "manual"
  ) {}

  private async request(path: string, body: object, token = this.token): Promise<any> {
    const controller = new AbortController();
    if (path !== "stop") this.requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(`${this.baseUrl}/api/session/${path}`, {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `模型服务 HTTP ${res.status}`);
      return data;
    } finally {
      clearTimeout(timeout);
      this.requests.delete(controller);
    }
  }

  /** 确保已为目标动作建立会话；动作切换重建；并发共享同一次 start。 */
  private async ensureSession(exercise: SupportedExercise): Promise<string> {
    if (this.sessionId && this.sessionExercise === exercise) {
      return this.sessionId;
    }
    if (this.starting) return this.starting;

    if (this.sessionId) await this.stop();
    const generation = this.generation;
    this.starting = (async () => {
      const data = await this.request("start", {
          exercise: EXERCISE_TO_MODEL[exercise],
          mode: this.mode,
          consent: true, // TrainingScreen calls analyze only after explicit camera/server consent.
      }, null);
      if (generation !== this.generation) throw new Error("训练已结束");
      const sid = data.session_id ?? data.sessionId;
      if (!sid) throw new Error("session/start: missing session_id");
      this.token = data.session_token ?? null;
      this.sessionId = sid as string;
      this.sessionExercise = exercise;
      return this.sessionId;
    })();

    try {
      return await this.starting;
    } finally {
      if (generation === this.generation) this.starting = null;
    }
  }

  async analyze(context: FormContext): Promise<FormAnalysisResult> {
    const sessionId = await this.ensureSession(context.exercise);

    const image = context.imageBase64;
    if (!image) {
      return {
        isStandard: false,
        confidence: "low",
        problemAreas: [],
        status: "inconclusive",
      };
    }

    const data: FrameResponse = await this.request("frame", {
        session_id: sessionId,
        image_data: toDataUrl(image),
        mode: this.mode,
    });
    return this.mapResponse(data);
  }

  /** 结束会话并返回总结。 */
  async stop(): Promise<unknown | null> {
    this.generation += 1;
    for (const request of this.requests) request.abort();
    this.starting = null;
    const sid = this.sessionId;
    const token = this.token;
    this.sessionId = null;
    this.token = null;
    this.sessionExercise = null;
    if (!sid) return null;
    try {
      const data = await this.request("stop", { session_id: sid }, token);
      return data.summary ?? null;
    } catch {
      return null;
    }
  }

  private mapResponse(data: FrameResponse): FormAnalysisResult {
    const statusColor = data.status_color;
    const errs = data.errors ?? [];

    const isStandard = statusColor === "good";
    const confidence: ConfidenceLevel =
      statusColor === "alert"
        ? "high"
        : statusColor === "warn"
          ? "medium"
          : statusColor === "good"
            ? "high"
            : "low";

    const isNoPerson =
      errs.some((e) => e.code === "no_person") ||
      data.recognition_state === "no_person";
    const status: FormStatus = isNoPerson ? "inconclusive" : "conclusive";

    const problemAreas: ProblemArea[] = errs
      .filter((e) => e.code !== "no_person")
      .map((e) => ({
        area: e.code,
        severity: e.severity >= 0.85 ? "high" : "medium",
      }));

    const primaryCue = data.primary_cue || undefined;
    const secondaryCue = data.secondary_cue || undefined;
    const correctionText =
      !isStandard && status === "conclusive"
        ? [primaryCue, secondaryCue].filter(Boolean).join(" ") || undefined
        : undefined;

    return {
      isStandard,
      confidence,
      problemAreas,
      status,
      correctionText,
      speakText: data.speak_text || undefined,
      repCount: data.rep_count,
      phase: data.phase,
      statusColor,
      primaryCue,
      secondaryCue,
      activeExerciseLabel: data.active_exercise_label,
      visibleKeypoints: data.visible_keypoints,
      inferenceMs: data.inference_ms,
    };
  }
}
