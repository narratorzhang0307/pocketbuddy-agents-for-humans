"""动作库（任务 4.1 支撑数据）。

定义可选动作及其约束：所需器械、适用场地、主要加载的身体部位、可纠错动作枚举。
计划生成器据此做"器械/场地相容"过滤与"伤痛部位规避"。纯数据 + 纯函数，无副作用。
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.models.enums import InjuryRiskArea, SupportedExercise, Venue


@dataclass(frozen=True)
class ExerciseDef:
    """单个动作定义。"""

    name: str
    # 所需器械标识；空集表示徒手（任何场地可做）。
    required_equipment: frozenset[str] = field(default_factory=frozenset)
    # 适用场地；空集表示不限场地。
    venues: frozenset[Venue] = field(default_factory=frozenset)
    # 显著加载的身体部位（用于伤痛规避）。
    loads: frozenset[InjuryRiskArea] = field(default_factory=frozenset)
    # 关联的可纠错动作枚举（仅四个首版支持动作有值）。
    supported: SupportedExercise | None = None


# 动作目录：覆盖徒手与常见器械，保证 equipment=none 时也有足够动作可排。
CATALOG: tuple[ExerciseDef, ...] = (
    ExerciseDef(
        name="深蹲",
        required_equipment=frozenset(),
        loads=frozenset({InjuryRiskArea.KNEE}),
        supported=SupportedExercise.SQUAT,
    ),
    ExerciseDef(
        name="弓步蹲",
        required_equipment=frozenset(),
        loads=frozenset({InjuryRiskArea.KNEE}),
        supported=SupportedExercise.LUNGE,
    ),
    ExerciseDef(
        name="俯卧撑",
        required_equipment=frozenset(),
        loads=frozenset({InjuryRiskArea.SHOULDER, InjuryRiskArea.WRIST}),
        supported=SupportedExercise.PUSH_UP,
    ),
    ExerciseDef(
        name="站姿推举",
        required_equipment=frozenset({"dumbbell"}),
        loads=frozenset({InjuryRiskArea.SHOULDER}),
        supported=SupportedExercise.OVERHEAD_PRESS,
    ),
    ExerciseDef(
        name="平板支撑",
        required_equipment=frozenset(),
        loads=frozenset(),
    ),
    ExerciseDef(
        name="臀桥",
        required_equipment=frozenset(),
        loads=frozenset(),
    ),
    ExerciseDef(
        name="开合跳",
        required_equipment=frozenset(),
        loads=frozenset({InjuryRiskArea.KNEE}),
    ),
    ExerciseDef(
        name="哑铃划船",
        required_equipment=frozenset({"dumbbell"}),
        loads=frozenset({InjuryRiskArea.LOWER_BACK}),
    ),
    ExerciseDef(
        name="杠铃硬拉",
        required_equipment=frozenset({"barbell"}),
        loads=frozenset({InjuryRiskArea.LOWER_BACK}),
    ),
    ExerciseDef(
        name="弹力带划船",
        required_equipment=frozenset({"resistance_band"}),
        loads=frozenset(),
    ),
)


def available_exercises(
    equipment: set[str], venue: Venue, injury_risk: set[InjuryRiskArea]
) -> list[ExerciseDef]:
    """返回与器械/场地相容、且不加载伤痛部位的动作列表（需求 2.4 / 2.5）。

    - 器械相容：动作所需器械必须是用户可用器械的子集（徒手动作总是相容）。
    - 伤痛规避：动作显著加载的部位与用户伤痛部位不相交。
    """
    result: list[ExerciseDef] = []
    for ex in CATALOG:
        if not ex.required_equipment.issubset(equipment):
            continue
        if ex.loads & injury_risk:
            continue
        result.append(ex)
    return result
