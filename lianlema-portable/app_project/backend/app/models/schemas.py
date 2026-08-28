"""领域数据模型（Pydantic v2，任务 3.1）。

对应 design.md "Data Models" 一节。字段范围约束（``weekly_frequency 1~7``、
``difficulty 1~5``、``form_score 0~100`` 等）在此以 Pydantic 校验落地，构成
需求 1.1 / 1.3 / 2.3 / 7.1 / 7.2 的后端侧校验（前端 Zod 为对侧校验）。

这些模型是 API 与服务层之间传递的"领域对象"；持久化由 ``models.orm`` 的
SQLAlchemy 表负责，两者通过仓储层（任务 3.2）相互转换。
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

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

# ---- 字段范围常量（单一事实来源，供模型与测试共用）----
HEIGHT_CM_MIN, HEIGHT_CM_MAX = 100, 230
WEIGHT_KG_MIN, WEIGHT_KG_MAX = 30, 250
AGE_MIN, AGE_MAX = 12, 90
WEEKLY_FREQUENCY_MIN, WEEKLY_FREQUENCY_MAX = 1, 7
DIFFICULTY_MIN, DIFFICULTY_MAX = 1, 5
FORM_SCORE_MIN, FORM_SCORE_MAX = 0, 100
PLAN_DAYS = 7


# --------------------------------------------------------------------------
# 评估与计划
# --------------------------------------------------------------------------
class Assessment(BaseModel):
    """新用户运动评估（需求 1）。"""

    user_id: UUID = Field(default_factory=uuid4)
    goal: TrainingGoal
    venue: Venue
    equipment: list[str] = Field(default_factory=list)
    weekly_frequency: int = Field(
        ..., ge=WEEKLY_FREQUENCY_MIN, le=WEEKLY_FREQUENCY_MAX
    )
    # 敏感健康信息：仅在取得 Sensitive_Consent 后才应非空（需求 1.4 / 9.3）。
    injury_risk: list[InjuryRiskArea] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PlanExercise(BaseModel):
    """计划中的单个动作（需求 2.3）。"""

    name: str
    exercise: Optional[SupportedExercise] = None
    sets: int = Field(..., ge=1)
    reps: Optional[int] = Field(default=None, ge=1)
    duration_sec: Optional[int] = Field(default=None, ge=1)
    rest_sec: int = Field(..., ge=0)
    difficulty: int = Field(..., ge=DIFFICULTY_MIN, le=DIFFICULTY_MAX)


class PlanDay(BaseModel):
    """计划中的某一天（需求 2.1 / 2.2）。"""

    day_index: int = Field(..., ge=1, le=PLAN_DAYS)
    is_rest_day: bool = False
    exercises: list[PlanExercise] = Field(default_factory=list)


class TrainingPlan(BaseModel):
    """7 天训练计划（需求 2）。"""

    user_id: UUID
    days: list[PlanDay] = Field(..., min_length=PLAN_DAYS, max_length=PLAN_DAYS)
    created_at: datetime = Field(default_factory=datetime.utcnow)


# --------------------------------------------------------------------------
# 动作分析与训练会话
# --------------------------------------------------------------------------
class ProblemArea(BaseModel):
    """动作问题部位（需求 4.3）。"""

    area: str
    severity: ConfidenceLevel = ConfidenceLevel.MEDIUM


class FormAnalysis(BaseModel):
    """单次动作标准度分析结果（需求 3.1 / 4）。"""

    session_id: UUID
    exercise: SupportedExercise
    is_standard: bool
    confidence: ConfidenceLevel
    problem_areas: list[ProblemArea] = Field(default_factory=list)
    status: FormStatus = FormStatus.CONCLUSIVE
    correction_text: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class VoiceCommandEvent(BaseModel):
    """一次语音命令事件（需求 5）。"""

    session_id: UUID
    command: VoiceCommand
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SetRecord(BaseModel):
    """一组训练记录（需求 7 / 10）。"""

    exercise: Optional[SupportedExercise] = None
    reps: Optional[int] = Field(default=None, ge=0)
    difficulty: int = Field(..., ge=DIFFICULTY_MIN, le=DIFFICULTY_MAX)


class SessionReport(BaseModel):
    """训练后报告（需求 7）。"""

    session_id: UUID
    form_score: int = Field(..., ge=FORM_SCORE_MIN, le=FORM_SCORE_MAX)
    risk_notes: list[str] = Field(default_factory=list)
    correction_count: int = Field(..., ge=0)
    next_focus: str
    summary_text: Optional[str] = None


class TrainingSession(BaseModel):
    """训练会话（需求 7 / 10）。"""

    session_id: UUID = Field(default_factory=uuid4)
    user_id: UUID
    started_at: datetime = Field(default_factory=datetime.utcnow)
    ended_at: Optional[datetime] = None
    sets: list[SetRecord] = Field(default_factory=list)
    form_analyses: list[FormAnalysis] = Field(default_factory=list)
    voice_commands: list[VoiceCommandEvent] = Field(default_factory=list)
    report: Optional[SessionReport] = None


# --------------------------------------------------------------------------
# 隐私授权与会员权益
# --------------------------------------------------------------------------
class PermissionRecord(BaseModel):
    """设备权限授予记录（需求 9.4）。"""

    user_id: UUID
    scope: PermissionScope
    granted: bool
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ConsentRecord(BaseModel):
    """敏感信息同意记录（需求 9.3 / 9.4）。"""

    user_id: UUID
    consent_type: ConsentType = ConsentType.SENSITIVE_HEALTH
    granted: bool
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class UserEntitlement(BaseModel):
    """用户会员权益与免费额度（需求 8）。"""

    user_id: UUID
    entitlement: Entitlement = Entitlement.FREE
    free_quota_used: int = Field(default=0, ge=0)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
