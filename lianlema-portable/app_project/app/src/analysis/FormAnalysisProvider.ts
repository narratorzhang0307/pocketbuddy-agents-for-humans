/**
 * 动作分析 Provider 抽象。
 *
 * 训练页只依赖这个接口；唯一实现是 ModelCoachProvider（直连 web_app.py 真实模型）。
 * 选择逻辑见 ./index.ts。
 */
import type { SupportedExercise } from "../types";

export type ConfidenceLevel = "low" | "medium" | "high";
export type FormStatus = "conclusive" | "inconclusive";
export type StatusColor = "idle" | "good" | "warn" | "alert";

export interface ProblemArea {
  area: string;
  severity: ConfidenceLevel;
}

/** 分析输入：动作类型 + 采集到的图像。 */
export interface FormContext {
  exercise: SupportedExercise;
  /** base64 图像（纯 base64 或 dataURL 都可），模型逐帧分析用。 */
  imageBase64?: string;
}

/** 分析输出：统一的动作分析结果。 */
export interface FormAnalysisResult {
  isStandard: boolean;
  confidence: ConfidenceLevel;
  problemAreas: ProblemArea[];
  status: FormStatus;
  /** 纠正反馈文本（不标准且 conclusive 时非空）。 */
  correctionText?: string;
  /** 模型决定此刻应播报的内容（已含播报节流/冷却）。 */
  speakText?: string;
  /** 实时统计：已完成的动作次数。 */
  repCount?: number;
  /** 动作阶段（如 down/up/ready）。 */
  phase?: string;
  /** 状态色：idle/good/warn/alert，用于 UI 着色。 */
  statusColor?: StatusColor;
  /** 主提示。 */
  primaryCue?: string;
  /** 副提示。 */
  secondaryCue?: string;
  /** 自动识别模式下模型识别出的动作标签。 */
  activeExerciseLabel?: string;
  visibleKeypoints?: number;
  inferenceMs?: number;
}

/** Provider 契约：所有实现都暴露这一个方法。 */
export interface FormAnalysisProvider {
  analyze(context: FormContext): Promise<FormAnalysisResult>;
}
