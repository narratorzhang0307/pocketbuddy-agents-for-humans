"""SQLAlchemy ORM 表定义（任务 3.1）。

与 ``models.schemas`` 的 Pydantic 领域模型一一对应，负责持久化。设计取舍：

- 顶层实体（评估 / 计划 / 会话 / 权益 / 授权）为独立表，便于按 ``user_id`` 与
  时间戳查询（需求 7.3 / 10.2 / 10.3）。
- 会话的子项（动作组、动作分析、语音命令、报告）以 ``session_id`` 外键的子表
  存储，便于增量追加；列表型值对象（如 ``problem_areas``、``equipment``）以
  JSON 列内嵌，避免过度拆表。
- 枚举统一以字符串存储，保证跨 SQLite / PostgreSQL 可读且可移植。
- 数值范围（``weekly_frequency``、``difficulty``、``form_score``）在 Pydantic 层
  已校验；此处以 ``CheckConstraint`` 增加数据库层防线（SQLite 亦支持）。
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class AssessmentORM(Base):
    """新用户运动评估（需求 1）。"""

    __tablename__ = "assessments"
    __table_args__ = (
        CheckConstraint(
            "weekly_frequency >= 1 AND weekly_frequency <= 7",
            name="ck_assessment_weekly_frequency",
        ),
    )

    user_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    goal: Mapped[str] = mapped_column(String(32), nullable=False)
    venue: Mapped[str] = mapped_column(String(16), nullable=False)
    equipment: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    weekly_frequency: Mapped[int] = mapped_column(Integer, nullable=False)
    injury_risk: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )


class TrainingPlanORM(Base):
    """7 天训练计划（需求 2）。``days`` 以 JSON 内嵌完整结构。"""

    __tablename__ = "training_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    days: Mapped[list] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True, nullable=False
    )


class TrainingSessionORM(Base):
    """训练会话（需求 7 / 10）。子项以子表关联。"""

    __tablename__ = "training_sessions"

    session_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True, nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    sets: Mapped[list["SetRecordORM"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="SetRecordORM.id",
    )
    form_analyses: Mapped[list["FormAnalysisORM"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="FormAnalysisORM.id",
    )
    voice_commands: Mapped[list["VoiceCommandEventORM"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="VoiceCommandEventORM.id",
    )
    report: Mapped["SessionReportORM | None"] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        uselist=False,
    )


class SetRecordORM(Base):
    """会话中的一组训练记录。"""

    __tablename__ = "set_records"
    __table_args__ = (
        CheckConstraint(
            "difficulty >= 1 AND difficulty <= 5", name="ck_set_difficulty"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("training_sessions.session_id"), nullable=False
    )
    exercise: Mapped[str | None] = mapped_column(String(32), nullable=True)
    reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    difficulty: Mapped[int] = mapped_column(Integer, nullable=False)

    session: Mapped[TrainingSessionORM] = relationship(back_populates="sets")


class FormAnalysisORM(Base):
    """会话中一次动作分析结果（需求 3 / 4）。"""

    __tablename__ = "form_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("training_sessions.session_id"), nullable=False
    )
    exercise: Mapped[str] = mapped_column(String(32), nullable=False)
    is_standard: Mapped[bool] = mapped_column(Boolean, nullable=False)
    confidence: Mapped[str] = mapped_column(String(8), nullable=False)
    problem_areas: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    correction_text: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    session: Mapped[TrainingSessionORM] = relationship(
        back_populates="form_analyses"
    )


class VoiceCommandEventORM(Base):
    """会话中一次语音命令事件（需求 5）。"""

    __tablename__ = "voice_command_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("training_sessions.session_id"), nullable=False
    )
    command: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    session: Mapped[TrainingSessionORM] = relationship(
        back_populates="voice_commands"
    )


class SessionReportORM(Base):
    """训练后报告（需求 7），与会话一对一。"""

    __tablename__ = "session_reports"
    __table_args__ = (
        CheckConstraint(
            "form_score >= 0 AND form_score <= 100", name="ck_report_form_score"
        ),
    )

    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("training_sessions.session_id"), primary_key=True
    )
    form_score: Mapped[int] = mapped_column(Integer, nullable=False)
    risk_notes: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    correction_count: Mapped[int] = mapped_column(Integer, nullable=False)
    next_focus: Mapped[str] = mapped_column(String, nullable=False)
    summary_text: Mapped[str | None] = mapped_column(String, nullable=True)

    session: Mapped[TrainingSessionORM] = relationship(back_populates="report")


class PermissionRecordORM(Base):
    """设备权限授予记录（需求 9.4）。``user_id + scope`` 复合主键。"""

    __tablename__ = "permission_records"

    user_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    scope: Mapped[str] = mapped_column(String(16), primary_key=True)
    granted: Mapped[bool] = mapped_column(Boolean, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )


class ConsentRecordORM(Base):
    """敏感信息同意记录（需求 9.3 / 9.4）。``user_id + consent_type`` 复合主键。"""

    __tablename__ = "consent_records"

    user_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    consent_type: Mapped[str] = mapped_column(String(32), primary_key=True)
    granted: Mapped[bool] = mapped_column(Boolean, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )


class UserEntitlementORM(Base):
    """用户会员权益与免费额度（需求 8）。"""

    __tablename__ = "user_entitlements"
    __table_args__ = (
        CheckConstraint("free_quota_used >= 0", name="ck_entitlement_quota"),
    )

    user_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    entitlement: Mapped[str] = mapped_column(String(8), default="free", nullable=False)
    free_quota_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
