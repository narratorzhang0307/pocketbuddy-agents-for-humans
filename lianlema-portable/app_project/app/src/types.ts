/**
 * 前端领域类型（精简版）。
 * 动作列表与模型端 src/live_coach.py 的 EXERCISES 对齐（10 个真实动作）。
 */

export type SupportedExercise =
  | "squat"
  | "lunge"
  | "push_up"
  | "dumbbell_shoulder_press"
  | "dumbbell_rows"
  | "bicep_curls"
  | "situps"
  | "tricep_extensions"
  | "lateral_shoulder_raises"
  | "jumping_jacks";

/** 动作元信息：用于选择页展示与站位提示。 */
export interface ExerciseMeta {
  value: SupportedExercise;
  label: string;
  emoji: string;
  /** 主要锻炼部位。 */
  muscle: string;
  /** 难度 1~3。 */
  level: 1 | 2 | 3;
  /** 卡片副标题（一句卖点）。 */
  blurb: string;
  /** 站位提示（训练页用）。 */
  tip: string;
}

export const EXERCISES: ExerciseMeta[] = [
  {
    value: "squat",
    label: "深蹲",
    emoji: "🏋️",
    muscle: "腿 · 臀 · 核心",
    level: 2,
    blurb: "下肢力量基石",
    tip: "让全身进入画面，脚尖与膝盖尽量保持同向。",
  },
  {
    value: "lunge",
    label: "弓步蹲",
    emoji: "🦵",
    muscle: "腿 · 臀 · 平衡",
    level: 2,
    blurb: "单侧稳定与协调",
    tip: "前后腿都要拍到，给迈步和下蹲留出空间。",
  },
  {
    value: "push_up",
    label: "俯卧撑",
    emoji: "💪",
    muscle: "胸 · 肩 · 三头",
    level: 3,
    blurb: "上肢推力经典",
    tip: "尽量使用侧面机位，肩、髋、踝最好都能看到。",
  },
  {
    value: "dumbbell_shoulder_press",
    label: "哑铃肩推",
    emoji: "🙆",
    muscle: "肩 · 三头 · 核心",
    level: 3,
    blurb: "肩部力量塑形",
    tip: "全身站直入镜，头顶上方给手臂伸直留出空间。",
  },
  {
    value: "dumbbell_rows",
    label: "哑铃划船",
    emoji: "🚣",
    muscle: "背 · 二头 · 后肩",
    level: 2,
    blurb: "厚背训练首选",
    tip: "躯干和双臂尽量完整入镜，方便识别手肘轨迹。",
  },
  {
    value: "bicep_curls",
    label: "二头弯举",
    emoji: "💪",
    muscle: "肱二头肌",
    level: 1,
    blurb: "手臂线条塑造",
    tip: "正对镜头站立，手肘和上臂尽量保持清晰可见。",
  },
  {
    value: "situps",
    label: "仰卧起坐",
    emoji: "🧎",
    muscle: "腹 · 核心",
    level: 1,
    blurb: "核心耐力训练",
    tip: "躯干和髋部保持在画面内，方便识别动作节奏。",
  },
  {
    value: "tricep_extensions",
    label: "肱三头屈伸",
    emoji: "💪",
    muscle: "肱三头肌",
    level: 2,
    blurb: "后臂塑形",
    tip: "上臂尽量完整入镜，不要把手肘裁出画面。",
  },
  {
    value: "lateral_shoulder_raises",
    label: "侧平举",
    emoji: "🙆",
    muscle: "三角肌中束",
    level: 1,
    blurb: "宽肩塑造",
    tip: "双肩和双手尽量都入镜，方便判断抬手是否水平。",
  },
  {
    value: "jumping_jacks",
    label: "开合跳",
    emoji: "🤸",
    muscle: "全身 · 有氧",
    level: 1,
    blurb: "热身燃脂",
    tip: "给头到脚留出完整空间，确保起跳和落地都能看到。",
  },
];

export const EXERCISE_LABEL: Record<SupportedExercise, string> = EXERCISES.reduce(
  (acc, e) => {
    acc[e.value] = e.label;
    return acc;
  },
  {} as Record<SupportedExercise, string>
);
