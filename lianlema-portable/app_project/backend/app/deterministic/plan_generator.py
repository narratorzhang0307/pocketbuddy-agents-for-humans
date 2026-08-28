"""训练计划生成器（任务 4.1，需求 2）。

纯函数 ``generate_plan(assessment) -> TrainingPlan``：
- 输出恰好 7 天（需求 2.1）。
- 训练日数量等于 weekly_frequency，其余为休息日（需求 2.2）。
- 仅安排与 equipment / venue 相容的动作（需求 2.4）。
- 规避加载伤痛部位的动作（需求 2.5）。
- 按训练目标调整每组次数 / 组数 / 休息（需求 2.6）。
- 不调用 LLM（需求 2.7）。
"""

from __future__ import annotations

from app.deterministic.exercise_catalog import ExerciseDef, available_exercises
from app.models.enums import TrainingGoal
from app.models.schemas import Assessment, PlanDay, PlanExercise, TrainingPlan

PLAN_DAYS = 7

# 各训练目标的处方参数（确定性，需求 2.6）。
# sets/reps/rest_sec/difficulty/exercises_per_day
_GOAL_PRESCRIPTION: dict[TrainingGoal, dict[str, int]] = {
    TrainingGoal.FAT_LOSS: {"sets": 3, "reps": 15, "rest_sec": 30, "difficulty": 3, "per_day": 4},
    TrainingGoal.MUSCLE_GAIN: {"sets": 4, "reps": 10, "rest_sec": 75, "difficulty": 4, "per_day": 3},
    TrainingGoal.ENDURANCE: {"sets": 3, "reps": 20, "rest_sec": 30, "difficulty": 2, "per_day": 4},
    TrainingGoal.GENERAL_FITNESS: {"sets": 3, "reps": 12, "rest_sec": 60, "difficulty": 3, "per_day": 3},
}


def _training_day_indices(weekly_frequency: int) -> set[int]:
    """在 1..7 中尽量均匀地选出 weekly_frequency 个训练日（确定性）。

    采用等间隔取整策略，保证训练日与休息日交错，结果只依赖输入，可复现。
    """
    if weekly_frequency >= PLAN_DAYS:
        return set(range(1, PLAN_DAYS + 1))
    indices: set[int] = set()
    for i in range(weekly_frequency):
        # 均匀分布到 [1, 7]
        day = round(1 + i * (PLAN_DAYS - 1) / max(weekly_frequency - 1, 1))
        # 避免重复（极端情况下取下一个空位）。
        while day in indices:
            day = day % PLAN_DAYS + 1
        indices.add(day)
    return indices


def _build_exercises(
    pool: list[ExerciseDef], prescription: dict[str, int], day_offset: int
) -> list[PlanExercise]:
    """从相容动作池中为某训练日挑选动作（轮转以增加多样性，仍为确定性）。"""
    if not pool:
        return []
    per_day = min(prescription["per_day"], len(pool))
    chosen: list[PlanExercise] = []
    for j in range(per_day):
        ex = pool[(day_offset + j) % len(pool)]
        chosen.append(
            PlanExercise(
                name=ex.name,
                exercise=ex.supported,
                sets=prescription["sets"],
                reps=prescription["reps"],
                duration_sec=None,
                rest_sec=prescription["rest_sec"],
                difficulty=prescription["difficulty"],
            )
        )
    return chosen


def generate_plan(assessment: Assessment) -> TrainingPlan:
    """根据评估生成 7 天训练计划（纯函数，确定性）。"""
    prescription = _GOAL_PRESCRIPTION[assessment.goal]
    pool = available_exercises(
        equipment=set(assessment.equipment),
        venue=assessment.venue,
        injury_risk=set(assessment.injury_risk),
    )
    training_days = _training_day_indices(assessment.weekly_frequency)

    days: list[PlanDay] = []
    training_seen = 0
    for day_index in range(1, PLAN_DAYS + 1):
        if day_index in training_days:
            exercises = _build_exercises(pool, prescription, training_seen)
            training_seen += 1
            days.append(
                PlanDay(day_index=day_index, is_rest_day=False, exercises=exercises)
            )
        else:
            days.append(PlanDay(day_index=day_index, is_rest_day=True, exercises=[]))

    return TrainingPlan(user_id=assessment.user_id, days=days)
