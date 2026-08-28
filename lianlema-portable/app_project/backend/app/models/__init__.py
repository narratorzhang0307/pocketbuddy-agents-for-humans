"""领域模型包：枚举、Pydantic 领域模型与 SQLAlchemy ORM 表（任务 3.1）。"""

from app.models.enums import (
    ConfidenceLevel,
    ConsentType,
    Entitlement,
    FormStatus,
    InjuryRiskArea,
    PermissionScope,
    SupportedExercise,
    TrainingGoal,
    Venue,
    VoiceCommand,
)
from app.models.schemas import (
    Assessment,
    ConsentRecord,
    FormAnalysis,
    PermissionRecord,
    PlanDay,
    PlanExercise,
    ProblemArea,
    SessionReport,
    SetRecord,
    TrainingPlan,
    TrainingSession,
    UserEntitlement,
    VoiceCommandEvent,
)

__all__ = [
    # enums
    "TrainingGoal",
    "Venue",
    "SupportedExercise",
    "ConfidenceLevel",
    "FormStatus",
    "VoiceCommand",
    "Entitlement",
    "InjuryRiskArea",
    "PermissionScope",
    "ConsentType",
    # schemas
    "Assessment",
    "PlanExercise",
    "PlanDay",
    "TrainingPlan",
    "ProblemArea",
    "FormAnalysis",
    "VoiceCommandEvent",
    "SetRecord",
    "SessionReport",
    "TrainingSession",
    "PermissionRecord",
    "ConsentRecord",
    "UserEntitlement",
]
