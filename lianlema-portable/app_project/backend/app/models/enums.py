"""领域枚举（任务 3.1）。

集中定义全系统共享的枚举值，前后端术语对齐 requirements.md 的 Glossary。
所有枚举均继承 ``str``，便于 JSON 序列化与数据库存储为可读字符串。
"""

from __future__ import annotations

from enum import Enum


class TrainingGoal(str, Enum):
    """训练目标（需求 1.2）。"""

    FAT_LOSS = "fat_loss"
    MUSCLE_GAIN = "muscle_gain"
    ENDURANCE = "endurance"
    GENERAL_FITNESS = "general_fitness"


class Venue(str, Enum):
    """训练场地（需求 1.3）。"""

    HOME = "home"
    GYM = "gym"
    OUTDOOR = "outdoor"


class SupportedExercise(str, Enum):
    """首版支持动作纠错的动作（需求 4.1）。"""

    SQUAT = "squat"
    LUNGE = "lunge"
    OVERHEAD_PRESS = "overhead_press"
    PUSH_UP = "push_up"


class ConfidenceLevel(str, Enum):
    """置信度等级（需求 3.1）。"""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class FormStatus(str, Enum):
    """动作分析结论状态（需求 3.1 / 4.5）。"""

    CONCLUSIVE = "conclusive"
    INCONCLUSIVE = "inconclusive"


class VoiceCommand(str, Enum):
    """受支持的训练控制语音命令（需求 5.1）。"""

    PAUSE = "pause"
    RESUME = "resume"
    SWITCH = "switch_exercise"
    REDUCE = "reduce_difficulty"
    REPEAT = "repeat"
    END = "end_session"


class Entitlement(str, Enum):
    """会员权益等级（需求 8）。"""

    FREE = "free"
    PRO = "pro"


class InjuryRiskArea(str, Enum):
    """伤痛风险自评的身体部位（需求 1.4，敏感健康信息）。"""

    SHOULDER = "shoulder"
    LOWER_BACK = "lower_back"
    KNEE = "knee"
    WRIST = "wrist"
    NECK = "neck"


class PermissionScope(str, Enum):
    """设备级授权范围（需求 9.1）。"""

    CAMERA = "camera"
    MICROPHONE = "microphone"
    HEALTHKIT = "healthkit"


class ConsentType(str, Enum):
    """敏感信息同意类型（需求 9.3）。"""

    SENSITIVE_HEALTH = "sensitive_health"
